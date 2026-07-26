
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const session = require('express-session');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'roventra-secret-key-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
}));

// SQLite Veritabanı Kurulumu
const db = new sqlite3.Database('./roventra.db', (err) => {
    if (err) console.error('Veritabanı bağlantı hatası:', err.message);
    else console.log('SQLite veritabanına başarıyla bağlanıldı.');
});

// Tabloları Oluşturma ve Varsayılan Veriler
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        email TEXT UNIQUE,
        password TEXT,
        role TEXT DEFAULT 'customer'
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        category TEXT,
        price REAL,
        rating TEXT,
        img TEXT,
        badge TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_code TEXT UNIQUE,
        customer_name TEXT,
        email TEXT,
        phone TEXT,
        address TEXT,
        city TEXT,
        district TEXT,
        total_amount REAL,
        status TEXT DEFAULT 'Sipariş Alındı',
        courier TEXT,
        tracking_no TEXT,
        items TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Varsayılan Admin Hesabı
    db.get(`SELECT * FROM users WHERE email = ?`, ['admin@roventra.com'], (err, row) => {
        if (!row) {
            bcrypt.hash('admin123', 10, (err, hash) => {
                db.run(`INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)`,
                    ['Roventra Admin', 'admin@roventra.com', hash, 'admin']);
            });
        }
    });

    // Örnek Ürünler
    db.get(`SELECT COUNT(*) as count FROM products`, (err, row) => {
        if (row.count === 0) {
            const initialProducts = [
                ['Roventra Acid Wash Oversize Tee', 'T-Shirt', 890, '4.9 (124)', 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?q=80&w=800', 'Çok Satan'],
                ['Roventra Cyberpunk Cargo Ceket', 'Dış Giyim', 2450, '5.0 (86)', 'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?q=80&w=800', 'Yeni'],
                ['Monogram Boxy Fit Sweat', 'Sweat', 1650, '4.8 (92)', 'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?q=80&w=800', ''],
                ['Tactical Multi-Pocket Cargo Jogger', 'Pantolon', 1350, '4.7 (65)', 'https://images.unsplash.com/photo-1551232864-3f0890e580d9?q=80&w=800', ''],
                ['Roventra Heavyweight Siyah Sweat', 'Sweat', 1850, '5.0 (140)', 'https://images.unsplash.com/photo-1509631179647-0177331693ae?q=80&w=800', 'Limited'],
                ['Oversize Keten Ceket Gömlek (Shaket)', 'Gömlek', 1250, '4.8 (58)', 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?q=80&w=1000', 'Yeni'],
                ['Ribana Dokulu Oversize Erkek Atlet', 'Atlet', 490, '4.7 (64)', 'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?q=80&w=800', 'Yeni'],
                ['Minimalist Monogram Beanie Şapka', 'Aksesuar', 420, '4.6 (45)', 'https://images.unsplash.com/photo-1576871337632-b9aef4c17ab9?q=80&w=800', '']
            ];
            const stmt = db.prepare(`INSERT INTO products (title, category, price, rating, img, badge) VALUES (?, ?, ?, ?, ?, ?)`);
            initialProducts.forEach(p => stmt.run(p));
            stmt.finalize();
        }
    });
});

// --- API ROTALARI ---

app.get('/api/products', (req, res) => {
    db.all(`SELECT * FROM products`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/admin/products', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ error: 'Yetkisiz' });
    const { title, category, price, img, badge } = req.body;
    db.run(`INSERT INTO products (title, category, price, rating, img, badge) VALUES (?, ?, ?, '5.0 (1)', ?, ?)`,
        [title, category, price, img, badge], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, productId: this.lastID });
        });
});

app.post('/api/register', (req, res) => {
    const { name, email, password } = req.body;
    bcrypt.hash(password, 10, (err, hash) => {
        if (err) return res.status(500).json({ error: 'Hata' });
        db.run(`INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, 'customer')`, [name, email, hash], function(err) {
            if (err) return res.status(400).json({ error: 'E-posta zaten kayıtlı.' });
            res.json({ success: true, userId: this.lastID });
        });
    });
});

app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    db.get(`SELECT * FROM users WHERE email = ?`, [email], (err, user) => {
        if (err || !user) return res.status(400).json({ error: 'Kullanıcı bulunamadı.' });
        bcrypt.compare(password, user.password, (err, match) => {
            if (!match) return res.status(400).json({ error: 'Hatalı şifre.' });
            req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role };
            res.json({ success: true, user: req.session.user });
        });
    });
});

