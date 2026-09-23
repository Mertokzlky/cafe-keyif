// Açık/koyu tema: tercih localStorage'da saklanır, yoksa sistem temasına uyulur.
(function () {
    var KEY = 'theme';
    var root = document.documentElement;

    function read() {
        try { return localStorage.getItem(KEY); } catch (e) { return null; }
    }
    function write(v) {
        try { localStorage.setItem(KEY, v); } catch (e) { /* sessizce geç */ }
    }

    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    var theme = read() || (prefersDark ? 'dark' : 'light');
    root.setAttribute('data-bs-theme', theme); // sayfa çizilmeden uygula, yanıp sönmeyi önler

    document.addEventListener('DOMContentLoaded', function () {
        var iconsHost = document.querySelector('.navbar-icons');
        var host = iconsHost || document.querySelector('.navbar .navbar-nav') || document.querySelector('.navbar .container');
        if (!host) return;

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'theme-toggle';

        function render() {
            var dark = theme === 'dark';
            btn.textContent = dark ? '☀️' : '🌙';
            btn.setAttribute('aria-label', dark ? 'Açık temaya geç' : 'Koyu temaya geç');
            btn.title = dark ? 'Açık tema' : 'Koyu tema';
        }

        btn.addEventListener('click', function () {
            theme = theme === 'dark' ? 'light' : 'dark';
            root.setAttribute('data-bs-theme', theme);
            write(theme);
            render();
        });

        render();

        if (iconsHost || host.classList.contains('navbar-nav')) {
            host.appendChild(btn);
        } else {
            // Yönetim paneli: düğmeyi "Çıkış Yap" ile birlikte sağda grupla
            var wrap = document.createElement('div');
            wrap.className = 'd-flex align-items-center';
            btn.style.margin = '0 0.5rem 0 0';
            wrap.appendChild(btn);
            if (host.lastElementChild) wrap.appendChild(host.lastElementChild);
            host.appendChild(wrap);
        }
    });
})();
