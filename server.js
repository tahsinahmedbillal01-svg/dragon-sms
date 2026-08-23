const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const DATA_FILE = path.join(__dirname, 'data.json');

let db = {
    categories: [
        { name: 'Facebook', icon: 'https://cdn-icons-png.flaticon.com/512/5968/5968764.png' },
        { name: 'Outlook', icon: 'https://cdn-icons-png.flaticon.com/512/732/732221.png' },
        { name: 'Gmail', icon: 'https://cdn-icons-png.flaticon.com/512/5968/5968534.png' }
    ],
    products: [],
    users: [],
    orders: [],
    deposits: [],
    chatMessages: []
};

if (fs.existsSync(DATA_FILE)) {
    try {
        const raw = fs.readFileSync(DATA_FILE);
        db = JSON.parse(raw);
    } catch (e) {
        console.log('Error loading data, using fallback defaults.');
    }
}

function saveData() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

const ADMIN_EMAIL = "sean.storr75@gmail.com";
const ADMIN_PASS = "Alex@123tt";

// Authentication APIs
app.post('/api/auth/signup', (req, res) => {
    const { firstName, lastName, email, password, confirmPassword } = req.body;
    if (!firstName || !lastName || !email || !password) {
        return res.status(400).json({ success: false, message: 'All fields are required!' });
    }
    if (password !== confirmPassword) {
        return res.status(400).json({ success: false, message: 'Passwords do not match!' });
    }
    if (db.users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
        return res.status(400).json({ success: false, message: 'Email already registered!' });
    }

    const newUser = { firstName, lastName, email: email.toLowerCase(), password, balanceUSD: 0, date: new Date().toLocaleDateString() };
    db.users.push(newUser);
    saveData();
    res.json({ success: true, message: 'Account created successfully!' });
});

app.post('/api/auth/forgot-password', (req, res) => {
    const { email, newPassword } = req.body;
    const user = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!user) return res.status(400).json({ success: false, message: 'Email not found!' });

    user.password = newPassword;
    saveData();
    res.json({ success: true, message: 'Password updated successfully!' });
});

app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    if (email === ADMIN_EMAIL && password === ADMIN_PASS) {
        return res.json({ success: true, isAdmin: true, message: 'Logged in as Admin!' });
    }

    const user = db.users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
    if (!user) return res.status(400).json({ success: false, message: 'Invalid Credentials!' });

    res.json({
        success: true,
        isAdmin: false,
        message: 'Login successful!',
        user: { firstName: user.firstName, lastName: user.lastName, email: user.email, balance: user.balanceUSD }
    });
});

// Admin Analytics & Chat Data
app.get('/api/admin/analytics', (req, res) => {
    const today = new Date().toLocaleDateString();
    const todaySales = db.orders
        .filter(o => new Date(o.rawDate).toLocaleDateString() === today)
        .reduce((sum, o) => sum + o.price, 0);

    const activeChatUsers = [...new Set(db.chatMessages.map(m => m.userEmail))];

    res.json({
        totalUsers: db.users.length,
        todaySalesUSD: todaySales.toFixed(2),
        totalSoldProducts: db.orders.length,
        usersList: db.users,
        ordersList: db.orders,
        productsList: db.products,
        pendingDeposits: db.deposits.filter(d => d.status === 'Pending'),
        activeChatUsers
    });
});

// Category Management
app.get('/api/categories', (req, res) => res.json(db.categories));

app.post('/api/admin/add-category', (req, res) => {
    const { name, icon } = req.body;
    if (name) {
        db.categories.push({ name, icon: icon || 'https://via.placeholder.com/30' });
        saveData();
    }
    res.json({ success: true, categories: db.categories });
});

// Save Listing with File/Image Data
app.post('/api/admin/save-product', (req, res) => {
    const { id, title, description, category, price, imageUrl, accounts } = req.body;
    const accountList = accounts ? accounts.split('\n').map(a => a.trim()).filter(a => a !== '') : [];

    if (id) {
        const index = db.products.findIndex(p => p.id === parseInt(id));
        if (index !== -1) {
            let existingStock = db.products[index].stock || [];
            let updatedStock = accountList.length > 0 ? existingStock.concat(accountList) : existingStock;

            db.products[index] = {
                id: parseInt(id),
                title,
                description: description || '',
                category,
                price: parseFloat(price),
                imageUrl: imageUrl || db.products[index].imageUrl || 'https://via.placeholder.com/150',
                stock: updatedStock,
                soldCount: db.products[index].soldCount || 0
            };
        }
    } else {
        const newProduct = {
            id: Date.now(),
            title,
            description: description || '',
            category,
            price: parseFloat(price),
            imageUrl: imageUrl || 'https://via.placeholder.com/150',
            stock: accountList,
            soldCount: 0
        };
        db.products.push(newProduct);
    }

    saveData();
    res.json({ success: true, message: 'Product listing saved!' });
});