app.get('/api/auth/me', (req, res) => { res.json({ user: req.session.user || null }); });
app.post('/api/logout', (req, res) => { req.session.destroy(() => { res.json({ success: true }); }); });

app.post('/api/orders', (req, res) => {
    const { customerName, email, phone, address, city, district, totalAmount, items } = req.body;
    const orderCode = 'ROV-' + Math.floor(100000 + Math.random() * 900000);
    const courier = 'Yurtiçi Kargo VIP';
    const trackingNo = 'YK-' + Math.floor(1000000000 + Math.random() * 9000000000);

    db.run(`INSERT INTO orders (order_code, customer_name, email, phone, address, city, district, total_amount, status, courier, tracking_no, items) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Sipariş Alındı', ?, ?, ?)`,
        [orderCode, customerName, email, phone, address, city, district, totalAmount, courier, trackingNo, JSON.stringify(items)],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            io.emit('newOrder', { orderCode, customerName, totalAmount });
            res.json({ success: true, orderCode });
        });
});

app.get('/api/orders/track', (req, res) => {
    const { code, email } = req.query;
    db.get(`SELECT * FROM orders WHERE order_code = ? AND email = ?`, [code, email], (err, row) => {
        if (err || !row) return res.status(404).json({ error: 'Sipariş bulunamadı.' });
        row.items = JSON.parse(row.items);
        res.json(row);
    });
});

