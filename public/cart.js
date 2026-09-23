// Sepet: tarayıcıda (localStorage) saklanır, sunucuya sadece sipariş verilince gönderilir.
window.Cart = (function () {
    var KEY = 'cafe-keyif-cart';

    function read() {
        try {
            var raw = JSON.parse(localStorage.getItem(KEY) || '{}');
            return raw && typeof raw === 'object' ? raw : {};
        } catch (e) { return {}; }
    }
    function write(state) {
        try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* sessizce geç */ }
        document.dispatchEvent(new CustomEvent('cart:change', { detail: state }));
    }

    var state = read(); // { [productId]: { id, name, price, qty } }

    function add(product, qty) {
        qty = qty || 1;
        var id = String(product.id);
        var existing = state[id];
        var newQty = Math.min(20, (existing ? existing.qty : 0) + qty);
        state[id] = { id: product.id, name: product.name, price: product.price, qty: newQty };
        write(state);
    }
    function setQty(id, qty) {
        id = String(id);
        if (!state[id]) return;
        qty = Math.max(1, Math.min(20, qty));
        state[id].qty = qty;
        write(state);
    }
    function remove(id) {
        delete state[String(id)];
        write(state);
    }
    function clear() {
        state = {};
        write(state);
    }
    function items() {
        return Object.values(state);
    }
    function count() {
        return items().reduce(function (sum, i) { return sum + i.qty; }, 0);
    }
    function total() {
        return Math.round(items().reduce(function (sum, i) { return sum + i.price * i.qty; }, 0) * 100) / 100;
    }

    return { add: add, setQty: setQty, remove: remove, clear: clear, items: items, count: count, total: total };
})();
