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

    // Check if joining a collab room (skip localStorage in that case)
    const _isCollabRoom = new URLSearchParams(window.location.search).has('room');

    // Try to restore from localStorage (only in local mode)
    let restored = false;
    if (!_isCollabRoom) {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                State.importJSON(saved);
                restored = true;
            }
        } catch (e) {
            console.warn('Could not restore autosave:', e);
        }
    }
    if (!restored) {
        State.clear(); // creates first site
    }

    // Initialize canvas
    Canvas.init(document.getElementById('canvas'));

    // Initialize UI
    UI.init();
    UI.buildLayers();
    UI.syncSettings();
    I18n.updateDOM();

    // Update language flag highlight
    if (savedLang) {
        document.querySelectorAll('.lang-flag').forEach(b => b.classList.toggle('active', b.dataset.lang === savedLang));
    }

    // Auto-save to localStorage on state change (debounced, not in collab mode)
    let _saveTimer = null;
    function autoSave() {
        if (typeof Collab !== 'undefined' && Collab.isConnected()) return;
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
    State.onChange((skipSync) => {
        UI.buildTabs();
        UI.buildPalette();
        UI.buildPlacedList();
        UI.buildLayers();
        UI.syncSettings();
        Canvas.render();
        autoSave();
        // Collab: State zum Server pushen (wenn nicht vom Server empfangen)
        if (!skipSync && typeof Collab !== 'undefined' && Collab.isConnected()) {
            Collab.pushState();
        }
    });

    // Canvas events (mouse)
    const c = Canvas.canvas;
    c.addEventListener('mousedown', (e) => Tools.onMouseDown(e));
    c.addEventListener('mousemove', (e) => Tools.onMouseMove(e));
    c.addEventListener('mouseup', (e) => Tools.onMouseUp(e));
    c.addEventListener('wheel', (e) => Tools.onWheel(e), { passive: false });
    c.addEventListener('contextmenu', (e) => Tools.onContextMenu(e));
    c.addEventListener('dblclick', (e) => Tools.onDblClick(e));

    // Touch events (tablet)
    if (typeof Touch !== 'undefined') Touch.init(c);

    // Keyboard events
    document.addEventListener('keydown', (e) => Tools.onKeyDown(e));

    // Prevent browser context menu on canvas
    c.addEventListener('contextmenu', (e) => e.preventDefault());

    // Save and remind before leaving
    window.addEventListener('beforeunload', (e) => {
        try {
            localStorage.setItem(STORAGE_KEY, State.exportJSON());
        } catch (ex) { /* ignore */ }
        const hasContent = State.sites.some(s => s.objects.length > 0);
        if (hasContent) {
            e.preventDefault();
            e.returnValue = I18n.t('msg.exportReminder');
        }
    });

    // Legal modal (Impressum / Datenschutz)
    const legalOverlay = document.getElementById('modal-overlay');
    const legalModal = document.getElementById('modal-legal');
    const legalTitle = document.getElementById('legal-title');
    const legalBody = document.getElementById('legal-body');
    function showLegal(type) {
        if (type === 'impressum') {
            legalTitle.textContent = 'Impressum';
            legalBody.innerHTML = '<p><strong>Angaben gem. \u00a7 5 TMG</strong></p>' +
                '<p>Marc Sch\u00fc\u00dfler<br>E-Mail: marc@tyra-lorena.de</p>' +
                '<p>Private, nicht-kommerzielle Webseite.</p>';
        } else {
            legalTitle.textContent = 'Datenschutz';
            legalBody.innerHTML = '<p><strong>Datenschutzerkl\u00e4rung</strong></p>' +
                '<p>Diese Webseite wird rein privat und nicht-kommerziell betrieben.</p>' +
                '<p><strong>Keine Datenerhebung:</strong> Es werden keine personenbezogenen Daten erhoben, gespeichert oder an Dritte weitergegeben. Es gibt keine Registrierung, kein Tracking, keine Analyse-Tools und keine Cookies.</p>' +
                '<p><strong>Lokale Speicherung:</strong> Die Anwendung nutzt ausschlie\u00dflich den lokalen Speicher Ihres Browsers (localStorage), um Ihre Arbeit zwischenzuspeichern. Diese Daten verlassen Ihren Browser nicht.</p>' +
                '<p><strong>Hosting:</strong> Die Webseite wird bei einem deutschen Hoster betrieben. Beim Zugriff werden technisch bedingt Server-Logfiles erfasst (IP-Adresse, Zeitpunkt, aufgerufene Seite). Diese dienen ausschlie\u00dflich der technischen Sicherstellung des Betriebs.</p>' +
                '<p><strong>PayPal-Spende:</strong> Diese Seite enth\u00e4lt einen freiwilligen Spenden-Link zu PayPal. Erst beim Klick auf diesen Link werden Sie zu PayPal (PayPal (Europe) S.\u00e0 r.l. et Cie, S.C.A., Luxemburg) weitergeleitet. Die Datenverarbeitung erfolgt dann durch PayPal gem\u00e4\u00df deren <a href="https://www.paypal.com/de/webapps/mpp/ua/privacy-full" target="_blank" style="color:var(--primary)">Datenschutzerkl\u00e4rung</a>. Von dieser Webseite werden dabei keine Daten an PayPal \u00fcbermittelt.</p>' +
                '<p><strong>Kontakt:</strong> Marc Sch\u00fc\u00dfler, marc@tyra-lorena.de</p>';
        }
        legalModal.classList.remove('hidden');
        legalOverlay.classList.remove('hidden');
    }
    document.getElementById('link-impressum').addEventListener('click', (e) => { e.preventDefault(); showLegal('impressum'); });
    document.getElementById('link-datenschutz').addEventListener('click', (e) => { e.preventDefault(); showLegal('datenschutz'); });
    document.getElementById('legal-close').addEventListener('click', () => { legalModal.classList.add('hidden'); legalOverlay.classList.add('hidden'); });

    // Initial render
    Canvas.render();

    // Collab: Raum aus URL beitreten
    if (typeof Collab !== 'undefined') {
        const roomFromUrl = Collab.getRoomFromUrl();
        if (roomFromUrl) {
            Collab.joinRoom(roomFromUrl).then(ok => {
                if (ok) {
                    UI.updateCollabStatus();
                } else {
                    alert(I18n.t('collab.roomNotFound'));
                    // URL bereinigen
                    const url = new URL(window.location);
                    url.searchParams.delete('room');
                    history.replaceState(null, '', url);
                }
            });
        }
    }

    // Resize observer for canvas
    const ro = new ResizeObserver(() => {
        Canvas.resize();
        Canvas.render();
    });
    ro.observe(document.getElementById('canvas-container'));
})();
