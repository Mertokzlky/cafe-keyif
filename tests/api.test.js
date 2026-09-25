// Testler gerçek bir sunucu başlatmaz; bellekte (:memory:) ayrı bir veritabanıyla
// Express uygulamasını doğrudan supertest ile çağırır.
process.env.DB_PATH = ':memory:';
process.env.ADMIN_USER = 'admin';
process.env.ADMIN_PASS = 'test-sifre-123';
process.env.SESSION_SECRET = 'test-secret';

const request = require('supertest');
const { app, ready } = require('../index');

let token;

beforeAll(async () => {
    await ready;
    const res = await request(app)
        .post('/api/login')
        .send({ username: 'admin', password: 'test-sifre-123' });
    token = res.body.token;
});

describe('Kimlik doğrulama', () => {
    test('yanlış şifreyle giriş reddedilir', async () => {
        const res = await request(app)
            .post('/api/login')
            .send({ username: 'admin', password: 'yanlis-sifre' });
        expect(res.status).toBe(401);
    });

    test('doğru bilgiyle giriş token döner', () => {
        expect(token).toEqual(expect.any(String));
    });
});

describe('Menü', () => {
    test('menü herkese açıktır ve örnek ürünler yüklenir', async () => {
        const res = await request(app).get('/api/menu');
        expect(res.status).toBe(200);
        expect(res.body.length).toBeGreaterThanOrEqual(10);
    });

    test('token olmadan ürün eklenemez', async () => {
        const res = await request(app)
            .post('/api/menu')
            .send({ name: 'Yetkisiz Ürün', price: 10, category: 'Test' });
        expect(res.status).toBe(401);
    });

    test('negatif fiyatla ürün eklenemez', async () => {
        const res = await request(app)
            .post('/api/menu')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'Negatif Ürün', price: -5, category: 'Test' });
        expect(res.status).toBe(400);
    });

    test('yönetici geçerli bir ürün ekleyebilir', async () => {
        const res = await request(app)
            .post('/api/menu')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'Test Ürünü', price: 20, category: 'Test' });
        expect(res.status).toBe(201);
        expect(res.body.name).toBe('Test Ürünü');
    });

    test('aynı isimde ikinci ürün eklenemez (Türkçe büyük/küçük harf dahil)', async () => {
        const res = await request(app)
            .post('/api/menu')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'test ürünü', price: 25, category: 'Test' });
        expect(res.status).toBe(400);
    });

    test('düzenlerken başka bir ürünle aynı isim verilemez', async () => {
        const menu = await request(app).get('/api/menu');
        const latte = menu.body.find((p) => p.name === 'Latte');
        const res = await request(app)
            .put(`/api/menu/${latte.id}`)
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'ESPRESSO', price: latte.price, category: latte.category });
        expect(res.status).toBe(400);
    });
});

describe('Siparişler', () => {
    let productId;
    let productPrice;

    beforeAll(async () => {
        const menu = await request(app).get('/api/menu');
        productId = menu.body[0].id;
        productPrice = menu.body[0].price;
    });

    test('boş sepetle sipariş verilemez', async () => {
        const res = await request(app).post('/api/orders').send({ items: [] });
        expect(res.status).toBe(400);
    });

    test('fiyat istemciden değil veritabanından hesaplanır', async () => {
        const res = await request(app)
            .post('/api/orders')
            // İstemci sahte bir fiyat gönderiyor, sunucu bunu yok saymalı
            .send({ items: [{ id: productId, qty: 2, price: 1 }] });
        expect(res.status).toBe(201);
        expect(res.body.total).toBe(Math.round(productPrice * 2 * 100) / 100);
    });

    test('token olmadan sipariş listesi görülemez', async () => {
        const res = await request(app).get('/api/orders');
        expect(res.status).toBe(401);
    });

    test('yönetici sipariş durumunu güncelleyebilir', async () => {
        const orders = await request(app).get('/api/orders').set('Authorization', `Bearer ${token}`);
        const orderId = orders.body[0].id;
        const res = await request(app)
            .put(`/api/orders/${orderId}/status`)
            .set('Authorization', `Bearer ${token}`)
            .send({ status: 'Teslim edildi' });
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('Teslim edildi');
    });

    test('geçersiz durum reddedilir', async () => {
        const orders = await request(app).get('/api/orders').set('Authorization', `Bearer ${token}`);
        const orderId = orders.body[0].id;
        const res = await request(app)
            .put(`/api/orders/${orderId}/status`)
            .set('Authorization', `Bearer ${token}`)
            .send({ status: 'Kayıp' });
        expect(res.status).toBe(400);
    });
});
