const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Temporary In-Memory Database
let categories = ['Outlook', 'Gmail', 'Facebook'];
let products = [];
let users = [];
let orders = [];

// Blocked Temp Email Domains
const tempEmailDomains = ['mailinator.com', '10minutemail.com', 'tempmail.com', 'guerrillamail.com', 'throwawaymail.com', 'yopmail.com', 'tempmailo.com'];

// Admin Auth Credentials
const ADMIN_EMAIL = "sean.storr75@gmail.com";
const ADMIN_PASS = "Alex@123tt";

// Helper Functions
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
        return res.status(400).json({ success: false, message: 'Temporary emails are not allowed! Use an original email.' });
    }
    if (users.find(u => u.email === email)) {
        return res.status(400).json({ success: false, message: 'Email already registered!' });
    }

    const newUser = { firstName, lastName, email, password, balanceUSD: 0, date: new Date() };
    users.push(newUser);
    res.json({ success: true, message: 'Account registered successfully!' });
});

// User & Admin Login
app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;

    // Check if Admin
    if (email === ADMIN_EMAIL && password === ADMIN_PASS) {
        return res.json({ success: true, isAdmin: true, message: 'Welcome to Admin Dashboard!' });
    }

    const user = users.find(u => u.email === email && u.password === password);
    if (!user) {
        return res.status(400).json({ success: false, message: 'Invalid email or password!' });
    }

    res.json({
        success: true,
        isAdmin: false,
        message: 'Login successful!',
        user: { firstName: user.firstName, email: user.email, balance: user.balanceUSD }
    });
});

// Admin Stats Endpoint
app.get('/api/admin/stats', (req, res) => {
    const today = new Date().toLocaleDateString();
    
    // Calculate Today's Sales
    const todaySales = orders
        .filter(o => new Date(o.rawDate).toLocaleDateString() === today)
        .reduce((sum, o) => sum + o.price, 0);

    res.json({
        totalUsers: users.length,
        todaySalesUSD: todaySales.toFixed(2),
        totalSoldProducts: orders.length,
        soldProductsList: orders
    });
});

// Categories & Products APIs
app.get('/api/categories', (req, res) => res.json(categories));

app.post('/api/admin/add-category', (req, res) => {
    const { category } = req.body;
    if (category && !categories.includes(category)) {
        categories.push(category);
    }
    res.json({ success: true, categories });
});

app.post('/api/admin/add-product', (req, res) => {
    const { title, category, price, accounts } = req.body;
    const accountList = accounts ? accounts.split('\n').map(a => a.trim()).filter(a => a !== '') : [];

    const newProduct = {
        id: Date.now(),
        title,
        category,
        price: parseFloat(price),
        stock: accountList
    };

    products.push(newProduct);
    res.json({ success: true, message: 'Listing added successfully!' });
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
        category: p.category,
        price: p.price,
        stockCount: p.stock.length
    }));
    res.json(safeProducts);
});

app.get('/api/user/balance/:email', (req, res) => {
    const user = users.find(u => u.email === req.params.email);
    res.json({ balance: user ? user.balanceUSD : 0 });
});

app.post('/api/deposit', (req, res) => {
    const { email, method, amount } = req.body;
    const user = users.find(u => u.email === email);
    if (!user) return res.status(400).json({ success: false, message: 'User not found!' });

    let addedUSD = method === 'bkash' ? parseFloat((amount / 120).toFixed(2)) : parseFloat(amount);
    user.balanceUSD += addedUSD;

    res.json({ success: true, message: `Deposit successful! $${addedUSD} USD added.`, balance: user.balanceUSD });
});

app.post('/api/buy', (req, res) => {
    const { email, productId } = req.body;
    const product = products.find(p => p.id === productId);
    const user = users.find(u => u.email === email);

    if (!user) return res.status(400).json({ success: false, message: 'User not logged in!' });
    if (!product || product.stock.length === 0) return res.status(400).json({ success: false, message: 'Out of stock!' });
    if (user.balanceUSD < product.price) return res.status(400).json({ success: false, message: 'Insufficient balance! Please deposit.' });

    user.balanceUSD -= product.price;
    const deliveredAccount = product.stock.shift();

    const order = {
        orderId: 'ORD-' + Date.now(),
        email,
        productTitle: product.title,
        accountData: deliveredAccount,
        price: product.price,
        rawDate: new Date(),
        date: new Date().toLocaleString()
    };
    orders.push(order);

    res.json({ success: true, message: 'Purchase successful!', account: deliveredAccount, balance: user.balanceUSD });
});

app.get('/api/orders/:email', (req, res) => {
    const userOrders = orders.filter(o => o.email === req.params.email);
    res.json(userOrders);
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