app.get('/api/admin/orders', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ error: 'Yetkisiz' });
    db.all(`SELECT * FROM orders ORDER BY created_at DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        rows.forEach(r => r.items = JSON.parse(r.items));
        res.json(rows);
    });
});

app.put('/api/admin/orders/:id', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ error: 'Yetkisiz' });
    const { status } = req.body;
    db.run(`UPDATE orders SET status = ? WHERE id = ?`, [status, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        io.emit('orderUpdated', { orderId: req.params.id, status });
        res.json({ success: true });
    });
});

// --- EXPRESS v5 UYUMLU FULL HTML SUNUMU (CATCH-ALL) ---
app.use((req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ROVENTRA — Menswear & Modern Streetwear</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Space+Grotesk:wght@500;700&display=swap" rel="stylesheet">
    <script src="/socket.io/socket.io.js"></script>
    <style>
        :root {
            --bg-main: #0b0f17; --bg-surface: #131926; --bg-card: #1a2234;
            --accent-primary: #d4a373; --accent-glow: rgba(212, 163, 115, 0.25);
            --text-heading: #ffffff; --text-body: #94a3b8;
            --border-glow: rgba(212, 163, 115, 0.3); --border-subtle: rgba(255, 255, 255, 0.08);
            --font-display: 'Space Grotesk', sans-serif; --font-body: 'Plus Jakarta Sans', sans-serif;
        }
        * { margin: 0; padding: 0; box-sizing: border-box; scroll-behavior: smooth; }
        body { background-color: var(--bg-main); color: var(--text-body); font-family: var(--font-body); line-height: 1.6; overflow-x: hidden; }
        a { text-decoration: none; color: inherit; } ul { list-style: none; } img { width: 100%; height: auto; display: block; object-fit: cover; }
        .page-view { display: none; opacity: 0; transition: opacity 0.3s ease-in-out; }
        .page-view.active { display: block; opacity: 1; }
        header { position: fixed; top: 0; left: 0; width: 100%; z-index: 1000; background: rgba(11, 15, 23, 0.88); backdrop-filter: blur(16px); border-bottom: 1px solid var(--border-subtle); }
        .top-banner { background: linear-gradient(90deg, #b8860b, #d4a373, #8b5a2b); color: #0b0f17; font-size: 0.75rem; font-weight: 700; text-align: center; padding: 6px; letter-spacing: 1.5px; text-transform: uppercase; }
        .nav-inner { max-width: 1380px; margin: 0 auto; padding: 12px 32px; display: flex; justify-content: space-between; align-items: center; }
        .brand-logo-container { display: flex; align-items: center; cursor: pointer; color: #fff; font-family: var(--font-display); font-size: 1.5rem; font-weight: 700; letter-spacing: 2px; }
        .nav-links { display: flex; gap: 28px; align-items: center; }
        .nav-item { font-size: 0.88rem; font-weight: 500; color: var(--text-body); position: relative; padding: 6px 0; cursor: pointer; }
        .nav-item:hover, .nav-item.active { color: var(--text-heading); }
        .nav-actions { display: flex; align-items: center; gap: 16px; }
        .action-icon { width: 42px; height: 42px; border-radius: 50%; background: var(--bg-surface); border: 1px solid var(--border-subtle); color: var(--text-heading); display: flex; align-items: center; justify-content: center; cursor: pointer; position: relative; }
        .badge-count { position: absolute; top: -4px; right: -4px; background: var(--accent-primary); color: #0b0f17; font-size: 0.65rem; font-weight: 800; width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
        .hero { padding-top: 150px; padding-bottom: 90px; min-height: 90vh; display: flex; align-items: center; background: radial-gradient(circle at 80% 20%, rgba(212, 163, 115, 0.12) 0%, transparent 50%); }
        .hero-container { max-width: 1380px; margin: 0 auto; padding: 0 32px; }
        .hero-title { font-family: var(--font-display); font-size: 3.5rem; font-weight: 700; color: var(--text-heading); margin-bottom: 24px; }
        .hero-title span { color: var(--accent-primary); }
        .btn-main { padding: 14px 28px; background: var(--accent-primary); color: #0b0f17; font-weight: 700; font-size: 0.9rem; border-radius: 12px; text-transform: uppercase; cursor: pointer; border: none; }
        .container { max-width: 1380px; margin: 0 auto; padding: 0 32px; }
        .catalog-sec { padding: 80px 0; }
        .products-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 30px; }
        .product-card { background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: 20px; overflow: hidden; position: relative; }
        .img-container { height: 320px; background: var(--bg-card); position: relative; overflow: hidden; }
        .img-container img { height: 100%; transition: transform 0.4s ease; }
        .product-card:hover .img-container img { transform: scale(1.06); }
        .product-details { padding: 20px; }
        .p-title { color: var(--text-heading); font-size: 1.05rem; font-weight: 600; margin-bottom: 10px; }
        .p-price { font-size: 1.2rem; font-weight: 800; color: var(--text-heading); }
        .drawer-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.75); z-index: 2000; opacity: 0; pointer-events: none; transition: opacity 0.3s ease; }
        .drawer-overlay.active { opacity: 1; pointer-events: auto; }
        .drawer-panel { position: fixed; top: 0; right: -450px; width: 100%; max-width: 450px; height: 100vh; background: var(--bg-surface); border-left: 1px solid var(--border-glow); z-index: 2001; display: flex; flex-direction: column; transition: right 0.35s ease; }
        .drawer-panel.active { right: 0; }
        .auth-modal { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 100%; max-width: 400px; background: var(--bg-surface); border: 1px solid var(--border-glow); border-radius: 20px; padding: 30px; z-index: 3000; display: none; }
        .auth-modal.active { display: block; }
        .form-group { margin-bottom: 14px; }
        .form-group label { display: block; font-size: 0.85rem; color: #fff; margin-bottom: 4px; }
        .form-input { width: 100%; padding: 12px; background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 8px; color: #fff; outline: none; }
        .admin-table { width: 100%; border-collapse: collapse; margin-top: 20px; background: var(--bg-surface); border-radius: 12px; overflow: hidden; }
        .admin-table th, .admin-table td { padding: 12px 16px; text-align: left; border-bottom: 1px solid var(--border-subtle); color: #fff; font-size: 0.9rem; }
        .admin-table th { background: var(--bg-card); }
    </style>
</head>
<body>

    <!-- AUTH MODAL -->
    <div class="drawer-overlay" id="authOverlay" onclick="toggleAuthModal(false)"></div>
    <div class="auth-modal" id="authModal">
        <h3 id="authTitle" style="color:#fff; font-size:1.3rem; margin-bottom:16px;">Kullanıcı Girişi</h3>
        <div id="registerFields" style="display:none;"><div class="form-group"><label>Ad Soyad</label><input type="text" id="regName" class="form-input"></div></div>
        <div class="form-group"><label>E-Posta (Admin: admin@roventra.com)</label><input type="email" id="authEmail" class="form-input"></div>
        <div class="form-group"><label>Şifre (Admin: admin123)</label><input type="password" id="authPassword" class="form-input"></div>
        <button class="btn-main" style="width:100%; margin-top:10px;" onclick="handleAuthSubmit()">Giriş Yap</button>
        <p style="text-align:center; margin-top:14px; font-size:0.85rem; cursor:pointer; color:var(--accent-primary);" onclick="toggleAuthMode()" id="authToggleText">Hesabın yok mu? Kayıt ol</p>
    </div>

    <!-- CART DRAWER -->
    <div class="drawer-overlay" id="cartOverlay" onclick="toggleCart(false)"></div>
    <aside class="drawer-panel" id="cartDrawer">
        <div style="padding:20px; border-bottom:1px solid var(--border-subtle); display:flex; justify-content:space-between; align-items:center; background:var(--bg-card); color:#fff;">
            <h3>🛍️ Sepet</h3><button onclick="toggleCart(false)" style="background:none;border:none;color:#fff;cursor:pointer;">✕</button>
        </div>
        <div style="flex:1; padding:20px; overflow-y:auto;" id="cartItemsContainer"></div>
        <div style="padding:20px; border-top:1px solid var(--border-subtle); background:var(--bg-card);">
            <div style="display:flex; justify-content:space-between; margin-bottom:12px; color:#fff; font-weight:700;"><span>Toplam:</span><span id="cartTotal">₺0,00</span></div>
            <button class="btn-main" style="width:100%;" onclick="goToCheckout()">Ödemeye Geç ➔</button>
        </div>
    </aside>

    <!-- HEADER -->
    <header>
        <div class="nav-inner">
            <div onclick="showPage('home')" class="brand-logo-container">ROVENTRA</div>
            <nav class="nav-links">
                <span onclick="showPage('home')" class="nav-item active" id="nav-home">Ana Sayfa</span>
                <span onclick="showPage('collection')" class="nav-item" id="nav-collection">Koleksiyon</span>
                <span onclick="showPage('tracking')" class="nav-item" id="nav-tracking">Sipariş Takibi</span>
                <span onclick="showPage('admin')" class="nav-item" id="nav-admin" style="display:none; color:var(--accent-primary);">Yönetici Paneli</span>
            </nav>
            <div class="nav-actions">
                <button class="action-icon" onclick="toggleAuthModal(true)">👤</button>
                <button class="action-icon" onclick="toggleCart(true)">🛍️<span class="badge-count" id="cartBadge">0</span></button>
            </div>
        </div>
    </header>

    <!-- VIEWS -->
    <main id="home-page" class="page-view active">
        <section class="hero">
            <div class="hero-container">
                <h1 class="hero-title">Erkek Modasında <span>Modern Duruş</span></h1>
                <button class="btn-main" onclick="showPage('collection')">Koleksiyonu İncele</button>
            </div>
        </section>
        <section class="catalog-sec"><div class="container"><div class="products-grid" id="homeProductsGrid"></div></div></section>
    </main>

    <main id="collection-page" class="page-view">
        <div style="padding-top:140px;" class="container"><h1 style="color:#fff; margin-bottom:30px;">Tüm Ürünler</h1><div class="products-grid" id="fullProductsGrid"></div></div>
    </main>

    <main id="tracking-page" class="page-view">
        <div style="padding-top:140px;" class="container"><h1 style="color:#fff; margin-bottom:20px;">Sipariş Takibi</h1>
            <div style="max-width:450px; background:var(--bg-surface); padding:24px; border-radius:12px;">
                <div class="form-group"><label>Sipariş Kodu</label><input type="text" id="trackCode" class="form-input" placeholder="ROV-XXXXXX"></div>
                <div class="form-group"><label>E-Posta</label><input type="email" id="trackEmail" class="form-input"></div>
                <button class="btn-main" style="width:100%;" onclick="queryTracking()">Sorgula</button>
            </div>
            <div id="trackingResult" style="margin-top:20px; background:var(--bg-card); padding:20px; border-radius:12px; display:none;"></div>
        </div>
    </main>

    <main id="checkout-page" class="page-view">
        <div style="padding-top:140px;" class="container"><h1 style="color:#fff; margin-bottom:20px;">Ödeme</h1>
            <div style="max-width:500px; background:var(--bg-surface); padding:24px; border-radius:12px;">
                <div class="form-group"><label>Ad Soyad</label><input type="text" id="chkName" class="form-input"></div>
                <div class="form-group"><label>E-Posta</label><input type="email" id="chkEmail" class="form-input"></div>
                <div class="form-group"><label>Adres</label><input type="text" id="chkAddress" class="form-input"></div>
                <button class="btn-main" style="width:100%; margin-top:10px;" onclick="completeOrder()">Ödemeyi Onayla</button>
            </div>
        </div>
    </main>

    <main id="admin-page" class="page-view">
        <div style="padding-top:140px;" class="container"><h1 style="color:#fff; margin-bottom:20px;">Yönetici Paneli</h1>
            <div style="background:var(--bg-surface); padding:20px; border-radius:12px; margin-bottom:30px;">
                <h3 style="color:#fff; margin-bottom:12px;">Yeni Ürün Ekle</h3>
                <div class="form-group"><label>Ürün Adı</label><input type="text" id="newTitle" class="form-input"></div>
                <div class="form-group"><label>Kategori</label><input type="text" id="newCat" class="form-input"></div>
                <div class="form-group"><label>Fiyat</label><input type="number" id="newPrice" class="form-input"></div>
                <div class="form-group"><label>Görsel URL</label><input type="text" id="newImg" class="form-input" placeholder="https://..."></div>
                <button class="btn-main" onclick="addNewProduct()">Ekle</button>
            </div>
            <table class="admin-table"><thead><tr><th>Kod</th><th>Müşteri</th><th>Tutar</th><th>Durum</th><th>İşlem</th></tr></thead><tbody id="adminOrdersBody"></tbody></table>
        </div>
    </main>

    <script>
        const socket = io();
        let products = [], cart = [], currentUser = null, isRegisterMode = false;

        async function initStore() {
            const res = await fetch('/api/products'); products = await res.json(); renderProducts();
            const authRes = await fetch('/api/auth/me'); const authData = await authRes.json();
            if (authData.user) { currentUser = authData.user; updateAuthUI(); }
        }

        function showPage(page) {
            document.querySelectorAll('.page-view').forEach(el => el.classList.remove('active'));
            document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
            if(page==='home'){document.getElementById('home-page').classList.add('active');document.getElementById('nav-home').classList.add('active');}
            if(page==='collection'){document.getElementById('collection-page').classList.add('active');document.getElementById('nav-collection').classList.add('active');}
            if(page==='tracking'){document.getElementById('tracking-page').classList.add('active');document.getElementById('nav-tracking').classList.add('active');}
            if(page==='checkout'){document.getElementById('checkout-page').classList.add('active');}
            if(page==='admin'){
                if(!currentUser || currentUser.role!=='admin'){alert('Yetkisiz erişim! Admin girişi yapın.'); return;}
                document.getElementById('admin-page').classList.add('active');document.getElementById('nav-admin').classList.add('active');loadAdminOrders();
            }
            window.scrollTo({top:0, behavior:'smooth'});
        }

        function renderProducts() {
            const card = p => \`<div class="product-card">
                <div class="img-container"><img src="\${p.img}"></div>
                <div class="product-details"><div style="color:var(--accent-primary); font-size:0.75rem; font-weight:700;">\${p.category}</div>
                <h3 class="p-title">\${p.title}</h3><div class="p-price">₺\${p.price},00</div>
                <button class="btn-main" style="width:100%; margin-top:10px; padding:10px;" onclick="addToCart(\${p.id})">Sepete Ekle</button></div></div>\`;
            document.getElementById('homeProductsGrid').innerHTML = products.slice(0, 4).map(card).join('');
            document.getElementById('fullProductsGrid').innerHTML = products.map(card).join('');
        }

        function addToCart(id) {
            const p = products.find(x => x.id === id);
            const exist = cart.find(x => x.id === id);
            if(exist) exist.qty++; else cart.push({...p, qty:1});
            updateCartUI(); toggleCart(true);
        }

        function updateCartUI() {
            document.getElementById('cartBadge').innerText = cart.reduce((a,b)=>a+b.qty,0);
            let sub=0, html='';
            cart.forEach((item, idx) => {
                sub += item.price * item.qty;
                html += \`<div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-card); padding:10px; border-radius:8px; margin-bottom:10px;">
                    <span style="color:#fff;">\${item.title} (x\${item.qty})</span><span style="color:var(--accent-primary);">₺\${item.price * item.qty}</span>
                    <button onclick="cart.splice(\${idx},1); updateCartUI();" style="background:none;border:none;color:#ef4444;cursor:pointer;">Sil</button></div>\`;
            });
            document.getElementById('cartItemsContainer').innerHTML = html || '<p style="color:#94a3b8; text-align:center;">Sepet boş</p>';
            document.getElementById('cartTotal').innerText = \`₺\${sub},00\`;
        }

        function toggleCart(open){document.getElementById('cartOverlay').classList.toggle('active', open); document.getElementById('cartDrawer').classList.toggle('active', open);}
        function toggleAuthModal(open){document.getElementById('authOverlay').classList.toggle('active', open); document.getElementById('authModal').classList.toggle('active', open);}
        function toggleAuthMode(){
            isRegisterMode = !isRegisterMode;
            document.getElementById('authTitle').innerText = isRegisterMode ? 'Kayıt Ol' : 'Giriş Yap';
            document.getElementById('registerFields').style.display = isRegisterMode ? 'block' : 'none';
        }

        async function handleAuthSubmit(){
            const email = document.getElementById('authEmail').value, password = document.getElementById('authPassword').value;
            if(isRegisterMode){
                const name = document.getElementById('regName').value;
                const res = await fetch('/api/register', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name,email,password})});
                const d = await res.json(); if(d.success){alert('Kayıt başarılı!'); toggleAuthMode();} else alert(d.error);
            } else {
                const res = await fetch('/api/login', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email,password})});
                const d = await res.json(); if(d.success){currentUser=d.user; updateAuthUI(); toggleAuthModal(false); alert('Giriş başarılı!'); if(currentUser.role==='admin') showPage('admin');} else alert(d.error);
            }
        }

        function updateAuthUI(){ if(currentUser && currentUser.role==='admin') document.getElementById('nav-admin').style.display='block'; }
        function goToCheckout(){ if(cart.length===0){alert('Sepet boş'); return;} toggleCart(false); showPage('checkout'); }

        async function completeOrder(){
            const customerName = document.getElementById('chkName').value, email = document.getElementById('chkEmail').value, address = document.getElementById('chkAddress').value;
            const totalAmount = cart.reduce((a,b)=>a+(b.price*b.qty),0);
            if(!customerName || !email){alert('Bilgileri doldurun'); return;}
            const res = await fetch('/api/orders', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({customerName,email,phone:'05000000000',address,city:'İstanbul',totalAmount,items:cart})});
            const d = await res.json();
            if(d.success){alert('Sipariş Alındı! Kod: ' + d.orderCode); cart=[]; updateCartUI(); showPage('tracking'); document.getElementById('trackCode').value=d.orderCode; document.getElementById('trackEmail').value=email; queryTracking();}
        }

        async function queryTracking(){
            const code = document.getElementById('trackCode').value, email = document.getElementById('trackEmail').value;
            const res = await fetch(\`/api/orders/track?code=\${code}&email=\${email}\`); const d = await res.json();
            const p = document.getElementById('trackingResult'); p.style.display='block';
            if(d.error){p.innerHTML=\`<span style="color:#ef4444;">\${d.error}</span>\`; return;}
            p.innerHTML = \`<h3 style="color:#fff;">Durum: <span style="color:var(--accent-primary);">\${d.status}</span></h3><p>Kargo: \${d.courier} (\${d.tracking_no})</p>\`;
        }

        async function loadAdminOrders(){
            const res = await fetch('/api/admin/orders'); const orders = await res.json();
            document.getElementById('adminOrdersBody').innerHTML = orders.map(o => \`<tr><td>\${o.order_code}</td><td>\${o.customer_name}</td><td>₺\${o.total_amount}</td><td>\${o.status}</td>
            <td><button onclick="updateOrderStatus(\${o.id}, 'Kargoda')" class="btn-main" style="padding:4px 8px; font-size:0.7rem;">Kargola</button></td></tr>\`).join('');
        }

        async function updateOrderStatus(id, status){
            await fetch(\`/api/admin/orders/\${id}\`, {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({status})});
            loadAdminOrders();
        }

        async function addNewProduct(){
            const title = document.getElementById('newTitle').value, category = document.getElementById('newCat').value, price = document.getElementById('newPrice').value, img = document.getElementById('newImg').value;
            if(!title || !price){alert('Zorunlu alanlar eksik'); return;}
            const res = await fetch('/api/admin/products', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({title, category, price, img})});
            const d = await res.json();
            if(d.success){alert('Ürün eklendi!'); const pr = await fetch('/api/products'); products = await pr.json(); renderProducts();}
        }

        socket.on('newOrder', d => { if(currentUser && currentUser.role==='admin') { alert('Yeni Sipariş: ' + d.orderCode); loadAdminOrders(); } });
        window.onload = initStore;
    </script>
</body>
</html>`);
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Roventra Tek Dosya Uygulaması http://localhost:${PORT} adresinde çalışıyor.`);
});
