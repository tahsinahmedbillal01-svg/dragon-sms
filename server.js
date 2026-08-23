const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// ইন-মেমোরি ডাটাবেস (সাময়িকভাবে ডেটা রাখার জন্য)
let products = [];
let users = [];
let orders = [];

// ১. এডমিন প্রোডাক্ট ও বাল্ক স্টক আপলোড এপিআই
app.post('/api/admin/add-product', (req, res) => {
    const { title, category, price, description, accounts } = req.body;
    
    // লাইন বাই লাইন অ্যাকাউন্ট স্প্লিট করা
    const accountList = accounts ? accounts.split('\n').filter(line => line.trim() !== '') : [];
    
    const newProduct = {
        id: Date.now(),
        title,
        category,
        price: parseFloat(price),
        description,
        stock: accountList, // কতগুলো অ্যাকাউন্ট আছে
        stockCount: accountList.length
    };
    
    products.push(newProduct);
    res.json({ success: true, message: 'প্রোডাক্ট সফলভাবে যোগ হয়েছে!', product: newProduct });
});

// ২. কাস্টমার প্রোডাক্ট লিস্ট দেখার এপিআই
app.get('/api/products', (req, res) => {
    // সেফটির জন্য স্টক অ্যাকাউন্টের টেক্সট হাইড করে শুধু কাউন্ট পাঠানো হয়
    const safeProducts = products.map(p => ({
        id: p.id,
        title: p.title,
        category: p.category,
        price: p.price,
        description: p.description,
        stockCount: p.stock.length
    }));
    res.json(safeProducts);
});

// ৩. বিকাশ ডিপোজিট এপিআই (টাকা থেকে ডলারে কনভার্ট)
app.post('/api/deposit/bkash', (req, res) => {
    const { email, amountBDT, rate } = req.body; // rate যেমন ১২০ টাকা = ১ ডলার
    const usdAmount = parseFloat((amountBDT / (rate || 120)).toFixed(2));

    let user = users.find(u => u.email === email);
    if (!user) {
        user = { email, balanceUSD: 0 };
        users.push(user);
    }
    
    user.balanceUSD += usdAmount;
    res.json({ success: true, message: `ডিপোজিট সফল! $${usdAmount} যোগ হয়েছে।`, balance: user.balanceUSD });
});

// ৪. প্রোডাক্ট কেনাকাটা এপিআই
app.post('/api/buy', (req, res) => {
    const { email, productId } = req.body;
    const product = products.find(p => p.id === productId);
    const user = users.find(u => u.email === email);

    if (!product || product.stock.length === 0) {
        return res.status(400).json({ success: false, message: 'স্টকে অ্যাকাউন্ট নেই!' });
    }
    if (!user || user.balanceUSD < product.price) {
        return res.status(400).json({ success: false, message: 'পর্যাপ্ত ব্যালেন্স নেই! আগে ডিপোজিট করুন।' });
    }

    // ব্যালেন্স কাটা এবং স্টক থেকে ১টি অ্যাকাউন্ট ডেলিভারি
    user.balanceUSD -= product.price;
    const deliveredAccount = product.stock.shift(); // প্রথম অ্যাকাউন্টটি নেওয়া হলো

    const order = {
        orderId: 'ORD-' + Date.now(),
        email,
        productTitle: product.title,
        accountData: deliveredAccount,
        price: product.price,
        date: new Date().toLocaleString()
    };
    orders.push(order);

    res.json({ success: true, message: 'কেনাকাটা সফল হয়েছে!', account: deliveredAccount, remainingBalance: user.balanceUSD });
});

// ৫. কাস্টমার অর্ডার হিস্টোরি এপিআই
app.get('/api/orders/:email', (req, res) => {
    const userOrders = orders.filter(o => o.email === req.params.email);
    res.json(userOrders);
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
