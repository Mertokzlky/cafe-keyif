# ☕ Cafe Keyif

Kurgusal bir kafe için geliştirilmiş, **menü ve mesaj yönetimi** yapan tam yığın (full-stack) web uygulaması. Ziyaretçiler güncel menüyü görüntüleyip iletişim formu gönderebilir; yönetici giriş yaparak ürünleri **ekleyebilir, düzenleyebilir, silebilir** ve gelen mesajları yönetebilir.

> *English:* A full-stack café website built with Node.js, Express and SQLite. Visitors can browse the menu and send messages; an authenticated admin can manage menu items (CRUD) and read/delete contact messages.

🔗 **Canlı demo:** https://cafeprojefinal.onrender.com
*(Ücretsiz Render planında çalıştığı için ilk açılış 2-3 dakika sürebilir ve sunucu yeniden başladığında veritabanı sıfırlanır.)*

<!-- Ekran görüntülerini docs/screenshots/ klasörüne koyup aşağıdaki satırları açın -->
<!--
![Ana sayfa](docs/screenshots/home.png)
![Menü](docs/screenshots/menu.png)
![Yönetim paneli](docs/screenshots/admin.png)
-->

## Özellikler

- 📋 Kategorilere göre gruplanmış dinamik menü sayfası
- 🔧 Yönetim paneli: ürün ekleme, fiyat güncelleme, silme (CRUD)
- 🔐 Sunucu taraflı yönetici girişi (imzalı, süreli token); yönetim uçları korumalıdır
- 📩 İletişim formu ve yönetim panelinde mesaj listesi
- ✅ Sunucu tarafında doğrulama: boş alan, negatif fiyat, aynı isimli ürün kontrolü
- 🛡️ XSS'e karşı HTML kaçışı, parametreli SQL sorguları
- 📱 Bootstrap 5 ile responsive tasarım

## Teknolojiler

| Katman | Teknoloji |
| --- | --- |
| Backend | Node.js, Express 5 |
| Veritabanı | SQLite (`sqlite3`) |
| Frontend | HTML5, CSS3, JavaScript (ES6+), Bootstrap 5 |
| Barındırma | Render |

## Kurulum

Gereksinim: **Node.js 18+**

```bash
git clone https://github.com/mertokzlky/cafe-keyif.git
cd cafe-keyif
npm install
cp .env.example .env    # ardından .env içindeki değerleri düzenleyin
npm start
```

Uygulama `http://localhost:3000` adresinde açılır. Veritabanı (`cafe.db`) ilk çalıştırmada otomatik oluşturulur ve örnek ürünlerle doldurulur.

Yönetim paneli: `http://localhost:3000/login.html`
Kullanıcı adı ve şifre `.env` dosyasındaki `ADMIN_USER` ve `ADMIN_PASS` değerleridir.

### Ortam değişkenleri

| Değişken | Açıklama | Varsayılan |
| --- | --- | --- |
| `PORT` | Sunucu portu | `3000` |
| `ADMIN_USER` | Yönetici kullanıcı adı | `admin` |
| `ADMIN_PASS` | Yönetici şifresi | `1234` (yalnızca yerel demo için, yayında mutlaka değiştirin) |
| `SESSION_SECRET` | Token imzalama anahtarı | Her başlatmada rastgele üretilir |

## API

| Metot | Uç nokta | Açıklama | Yetki |
| --- | --- | --- | --- |
| `POST` | `/api/login` | Giriş yapar, token döner | Herkese açık |
| `GET` | `/api/menu` | Menüyü listeler | Herkese açık |
| `POST` | `/api/menu` | Ürün ekler | Yönetici |
| `PUT` | `/api/menu/:id` | Ürün günceller | Yönetici |
| `DELETE` | `/api/menu/:id` | Ürün siler | Yönetici |
| `POST` | `/api/messages` | İletişim mesajı gönderir | Herkese açık |
| `GET` | `/api/messages` | Mesajları listeler | Yönetici |
| `DELETE` | `/api/messages/:id` | Mesaj siler | Yönetici |

Yönetici uçları `Authorization: Bearer <token>` başlığı bekler.

## Proje yapısı

```
cafe-keyif/
├── index.js          # Express sunucusu, API ve veritabanı
├── package.json
├── .env.example      # Ortam değişkeni şablonu
├── .gitignore
└── public/           # Statik frontend
    ├── index.html    # Ana sayfa
    ├── menu.html     # Menü
    ├── about.html    # Hakkımızda
    ├── contact.html  # İletişim formu
    ├── login.html    # Yönetici girişi
    ├── admin.html    # Yönetim paneli
    └── style.css
```

## Geliştirme fikirleri

- Şifrelerin `bcrypt` ile hash'lenip veritabanında tutulması
- Ürün görseli yükleme
- Kalıcı veritabanı (PostgreSQL) ile canlıya alma
- Otomatik testler (Jest + Supertest)

## Geliştirici

**Mert Ali Kızılkaya** — Yazılım Mühendisliği öğrencisi
GitHub: [@mertokzlky](https://github.com/mertokzlky)

Web Tasarımı ve Programlama dersi final projesi olarak geliştirilmiştir.
