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
    const changelogModal = document.getElementById('modal-changelog');
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
                '<p><strong>Kollaborative R\u00e4ume:</strong> Bei Nutzung der Raum-Funktion werden die Plandaten (Objekte, Positionen, Farben etc.) auf dem Server gespeichert, damit alle Teilnehmer gemeinsam arbeiten k\u00f6nnen. Es werden keine pers\u00f6nlichen Daten wie Namen oder E-Mail-Adressen erfasst. Die Raumdaten werden nach Ablauf der eingestellten G\u00fcltigkeitsdauer automatisch gel\u00f6scht bzw. archiviert und sp\u00e4testens nach 7 Tagen endg\u00fcltig entfernt.</p>' +
                '<p><strong>Hosting:</strong> Die Webseite wird bei einem deutschen Hoster betrieben. Beim Zugriff werden technisch bedingt Server-Logfiles erfasst (IP-Adresse, Zeitpunkt, aufgerufene Seite). Diese dienen ausschlie\u00dflich der technischen Sicherstellung des Betriebs.</p>' +
                '<p><strong>PayPal-Spende:</strong> Diese Seite enth\u00e4lt einen freiwilligen Spenden-Link zu PayPal. Erst beim Klick auf diesen Link werden Sie zu PayPal (PayPal (Europe) S.\u00e0 r.l. et Cie, S.C.A., Luxemburg) weitergeleitet. Die Datenverarbeitung erfolgt dann durch PayPal gem\u00e4\u00df deren <a href="https://www.paypal.com/de/webapps/mpp/ua/privacy-full" target="_blank" style="color:var(--primary)">Datenschutzerkl\u00e4rung</a>. Von dieser Webseite werden dabei keine Daten an PayPal \u00fcbermittelt.</p>' +
                '<p><strong>Kontakt:</strong> Marc Sch\u00fc\u00dfler, marc@tyra-lorena.de</p>';
        }
        changelogModal.classList.add('hidden');
        legalModal.classList.remove('hidden');
        legalOverlay.classList.remove('hidden');
    }
    document.getElementById('link-impressum').addEventListener('click', (e) => { e.preventDefault(); showLegal('impressum'); });
    document.getElementById('link-datenschutz').addEventListener('click', (e) => { e.preventDefault(); showLegal('datenschutz'); });
    document.getElementById('legal-close').addEventListener('click', () => { legalModal.classList.add('hidden'); legalOverlay.classList.add('hidden'); });

    // Changelog modal
    const changelogNav = document.getElementById('changelog-nav');
    const changelogContent = document.getElementById('changelog-content');

    function parseChangelog(md) {
        const versions = [];
        const parts = md.split(/^## /m);
        parts.forEach(part => {
            part = part.trim();
            if (!part || !part.startsWith('[')) return;
            const nlIdx = part.indexOf('\n');
            const title = part.substring(0, nlIdx !== -1 ? nlIdx : part.length).trim();
            const body = nlIdx !== -1 ? part.substring(nlIdx + 1).trim() : '';
            versions.push({ title, body });
        });
        return versions;
    }

    function renderChangelogBody(md) {
        // Simple markdown to HTML: ### headings, **bold**, - lists, `code`
        let html = md
            .replace(/^### (.+)$/gm, '<h4 style="margin:12px 0 6px;color:var(--primary);font-size:13px">$1</h4>')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/`([^`]+)`/g, '<code style="background:var(--bg);padding:1px 4px;border-radius:3px;font-size:12px">$1</code>');
        // Convert list items
        const lines = html.split('\n');
        let inList = false;
        let result = '';
        lines.forEach(line => {
            const trimmed = line.trim();
            if (trimmed.startsWith('- ')) {
                if (!inList) { result += '<ul style="margin:4px 0;padding-left:20px">'; inList = true; }
                result += '<li style="margin:2px 0">' + trimmed.substring(2) + '</li>';
            } else {
                if (inList) { result += '</ul>'; inList = false; }
                if (trimmed) result += '<p style="margin:4px 0">' + trimmed + '</p>';
            }
        });
        if (inList) result += '</ul>';
        return result;
    }

    function getVersion(title) {
        const m = title.match(/\[(\d+)\.(\d+)\.(\d+)\]/);
        return m ? { major: parseInt(m[1]), minor: parseInt(m[2]), patch: parseInt(m[3]) } : null;
    }

    function selectVersion(btn, v) {
        changelogNav.querySelectorAll('.changelog-nav-item').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        changelogContent.innerHTML = '<h3 style="margin:0 0 12px;font-size:16px">' + v.title + '</h3>' + renderChangelogBody(v.body);
    }

    function showChangelog() {
        fetch('CHANGELOG.md?' + Date.now())
            .then(r => r.text())
            .then(md => {
                const versions = parseChangelog(md);
                changelogNav.innerHTML = '';
                let firstBtn = null;

                // Group versions by major (preserving order; first major encountered is the most recent)
                const groups = new Map();
                versions.forEach((v, i) => {
                    const ver = getVersion(v.title);
                    const major = ver ? ver.major : 0;
                    if (!groups.has(major)) groups.set(major, []);
                    groups.get(major).push({ v, i });
                });
                const activeMajor = groups.keys().next().value;

                groups.forEach((items, major) => {
                    const header = document.createElement('div');
                    header.className = 'changelog-nav-header';
                    header.textContent = 'Version ' + major;
                    const group = document.createElement('div');
                    group.className = 'changelog-nav-group';
                    if (major !== activeMajor) {
                        header.classList.add('collapsed');
                        group.classList.add('collapsed');
                    }
                    header.addEventListener('click', () => {
                        header.classList.toggle('collapsed');
                        group.classList.toggle('collapsed');
                    });
                    changelogNav.appendChild(header);
                    changelogNav.appendChild(group);

                    items.forEach(({ v, i }) => {
                        const ver = getVersion(v.title);
                        const btn = document.createElement('button');
                        const isMajor = ver && ver.minor === 0 && ver.patch === 0;
                        btn.className = 'changelog-nav-item' + (isMajor ? ' major' : '');
                        const display = v.title.replace(/^\[/, '').replace(/\]/, '');
                        btn.textContent = display.replace(' - ', '  ');
                        btn.addEventListener('click', () => selectVersion(btn, v));
                        group.appendChild(btn);
                        if (i === 0) firstBtn = btn;
                    });
                });

                if (firstBtn && versions.length > 0) {
                    selectVersion(firstBtn, versions[0]);
                }
                legalModal.classList.add('hidden');
                changelogModal.classList.remove('hidden');
                legalOverlay.classList.remove('hidden');
            });
    }

    document.getElementById('link-changelog').addEventListener('click', (e) => { e.preventDefault(); showChangelog(); });
    document.getElementById('changelog-close').addEventListener('click', () => { changelogModal.classList.add('hidden'); legalOverlay.classList.add('hidden'); });

    // Daten-Warnung als Modal
    window.showDataWarning = function() {
        if (sessionStorage.getItem('data_warning_shown')) return;
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px';
        const box = document.createElement('div');
        box.style.cssText = 'background:#fff;border-radius:12px;max-width:480px;width:100%;padding:24px;box-shadow:0 8px 32px rgba(0,0,0,0.3);display:flex;gap:16px;align-items:flex-start';
        const svg = '<svg viewBox="0 0 600 524" xmlns="http://www.w3.org/2000/svg" style="min-width:48px;width:48px;flex-shrink:0;align-self:stretch"><path d="m300 16 284 492h-568z" fill="#F9A800" stroke-linejoin="round" stroke="#000" stroke-width="32"/><path d="m337 192a37 37 0 0 0-74 0l11 143a26 26 0 0 0 52 0m12 85a38 38 0 1 1 0-1"/></svg>';
        const right = document.createElement('div');
        right.style.cssText = 'flex:1';
        const msg = document.createElement('p');
        msg.style.cssText = 'margin:0 0 16px;font-size:14px;line-height:1.5;color:#1a1a2e';
        msg.textContent = I18n.t('collab.dataWarning').replace(/^\u26A0\s*/, '');
        const btn = document.createElement('button');
        btn.textContent = I18n.t('collab.dataWarningOk');
        btn.style.cssText = 'padding:8px 20px;border:none;border-radius:8px;background:#1a1a2e;color:#fff;font-size:14px;cursor:pointer';
        btn.addEventListener('click', () => { overlay.remove(); });
        right.appendChild(msg);
        right.appendChild(btn);
        box.innerHTML = svg;
        box.appendChild(right);
        overlay.appendChild(box);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        document.body.appendChild(overlay);
        sessionStorage.setItem('data_warning_shown', '1');
    };

    // Initial render
    Canvas.render();

    // Daten-Warnung (einmal pro Session)
    if (!sessionStorage.getItem('data_warning_shown')) {
        showDataWarning();
    }

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
