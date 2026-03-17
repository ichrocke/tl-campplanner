/* ========================================
   App – Initialisierung & Event-Binding
   ======================================== */

(function () {
    const STORAGE_KEY = 'zeltplaner_autosave';
    const STORAGE_LANG_KEY = 'zeltplaner_lang';

    // Restore language preference
    const savedLang = localStorage.getItem(STORAGE_LANG_KEY);
    if (savedLang) {
        I18n.setLang(savedLang);
    }

    // Try to restore from localStorage
    let restored = false;
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            State.importJSON(saved);
            restored = true;
        }
    } catch (e) {
        console.warn('Could not restore autosave:', e);
    }
    if (!restored) {
        State.clear(); // creates first site
    }

    // Initialize canvas
    Canvas.init(document.getElementById('canvas'));

    // Initialize UI
    UI.init();
    UI.syncSettings();
    I18n.updateDOM();

    // Update language flag highlight
    if (savedLang) {
        document.querySelectorAll('.lang-flag').forEach(b => b.classList.toggle('active', b.dataset.lang === savedLang));
    }

    // Auto-save to localStorage on state change (debounced)
    let _saveTimer = null;
    function autoSave() {
        if (localStorage.getItem('zeltplaner_autosave_enabled') === '0') return;
        clearTimeout(_saveTimer);
        _saveTimer = setTimeout(() => {
            try {
                localStorage.setItem(STORAGE_KEY, State.exportJSON());
            } catch (e) {}
        }, 500);
    }

    // Language change handler
    I18n.onChange((lang) => {
        localStorage.setItem(STORAGE_LANG_KEY, lang);
        UI.translateUI();
        UI.syncSettings();
        Canvas.render();
    });

    // State change handler
    State.onChange(() => {
        UI.buildTabs();
        UI.buildPalette();
        UI.buildPlacedList();
        UI.syncSettings();
        Canvas.render();
        autoSave();
    });

    // Canvas events
    const c = Canvas.canvas;
    c.addEventListener('mousedown', (e) => Tools.onMouseDown(e));
    c.addEventListener('mousemove', (e) => Tools.onMouseMove(e));
    c.addEventListener('mouseup', (e) => Tools.onMouseUp(e));
    c.addEventListener('wheel', (e) => Tools.onWheel(e), { passive: false });
    c.addEventListener('contextmenu', (e) => Tools.onContextMenu(e));
    c.addEventListener('dblclick', (e) => Tools.onDblClick(e));

    // Keyboard events
    document.addEventListener('keydown', (e) => Tools.onKeyDown(e));

    // Prevent browser context menu on canvas
    c.addEventListener('contextmenu', (e) => e.preventDefault());

    // Save and remind before leaving
    window.addEventListener('beforeunload', (e) => {
        try {
            localStorage.setItem(STORAGE_KEY, State.exportJSON());
        } catch (ex) { /* ignore */ }
        const hasContent = State.sites.some(s => s.objects.length > 0 || (s.grounds && s.grounds.length > 0));
        if (hasContent) {
            e.preventDefault();
            e.returnValue = I18n.t('msg.exportReminder');
        }
    });

    // Initial render
    Canvas.render();

    // Resize observer for canvas
    const ro = new ResizeObserver(() => {
        Canvas.resize();
        Canvas.render();
    });
    ro.observe(document.getElementById('canvas-container'));
})();
