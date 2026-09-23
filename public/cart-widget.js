// Sepet düğmesi + kayan panel (offcanvas): navbar'ı olan her sayfada kullanılabilir.
(function () {
    function esc(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    document.addEventListener('DOMContentLoaded', function () {
        var navHost = document.querySelector('.navbar-icons') || document.querySelector('.navbar .navbar-nav') || document.querySelector('.navbar .container');
        if (!navHost || !window.Cart) return;

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cart-toggle';
        btn.setAttribute('aria-label', 'Sepeti aç');
        btn.innerHTML = '🛒<span class="cart-badge" hidden>0</span>';
        navHost.appendChild(btn);

        var panelHtml = ''
            + '<div class="cart-backdrop" hidden></div>'
            + '<aside class="cart-panel" hidden aria-hidden="true" role="dialog" aria-label="Sepetim">'
            + '  <div class="cart-panel__header">'
            + '    <h3 class="m-0">Sepetim</h3>'
            + '    <button type="button" class="btn-close cart-close" aria-label="Kapat"></button>'
            + '  </div>'
            + '  <div class="cart-panel__body" id="cartBody"></div>'
            + '  <div class="cart-panel__footer">'
            + '    <div class="d-flex justify-content-between mb-2"><span>Toplam</span><strong id="cartTotal">0 TL</strong></div>'
            + '    <textarea id="cartNote" class="form-control mb-2" rows="2" maxlength="300" placeholder="Sipariş notu (isteğe bağlı)"></textarea>'
            + '    <button type="button" id="cartSubmit" class="btn btn-primary w-100" style="background-color:#8B4513;border:none;">Siparişi Ver</button>'
            + '    <p id="cartMsg" class="small mt-2 mb-0" aria-live="polite"></p>'
            + '  </div>'
            + '</aside>';
        document.body.insertAdjacentHTML('beforeend', panelHtml);

        var panel = document.querySelector('.cart-panel');
        var backdrop = document.querySelector('.cart-backdrop');
        var body = document.getElementById('cartBody');
        var totalEl = document.getElementById('cartTotal');
        var badge = btn.querySelector('.cart-badge');
        var msg = document.getElementById('cartMsg');

        function open() {
            panel.hidden = false; backdrop.hidden = false;
            panel.setAttribute('aria-hidden', 'false');
            requestAnimationFrame(function () { panel.classList.add('cart-panel--open'); backdrop.classList.add('cart-backdrop--open'); });
        }
        function close() {
            panel.classList.remove('cart-panel--open'); backdrop.classList.remove('cart-backdrop--open');
            panel.setAttribute('aria-hidden', 'true');
            setTimeout(function () { panel.hidden = true; backdrop.hidden = true; }, 200);
        }

        function render() {
            var items = window.Cart.items();
            badge.textContent = window.Cart.count();
            badge.hidden = items.length === 0;
            totalEl.textContent = window.Cart.total() + ' TL';

            if (items.length === 0) {
                body.innerHTML = '<p class="text-center text-muted py-4 mb-0">Sepetiniz boş.</p>';
                return;
            }
            body.innerHTML = items.map(function (i) {
                return ''
                    + '<div class="cart-item" data-id="' + i.id + '">'
                    + '  <div class="cart-item__info">'
                    + '    <div class="cart-item__name">' + esc(i.name) + '</div>'
                    + '    <div class="cart-item__price">' + i.price + ' TL</div>'
                    + '  </div>'
                    + '  <div class="cart-item__qty">'
                    + '    <button type="button" class="qty-btn" data-action="dec" aria-label="Azalt">−</button>'
                    + '    <span>' + i.qty + '</span>'
                    + '    <button type="button" class="qty-btn" data-action="inc" aria-label="Artır">+</button>'
                    + '  </div>'
                    + '  <button type="button" class="cart-item__remove" data-action="remove" aria-label="Kaldır">✕</button>'
                    + '</div>';
            }).join('');
        }

        btn.addEventListener('click', open);
        document.querySelector('.cart-close').addEventListener('click', close);
        backdrop.addEventListener('click', close);
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
        document.addEventListener('cart:change', render);

        body.addEventListener('click', function (e) {
            var el = e.target.closest('[data-action]');
            if (!el) return;
            var id = el.closest('.cart-item').dataset.id;
            var current = window.Cart.items().find(function (i) { return String(i.id) === id; });
            if (!current) return;
            if (el.dataset.action === 'inc') window.Cart.setQty(id, current.qty + 1);
            else if (el.dataset.action === 'dec') {
                if (current.qty <= 1) window.Cart.remove(id); else window.Cart.setQty(id, current.qty - 1);
            } else if (el.dataset.action === 'remove') window.Cart.remove(id);
        });

        document.getElementById('cartSubmit').addEventListener('click', function () {
            var items = window.Cart.items();
            if (items.length === 0) return;
            var submitBtn = this;
            submitBtn.disabled = true;
            msg.textContent = '';
            msg.className = 'small mt-2 mb-0';

            fetch('/api/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    items: items.map(function (i) { return { id: i.id, qty: i.qty }; }),
                    note: document.getElementById('cartNote').value
                })
            })
                .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
                .then(function (res) {
                    if (!res.ok) throw new Error(res.data.error || 'Sipariş gönderilemedi.');
                    window.Cart.clear();
                    document.getElementById('cartNote').value = '';
                    msg.textContent = 'Siparişiniz alındı, teşekkürler! ✅';
                    msg.classList.add('text-success');
                    setTimeout(close, 1500);
                })
                .catch(function (err) {
                    msg.textContent = err.message;
                    msg.classList.add('text-danger');
                })
                .finally(function () { submitBtn.disabled = false; });
        });

        render();
    });
})();
