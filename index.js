require('dotenv').config();
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const port = process.env.PORT || 3000;

// --- Ayarlar (.env.example dosyasına bakın) ---
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || '1234';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const TOKEN_TTL_MS = 2 * 60 * 60 * 1000; // 2 saat

if (!process.env.ADMIN_PASS) {
    console.warn('UYARI: ADMIN_PASS tanımlı değil, varsayılan demo şifresi kullanılıyor. Yayına almadan önce .env ile değiştirin.');
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const db = new sqlite3.Database(path.join(__dirname, 'cafe.db'), (err) => {
    if (err) console.error(err.message);
    else console.log('SQLite veritabanına bağlanıldı.');
});

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

    // Eski veritabanlarına yeni sütunları ekle, sonra menü boşsa örnek ürünlerle doldur
    db.all("PRAGMA table_info(menu)", (err, cols) => {
        if (err) return console.error(err.message);
        const names = cols.map((c) => c.name);

        db.serialize(() => {
            if (!names.includes('description')) db.run("ALTER TABLE menu ADD COLUMN description TEXT DEFAULT ''");
            if (!names.includes('image')) db.run("ALTER TABLE menu ADD COLUMN image TEXT DEFAULT ''");

            db.get("SELECT count(*) as count FROM menu", (err, row) => {
                if (err || row.count !== 0) return;
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
                stmt.finalize();
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

function safeEqual(a, b) {
    const ha = crypto.createHash('sha256').update(String(a)).digest();
    const hb = crypto.createHash('sha256').update(String(b)).digest();
    return crypto.timingSafeEqual(ha, hb);
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
    if (safeEqual(username ?? '', ADMIN_USER) && safeEqual(password ?? '', ADMIN_PASS)) {
        return res.json({ token: createToken() });
    }
    res.status(401).json({ error: 'Kullanıcı adı veya şifre yanlış!' });
});

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

app.post('/api/menu', requireAuth, (req, res) => {
    const { error, name, price, category, description, image } = parseMenuBody(req.body);
    if (error) return res.status(400).json({ error });

    db.get("SELECT id FROM menu WHERE name = ? COLLATE NOCASE", [name], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
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

    db.run("UPDATE menu SET name = ?, price = ?, category = ?, description = ?, image = ? WHERE id = ?", [name, price, category, description, image, req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Ürün bulunamadı.' });
        res.json({ id: Number(req.params.id), name, price, category, description, image });
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

app.listen(port, () => {
    console.log(`Sunucu çalışıyor: http://localhost:${port}`);
});