app.delete('/api/admin/delete-product/:id', (req, res) => {
    db.products = db.products.filter(p => p.id !== parseInt(req.params.id));
    saveData();
    res.json({ success: true, message: 'Deleted!' });
});

app.get('/api/products', (req, res) => {
    const safeProducts = db.products.map(p => ({
        id: p.id,
        title: p.title,
        description: p.description,
        category: p.category,
        price: p.price,
        imageUrl: p.imageUrl,
        stockCount: p.stock.length,
        soldCount: p.soldCount || 0
    }));
    res.json(safeProducts);
});

// User Info
app.get('/api/user/dashboard/:email', (req, res) => {
    const user = db.users.find(u => u.email.toLowerCase() === req.params.email.toLowerCase());
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const userOrders = db.orders.filter(o => o.email.toLowerCase() === req.params.email.toLowerCase());
    const userDeposits = db.deposits.filter(d => d.email.toLowerCase() === req.params.email.toLowerCase());

    res.json({
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        memberSince: user.date,
        balance: user.balanceUSD,
        totalSpent: userOrders.reduce((sum, o) => sum + o.price, 0),
        totalOrdersCount: userOrders.length,
        orders: userOrders,
        deposits: userDeposits
    });
});

// Deposits
app.post('/api/deposit', (req, res) => {
    const { email, method, amount, trxId } = req.body;
    const user = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!user || !trxId) return res.status(400).json({ success: false, message: 'Invalid submission!' });

    let addedUSD = method === 'bkash' ? parseFloat((amount / 120).toFixed(2)) : parseFloat(amount);

    db.deposits.push({
        id: Date.now(),
        txId: trxId,
        email: user.email,
        amount: addedUSD,
        method: method.toUpperCase(),
        date: new Date().toLocaleString(),
        status: 'Pending'
    });
    saveData();
    res.json({ success: true, message: 'Deposit requested!' });
});

app.post('/api/admin/approve-deposit', (req, res) => {
    const { depositId } = req.body;
    const dep = db.deposits.find(d => d.id === depositId);

    if (dep && dep.status === 'Pending') {
        dep.status = 'Approved';
        const user = db.users.find(u => u.email.toLowerCase() === dep.email.toLowerCase());
        if (user) user.balanceUSD += dep.amount;
        saveData();
        return res.json({ success: true, message: 'Deposit approved!' });
    }
    res.status(400).json({ success: false, message: 'Error approving deposit.' });
});

// Buy logic
app.post('/api/buy', (req, res) => {
    const { email, productId, quantity } = req.body;
    const qty = parseInt(quantity) || 1;
    const product = db.products.find(p => p.id === productId);
    const user = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());

    if (!user) return res.status(400).json({ success: false, message: 'Please login first!' });
    if (!product || product.stock.length < qty) return res.status(400).json({ success: false, message: 'Not enough stock!' });

    const totalPrice = product.price * qty;
    if (user.balanceUSD < totalPrice) return res.status(400).json({ success: false, message: 'Insufficient balance!' });

    user.balanceUSD -= totalPrice;
    const purchased = product.stock.splice(0, qty);
    product.soldCount = (product.soldCount || 0) + qty;

    const order = {
        orderId: '#ORD-' + Math.floor(10000 + Math.random() * 90000),
        email: user.email,
        productTitle: product.title,
        quantity: qty,
        category: product.category,
        accountData: purchased.join('\n'),
        price: totalPrice,
        rawDate: new Date(),
        date: new Date().toLocaleDateString(),
        status: 'Completed'
    };
    db.orders.push(order);
    saveData();

    res.json({ success: true, message: 'Purchase successful!', order, balance: user.balanceUSD });
});

// Live Chat APIs
app.get('/api/chat/messages/:email', (req, res) => {
    const userEmail = req.params.email.toLowerCase();
    const msgs = db.chatMessages.filter(m => m.userEmail.toLowerCase() === userEmail);
    res.json(msgs);
});

app.post('/api/chat/send', (req, res) => {
    const { sender, receiver, message, userEmail } = req.body;
    if (!userEmail || !message) return res.status(400).json({ success: false });

    const chat = {
        id: Date.now(),
        sender,
        receiver,
        message,
        userEmail: userEmail.toLowerCase(),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    db.chatMessages.push(chat);
    saveData();
    res.json({ success: true, chat });
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
