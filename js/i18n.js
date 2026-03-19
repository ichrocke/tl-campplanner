/* ========================================
   I18n – Internationalisierung
   ======================================== */

const I18n = (() => {
    let _lang = 'de';
    let _translations = {};
    let _onChangeCallbacks = [];

    function load(lang) {
        // Try embedded translations first (offline mode)
        if (window._offlineLangs && window._offlineLangs[lang]) {
            _translations = typeof window._offlineLangs[lang] === 'string'
                ? JSON.parse(window._offlineLangs[lang])
                : window._offlineLangs[lang];
            _lang = lang;
            return;
        }
        // Try XHR (works on http://, may fail on file://)
        try {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', 'lang/' + lang + '.json?v=' + Date.now(), false);
            xhr.send();
            if (xhr.status === 200 || (xhr.status === 0 && xhr.responseText)) {
                _translations = JSON.parse(xhr.responseText);
                _lang = lang;
                return;
            }
        } catch (e) {}
        // Fallback: try to load via dynamic script tag
        try {
            const script = document.createElement('script');
            script.src = 'lang/' + lang + '.json';
            document.head.appendChild(script);
        } catch (e) {}
    }

    function t(key, params) {
        let text = _translations[key] || key;
        if (params) {
            Object.keys(params).forEach(k => {
                text = text.replace('{' + k + '}', params[k]);
            });
        }
        return text;
    }

    function setLang(lang) {
        load(lang);
        updateDOM();
        _onChangeCallbacks.forEach(fn => fn(lang));
    }

    function updateDOM() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            el.textContent = t(el.dataset.i18n);
        });
        document.querySelectorAll('[data-i18n-title]').forEach(el => {
            el.title = t(el.dataset.i18nTitle);
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            el.placeholder = t(el.dataset.i18nPlaceholder);
        });
        document.title = t('app.title');
    }

    function onChange(fn) {
        _onChangeCallbacks.push(fn);
    }

    // Load default language
    load('en');

    return { t, setLang, updateDOM, onChange, get lang() { return _lang; } };
})();
