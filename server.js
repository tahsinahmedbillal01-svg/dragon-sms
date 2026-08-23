const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
// JSON & URL-encoded payload limit size increased for Image base64 string upload
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

let categories = ['Outlook', 'Gmail', 'Facebook'];
let products = [];
let users = [];
let orders = [];
let deposits = [];

const tempEmailDomains = ['mailinator.com', '10minutemail.com', 'tempmail.com', 'guerrillamail.com', 'throwawaymail.com', 'yopmail.com', 'tempmailo.com'];
const ADMIN_EMAIL = "sean.storr75@gmail.com";
const ADMIN_PASS = "Alex@123tt";

function isTempEmail(email) {
    const domain = email.split('@')[1];
    return tempEmailDomains.includes(domain ? domain.toLowerCase() : '');
}

// User Sign Up
app.post('/api/auth/signup', (req, res) => {
    const { firstName, lastName, email, password, confirmPassword } = req.body;

    if (!firstName || !lastName || !email || !password) {
        return res.status(400).json({ success: false, message: 'All fields are required!' });
    }
    if (password !== confirmPassword) {
        return res.status(400).json({ success: false, message: 'Passwords do not match!' });
    }
    if (isTempEmail(email)) {
        return res.status(400).json({ success: false, message: 'Temporary emails are not allowed!' });
    }
    if (users.find(u => u.email === email)) {
        return res.status(400).json({ success: false, message: 'Email already registered!' });
    }

    const newUser = { firstName, lastName, email, password, balanceUSD: 0, date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) };
    users.push(newUser);
    res.json({ success: true, message: 'Account registered successfully!' });
});

// Login
app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;

    if (email === ADMIN_EMAIL && password === ADMIN_PASS) {
        return res.json({ success: true, isAdmin: true, message: 'Welcome to Admin Control Panel!' });
    }

    const user = users.find(u => u.email === email && u.password === password);
    if (!user) {
        return res.status(400).json({ success: false, message: 'Invalid email or password!' });
    }

    res.json({
        success: true,
        isAdmin: false,
        message: 'Login successful!',
        user: { firstName: user.firstName, lastName: user.lastName, email: user.email, balance: user.balanceUSD }
    });
});

// Admin Analytics API
app.get('/api/admin/analytics', (req, res) => {
    const today = new Date().toLocaleDateString();
    
    const todaySales = orders
        .filter(o => new Date(o.rawDate).toLocaleDateString() === today)
        .reduce((sum, o) => sum + o.price, 0);

    res.json({
        totalUsers: users.length,
        todaySalesUSD: todaySales.toFixed(2),
        totalSoldProducts: orders.length,
        usersList: users,
        ordersList: orders,
        productsList: products
    });
});

// Categories & Listings APIs
app.get('/api/categories', (req, res) => res.json(categories));

app.post('/api/admin/add-category', (req, res) => {
    const { category } = req.body;
    if (category && !categories.includes(category)) {
        categories.push(category);
    }
    res.json({ success: true, categories });
});

// Add / Edit Product with Image Base64 & Description & Restock
app.post('/api/admin/save-product', (req, res) => {
    const { id, title, description, category, price, imageUrl, accounts } = req.body;
    const accountList = accounts ? accounts.split('\n').map(a => a.trim()).filter(a => a !== '') : [];

    if (id) {
        // Edit Existing Product (Add extra stock if provided)
        const index = products.findIndex(p => p.id === parseInt(id));
        if (index !== -1) {
            let existingStock = products[index].stock || [];
            let updatedStock = accountList.length > 0 ? existingStock.concat(accountList) : existingStock;

            products[index] = {
                id: parseInt(id),
                title,
                description: description || '',
                category,
                price: parseFloat(price),
                imageUrl: imageUrl || products[index].imageUrl || 'https://via.placeholder.com/150',
                stock: updatedStock
            };
        }
    } else {
        // Create New Product
        const newProduct = {
            id: Date.now(),
            title,
            description: description || '',
            category,
            price: parseFloat(price),
            imageUrl: imageUrl || 'https://via.placeholder.com/150',
            stock: accountList
        };
        products.push(newProduct);
    }

    res.json({ success: true, message: 'Listing saved & restocked successfully!' });
});

app.delete('/api/admin/delete-product/:id', (req, res) => {
    const id = parseInt(req.params.id);
    products = products.filter(p => p.id !== id);
    res.json({ success: true, message: 'Listing deleted successfully!' });
});

app.get('/api/products', (req, res) => {
    const safeProducts = products.map(p => ({
        id: p.id,
        title: p.title,
        description: p.description,
        category: p.category,
        price: p.price,
        imageUrl: p.imageUrl,
        stockCount: p.stock.length
    }));
    res.json(safeProducts);
});

app.get('/api/user/dashboard/:email', (req, res) => {
    const user = users.find(u => u.email === req.params.email);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const userOrders = orders.filter(o => o.email === req.params.email);
    const userDeposits = deposits.filter(d => d.email === req.params.email);

    const totalSpent = userOrders.reduce((sum, o) => sum + o.price, 0);
    const totalDeposited = userDeposits.reduce((sum, d) => sum + d.amount, 0);

    res.json({
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        memberSince: user.date,
        balance: user.balanceUSD,
        totalSpent,
        totalDeposited,
        totalOrdersCount: userOrders.length,
        orders: userOrders,
        deposits: userDeposits
    });
});

app.post('/api/deposit', (req, res) => {
    const { email, method, amount } = req.body;
    const user = users.find(u => u.email === email);
    if (!user) return res.status(400).json({ success: false, message: 'User not found!' });

    let addedUSD = method === 'bkash' ? parseFloat((amount / 120).toFixed(2)) : parseFloat(amount);
    user.balanceUSD += addedUSD;

    const dep = {
        txId: '#DEP-' + Math.floor(1000 + Math.random() * 9000),
        email,
        amount: addedUSD,
        method: method.toUpperCase(),
        date: new Date().toLocaleString(),
        status: 'Completed'
    };
    deposits.push(dep);

    res.json({ success: true, message: `Deposit successful! $${addedUSD} USD added.`, balance: user.balanceUSD });
});

app.post('/api/buy', (req, res) => {
    const { email, productId } = req.body;
    const product = products.find(p => p.id === productId);
    const user = users.find(u => u.email === email);

    if (!user) return res.status(400).json({ success: false, message: 'Please login first!' });
    if (!product || product.stock.length === 0) return res.status(400).json({ success: false, message: 'Out of stock!' });
    if (user.balanceUSD < product.price) return res.status(400).json({ success: false, message: 'Insufficient balance!' });

    user.balanceUSD -= product.price;
    const deliveredAccount = product.stock.shift();

    const order = {
        orderId: '#ORD-' + Math.floor(1000 + Math.random() * 9000),
        email,
        productTitle: product.title,
        category: product.category,
        accountData: deliveredAccount,
        price: product.price,
        rawDate: new Date(),
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        status: 'Completed'
    };
    orders.push(order);

    res.json({ success: true, message: 'Purchase successful!', order, balance: user.balanceUSD });
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
