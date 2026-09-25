require('dotenv').config({ quiet: true });
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

const app = express();
const port = process.env.PORT || 3000;

// --- Ayarlar (.env.example dosyasına bakın) ---
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const TOKEN_TTL_MS = 2 * 60 * 60 * 1000; // 2 saat

// Şifre düz metin olarak saklanmaz/karşılaştırılmaz: ADMIN_PASS_HASH varsa doğrudan
// kullanılır (önerilen), yoksa ADMIN_PASS (varsa) her başlangıçta hash'lenir.
// Hash üretmek için: npm run hash-password -- "şifreniz"
const ADMIN_PASS_HASH = process.env.ADMIN_PASS_HASH
    || bcrypt.hashSync(process.env.ADMIN_PASS || '1234', 10);

if (!process.env.ADMIN_PASS_HASH && !process.env.ADMIN_PASS) {
    console.warn('UYARI: ADMIN_PASS_HASH ya da ADMIN_PASS tanımlı değil, varsayılan demo şifresi kullanılıyor. Yayına almadan önce .env ile değiştirin.');
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'cafe.db');
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) console.error(err.message);
    else console.log('SQLite veritabanına bağlanıldı.');
});

// Tablolar oluşturulup örnek veriler yüklenene kadar 'ready' bekletir.
// Testler (bkz. tests/) sunucuyu dinlemeden önce bunu await eder.
const ready = new Promise((resolve) => {
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS menu (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            price REAL,
            category TEXT
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            email TEXT,
            message TEXT,
            date TEXT
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            items TEXT,
            total REAL,
            note TEXT,
            status TEXT DEFAULT 'Hazırlanıyor',
            date TEXT
        )`);

        // Eski veritabanlarına yeni sütunları ekle, sonra menü boşsa örnek ürünlerle doldur
        db.all("PRAGMA table_info(menu)", (err, cols) => {
            if (err) { console.error(err.message); return resolve(); }
            const names = cols.map((c) => c.name);

            db.serialize(() => {
                if (!names.includes('description')) db.run("ALTER TABLE menu ADD COLUMN description TEXT DEFAULT ''");
                if (!names.includes('image')) db.run("ALTER TABLE menu ADD COLUMN image TEXT DEFAULT ''");

                db.get("SELECT count(*) as count FROM menu", (err, row) => {
                    if (err || row.count !== 0) return resolve();
                    const samples = [
                        ["Latte", 65, "Kahve", "Yumuşak sütlü espresso, ipeksi süt köpüğüyle."],
                        ["Espresso", 45, "Kahve", "Yoğun aromalı, çift shot espresso."],
                        ["Filtre Kahve", 55, "Kahve", "Günlük demlenen, hafif içimli klasik filtre kahve."],
                        ["Pumpkin Spice Latte", 170, "Kahve", "Balkabağı ve tarçınlı baharat aromalı mevsim favorisi."],
                        ["Cheesecake", 85, "Tatlı", "Ev yapımı, taze meyve sosuyla servis edilir."],
                        ["Tiramisu", 90, "Tatlı", "Mascarpone kreması ve kahveye batırılmış bisküvi katmanları."],
                        ["Çay", 25, "Sıcak İçecek", "Demlikte servis edilen taze çay."],
                        ["Sahlep", 70, "Sıcak İçecek", "Tarçınlı, kış aylarının vazgeçilmezi."],
                        ["Limonata", 60, "Soğuk İçecek", "Taze sıkılmış limon, nane yapraklarıyla."],
                        ["Buzlu Çay", 45, "Soğuk İçecek", "Şeftali aromalı, bol buzlu."]
                    ];
                    const stmt = db.prepare("INSERT INTO menu (name, price, category, description) VALUES (?, ?, ?, ?)");
                    samples.forEach((row) => stmt.run(row));
                    stmt.finalize(resolve);
                });
            });
        });
    });
});

// --- KİMLİK DOĞRULAMA (imzalı, süreli token) ---
const sign = (payload) =>
    crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');

function createToken() {
    const expires = String(Date.now() + TOKEN_TTL_MS);
    return `${expires}.${sign(expires)}`;
}

function isValidToken(token) {
    if (typeof token !== 'string') return false;
    const [expires, signature] = token.split('.');
    if (!expires || !signature || Number(expires) < Date.now()) return false;
    const expected = Buffer.from(sign(expires));
    const given = Buffer.from(signature);
    return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

function requireAuth(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!isValidToken(token)) {
        return res.status(401).json({ error: 'Yetkisiz erişim. Lütfen giriş yapın.' });
    }
    next();
}

app.post('/api/login', (req, res) => {
    const { username, password } = req.body || {};
    const validUser = typeof username === 'string' && username === ADMIN_USER;
    const validPass = typeof password === 'string' && bcrypt.compareSync(password, ADMIN_PASS_HASH);
    if (validUser && validPass) {
        return res.json({ token: createToken() });
    }
    res.status(401).json({ error: 'Kullanıcı adı veya şifre yanlış!' });
});

// --- SİPARİŞ DURUMLARI ---
const ORDER_STATUSES = ['Hazırlanıyor', 'Teslim edildi'];

// --- DOĞRULAMA YARDIMCILARI ---
function parseMenuBody(body = {}) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const category = typeof body.category === 'string' ? body.category.trim() : '';
    const price = Number(body.price);
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    const image = typeof body.image === 'string' ? body.image.trim() : '';

    if (!name || !category || body.price === '' || body.price == null) {
        return { error: 'Lütfen tüm alanları doldurunuz.' };
    }
    if (!Number.isFinite(price) || price < 0) {
        return { error: "Fiyat geçerli bir sayı olmalı ve 0'dan küçük olamaz!" };
    }
    if (name.length > 100 || category.length > 50) {
        return { error: 'Ürün adı veya kategori çok uzun.' };
    }
    if (description.length > 200) {
        return { error: 'Açıklama en fazla 200 karakter olabilir.' };
    }
    if (image && (image.length > 500 || !/^https?:\/\/\S+$/i.test(image))) {
        return { error: 'Görsel adresi http:// veya https:// ile başlayan geçerli bir bağlantı olmalı.' };
    }
    return { name, price, category, description, image };
}

// --- MENÜ API ---
app.get('/api/menu', (req, res) => {
    db.all("SELECT * FROM menu", [], (err, rows) => {
        if (err) res.status(500).json({ error: err.message });
        else res.json(rows);
    });
});

// SQLite'ın COLLATE NOCASE'i yalnızca ASCII harfleri katlar; "İ/i", "Ü/ü" gibi
// Türkçe harfleri eşleştirmez. Bu yüzden tekrar kontrolü JS tarafında,
// Türkçe locale ile küçük harfe çevirerek yapılır.
const sameName = (a, b) => a.toLocaleLowerCase('tr') === b.toLocaleLowerCase('tr');

app.post('/api/menu', requireAuth, (req, res) => {
    const { error, name, price, category, description, image } = parseMenuBody(req.body);
    if (error) return res.status(400).json({ error });

    db.all("SELECT id, name FROM menu", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const row = rows.find((r) => sameName(r.name, name));
        if (row) return res.status(400).json({ error: `"${name}" isimli ürün zaten menüde var!` });

        db.run("INSERT INTO menu (name, price, category, description, image) VALUES (?, ?, ?, ?, ?)", [name, price, category, description, image], function (err) {
            if (err) res.status(500).json({ error: err.message });
            else res.status(201).json({ id: this.lastID, name, price, category, description, image });
        });
    });
});

app.put('/api/menu/:id', requireAuth, (req, res) => {
    const { error, name, price, category, description, image } = parseMenuBody(req.body);
    if (error) return res.status(400).json({ error });

    db.all("SELECT id, name FROM menu WHERE id != ?", [req.params.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const clash = rows.find((r) => sameName(r.name, name));
        if (clash) return res.status(400).json({ error: `"${name}" isimli ürün zaten menüde var!` });

        db.run("UPDATE menu SET name = ?, price = ?, category = ?, description = ?, image = ? WHERE id = ?", [name, price, category, description, image, req.params.id], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            if (this.changes === 0) return res.status(404).json({ error: 'Ürün bulunamadı.' });
            res.json({ id: Number(req.params.id), name, price, category, description, image });
        });
    });
});

app.delete('/api/menu/:id', requireAuth, (req, res) => {
    db.run("DELETE FROM menu WHERE id = ?", req.params.id, function (err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Ürün bulunamadı.' });
        res.json({ message: 'Silindi' });
    });
});

// --- MESAJ API ---
app.post('/api/messages', (req, res) => {
    const { name, email, message } = req.body || {};
    const clean = (v) => (typeof v === 'string' ? v.trim() : '');
    const n = clean(name), e = clean(email), m = clean(message);

    if (!n || !e || !m) {
        return res.status(400).json({ error: 'Lütfen tüm alanları doldurunuz.' });
    }
    if (n.length > 100 || e.length > 150 || m.length > 2000) {
        return res.status(400).json({ error: 'Girilen metin çok uzun.' });
    }

    const date = new Date().toLocaleString('tr-TR');
    db.run("INSERT INTO messages (name, email, message, date) VALUES (?, ?, ?, ?)", [n, e, m, date], function (err) {
        if (err) res.status(500).json({ error: err.message });
        else res.status(201).json({ message: 'Mesaj alındı' });
    });
});

app.get('/api/messages', requireAuth, (req, res) => {
    db.all("SELECT * FROM messages ORDER BY id DESC", [], (err, rows) => {
        if (err) res.status(500).json({ error: err.message });
        else res.json(rows);
    });
});

app.delete('/api/messages/:id', requireAuth, (req, res) => {
    db.run("DELETE FROM messages WHERE id = ?", req.params.id, function (err) {
        if (err) res.status(500).json({ error: err.message });
        else res.json({ message: 'Mesaj silindi' });
    });
});

// --- SİPARİŞ API ---
app.post('/api/orders', (req, res) => {
    const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];
    const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 300) : '';

    if (rawItems.length === 0) {
        return res.status(400).json({ error: 'Sepetiniz boş.' });
    }
    if (rawItems.length > 30) {
        return res.status(400).json({ error: 'Sipariş en fazla 30 farklı ürün içerebilir.' });
    }

    // Miktarları doğrula ve tekrar eden ürün id'lerini birleştir
    const qtyByProductId = new Map();
    for (const raw of rawItems) {
        const productId = Number(raw?.id);
        const qty = Number(raw?.qty);
        if (!Number.isInteger(productId) || productId <= 0) {
            return res.status(400).json({ error: 'Geçersiz ürün.' });
        }
        if (!Number.isInteger(qty) || qty < 1 || qty > 20) {
            return res.status(400).json({ error: 'Ürün adedi 1 ile 20 arasında olmalı.' });
        }
        qtyByProductId.set(productId, (qtyByProductId.get(productId) || 0) + qty);
    }

    const ids = [...qtyByProductId.keys()];
    const placeholders = ids.map(() => '?').join(',');

    // Fiyat ve isimler istemciden değil, veritabanından okunur
    db.all(`SELECT id, name, price FROM menu WHERE id IN (${placeholders})`, ids, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        if (rows.length !== ids.length) {
            return res.status(400).json({ error: 'Sepetteki bazı ürünler artık menüde yok. Sayfayı yenileyip tekrar deneyin.' });
        }

        const items = rows.map((row) => {
            const qty = qtyByProductId.get(row.id);
            return { id: row.id, name: row.name, price: row.price, qty, subtotal: Math.round(row.price * qty * 100) / 100 };
        });
        const total = Math.round(items.reduce((sum, i) => sum + i.subtotal, 0) * 100) / 100;
        const date = new Date().toLocaleString('tr-TR');

        db.run(
            'INSERT INTO orders (items, total, note, status, date) VALUES (?, ?, ?, ?, ?)',
            [JSON.stringify(items), total, note, ORDER_STATUSES[0], date],
            function (err) {
                if (err) return res.status(500).json({ error: err.message });
                res.status(201).json({ id: this.lastID, items, total, note, status: ORDER_STATUSES[0], date });
            }
        );
    });
});

app.get('/api/orders', requireAuth, (req, res) => {
    db.all('SELECT * FROM orders ORDER BY id DESC', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows.map((row) => ({ ...row, items: JSON.parse(row.items) })));
    });
});

app.put('/api/orders/:id/status', requireAuth, (req, res) => {
    const status = req.body?.status;
    if (!ORDER_STATUSES.includes(status)) {
        return res.status(400).json({ error: `Durum şunlardan biri olmalı: ${ORDER_STATUSES.join(', ')}` });
    }
    db.run('UPDATE orders SET status = ? WHERE id = ?', [status, req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Sipariş bulunamadı.' });
        res.json({ id: Number(req.params.id), status });
    });
});

if (require.main === module) {
    ready.then(() => {
        app.listen(port, () => {
            console.log(`Sunucu çalışıyor: http://localhost:${port}`);
        });
    });
}

module.exports = { app, ready, db };
