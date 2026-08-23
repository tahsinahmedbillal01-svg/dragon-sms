const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Data Storage
let categories = ['Outlook', 'Gmail', 'Facebook'];
let products = [];
let users = {}; 
let orders = [];

// Categories API
app.get('/api/categories', (req, res) => res.json(categories));
app.post('/api/admin/add-category', (req, res) => {
    const { category } = req.body;
    if (category && !categories.includes(category)) {
        categories.push(category);
    }
    res.json({ success: true, categories });
});

// Admin Product Upload & Delete
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

// Products List
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

// User Balance API
app.get('/api/user/balance/:email', (req, res) => {
    const email = req.params.email;
    res.json({ balance: users[email] || 0 });
});

// Deposit API (bKash & Crypto)
app.post('/api/deposit', (req, res) => {
    const { email, method, amount } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email required' });

    let addedUSD = 0;
    if (method === 'bkash') {
        addedUSD = parseFloat((amount / 120).toFixed(2)); // 120 BDT = 1 USD
    } else if (method === 'crypto') {
        addedUSD = parseFloat(amount); // Direct USD
    }

    users[email] = (users[email] || 0) + addedUSD;
    res.json({ success: true, message: `Deposit successful! $${addedUSD} USD added.`, balance: users[email] });
});

// Buy API
app.post('/api/buy', (req, res) => {
    const { email, productId } = req.body;
    const product = products.find(p => p.id === productId);
    const userBalance = users[email] || 0;

    if (!product || product.stock.length === 0) {
        return res.status(400).json({ success: false, message: 'Out of stock!' });
    }
    if (userBalance < product.price) {
        return res.status(400).json({ success: false, message: 'Insufficient balance! Please deposit.' });
    }

    users[email] -= product.price;
    const deliveredAccount = product.stock.shift();

    const order = {
        orderId: 'ORD-' + Date.now(),
        email,
        productTitle: product.title,
        accountData: deliveredAccount,
        price: product.price,
        date: new Date().toLocaleString()
    };
    orders.push(order);

    res.json({ success: true, message: 'Purchase successful!', account: deliveredAccount, balance: users[email] });
});

// Order History
app.get('/api/orders/:email', (req, res) => {
    const userOrders = orders.filter(o => o.email === req.params.email);
    res.json(userOrders);
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
