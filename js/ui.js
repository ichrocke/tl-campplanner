/* ========================================
   UI – DOM-Interaktionen, Panels, Dialoge
   ======================================== */
const UI = (() => {
    let contextMenuEl = null;

    let _savedColors = ['#4a90d9', '#ea580c', '#22c55e', '#9333ea', '#ef4444', '#f59e0b'];
    let _activeColorIdx = 0;

    function syncColorsToState() {
        State._colorPalette = { colors: [..._savedColors], active: _activeColorIdx };
    }
    function syncColorsFromState() {
        if (State._colorPalette && State._colorPalette.colors) {
            _savedColors = State._colorPalette.colors;
            _activeColorIdx = State._colorPalette.active || 0;
        }
    }

    function init() {
        buildPalette();
        buildTabs();
        buildPlacedList();
        bindToolbar();
        bindSettings();
        bindModals();
        bindContextMenuClose();
        bindPaletteToggle();
        bindFloatingTools();
        bindLangFlags();
        syncColorsFromState();
        buildColorSwatches();
        bindSidebarDivider();
        bindLayers();
        // (responsive sidebar removed)
    }

    // --- Layers ---
    function bindLayers() {
        document.getElementById('btn-add-layer').addEventListener('click', () => {
            const site = State.activeSite;
            if (!site) return;
            const name = prompt(I18n.t('layer.rename'), I18n.t('layer.title') + ' ' + (site.layers.length + 1));
            if (!name || !name.trim()) return;
            const newLayer = { id: State.generateId(), name: name.trim(), visible: true, locked: false };
            site.layers.unshift(newLayer);
            site.activeLayerId = newLayer.id;
            State.notifyChange(true);
            buildLayers();
        });
    }

    function buildLayers() {
        const container = document.getElementById('layers-list');
        container.innerHTML = '';
        const site = State.activeSite;
        if (!site || !site.layers) return;

        site.layers.forEach((layer, i) => {
            const el = document.createElement('div');
            el.className = 'layer-item' + (layer.id === site.activeLayerId ? ' active' : '');
            const objCount = site.objects.filter(o => o.layerId === layer.id).length;

            const lColor = layer.color || '#888';
            el.innerHTML = `
                <span class="layer-color-dot" style="background:${lColor}"></span>
                <button class="layer-vis-btn ${layer.visible ? '' : 'off'}" title="Visibility">${layer.visible ? '\u{1F441}' : '\u{1F441}'}</button>
                <button class="layer-lock-btn ${layer.locked ? 'on' : ''}" title="Lock">${layer.locked ? '\u{1F6AB}' : '\u{1F513}'}</button>
                <span class="layer-name" title="${layer.name}">${layer.name}</span>
                <span style="font-size:9px;color:var(--text-secondary)">${objCount}</span>
                <div class="layer-order-btns">
                    <button class="layer-order-btn" data-dir="up" title="Up">&#9650;</button>
                    <button class="layer-order-btn" data-dir="down" title="Down">&#9660;</button>
                </div>
                ${site.layers.length > 1 ? '<button class="layer-del-btn" title="Delete">&times;</button>' : ''}`;

            // Click to set active layer
            el.addEventListener('click', (e) => {
                if (e.target.closest('.layer-vis-btn') || e.target.closest('.layer-lock-btn') ||
                    e.target.closest('.layer-order-btn') || e.target.closest('.layer-del-btn')) return;
                site.activeLayerId = layer.id;
                State.notifyChange(true);
                buildLayers();
            });

            // Color dot click
            el.querySelector('.layer-color-dot').addEventListener('click', (e) => {
                e.stopPropagation();
                openColorPicker(layer.color || '#888', (c) => {
                    layer.color = c;
                    State.notifyChange(true);
                    buildLayers();
                });
            });

            // Right-click for layer options
            el.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const items = [
                    { label: I18n.t('tab.rename'), action: () => {
                        const n = prompt(I18n.t('layer.rename'), layer.name);
                        if (n && n.trim()) { layer.name = n.trim(); State.notifyChange(true); buildLayers(); }
                    }},
                    { label: I18n.t('layer.opacity'), action: () => {
                        const o = prompt(I18n.t('layer.opacity') + ' (0.1-1.0):', layer.opacity !== undefined ? layer.opacity : 1);
                        if (o !== null) { layer.opacity = Math.max(0.1, Math.min(1, parseFloat(o) || 1)); State.notifyChange(true); Canvas.render(); }
                    }},
                ];
                if (i < site.layers.length - 1) {
                    items.push({ label: I18n.t('layer.merge'), action: () => {
                        const targetId = site.layers[i + 1].id;
                        site.objects.forEach(o => { if (o.layerId === layer.id) o.layerId = targetId; });
                        site.layers.splice(i, 1);
                        if (site.activeLayerId === layer.id) site.activeLayerId = targetId;
                        State.notifyChange(); buildLayers(); buildPlacedList(); Canvas.render();
                    }});
                }
                if (site.layers.length > 1) {
                    items.push({ label: I18n.t('layer.flatten'), action: () => {
                        const keepId = site.layers[site.layers.length - 1].id;
                        site.objects.forEach(o => { o.layerId = keepId; });
                        site.layers = [site.layers[site.layers.length - 1]];
                        site.activeLayerId = keepId;
                        State.notifyChange(); buildLayers(); buildPlacedList(); Canvas.render();
                    }});
                }
                createContextMenuAt(e.clientX, e.clientY, items);
            });

            // Double-click to rename
            el.querySelector('.layer-name').addEventListener('dblclick', (e) => {
                e.stopPropagation();
                const newName = prompt(I18n.t('layer.rename'), layer.name);
                if (newName && newName.trim()) {
                    layer.name = newName.trim();
                    State.notifyChange(true);
                    buildLayers();
                }
            });

            // Visibility toggle
            el.querySelector('.layer-vis-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                layer.visible = !layer.visible;
                State.notifyChange(true);
                buildLayers();
                Canvas.render();
            });

            // Lock toggle
            el.querySelector('.layer-lock-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                layer.locked = !layer.locked;
                State.notifyChange(true);
                buildLayers();
            });

            // Reorder
            el.querySelectorAll('.layer-order-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const dir = btn.dataset.dir;
                    if (dir === 'up' && i > 0) {
                        [site.layers[i], site.layers[i - 1]] = [site.layers[i - 1], site.layers[i]];
                    } else if (dir === 'down' && i < site.layers.length - 1) {
                        [site.layers[i], site.layers[i + 1]] = [site.layers[i + 1], site.layers[i]];
                    }
                    State.notifyChange(true);
                    buildLayers();
                    Canvas.render();
                });
            });

            // Delete
            const delBtn = el.querySelector('.layer-del-btn');
            if (delBtn) {
                delBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (!confirm(I18n.t('layer.deleteConfirm', { name: layer.name }))) return;
                    // Delete objects on this layer
                    site.objects = site.objects.filter(o => o.layerId !== layer.id);
                    Canvas.clearSelection();
                    site.layers.splice(i, 1);
                    if (site.activeLayerId === layer.id) site.activeLayerId = targetId;
                    State.notifyChange();
                    buildLayers();
                    buildPlacedList();
                    Canvas.render();
                });
            }

            container.appendChild(el);
        });
    }

    // --- Sidebar resize divider ---
    function bindSidebarDivider() {
        const sidebar = document.getElementById('sidebar');
        const sections = sidebar.querySelectorAll('.sidebar-section');
        // sections[0]=palette, sections[1]=placed, sections[2]=layers

        function setupDivider(dividerId, aboveSection, belowSection, otherSections) {
            const divider = document.getElementById(dividerId);
            if (!divider || !aboveSection || !belowSection) return;
            let dragging = false;

            function onMove(clientY) {
                const sidebarRect = sidebar.getBoundingClientRect();
                let otherH = 12; // dividers
                otherSections.forEach(s => { otherH += s.offsetHeight; });
                const y = clientY - sidebarRect.top;
                const aboveTop = aboveSection.getBoundingClientRect().top - sidebarRect.top;
                const belowBottom = belowSection.getBoundingClientRect().bottom - sidebarRect.top;
                const total = belowBottom - aboveTop - 6;
                const aboveH = Math.max(40, Math.min(total - 40, y - aboveTop));
                aboveSection.style.flex = 'none';
                aboveSection.style.height = aboveH + 'px';
                belowSection.style.flex = 'none';
                belowSection.style.height = (total - aboveH) + 'px';
            }

            divider.addEventListener('mousedown', (e) => { dragging = true; e.preventDefault(); });
            document.addEventListener('mousemove', (e) => { if (dragging) onMove(e.clientY); });
            document.addEventListener('mouseup', () => { dragging = false; });
            divider.addEventListener('touchstart', (e) => { dragging = true; e.preventDefault(); }, { passive: false });
            document.addEventListener('touchmove', (e) => { if (dragging && e.touches.length) onMove(e.touches[0].clientY); }, { passive: true });
            document.addEventListener('touchend', () => { dragging = false; });
        }

        setupDivider('sidebar-divider', sections[0], sections[1], [sections[2]]);
        setupDivider('sidebar-divider2', sections[1], sections[2], [sections[0]]);
    }

    function getActiveColor() { return _savedColors[_activeColorIdx] || _savedColors[0]; }

    function openColorPicker(initialColor, callback) {
        const existing = document.getElementById('_colorPickerTemp');
        if (existing) existing.remove();
        const input = document.createElement('input');
        input.type = 'color';
        input.id = '_colorPickerTemp';
        input.value = initialColor;
        input.style.cssText = 'position:fixed;top:50%;left:50%;width:1px;height:1px;opacity:0.01;pointer-events:none;';
        document.body.appendChild(input);
        let done = false;
        input.addEventListener('change', () => {
            if (!done) { done = true; callback(input.value); }
            input.remove();
        });
        setTimeout(() => input.click(), 10);
    }

    function buildColorSwatches() {
        syncColorsToState();
        const container = document.getElementById('color-swatches');
        container.innerHTML = '';
        _savedColors.forEach((color, i) => {
            const el = document.createElement('div');
            el.className = 'color-swatch' + (i === _activeColorIdx ? ' active' : '');
            el.style.background = color;
            el.innerHTML = '<button class="color-swatch-edit">&#9998;</button><button class="color-swatch-del">&times;</button>';
            el.addEventListener('click', (e) => {
                if (e.target.closest('.color-swatch-del')) {
                    if (_savedColors.length > 1) {
                        _savedColors.splice(i, 1);
                        if (_activeColorIdx >= _savedColors.length) _activeColorIdx = _savedColors.length - 1;
                        buildColorSwatches();
                    }
                    return;
                }
                if (e.target.closest('.color-swatch-edit')) {
                    openColorPicker(color, (newColor) => {
                        _savedColors[i] = newColor;
                        buildColorSwatches();
                    });
                    return;
                }
                _activeColorIdx = i;
                buildColorSwatches();
            });
            container.appendChild(el);
        });
    }

    // --- Floating tool palette drag ---
    function bindFloatingTools() {
        const panel = document.getElementById('floating-tools');
        const handle = document.getElementById('floating-tools-handle');
        let dragging = false, offX = 0, offY = 0;

        handle.addEventListener('mousedown', (e) => {
            dragging = true;
            offX = e.clientX - panel.offsetLeft;
            offY = e.clientY - panel.offsetTop;
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!dragging) return;
            const container = document.getElementById('canvas-container');
            const rect = container.getBoundingClientRect();
            let nx = e.clientX - offX;
            let ny = e.clientY - offY;
            // Clamp to container
            nx = Math.max(0, Math.min(rect.width - panel.offsetWidth, nx));
            ny = Math.max(0, Math.min(rect.height - panel.offsetHeight, ny));
            panel.style.left = nx + 'px';
            panel.style.top = ny + 'px';
        });

        document.addEventListener('mouseup', () => { dragging = false; });

        // Bind tool buttons inside floating panel
        panel.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
            btn.addEventListener('click', () => Tools.setTool(btn.dataset.tool));
        });

        // Prevent canvas contextmenu handler from blocking color palette right-clicks
        document.getElementById('color-palette').addEventListener('contextmenu', (e) => {
            e.stopPropagation();
        });

        // Color palette drag
        const cpanel = document.getElementById('color-palette');
        const chandle = document.getElementById('color-palette-handle');
        let cDragging = false, cOffX = 0, cOffY = 0;
        chandle.addEventListener('mousedown', (e) => {
            cDragging = true;
            cOffX = e.clientX - cpanel.offsetLeft;
            cOffY = e.clientY - cpanel.offsetTop;
            e.preventDefault();
        });
        document.addEventListener('mousemove', (e) => {
            if (!cDragging) return;
            const container = document.getElementById('canvas-container');
            const rect = container.getBoundingClientRect();
            let nx = e.clientX - cOffX;
            let ny = e.clientY - cOffY;
            nx = Math.max(0, Math.min(rect.width - cpanel.offsetWidth, nx));
            ny = Math.max(0, Math.min(rect.height - cpanel.offsetHeight, ny));
            cpanel.style.left = nx + 'px';
            cpanel.style.top = ny + 'px';
        });
        document.addEventListener('mouseup', () => { cDragging = false; });

        // Add color button
        document.getElementById('btn-add-color').addEventListener('click', () => {
            if (_savedColors.length >= 10) return;
            openColorPicker('#888888', (color) => {
                _savedColors.push(color);
                _activeColorIdx = _savedColors.length - 1;
                buildColorSwatches();
            });
        });

        // Post-it
        document.getElementById('btn-postit').addEventListener('click', () => {
            Tools.setPendingTemplate({
                type: 'postit', name: 'Note',
                width: 3, height: 3, guyRopeDistance: 0,
                color: '#fef08a', shape: 'rect', text: '',
            });
        });

        // Symbol picker
        document.getElementById('btn-symbols').addEventListener('click', () => {
            const picker = document.getElementById('symbol-picker');
            picker.classList.toggle('hidden');
            if (!picker.classList.contains('hidden')) {
                const grid = document.getElementById('symbol-grid');
                grid.innerHTML = '';
                Object.entries(Canvas.SYMBOLS).forEach(([id, sym]) => {
                    const btn = document.createElement('button');
                    btn.className = 'symbol-btn';
                    if (sym.src) {
                        const img = document.createElement('img');
                        img.src = sym.src;
                        img.width = 28; img.height = 28;
                        img.style.objectFit = 'contain';
                        btn.appendChild(img);
                    } else {
                        const cvs = document.createElement('canvas');
                        cvs.width = 32; cvs.height = 32;
                        const c = cvs.getContext('2d');
                        c.translate(16, 16);
                        c.fillStyle = sym.bg; c.strokeStyle = '#333'; c.lineWidth = 1;
                        c.beginPath(); c.roundRect(-14, -14, 28, 28, 3); c.fill(); c.stroke();
                        c.fillStyle = sym.fg; c.strokeStyle = sym.fg; c.lineWidth = 1.5;
                        sym.draw(c, 24);
                        btn.appendChild(cvs);
                    }
                    btn.title = sym.name;
                    btn.addEventListener('click', () => {
                        picker.classList.add('hidden');
                        Tools.setPendingTemplate({
                            type: 'symbol', name: sym.name,
                            width: 1.5, height: 1.5, guyRopeDistance: 0,
                            color: sym.bg, shape: 'rect', symbolId: id,
                        });
                    });
                    grid.appendChild(btn);
                });
            }
        });

        // Paint tool button
        document.getElementById('color-palette').querySelector('.color-paint-btn').addEventListener('click', () => {
            Tools.setTool('paint');
        });

        // Zoom buttons
        document.getElementById('btn-zoom-in').addEventListener('click', () => {
            const site = State.activeSite;
            if (!site) return;
            site.view.zoom = Math.min(20, site.view.zoom * 1.25);
            updateZoom(site.view.zoom);
            Canvas.render();
        });
        document.getElementById('btn-zoom-out').addEventListener('click', () => {
            const site = State.activeSite;
            if (!site) return;
            site.view.zoom = Math.max(0.05, site.view.zoom / 1.25);
            updateZoom(site.view.zoom);
            Canvas.render();
        });

        // Background image button
        document.getElementById('btn-add-bgimage').addEventListener('click', () => {
            document.getElementById('bg-file-input').click();
        });
        document.getElementById('bg-file-input').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                const site = State.activeSite;
                if (!site) return;
                // Get image dimensions for aspect ratio
                const img = new Image();
                img.onload = () => {
                    const aspect = img.naturalHeight / img.naturalWidth;
                    const w = 50;
                    const obj = State.addObject({
                        type: 'bgimage', name: I18n.t('modal.settings.bgImage'),
                        width: w, height: w * aspect,
                        guyRopeDistance: 0, color: '#888', shape: 'rect',
                        dataUrl: ev.target.result, opacity: 0.3,
                    }, 0, 0);
                    if (obj) {
                        Canvas.selectedId = obj.id;
                        showProperties(obj);
                        Canvas.render();
                    }
                };
                img.src = ev.target.result;
            };
            reader.readAsDataURL(file);
            e.target.value = '';
        });

        // Map tiles
        document.getElementById('btn-maptiles').addEventListener('click', () => {
            const site = State.activeSite;
            if (!site) return;
            const ml = site.mapLayer || {};
            document.getElementById('map-lat').value = ml.lat || '';
            document.getElementById('map-lng').value = ml.lng || '';
            document.getElementById('map-source').value = ml.source || 'osm';
            document.getElementById('map-opacity').value = ml.opacity != null ? ml.opacity : 0.5;
            document.getElementById('map-opacity-val').textContent = Math.round((ml.opacity != null ? ml.opacity : 0.5) * 100) + '%';
            document.getElementById('map-enabled').checked = !!ml.enabled;
            document.getElementById('map-rotation').value = ml.rotation || 0;
            document.getElementById('map-rotation-val').textContent = (ml.rotation || 0) + '\u00B0';
            openModal('modal-maptiles');
        });

        document.getElementById('map-opacity').addEventListener('input', (e) => {
            document.getElementById('map-opacity-val').textContent = Math.round(e.target.value * 100) + '%';
        });

        document.getElementById('map-rotation').addEventListener('input', (e) => {
            document.getElementById('map-rotation-val').textContent = e.target.value + '\u00B0';
        });

        document.getElementById('map-ok').addEventListener('click', () => {
            const site = State.activeSite;
            if (!site) return;
            if (!site.mapLayer) site.mapLayer = {};
            site.mapLayer.lat = parseFloat(document.getElementById('map-lat').value) || null;
            site.mapLayer.lng = parseFloat(document.getElementById('map-lng').value) || null;
            site.mapLayer.source = document.getElementById('map-source').value;
            site.mapLayer.opacity = parseFloat(document.getElementById('map-opacity').value);
            site.mapLayer.rotation = parseInt(document.getElementById('map-rotation').value) || 0;
            site.mapLayer.enabled = document.getElementById('map-enabled').checked;
            if (site.mapLayer.anchorWorldX == null) site.mapLayer.anchorWorldX = 0;
            if (site.mapLayer.anchorWorldY == null) site.mapLayer.anchorWorldY = 0;
            MapTiles.clearCache();
            State.notifyChange();
            Canvas.render();
            closeModal();
        });

        document.getElementById('map-cancel').addEventListener('click', closeModal);

        // Collab button
        document.getElementById('btn-collab').addEventListener('click', () => {
            if (typeof Collab === 'undefined') return;
            if (Collab.isConnected()) {
                if (confirm(I18n.t('collab.disconnectConfirm'))) {
                    Collab.disconnect();
                    updateCollabStatus();
                }
            } else {
                const roomId = prompt(I18n.t('collab.enterRoom'));
                if (roomId && roomId.trim()) {
                    Collab.joinRoom(roomId.trim()).then(ok => {
                        if (ok) {
                            updateCollabStatus();
                        } else {
                            alert(I18n.t('collab.roomNotFound'));
                        }
                    });
                }
            }
        });

        // Collab user count updates + messages
        if (typeof Collab !== 'undefined') {
            Collab.onUsersChange(() => updateCollabStatus());
            Collab.onMessage((msg) => showCollabMessage(msg));
        }
    }

    // --- Language flags ---
    function bindLangFlags() {
        document.querySelectorAll('.lang-flag').forEach(btn => {
            btn.addEventListener('click', () => {
                const lang = btn.dataset.lang;
                I18n.setLang(lang);
                document.querySelectorAll('.lang-flag').forEach(b => b.classList.toggle('active', b.dataset.lang === lang));
                document.getElementById('lang-select').value = lang;
            });
        });
    }

    // --- Object Palette (with folders and drag-to-reorder) ---
    let _paletteDragIdx = -1;
    let _collapsedFolders = {};

    function buildPalette() {
        const container = document.getElementById('object-palette');
        container.innerHTML = '';
        const site = State.activeSite;
        if (!site) return;
        const templates = site.templates || [];

        // Group templates by folder
        const folders = {};
        const rootItems = [];
        templates.forEach((t, idx) => {
            const f = t.folder || '';
            if (f) {
                if (!folders[f]) folders[f] = [];
                folders[f].push({ t, idx });
            } else {
                rootItems.push({ t, idx });
            }
        });

        // Get ordered folder names (from templateFolders + first-seen in templates)
        const folderOrder = [...(site.templateFolders || [])];
        templates.forEach(t => {
            if (t.folder && !folderOrder.includes(t.folder)) folderOrder.push(t.folder);
        });

        // Render folders
        folderOrder.forEach(fname => {
            const folderEl = document.createElement('div');
            folderEl.className = 'palette-folder';
            const collapsed = _collapsedFolders[fname];
            folderEl.innerHTML = `
                <div class="palette-folder-header">
                    <span class="palette-folder-arrow ${collapsed ? 'collapsed' : ''}">&#9660;</span>
                    <span class="palette-folder-name">${fname}</span>
                    <span class="palette-folder-count">${(folders[fname] || []).length}</span>
                    <button class="palette-folder-del" title="${I18n.t('props.delete')}">&times;</button>
                </div>`;
            const header = folderEl.querySelector('.palette-folder-header');
            header.addEventListener('click', (e) => {
                if (e.target.closest('.palette-folder-del')) {
                    // Remove folder: move items to root
                    templates.forEach(t => { if (t.folder === fname) delete t.folder; });
                    if (site.templateFolders) {
                        site.templateFolders = site.templateFolders.filter(f => f !== fname);
                    }
                    State.notifyChange(true);
                    buildPalette();
                    return;
                }
                _collapsedFolders[fname] = !_collapsedFolders[fname];
                buildPalette();
            });

            // Right-click to rename folder
            header.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                createContextMenuAt(e.clientX, e.clientY, [
                    { label: I18n.t('tab.rename'), action: () => {
                        const newName = prompt(I18n.t('btn.newFolderPrompt'), fname);
                        if (newName && newName.trim() && newName.trim() !== fname) {
                            const nn = newName.trim();
                            templates.forEach(t => { if (t.folder === fname) t.folder = nn; });
                            if (site.templateFolders) {
                                const fi = site.templateFolders.indexOf(fname);
                                if (fi >= 0) site.templateFolders[fi] = nn;
                            }
                            State.notifyChange(true); buildPalette();
                        }
                    }},
                    { sep: true },
                    { label: I18n.t('props.delete'), className: 'danger', action: () => {
                        templates.forEach(t => { if (t.folder === fname) delete t.folder; });
                        if (site.templateFolders) site.templateFolders = site.templateFolders.filter(f => f !== fname);
                        State.notifyChange(true); buildPalette();
                    }},
                ]);
            });

            // Drop zone on folder header (to move items into folder)
            header.addEventListener('dragover', (e) => { e.preventDefault(); header.classList.add('drag-over'); });
            header.addEventListener('dragleave', () => { header.classList.remove('drag-over'); });
            header.addEventListener('drop', (e) => {
                e.preventDefault();
                header.classList.remove('drag-over');
                if (_paletteDragIdx >= 0 && templates[_paletteDragIdx]) {
                    templates[_paletteDragIdx].folder = fname;
                    State.notifyChange(true);
                    buildPalette();
                }
            });

            container.appendChild(folderEl);

            if (!collapsed && folders[fname] && folders[fname].length > 0) {
                const itemsContainer = document.createElement('div');
                itemsContainer.className = 'palette-folder-items';
                folders[fname].forEach(({ t, idx }) => {
                    itemsContainer.appendChild(buildPaletteItem(t, idx, templates));
                });
                container.appendChild(itemsContainer);
            }
        });

        // Render root items
        rootItems.forEach(({ t, idx }) => {
            container.appendChild(buildPaletteItem(t, idx, templates));
        });

        // Drop zone at bottom to move items out of folders (to root)
        const rootDrop = document.createElement('div');
        rootDrop.className = 'palette-root-drop';
        rootDrop.addEventListener('dragover', (e) => { e.preventDefault(); rootDrop.classList.add('drag-over'); });
        rootDrop.addEventListener('dragleave', () => { rootDrop.classList.remove('drag-over'); });
        rootDrop.addEventListener('drop', (e) => {
            e.preventDefault();
            rootDrop.classList.remove('drag-over');
            if (_paletteDragIdx >= 0 && templates[_paletteDragIdx]) {
                delete templates[_paletteDragIdx].folder;
                State.notifyChange(true);
                buildPalette();
            }
        });
        container.appendChild(rootDrop);
    }

    function buildPaletteItem(t, idx, templates) {
        const el = document.createElement('div');
        el.className = 'palette-item';
        el.draggable = true;
        el.dataset.idx = idx;
        const shapeStyle = t.shape === 'circle' ? 'border-radius:50%'
            : t.shape === 'hexagon' ? 'clip-path:polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%)'
            : t.shape === 'octagon' ? 'clip-path:polygon(30% 0%,70% 0%,100% 30%,100% 70%,70% 100%,30% 100%,0% 70%,0% 30%)'
            : (t.shape === 'decagon' || t.shape === 'dodecagon') ? 'border-radius:50%'
            : t.shape === 'triangle' ? 'clip-path:polygon(50% 0%,100% 100%,0% 100%)'
            : '';
        const shortcutLabel = idx < 10 ? `<span class="palette-shortcut">${(idx + 1) % 10}</span>` : '';
        el.innerHTML = `
            <div class="palette-drag-handle" title="Drag">&#8942;</div>
            <div class="palette-swatch" style="background:${t.color};${shapeStyle}"></div>
            <div class="palette-info">
                <div class="palette-name">${t.name}</div>
                <div class="palette-dims">${t.width} \u00d7 ${t.height} m</div>
            </div>
            ${shortcutLabel}
            <button class="palette-delete" title="${I18n.t('palette.removeTemplate')}">&times;</button>`;
        el.querySelector('.palette-delete').addEventListener('click', (e) => {
            e.stopPropagation();
            State.removeTemplate(idx);
            buildPalette();
        });
        el.addEventListener('click', (e) => {
            if (e.target.closest('.palette-delete') || e.target.closest('.palette-drag-handle')) return;
            Tools.setPendingTemplate(t);
        });

        // Right-click to edit template
        el.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            createContextMenuAt(e.clientX, e.clientY, [
                { label: I18n.t('tab.rename'), action: () => {
                    const name = prompt(I18n.t('props.name') + ':', t.name);
                    if (name && name.trim()) { t.name = name.trim(); State.notifyChange(true); buildPalette(); }
                }},
                { label: I18n.t('props.width') + ' / ' + I18n.t('props.depth'), action: () => {
                    const w = prompt(I18n.t('props.width') + ' (m):', t.width);
                    if (w !== null) { t.width = parseFloat(w) || t.width; }
                    const h = prompt(I18n.t('props.depth') + ' (m):', t.height);
                    if (h !== null) { t.height = parseFloat(h) || t.height; }
                    State.notifyChange(true); buildPalette();
                }},
                { label: I18n.t('props.color'), action: () => {
                    openColorPicker(t.color, (c) => { t.color = c; State.notifyChange(true); buildPalette(); });
                }},
                { label: I18n.t('props.shape'), action: () => {
                    const shapes = ['rect', 'triangle', 'hexagon', 'octagon', 'circle'];
                    const names = shapes.map(s => I18n.t('props.shape.' + s));
                    const current = shapes.indexOf(t.shape);
                    const next = (current + 1) % shapes.length;
                    t.shape = shapes[next];
                    State.notifyChange(true); buildPalette();
                }},
                { label: I18n.t('props.guyRope.distance'), action: () => {
                    const d = prompt(I18n.t('props.guyRope.distance') + ':', t.guyRopeDistance || 0);
                    if (d !== null) { t.guyRopeDistance = parseFloat(d) || 0; State.notifyChange(true); buildPalette(); }
                }},
                { sep: true },
                { label: I18n.t('props.delete'), className: 'danger', action: () => {
                    State.removeTemplate(idx); buildPalette();
                }},
            ]);
        });

        // Drag-and-drop reorder
        el.addEventListener('dragstart', (e) => {
            _paletteDragIdx = idx;
            el.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });
        el.addEventListener('dragend', () => {
            el.classList.remove('dragging');
            _paletteDragIdx = -1;
            document.querySelectorAll('.palette-item,.palette-folder-header,.palette-root-drop').forEach(item => item.classList.remove('drag-over'));
        });
        el.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            el.classList.add('drag-over');
        });
        el.addEventListener('dragleave', () => { el.classList.remove('drag-over'); });
        el.addEventListener('drop', (e) => {
            e.preventDefault();
            el.classList.remove('drag-over');
            const fromIdx = _paletteDragIdx;
            const toIdx = idx;
            if (fromIdx < 0 || fromIdx === toIdx) return;
            // Move item to same folder as target
            templates[fromIdx].folder = t.folder;
            const item = templates.splice(fromIdx, 1)[0];
            const newToIdx = toIdx > fromIdx ? toIdx - 1 : toIdx;
            templates.splice(newToIdx, 0, item);
            State.notifyChange(true);
            buildPalette();
        });

        return el;
    }

    // --- Placed Objects List ---
    function buildPlacedList() {
        const container = document.getElementById('placed-objects-list');
        container.innerHTML = '';
        container.dataset.empty = I18n.t('sidebar.noObjects');
        const site = State.activeSite;
        if (!site) return;

        // Group objects by groupId
        const groups = {};
        const ungrouped = [];
        const groupOrder = [];
        site.objects.forEach(obj => {
            if (obj.groupId) {
                if (!groups[obj.groupId]) {
                    groups[obj.groupId] = [];
                    groupOrder.push(obj.groupId);
                }
                groups[obj.groupId].push(obj);
            } else {
                ungrouped.push(obj);
            }
        });

        // Render groups
        groupOrder.forEach(gid => {
            const members = groups[gid];
            const gName = (site.groupNames && site.groupNames[gid]) || I18n.t('ctx.group');
            const anySelected = members.some(o => Canvas.isSelected(o.id));

            // Group header
            const gh = document.createElement('div');
            gh.className = 'placed-group-header' + (anySelected ? ' active' : '');
            gh.innerHTML = `<span class="placed-group-icon">&#9654;</span> <strong>${gName}</strong> <span class="placed-item-dims">${members.length}</span>`;
            gh.addEventListener('click', () => {
                Canvas.selectMultiple(members.map(o => o.id));
                showMultiProperties();
                Canvas.render();
                buildPlacedList();
            });
            container.appendChild(gh);

            // Group members (indented)
            members.forEach(obj => {
                container.appendChild(buildPlacedItem(obj, true));
            });
        });

        // Render ungrouped
        ungrouped.forEach(obj => {
            container.appendChild(buildPlacedItem(obj, false));
        });
    }

    function buildPlacedItem(obj, indented) {
        const el = document.createElement('div');
        el.className = 'placed-item' + (Canvas.isSelected(obj.id) ? ' active' : '') + (indented ? ' placed-item-indented' : '');
        const typeLabel = obj.type === 'fence' ? 'pipe' : obj.type === 'postit' ? 'note' : obj.type;
        const dims = (obj.type === 'area' || obj.type === 'text' || obj.type === 'fence' || obj.type === 'ground' || obj.type === 'bgimage' || obj.type === 'guideline') ? typeLabel : `${obj.width}\u00d7${obj.height}`;
        const desc = obj.description ? ` - ${obj.description.split('\n')[0]}` : '';
        const lockStr = obj.locked ? ' &#128274;' : '';
        el.innerHTML = `
            <div class="placed-item-color" style="background:${obj.color}"></div>
            <span class="placed-item-name" title="${obj.name}${desc}">${obj.name}${lockStr}</span>
            <span class="placed-item-dims">${dims}</span>`;
        el.addEventListener('click', (e) => {
            if (e.ctrlKey || e.metaKey) {
                Canvas.toggleSelection(obj.id);
            } else {
                Canvas.selectedId = obj.id;
                // Auto-select group
                if (obj.groupId) {
                    const site = State.activeSite;
                    site.objects.forEach(o => { if (o.groupId === obj.groupId) Canvas.addToSelection(o.id); });
                }
            }
            if (Canvas.selectionCount === 1) {
                showProperties(State.activeSite.objects.find(o => o.id === Canvas.selectedId));
            } else if (Canvas.selectionCount > 1) {
                showMultiProperties();
            } else {
                hideProperties();
            }
            Canvas.render();
            buildPlacedList();
        });
        return el;
    }

    // --- Tabs ---
    let _renamingTabIndex = -1;

    function buildTabs() {
        const container = document.getElementById('tabs-container');
        if (_renamingTabIndex >= 0) return;

        container.innerHTML = '';
        State.sites.forEach((site, i) => {
            const tab = document.createElement('div');
            tab.className = 'tab' + (i === State.activeSiteIndex ? ' active' : '');

            const nameSpan = document.createElement('span');
            nameSpan.className = 'tab-name';
            nameSpan.textContent = site.name;

            const editBtn = document.createElement('button');
            editBtn.className = 'tab-edit';
            editBtn.title = I18n.t('tab.rename');
            editBtn.innerHTML = '&#9998;';

            const dupBtn = document.createElement('button');
            dupBtn.className = 'tab-dup';
            dupBtn.title = I18n.t('props.duplicate');
            dupBtn.innerHTML = '&#10697;';

            const closeBtn = document.createElement('button');
            closeBtn.className = 'tab-close';
            closeBtn.title = I18n.t('tab.close');
            closeBtn.innerHTML = '&times;';

            tab.appendChild(nameSpan);
            tab.appendChild(editBtn);
            tab.appendChild(dupBtn);
            tab.appendChild(closeBtn);

            tab.addEventListener('click', (e) => {
                if (e.target === closeBtn) {
                    if (State.sites.length > 1 && confirm(I18n.t('tab.confirmDelete', { name: site.name }))) {
                        State.deleteSite(i);
                    }
                    return;
                }
                if (e.target === dupBtn) {
                    State.duplicateSite(i);
                    return;
                }
                if (e.target === editBtn || e.target.tagName === 'INPUT') return;
                Canvas.clearSelection();
                hideProperties();
                State.activeSiteIndex = i;
            });

            function startRename() {
                if (_renamingTabIndex >= 0) return;
                _renamingTabIndex = i;
                const input = document.createElement('input');
                input.type = 'text';
                input.className = 'tab-rename-input';
                input.value = site.name;
                nameSpan.style.display = 'none';
                editBtn.style.display = 'none';
                tab.insertBefore(input, closeBtn);
                input.focus();
                input.select();

                let finished = false;
                const finish = () => {
                    if (finished) return;
                    finished = true;
                    _renamingTabIndex = -1;
                    const newName = input.value.trim() || site.name;
                    State.renameSite(i, newName);
                };
                input.addEventListener('blur', finish);
                input.addEventListener('keydown', (ev) => {
                    if (ev.key === 'Enter') input.blur();
                    if (ev.key === 'Escape') { input.value = site.name; input.blur(); }
                });
            }

            editBtn.addEventListener('click', (e) => { e.stopPropagation(); startRename(); });
            nameSpan.addEventListener('dblclick', (e) => { e.stopPropagation(); startRename(); });

            container.appendChild(tab);
        });
    }

    // --- Toolbar ---
    function bindToolbar() {
        document.getElementById('btn-undo').addEventListener('click', () => {
            State.undo();
            Canvas.render();
        });

        document.getElementById('btn-add-tab').addEventListener('click', () => {
            if (document.activeElement && document.activeElement.blur) {
                document.activeElement.blur();
            }
            Canvas.clearSelection();
            Canvas.placementPreview = null;
            Canvas.dragDistances = [];
            Canvas.measureLine = null;
            Canvas.groundPreview = [];
            Canvas.pathPreview = [];
            hideProperties();
            const currentSite = State.activeSite;
            const copyTemplates = currentSite && currentSite.templates && currentSite.templates.length > 0
                && confirm(I18n.t('msg.copyTemplates'));
            if (copyTemplates) {
                State.createSiteFrom(currentSite);
            } else {
                State.createSite();
            }
        });

        document.getElementById('btn-custom-object').addEventListener('click', () => {
            openModal('modal-custom-object');
        });

        document.getElementById('btn-new-folder').addEventListener('click', () => {
            const name = prompt(I18n.t('btn.newFolderPrompt'), I18n.t('btn.newFolder'));
            if (!name || !name.trim()) return;
            // Create a dummy template in the folder to establish it, then remove it
            // Actually, just set the folder on the first root-level template, or create a marker
            // Simplest: folders exist implicitly via templates. Create an empty placeholder approach:
            // We just need at least one template with this folder. Let user drag items in.
            // For now, prompt and if there are root items, move the last one into the folder.
            const site = State.activeSite;
            if (!site || !site.templates) return;
            // Add folder by tagging a placeholder - or just store folder names
            if (!site.templateFolders) site.templateFolders = [];
            if (!site.templateFolders.includes(name.trim())) {
                site.templateFolders.push(name.trim());
            }
            State.notifyChange(true);
            buildPalette();
        });

        // Notebook
        document.getElementById('btn-notebook').addEventListener('click', () => {
            const site = State.activeSite;
            if (!site) return;
            document.getElementById('notebook-text').value = site.notebook || '';
            openModal('modal-notebook');
        });

        document.getElementById('btn-clear-all').addEventListener('click', () => {
            if (confirm(I18n.t('msg.confirmClearAll'))) {
                Canvas.clearSelection();
                hideProperties();
                State.clear();
            }
        });

        document.getElementById('btn-offline').addEventListener('click', () => {
            IO.downloadOffline();
        });

    }

    function updateToolButtons(activeName) {
        document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tool === activeName);
        });
        const toolKey = 'tool.' + activeName;
        document.getElementById('status-tool').textContent = I18n.t(toolKey);
    }

    // --- Palette dropdown toggle ---
    function bindPaletteToggle() {
        document.getElementById('palette-toggle').addEventListener('click', () => {
            document.getElementById('object-palette').classList.toggle('collapsed');
            document.getElementById('palette-arrow').classList.toggle('collapsed');
        });
    }

    // --- Settings ---
    function bindSettings() {
        document.getElementById('grid-size').addEventListener('change', (e) => {
            const site = State.activeSite;
            if (site) { site.gridSize = parseFloat(e.target.value); State.notifyChange(true); Canvas.render(); }
        });
        document.getElementById('snap-to-grid').addEventListener('change', (e) => {
            const site = State.activeSite;
            if (site) { site.snapToGrid = e.target.checked; }
        });
        document.getElementById('min-distance').addEventListener('change', (e) => {
            State.minDistance = parseFloat(e.target.value) || 0;
        });
        ['fontScale', 'lineScale', 'ropeScale', 'hatchScale'].forEach(key => {
            const id = 'set-' + key.replace('Scale', 'scale');
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', () => {
                State.displaySettings[key] = parseFloat(el.value) || 1;
                Canvas.render();
            });
        });
        // Display toggles
        ['showNames', 'showDimensions', 'showDescriptions'].forEach(key => {
            const id = 'set-show-' + key.replace('show', '').toLowerCase();
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', () => {
                State.displaySettings[key] = el.checked;
                Canvas.render();
            });
        });
        // Default colors
        document.getElementById('set-ground-color').addEventListener('change', (e) => {
            State.displaySettings.defaultGroundColor = e.target.value;
        });
        document.getElementById('set-area-color').addEventListener('change', (e) => {
            State.displaySettings.defaultAreaColor = e.target.value;
        });
        // Language selector (in settings)
        document.getElementById('lang-select').addEventListener('change', (e) => {
            I18n.setLang(e.target.value);
            document.querySelectorAll('.lang-flag').forEach(b => b.classList.toggle('active', b.dataset.lang === e.target.value));
        });
        // Auto-save toggle
        document.getElementById('autosave-toggle').addEventListener('change', (e) => {
            localStorage.setItem('zeltplaner_autosave_enabled', e.target.checked ? '1' : '0');
        });

        document.getElementById('show-distances-toggle').addEventListener('change', (e) => {
            State.showDistances = e.target.checked;
            Canvas.render();
        });
        document.getElementById('minimap-toggle').addEventListener('change', (e) => {
            Canvas.minimapEnabled = e.target.checked;
            State._minimapEnabled = e.target.checked;
            Canvas.render();
        });
        const compSlider = document.getElementById('compass-rotation');
        const compNum = document.getElementById('compass-rot-num');
        compSlider.addEventListener('input', (e) => {
            const site = State.activeSite;
            if (site) { site.compassRotation = parseInt(e.target.value); Canvas.render(); }
            compNum.value = e.target.value;
        });
        compNum.addEventListener('change', (e) => {
            const site = State.activeSite;
            if (site) { site.compassRotation = parseInt(e.target.value); Canvas.render(); }
            compSlider.value = e.target.value;
        });

        // (Background image controls moved to floating toolbar)
    }

    function syncSettings() {
        const site = State.activeSite;
        if (!site) return;
        document.getElementById('grid-size').value = site.gridSize;
        document.getElementById('snap-to-grid').checked = site.snapToGrid;
        document.getElementById('min-distance').value = State.minDistance;
        const ds = State.displaySettings;
        document.getElementById('set-fontscale').value = ds.fontScale;
        document.getElementById('set-linescale').value = ds.lineScale;
        document.getElementById('set-ropescale').value = ds.ropeScale;
        document.getElementById('set-hatchscale').value = ds.hatchScale;
        document.getElementById('set-show-names').checked = ds.showNames !== false;
        document.getElementById('set-show-dimensions').checked = ds.showDimensions !== false;
        document.getElementById('set-show-descriptions').checked = ds.showDescriptions !== false;
        document.getElementById('set-ground-color').value = ds.defaultGroundColor || '#22c55e';
        document.getElementById('set-area-color').value = ds.defaultAreaColor || '#d4a574';
        document.getElementById('lang-select').value = I18n.lang;
        document.getElementById('autosave-toggle').checked = localStorage.getItem('zeltplaner_autosave_enabled') !== '0';
        document.getElementById('show-distances-toggle').checked = State.showDistances;
        document.getElementById('minimap-toggle').checked = Canvas.minimapEnabled;
        // Sync color palette from state (after import)
        if (State._colorPalette && State._colorPalette.colors) {
            _savedColors = State._colorPalette.colors;
            _activeColorIdx = State._colorPalette.active || 0;
            buildColorSwatches();
        }
        const cr = (site && site.compassRotation) || 0;
        document.getElementById('compass-rotation').value = cr;
        document.getElementById('compass-rot-num').value = cr;
    }

    // --- Properties Panel ---
    function showProperties(obj) {
        const panel = document.getElementById('properties');
        const content = document.getElementById('prop-content');
        panel.classList.remove('hidden');

        const descVal = (obj.description || '').replace(/"/g, '&quot;');
        let html = '';

        // --- Section: General ---
        html += `<div class="prop-section">
            <div class="prop-section-title">${obj.type === 'guideline' ? I18n.t('tool.measure') : I18n.t('props.general')}</div>
            ${obj.type === 'guideline'
                ? `<div style="font-size:14px;font-weight:700;color:var(--primary);text-align:center;padding:4px 0">${obj.name}</div>`
                : `<label>${I18n.t('props.name')} <textarea id="prop-name" rows="1" style="resize:vertical;font-family:var(--font);font-size:12px">${(obj.name || '').replace(/</g, '&lt;')}</textarea></label>
                   <label>${I18n.t('props.description')} <textarea id="prop-desc" rows="2" placeholder="${I18n.t('props.descPlaceholder')}" style="resize:vertical;font-family:var(--font);font-size:12px">${descVal}</textarea></label>
                   <div class="prop-grid">
                       <label>${I18n.t('props.descColor')} <input type="color" id="prop-desc-color" value="${obj.descColor || '#94a3b8'}"></label>
                       <label>${I18n.t('props.descSize')} <input type="number" id="prop-desc-size" value="${obj.descSize || ''}" min="0" max="5" step="0.1" placeholder="auto"></label>
                   </div>`
            }`;
        if (obj.type === 'text') {
            html += `<label>${I18n.t('props.textSection')} <textarea id="prop-text" rows="2" style="resize:vertical;font-family:var(--font);font-size:12px">${(obj.text || '').replace(/</g, '&lt;')}</textarea></label>`;
        }
        if (obj.type !== 'bgimage') {
            html += `<label>${I18n.t('props.color')} <input type="color" id="prop-color" value="${obj.color}"></label>`;
        }
        if (obj.type === 'bgimage') {
            html += `<label>${I18n.t('modal.settings.bgOpacity')} <input type="range" id="prop-opacity" min="0.05" max="1" step="0.05" value="${obj.opacity || 0.3}" style="width:100%"></label>`;
            html += `<label style="flex-direction:row !important;align-items:center !important;gap:6px !important"><input type="checkbox" id="prop-keepaspect" ${obj.keepAspectRatio !== false ? 'checked' : ''} style="width:auto"> ${I18n.t('props.keepAspectRatio')}</label>`;
        }
        if (obj.type === 'area') {
            let texOpts = '';
            Canvas.AREA_TEXTURES.forEach(t => {
                texOpts += `<option value="${t.id}" ${(obj.texture || 'solid') === t.id ? 'selected' : ''}>${I18n.t('texture.' + t.id)}</option>`;
            });
            html += `<label>${I18n.t('props.texture')} <select id="prop-texture">${texOpts}</select></label>`;
        }
        html += `</div>`;

        // --- Section: Position & Size ---
        if (obj.type !== 'area' && obj.type !== 'text' && obj.type !== 'fence' && obj.type !== 'guideline' && obj.type !== 'ground' && obj.type !== 'symbol' && obj.type !== 'postit') {
            html += `<div class="prop-section">
                <div class="prop-section-title">${I18n.t('props.posSize')}</div>
                <div class="prop-grid">
                    <label>X <input type="number" id="prop-x" value="${obj.x}" step="0.1"></label>
                    <label>Y <input type="number" id="prop-y" value="${obj.y}" step="0.1"></label>
                    <label>${I18n.t('props.width')} <input type="number" id="prop-width" value="${obj.width}" min="0.1" step="0.1"></label>
                    <label>${I18n.t('props.depth')} <input type="number" id="prop-height" value="${obj.height}" min="0.1" step="0.1"></label>
                </div>
                ${obj.type === 'bgimage' ? '' : `<label>${I18n.t('props.shape')}
                    <select id="prop-shape">
                        <option value="rect" ${obj.shape === 'rect' ? 'selected' : ''}>${I18n.t('props.shape.rect')}</option>
                        <option value="triangle" ${obj.shape === 'triangle' ? 'selected' : ''}>${I18n.t('props.shape.triangle')}</option>
                        <option value="hexagon" ${obj.shape === 'hexagon' ? 'selected' : ''}>${I18n.t('props.shape.hexagon')}</option>
                        <option value="octagon" ${obj.shape === 'octagon' ? 'selected' : ''}>${I18n.t('props.shape.octagon')}</option>
                        <option value="decagon" ${obj.shape === 'decagon' ? 'selected' : ''}>${I18n.t('props.shape.decagon')}</option>
                        <option value="dodecagon" ${obj.shape === 'dodecagon' ? 'selected' : ''}>${I18n.t('props.shape.dodecagon')}</option>
                        <option value="circle" ${obj.shape === 'circle' ? 'selected' : ''}>${I18n.t('props.shape.circle')}</option>
                    </select>
                </label>`}
            </div>`;
        }

        // --- Post-it text ---
        if (obj.type === 'postit') {
            html += `<div class="prop-section">
                <div class="prop-section-title">Post-it</div>
                <label>Text <textarea id="prop-postit-text" rows="4" style="resize:vertical;font-family:var(--font);font-size:12px;background:#fffef5">${(obj.text || '').replace(/</g, '&lt;')}</textarea></label>
                <div class="prop-grid">
                    <label>${I18n.t('props.width')} <input type="number" id="prop-width" value="${obj.width}" min="1" max="20" step="0.5"></label>
                    <label>${I18n.t('props.depth')} <input type="number" id="prop-height" value="${obj.height}" min="1" max="20" step="0.5"></label>
                </div>
            </div>`;
        }

        // --- Symbol size ---
        if (obj.type === 'symbol') {
            html += `<div class="prop-section">
                <div class="prop-section-title">${I18n.t('props.posSize')}</div>
                <label>${I18n.t('props.width')} (m) <input type="number" id="prop-width" value="${obj.width}" min="0.5" max="5" step="0.1"></label>
            </div>`;
        }

        // --- Pipe/Line settings ---
        if (obj.type === 'fence') {
            let pipeLen = 0;
            if (obj.points && obj.points.length >= 2) {
                for (let i = 0; i < obj.points.length - 1; i++) {
                    const dx = obj.points[i+1].x - obj.points[i].x;
                    const dy = obj.points[i+1].y - obj.points[i].y;
                    pipeLen += Math.sqrt(dx*dx + dy*dy);
                }
            }
            html += `<div class="prop-section">
                <div class="prop-section-title">${I18n.t('tool.fence')}</div>
                <div style="font-size:11px;color:var(--text-secondary);margin-bottom:4px">${I18n.t('props.pipeLength')}: ${pipeLen.toFixed(1)} m</div>
                <label>${I18n.t('props.lineThickness')} <input type="number" id="prop-linethickness" value="${obj.lineThickness || 4}" min="1" max="20" step="1"></label>
                <label>${I18n.t('props.vertexSize')} <input type="number" id="prop-vertexsize" value="${obj.vertexSize || 0}" min="0" max="10" step="1" placeholder="auto"></label>
                <div class="prop-section-subtitle">${I18n.t('props.colorPresets')}</div>
                <div style="display:flex;gap:4px">
                    <button class="pipe-color-btn" data-color="#0ea5e9" style="background:#0ea5e9" title="Water">&#128167;</button>
                    <button class="pipe-color-btn" data-color="#eab308" style="background:#eab308" title="Electric">&#9889;</button>
                    <button class="pipe-color-btn" data-color="#8B4513" style="background:#8B4513" title="Fence">&#9608;</button>
                    <button class="pipe-color-btn" data-color="#6b7280" style="background:#6b7280" title="Gas">&#9679;</button>
                </div>
            </div>`;
        }

        if (obj.type === 'text') {
            html += `<div class="prop-section">
                <div class="prop-section-title">${I18n.t('props.textSection')}</div>
                <label>${I18n.t('props.fontSize')} <input type="number" id="prop-fontsize" value="${obj.fontSize || 1}" min="0.2" step="0.1"></label>
            </div>`;
        }

        // --- Section: Rotation ---
        if (obj.type !== 'text' && obj.type !== 'guideline') {
            const rotDisabled = obj.locked ? 'disabled' : '';
            html += `<div class="prop-section"${obj.locked ? ' style="opacity:0.5;pointer-events:none"' : ''}>
                <div class="prop-section-title">${I18n.t('props.rotation')}</div>
                <div class="prop-row">
                    <input type="number" id="prop-rotation" value="${Math.round(obj.rotation)}" step="15" class="prop-rot-input" ${rotDisabled}>&deg;
                </div>
                <input type="range" id="prop-rotation-slider" min="0" max="360" step="1" value="${Math.round(obj.rotation)}" class="rotation-slider" ${rotDisabled}>
                <div class="rotation-presets">
                    <button class="rot-preset" data-rot="0" ${rotDisabled}>0&deg;</button>
                    <button class="rot-preset" data-rot="90" ${rotDisabled}>90&deg;</button>
                    <button class="rot-preset" data-rot="180" ${rotDisabled}>180&deg;</button>
                    <button class="rot-preset" data-rot="270" ${rotDisabled}>270&deg;</button>
                </div>
            </div>`;
        }

        // --- Section: Entrance ---
        if (obj.type === 'tent') {
            const ePos = obj.entrancePos !== undefined ? obj.entrancePos : -1;
            const hasEntrance = ePos >= 0;
            html += `<div class="prop-section">
                <div class="prop-section-title">${I18n.t('props.entrance')}</div>
                <label><input type="checkbox" id="prop-entrance-toggle" ${hasEntrance ? 'checked' : ''}> ${I18n.t('props.entranceSide')}</label>
                <label style="${hasEntrance ? '' : 'opacity:0.4;pointer-events:none'}" id="prop-entrance-slider-wrap">${I18n.t('props.entrancePos')}
                    <input type="range" id="prop-entrance-pos" min="0" max="100" step="1" value="${hasEntrance ? Math.round(ePos * 100) : 50}" style="width:100%">
                </label>
            </div>`;
        }

        // --- Section: Guy ropes ---
        if (obj.type !== 'area' && obj.type !== 'text' && obj.type !== 'fence' && obj.type !== 'bgimage' && obj.type !== 'guideline') {
            const sides = obj.guyRopeSides || { top: true, right: true, bottom: true, left: true };
            html += `<div class="prop-section">
                <div class="prop-section-title">${I18n.t('props.guyRope')}</div>
                <label>${I18n.t('props.guyRope.distance')} <input type="number" id="prop-guyrope" value="${obj.guyRopeDistance}" min="0" step="0.1"></label>
                ${obj.guyRopeDistance > 0 ? `<label>${I18n.t('props.guyRope.ropeWidth')} <input type="number" id="prop-ropewidth" value="${obj.ropeWidth || ''}" min="0" max="3" step="0.1" placeholder="auto"></label>` : ''}
                ${obj.guyRopeDistance > 0 && obj.shape === 'rect' ? `
                <div class="prop-section-subtitle">${I18n.t('props.guyRope.sides')}</div>
                <div class="guyrope-sides">
                    <label><input type="checkbox" id="gr-top" ${sides.top ? 'checked' : ''}> ${I18n.t('props.guyRope.top')}</label>
                    <label><input type="checkbox" id="gr-right" ${sides.right ? 'checked' : ''}> ${I18n.t('props.guyRope.right')}</label>
                    <label><input type="checkbox" id="gr-bottom" ${sides.bottom ? 'checked' : ''}> ${I18n.t('props.guyRope.bottom')}</label>
                    <label><input type="checkbox" id="gr-left" ${sides.left ? 'checked' : ''}> ${I18n.t('props.guyRope.left')}</label>
                </div>` : ''}
            </div>`;
        }

        // --- Section: Display ---
        if (obj.type !== 'bgimage' && obj.type !== 'guideline') {
            const opVal = obj.objectOpacity !== undefined ? obj.objectOpacity : 1;
            html += `<div class="prop-section">
                <div class="prop-section-title">${I18n.t('props.display')}</div>
                ${obj.type !== 'text' && obj.type !== 'fence' ? `<div class="prop-grid">
                    <label>${I18n.t('props.labelSize')} <input type="number" id="prop-labelsize" value="${obj.labelSize || ''}" min="0" max="3" step="0.1" placeholder="auto"></label>
                    <label>${I18n.t('props.lineWidth')} <input type="number" id="prop-linewidth" value="${obj.lineWidth || ''}" min="0" max="3" step="0.1" placeholder="auto"></label>
                    <label>Label X <input type="number" id="prop-labeloffx" value="${obj.labelOffsetX || 0}" step="0.5"></label>
                    <label>Label Y <input type="number" id="prop-labeloffy" value="${obj.labelOffsetY || 0}" step="0.5"></label>
                </div>` : ''}
                <label>${I18n.t('props.opacity')} <input type="range" id="prop-obj-opacity" min="0.05" max="1" step="0.05" value="${opVal}" style="width:100%"></label>
            </div>`;
        }

        // --- Lock (all object types) ---
        if (obj.type !== 'guideline') {
            html += `<div class="prop-section">
                <label style="flex-direction:row !important;align-items:center !important;gap:6px !important;cursor:pointer">
                    <input type="checkbox" id="prop-locked" ${obj.locked ? 'checked' : ''} style="width:auto">
                    &#128274; ${I18n.t('props.lockObj')}
                </label>
            </div>`;
        }

        // --- Ground-specific actions ---
        if (obj.type === 'ground') {
            html += `<div class="prop-actions" style="flex-wrap:wrap">
                <button class="btn-duplicate" id="prop-ground-print">${I18n.t('ground.printOnly')}</button>
                <button class="btn-duplicate" id="prop-ground-export">${I18n.t('ground.export')}</button>
            </div>`;
        }

        // --- Actions ---
        html += `<div class="prop-actions">
            <button class="btn-duplicate" id="prop-duplicate">${I18n.t('props.duplicate')}</button>
            <button class="btn-danger" id="prop-delete">${I18n.t('props.delete')}</button>
        </div>`;

        content.innerHTML = html;

        const bind = (id, key, parser) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('change', () => {
                if (!Canvas.isSelected(obj.id)) return;
                const val = parser ? parser(el.value) : el.value;
                State.updateObject(obj.id, { [key]: val });
                Canvas.render();
                buildPlacedList();
            });
        };

        // Name textarea (multiline)
        const nameEl = document.getElementById('prop-name');
        if (nameEl) {
            nameEl.addEventListener('input', () => {
                if (!Canvas.isSelected(obj.id)) return;
                State.updateObject(obj.id, { name: nameEl.value });
                Canvas.render();
                buildPlacedList();
            });
        }

        // Ground-specific handlers
        const gpBtn = document.getElementById('prop-ground-print');
        if (gpBtn && obj.type === 'ground') {
            gpBtn.addEventListener('click', () => {
                const site = State.activeSite;
                const pts = obj.points;
                State._printFilter = {
                    objects: site.objects.filter(o => {
                        if (o.type === 'bgimage') return true;
                        if (o.id === obj.id) return true;
                        if (o.type === 'ground') return false;
                        return Canvas.pointInPolygonCheck(o.x, o.y, pts);
                    }),
                };
                document.getElementById('print-title').value = site.name;
                openModal('modal-print');
            });
        }
        const geBtn = document.getElementById('prop-ground-export');
        if (geBtn && obj.type === 'ground') {
            geBtn.addEventListener('click', () => {
                const site = State.activeSite;
                const data = {
                    type: 'ground_area', version: 1, ground: obj.points,
                    objects: site.objects.filter(o => {
                        if (o.type === 'bgimage' || o.type === 'ground') return false;
                        return Canvas.pointInPolygonCheck(o.x, o.y, obj.points);
                    }),
                };
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = (obj.name || 'ground') + '.json'; a.click();
                URL.revokeObjectURL(url);
            });
        }
        // Description textarea (multiline)
        const descEl = document.getElementById('prop-desc');
        if (descEl) {
            descEl.addEventListener('input', () => {
                if (!Canvas.isSelected(obj.id)) return;
                State.updateObject(obj.id, { description: descEl.value });
                Canvas.render();
                buildPlacedList();
            });
        }
        const textEl = document.getElementById('prop-text');
        if (textEl) {
            textEl.addEventListener('input', () => {
                if (!Canvas.isSelected(obj.id)) return;
                State.updateObject(obj.id, { text: textEl.value });
                Canvas.render();
            });
        }
        bind('prop-fontsize', 'fontSize', parseFloat);
        bind('prop-fenceheight', 'fenceHeight', parseFloat);
        const postitText = document.getElementById('prop-postit-text');
        if (postitText) {
            postitText.addEventListener('input', () => {
                if (!Canvas.isSelected(obj.id)) return;
                State.updateObject(obj.id, { text: postitText.value });
                Canvas.render();
            });
        }
        bind('prop-linethickness', 'lineThickness', parseFloat);
        bind('prop-vertexsize', 'vertexSize', parseFloat);
        // Pipe color presets
        document.querySelectorAll('.pipe-color-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (!Canvas.isSelected(obj.id)) return;
                State.updateObject(obj.id, { color: btn.dataset.color });
                Canvas.render();
                showProperties(State.activeSite.objects.find(o => o.id === obj.id));
            });
        });
        bind('prop-texture', 'texture');
        bind('prop-desc-color', 'descColor');
        bind('prop-desc-size', 'descSize', parseFloat);
        // Entrance position
        const entrToggle = document.getElementById('prop-entrance-toggle');
        const entrSlider = document.getElementById('prop-entrance-pos');
        const entrWrap = document.getElementById('prop-entrance-slider-wrap');
        if (entrToggle) {
            entrToggle.addEventListener('change', () => {
                if (entrToggle.checked) {
                    const val = parseInt(entrSlider.value) / 100;
                    State.updateObject(obj.id, { entrancePos: val, entranceSide: undefined });
                    if (entrWrap) { entrWrap.style.opacity = ''; entrWrap.style.pointerEvents = ''; }
                } else {
                    State.updateObject(obj.id, { entrancePos: -1, entranceSide: 'none' });
                    if (entrWrap) { entrWrap.style.opacity = '0.4'; entrWrap.style.pointerEvents = 'none'; }
                }
                Canvas.render();
            });
        }
        if (entrSlider) {
            entrSlider.addEventListener('input', () => {
                if (!entrToggle || !entrToggle.checked) return;
                State.updateObject(obj.id, { entrancePos: parseInt(entrSlider.value) / 100 });
                Canvas.render();
            });
        }
        // Lock checkbox
        const lockCb = document.getElementById('prop-locked');
        if (lockCb) {
            lockCb.addEventListener('change', () => {
                if (!Canvas.isSelected(obj.id)) return;
                State.updateObject(obj.id, { locked: lockCb.checked });
                Canvas.render();
                buildPlacedList();
            });
        }
        // Object opacity slider
        const objOpSlider = document.getElementById('prop-obj-opacity');
        if (objOpSlider) {
            objOpSlider.addEventListener('input', () => {
                if (!Canvas.isSelected(obj.id)) return;
                State.updateObject(obj.id, { objectOpacity: parseFloat(objOpSlider.value) });
                Canvas.render();
            });
        }
        // Bgimage opacity slider
        const opSlider = document.getElementById('prop-opacity');
        if (opSlider) {
            opSlider.addEventListener('input', () => {
                if (!Canvas.isSelected(obj.id)) return;
                State.updateObject(obj.id, { opacity: parseFloat(opSlider.value) });
                Canvas.render();
            });
        }
        // Keep aspect ratio checkbox
        const keepAspect = document.getElementById('prop-keepaspect');
        if (keepAspect) {
            keepAspect.addEventListener('change', () => {
                if (!Canvas.isSelected(obj.id)) return;
                State.updateObject(obj.id, { keepAspectRatio: keepAspect.checked });
            });
        }
        bind('prop-labelsize', 'labelSize', parseFloat);
        bind('prop-linewidth', 'lineWidth', parseFloat);
        bind('prop-labeloffx', 'labelOffsetX', parseFloat);
        bind('prop-labeloffy', 'labelOffsetY', parseFloat);
        bind('prop-ropewidth', 'ropeWidth', parseFloat);
        bind('prop-x', 'x', parseFloat);
        bind('prop-y', 'y', parseFloat);
        const propW = document.getElementById('prop-width');
        if (propW) {
            propW.addEventListener('change', () => {
                if (!Canvas.isSelected(obj.id)) return;
                const val = parseFloat(propW.value) || obj.width;
                const updates = { width: val };
                if (obj.type === 'symbol') updates.height = val;
                State.updateObject(obj.id, updates);
                Canvas.render(); buildPlacedList();
            });
        }
        bind('prop-height', 'height', parseFloat);
        // Rotation helper for points-based objects
        function applyRotation(newRot) {
            if (!Canvas.isSelected(obj.id)) return;
            if (obj.points && obj.points.length >= 2) {
                // Rotate points around centroid by delta
                const oldRot = obj.rotation || 0;
                const delta = (newRot - oldRot) * Math.PI / 180;
                const cos = Math.cos(delta), sin = Math.sin(delta);
                let cx = 0, cy = 0;
                obj.points.forEach(p => { cx += p.x; cy += p.y; });
                cx /= obj.points.length; cy /= obj.points.length;
                obj.points.forEach(p => {
                    const dx = p.x - cx, dy = p.y - cy;
                    p.x = cx + dx * cos - dy * sin;
                    p.y = cy + dx * sin + dy * cos;
                });
            }
            State.updateObject(obj.id, { rotation: newRot });
            Canvas.render();
        }

        if (obj.points && obj.points.length >= 2) {
            // Points-based: use applyRotation
            const rotInput = document.getElementById('prop-rotation');
            const rotSlider = document.getElementById('prop-rotation-slider');
            if (rotInput) rotInput.addEventListener('change', () => applyRotation(parseFloat(rotInput.value)));
            if (rotSlider) {
                rotSlider.addEventListener('input', () => {
                    if (rotInput) rotInput.value = rotSlider.value;
                    applyRotation(parseFloat(rotSlider.value));
                });
            }
            document.querySelectorAll('.rot-preset').forEach(btn => {
                btn.addEventListener('click', () => {
                    const rot = parseFloat(btn.dataset.rot);
                    if (rotInput) rotInput.value = rot;
                    if (rotSlider) rotSlider.value = rot;
                    applyRotation(rot);
                });
            });
        } else {
            bind('prop-rotation', 'rotation', parseFloat);
            const rotSlider = document.getElementById('prop-rotation-slider');
            const rotInput = document.getElementById('prop-rotation');
            if (rotSlider && rotInput) {
                rotSlider.addEventListener('input', () => {
                    if (!Canvas.isSelected(obj.id)) return;
                    rotInput.value = rotSlider.value;
                    State.updateObject(obj.id, { rotation: parseFloat(rotSlider.value) });
                    Canvas.render();
                });
                rotInput.addEventListener('change', () => { rotSlider.value = rotInput.value; });
            }
            document.querySelectorAll('.rot-preset').forEach(btn => {
                btn.addEventListener('click', () => {
                    if (!Canvas.isSelected(obj.id)) return;
                    const rot = parseFloat(btn.dataset.rot);
                    State.updateObject(obj.id, { rotation: rot });
                    if (rotInput) rotInput.value = rot;
                    if (rotSlider) rotSlider.value = rot;
                    Canvas.render();
                });
            });
        }
        bind('prop-guyrope', 'guyRopeDistance', parseFloat);
        bind('prop-color', 'color');
        bind('prop-shape', 'shape');

        // Guy rope sides checkboxes
        ['top', 'right', 'bottom', 'left'].forEach(side => {
            const cb = document.getElementById('gr-' + side);
            if (cb) {
                cb.addEventListener('change', () => {
                    if (!Canvas.isSelected(obj.id)) return;
                    const sides = obj.guyRopeSides || { top: true, right: true, bottom: true, left: true };
                    sides[side] = cb.checked;
                    State.updateObject(obj.id, { guyRopeSides: { ...sides } });
                    Canvas.render();
                });
            }
        });

        document.getElementById('prop-duplicate').addEventListener('click', () => {
            const dup = State.duplicateObject(obj.id);
            if (dup) {
                Canvas.selectedId = dup.id;
                showProperties(dup);
                Canvas.render();
                buildPlacedList();
            }
        });

        document.getElementById('prop-delete').addEventListener('click', () => {
            State.removeObject(obj.id);
            Canvas.clearSelection();
            hideProperties();
            Canvas.render();
            buildPlacedList();
        });

        document.getElementById('btn-close-props').addEventListener('click', hideProperties);
    }

    // showGroundProperties removed - grounds are now regular objects

    function showMultiProperties() {
        const panel = document.getElementById('properties');
        const content = document.getElementById('prop-content');
        panel.classList.remove('hidden');
        const site = State.activeSite;
        const count = Canvas.selectionCount;
        const selObjs = site ? site.objects.filter(o => Canvas.isSelected(o.id)) : [];

        // Check if all are in the same group
        const groupIds = [...new Set(selObjs.map(o => o.groupId).filter(Boolean))];
        const isGroup = groupIds.length === 1;
        const groupId = isGroup ? groupIds[0] : '';
        const groupName = isGroup && site.groupNames ? (site.groupNames[groupId] || '') : '';

        let html = `<div style="text-align:center;padding:8px 0;color:var(--text-secondary);font-size:12px;">
                <strong>${I18n.t('props.multiSelected', { count: count })}</strong>
            </div>`;

        // Group name (if grouped)
        if (isGroup) {
            html += `<div class="prop-section">
                <div class="prop-section-title">${I18n.t('ctx.group')}</div>
                <label>${I18n.t('props.groupName')} <input type="text" id="prop-group-name" value="${groupName}" placeholder="${I18n.t('ctx.group')}..."></label>
            </div>`;
        }

        // Group rotation
        html += `<div class="prop-section">
            <div class="prop-section-title">${I18n.t('props.rotation')}</div>
            <div class="prop-row">
                <input type="number" id="prop-group-rot" value="0" step="15" class="prop-rot-input">&deg;
            </div>
            <input type="range" id="prop-group-rot-slider" min="-180" max="180" step="1" value="0" class="rotation-slider">
            <div class="rotation-presets">
                <button class="grp-rot-preset" data-rot="0">0&deg;</button>
                <button class="grp-rot-preset" data-rot="90">90&deg;</button>
                <button class="grp-rot-preset" data-rot="180">180&deg;</button>
                <button class="grp-rot-preset" data-rot="-90">-90&deg;</button>
            </div>
        </div>`;

        // Bulk color
        html += `<div class="prop-section">
            <label>${I18n.t('props.bulkColor')} <input type="color" id="prop-bulk-color" value="#4a90d9"></label>
        </div>`;

        // Align buttons
        html += `<div class="prop-section">
            <div class="prop-section-title">${I18n.t('ctx.align')}</div>
            <div style="display:flex;gap:3px;flex-wrap:wrap">
                <button class="rot-preset" id="align-left" title="${I18n.t('ctx.alignLeft')}">&#9664;</button>
                <button class="rot-preset" id="align-right" title="${I18n.t('ctx.alignRight')}">&#9654;</button>
                <button class="rot-preset" id="align-top" title="${I18n.t('ctx.alignTop')}">&#9650;</button>
                <button class="rot-preset" id="align-bottom" title="${I18n.t('ctx.alignBottom')}">&#9660;</button>
                <button class="rot-preset" id="dist-h" title="${I18n.t('ctx.distributeH')}">&#8596;</button>
                <button class="rot-preset" id="dist-v" title="${I18n.t('ctx.distributeV')}">&#8597;</button>
            </div>
        </div>`;

        html += `<div class="prop-actions">
                <button class="btn-duplicate" id="prop-multi-group">${I18n.t('ctx.group')}</button>
                <button class="btn-duplicate" id="prop-multi-ungroup">${I18n.t('ctx.ungroup')}</button>
            </div>
            <div class="prop-actions">
                <button class="btn-duplicate" id="prop-multi-export">${I18n.t('btn.export')}</button>
                <button class="btn-duplicate" id="prop-multi-dup">${I18n.t('props.duplicateAll')}</button>
                <button class="btn-danger" id="prop-multi-del">${I18n.t('props.deleteAll')}</button>
            </div>`;

        content.innerHTML = html;

        // Group name handler
        const gnInput = document.getElementById('prop-group-name');
        if (gnInput) {
            gnInput.addEventListener('change', () => {
                if (!site.groupNames) site.groupNames = {};
                site.groupNames[groupId] = gnInput.value;
                State.notifyChange(true);
                buildPlacedList();
            });
        }

        // Group rotation handler
        const origStates = selObjs.map(o => ({ id: o.id, x: o.x, y: o.y, rotation: o.rotation, points: o.points ? o.points.map(p => ({x: p.x, y: p.y})) : null }));
        let cx = 0, cy = 0;
        selObjs.forEach(o => { cx += o.x; cy += o.y; });
        cx /= selObjs.length; cy /= selObjs.length;

        function applyGroupRotation(deg) {
            const rad = deg * Math.PI / 180;
            const cos = Math.cos(rad), sin = Math.sin(rad);
            origStates.forEach(orig => {
                const obj = site.objects.find(o => o.id === orig.id);
                if (!obj || obj.locked) return;
                const dx = orig.x - cx, dy = orig.y - cy;
                obj.x = cx + dx * cos - dy * sin;
                obj.y = cy + dx * sin + dy * cos;
                obj.rotation = ((orig.rotation + deg) % 360 + 360) % 360;
                if (orig.points && obj.points) {
                    orig.points.forEach((op, i) => {
                        const px = op.x - cx, py = op.y - cy;
                        obj.points[i].x = cx + px * cos - py * sin;
                        obj.points[i].y = cy + px * sin + py * cos;
                    });
                }
            });
            State.notifyChange();
            Canvas.render();
        }

        const grpRotInput = document.getElementById('prop-group-rot');
        const grpRotSlider = document.getElementById('prop-group-rot-slider');
        grpRotSlider.addEventListener('input', () => {
            grpRotInput.value = grpRotSlider.value;
            applyGroupRotation(parseFloat(grpRotSlider.value));
        });
        grpRotInput.addEventListener('change', () => {
            grpRotSlider.value = grpRotInput.value;
            applyGroupRotation(parseFloat(grpRotInput.value));
        });
        document.querySelectorAll('.grp-rot-preset').forEach(btn => {
            btn.addEventListener('click', () => {
                const rot = parseFloat(btn.dataset.rot);
                grpRotInput.value = rot;
                grpRotSlider.value = rot;
                applyGroupRotation(rot);
            });
        });

        // Bulk color
        document.getElementById('prop-bulk-color').addEventListener('change', (e) => {
            [...Canvas.selectedIds].forEach(id => State.updateObject(id, { color: e.target.value }));
            Canvas.render();
        });

        // Alignment
        document.getElementById('align-left').addEventListener('click', () => {
            const minX = Math.min(...selObjs.map(o => o.x - (o.width||0)/2));
            selObjs.forEach(o => { o.x = minX + (o.width||0)/2; }); State.notifyChange(); Canvas.render();
        });
        document.getElementById('align-right').addEventListener('click', () => {
            const maxX = Math.max(...selObjs.map(o => o.x + (o.width||0)/2));
            selObjs.forEach(o => { o.x = maxX - (o.width||0)/2; }); State.notifyChange(); Canvas.render();
        });
        document.getElementById('align-top').addEventListener('click', () => {
            const minY = Math.min(...selObjs.map(o => o.y - (o.height||0)/2));
            selObjs.forEach(o => { o.y = minY + (o.height||0)/2; }); State.notifyChange(); Canvas.render();
        });
        document.getElementById('align-bottom').addEventListener('click', () => {
            const maxY = Math.max(...selObjs.map(o => o.y + (o.height||0)/2));
            selObjs.forEach(o => { o.y = maxY - (o.height||0)/2; }); State.notifyChange(); Canvas.render();
        });
        document.getElementById('dist-h').addEventListener('click', () => {
            if (selObjs.length < 3) return;
            const sorted = [...selObjs].sort((a,b) => a.x - b.x);
            const minX = sorted[0].x, maxX = sorted[sorted.length-1].x;
            const step = (maxX - minX) / (sorted.length - 1);
            sorted.forEach((o, i) => { o.x = minX + i * step; }); State.notifyChange(); Canvas.render();
        });
        document.getElementById('dist-v').addEventListener('click', () => {
            if (selObjs.length < 3) return;
            const sorted = [...selObjs].sort((a,b) => a.y - b.y);
            const minY = sorted[0].y, maxY = sorted[sorted.length-1].y;
            const step = (maxY - minY) / (sorted.length - 1);
            sorted.forEach((o, i) => { o.y = minY + i * step; }); State.notifyChange(); Canvas.render();
        });

        document.getElementById('prop-multi-group').addEventListener('click', () => {
            const gid = State.generateId();
            [...Canvas.selectedIds].forEach(id => State.updateObject(id, { groupId: gid }));
            showMultiProperties();
            Canvas.render();
            buildPlacedList();
        });
        document.getElementById('prop-multi-ungroup').addEventListener('click', () => {
            [...Canvas.selectedIds].forEach(id => State.updateObject(id, { groupId: '' }));
            Canvas.render();
            buildPlacedList();
        });
        document.getElementById('prop-multi-export').addEventListener('click', () => {
            const objs = selObjs.map(o => JSON.parse(JSON.stringify(o)));
            const data = { type: 'objects_export', version: 1, objects: objs };
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = 'objects_export.json'; a.click();
            URL.revokeObjectURL(url);
        });

        document.getElementById('prop-multi-dup').addEventListener('click', () => {
            const newIds = [];
            [...Canvas.selectedIds].forEach(id => {
                const dup = State.duplicateObject(id);
                if (dup) newIds.push(dup.id);
            });
            Canvas.selectMultiple(newIds);
            showMultiProperties();
            Canvas.render();
            buildPlacedList();
        });
        document.getElementById('prop-multi-del').addEventListener('click', () => {
            [...Canvas.selectedIds].forEach(id => State.removeObject(id));
            Canvas.clearSelection();
            hideProperties();
            Canvas.render();
            buildPlacedList();
        });
        document.getElementById('btn-close-props').addEventListener('click', hideProperties);
    }

    function hideProperties() {
        document.getElementById('properties').classList.add('hidden');
    }

    // --- Modals ---
    function openModal(modalId) {
        document.getElementById('modal-overlay').classList.remove('hidden');
        document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
        document.getElementById(modalId).classList.remove('hidden');
    }

    function closeModal() {
        document.getElementById('modal-overlay').classList.add('hidden');
        document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
    }

    function bindModals() {
        document.getElementById('co-cancel').addEventListener('click', closeModal);
        function getCustomTemplate() {
            return {
                type: document.getElementById('co-type').value,
                name: document.getElementById('co-name').value || 'Object',
                width: parseFloat(document.getElementById('co-width').value) || 2,
                height: parseFloat(document.getElementById('co-height').value) || 2,
                shape: document.getElementById('co-shape').value,
                guyRopeDistance: parseFloat(document.getElementById('co-guyrope').value) || 0,
                color: document.getElementById('co-color').value,
            };
        }
        document.getElementById('co-create-only').addEventListener('click', () => {
            const template = getCustomTemplate();
            State.addTemplate(template);
            buildPalette();
            closeModal();
        });
        document.getElementById('co-create').addEventListener('click', () => {
            const template = getCustomTemplate();
            State.addTemplate(template);
            buildPalette();
            closeModal();
            Tools.setPendingTemplate(template);
        });

        // Export menu button
        document.getElementById('btn-exportmenu').addEventListener('click', () => {
            const site = State.activeSite;
            if (site) document.getElementById('print-title').value = site.name;
            openModal('modal-print');
        });
        document.getElementById('print-cancel').addEventListener('click', closeModal);

        // Format buttons
        function doExport(fmt) {
            if (fmt === 'svg') { IO.exportSVG(); return; }
            // For png, jpeg, pdf: set format and call print
            const fmtMap = { png: 'png', jpeg: 'jpeg', pdf: 'print' };
            document.getElementById('print-format') && (document.getElementById('print-format').value = fmtMap[fmt] || 'print');
            closeModal();
            IO.print(fmtMap[fmt] || 'print');
        }
        ['png','jpeg','pdf','svg','dxf'].forEach(fmt => {
            const btn = document.getElementById('fmt-' + fmt);
            if (btn) btn.addEventListener('click', () => doExport(fmt));
        });

        document.getElementById('rename-cancel').addEventListener('click', closeModal);
        document.getElementById('rename-ok').addEventListener('click', () => {
            const input = document.getElementById('rename-tab-input');
            const idx = parseInt(input.dataset.siteIndex);
            if (!isNaN(idx) && input.value.trim()) {
                State.renameSite(idx, input.value.trim());
            }
            closeModal();
        });

        document.getElementById('btn-import').addEventListener('click', () => IO.importFile());
        document.getElementById('btn-export').addEventListener('click', () => IO.exportFile());

        // CSV import
        const csvInput = document.getElementById('file-csv-import');
        document.getElementById('btn-csv-import').addEventListener('click', () => csvInput.click());
        csvInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => { IO.importCSV(reader.result); closeModal(); };
            reader.readAsText(file);
            csvInput.value = '';
        });

        // CSV example download
        document.getElementById('btn-csv-example').addEventListener('click', () => {
            const csv = 'name;breite;tiefe;abspann;farbe;beschreibung\n'
                + 'Familienzelt;4;3;0.5;#4a90d9;Platz 1\n'
                + '2-Personen-Zelt;2;1.5;0.3;;\n'
                + 'Gruppenzelt;6;4;0.8;#e67e22;Leitung\n';
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = 'beispiel-zelte.csv'; a.click();
            URL.revokeObjectURL(url);
        });

        // Rooms modal
        document.getElementById('btn-rooms').addEventListener('click', () => {
            const info = document.getElementById('rooms-connected-info');
            if (typeof Collab !== 'undefined' && Collab.isConnected()) {
                info.style.display = 'block';
                document.getElementById('rooms-connected-text').textContent = I18n.t('collab.connectedTo') + ' ' + Collab.getRoomId();
            } else {
                info.style.display = 'none';
            }
            document.getElementById('rooms-join-id').value = '';
            document.getElementById('rooms-create-name').value = '';
            openModal('modal-rooms');
        });

        document.getElementById('rooms-join-btn').addEventListener('click', () => {
            const id = document.getElementById('rooms-join-id').value.trim();
            if (!id) return;
            closeModal();
            if (typeof Collab !== 'undefined') {
                Collab.joinRoom(id).then(ok => {
                    if (ok) { updateCollabStatus(); }
                    else { alert(I18n.t('collab.roomNotFound')); }
                });
            }
        });

        document.getElementById('rooms-join-id').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); document.getElementById('rooms-join-btn').click(); }
        });

        document.getElementById('rooms-create-btn').addEventListener('click', async () => {
            const name = document.getElementById('rooms-create-name').value.trim();
            try {
                const resp = await fetch('api/room-create.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: name }),
                });
                const data = await resp.json();
                if (data.ok && data.roomId) {
                    closeModal();
                    if (typeof Collab !== 'undefined') {
                        Collab.joinRoom(data.roomId).then(ok => {
                            if (ok) {
                                updateCollabStatus();
                                // Link kopieren und anzeigen
                                const url = location.origin + location.pathname + '?room=' + data.roomId;
                                navigator.clipboard.writeText(url).catch(() => {});
                                alert(I18n.t('collab.roomCreated') + '\n\n' + url + '\n\n' + I18n.t('collab.roomCreatedCopied'));
                            }
                        });
                    }
                } else {
                    alert(data.error || 'Fehler beim Erstellen');
                }
            } catch (e) {
                alert('Fehler: ' + e.message);
            }
        });

        document.getElementById('rooms-disconnect').addEventListener('click', () => {
            if (typeof Collab !== 'undefined') {
                Collab.disconnect();
                updateCollabStatus();
            }
            closeModal();
        });

        document.getElementById('rooms-close').addEventListener('click', closeModal);

        document.getElementById('btn-settings').addEventListener('click', () => {
            syncSettings();
            openModal('modal-settings');
        });
        document.getElementById('settings-ok').addEventListener('click', closeModal);

        document.getElementById('text-cancel').addEventListener('click', () => {
            closeModal();
            Tools.setTool('select');
        });
        document.getElementById('text-ok').addEventListener('click', () => {
            const text = document.getElementById('text-input').value || 'Text';
            const fontSize = parseFloat(document.getElementById('text-size').value) || 1;
            const color = document.getElementById('text-color').value;
            const pos = _pendingTextPos;
            closeModal();
            if (pos) {
                State.addObject({
                    type: 'text', name: text, text: text,
                    width: 0, height: 0, guyRopeDistance: 0,
                    color: color, shape: 'rect', fontSize: fontSize,
                }, pos.x, pos.y);
            }
            Tools.setTool('select');
        });

        document.getElementById('notebook-ok').addEventListener('click', () => {
            const site = State.activeSite;
            if (site) { site.notebook = document.getElementById('notebook-text').value; State.notifyChange(true); }
            closeModal();
        });

        document.getElementById('modal-overlay').addEventListener('click', (e) => {
            if (e.target.id === 'modal-overlay') closeModal();
        });
    }

    let _pendingTextPos = null;
    function openTextModal(pos) {
        _pendingTextPos = pos;
        openModal('modal-text');
        setTimeout(() => document.getElementById('text-input').select(), 50);
    }

    // --- Context Menu ---
    function showCanvasContextMenu(x, y, worldPos) {
        createContextMenuAt(x, y, [
            { label: I18n.t('btn.import'), action: () => {
                const input = document.createElement('input');
                input.type = 'file'; input.accept = '.json';
                input.onchange = () => {
                    const file = input.files[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                        try {
                            const data = JSON.parse(ev.target.result);
                            const site = State.activeSite;
                            if (data.type === 'ground_area' && data.ground && site) {
                                const pts = data.ground;
                                // Center on click position
                                let cx = 0, cy = 0;
                                pts.forEach(p => { cx += p.x; cy += p.y; });
                                cx /= pts.length; cy /= pts.length;
                                const dx = worldPos.x - cx, dy = worldPos.y - cy;
                                pts.forEach(p => { p.x += dx; p.y += dy; });
                                // Create ground object
                                const obj = State.addObject({
                                    type: 'ground', name: I18n.t('tool.ground'),
                                    width: 0, height: 0, guyRopeDistance: 0,
                                    color: State.displaySettings.defaultGroundColor || '#22c55e', shape: 'rect', points: pts,
                                }, worldPos.x, worldPos.y);
                                if (obj) obj.points = pts;
                                // Import contained objects with offset
                                if (data.objects && Array.isArray(data.objects)) {
                                    data.objects.forEach(o => {
                                        o.id = State.generateId();
                                        o.x += dx; o.y += dy;
                                        if (o.points) o.points.forEach(p => { p.x += dx; p.y += dy; });
                                        site.objects.push(o);
                                    });
                                }
                                State.notifyChange();
                                Canvas.render();
                            } else if (data.type === 'object_export' && data.object && site) {
                                const o = data.object;
                                const dx = worldPos.x - o.x;
                                const dy = worldPos.y - o.y;
                                o.x = worldPos.x; o.y = worldPos.y;
                                if (o.points) o.points.forEach(p => { p.x += dx; p.y += dy; });
                                o.id = State.generateId();
                                o.layerId = site.activeLayerId;
                                site.objects.push(o);
                                State.notifyChange();
                                Canvas.render();
                            } else if (data.type === 'objects_export' && data.objects && site) {
                                // Multi-object import - center on click position
                                let cx = 0, cy = 0;
                                data.objects.forEach(o => { cx += o.x; cy += o.y; });
                                cx /= data.objects.length; cy /= data.objects.length;
                                const dx = worldPos.x - cx, dy = worldPos.y - cy;
                                data.objects.forEach(o => {
                                    o.x += dx; o.y += dy;
                                    if (o.points) o.points.forEach(p => { p.x += dx; p.y += dy; });
                                    o.id = State.generateId();
                                    o.layerId = site.activeLayerId;
                                    site.objects.push(o);
                                });
                                State.notifyChange();
                                Canvas.render();
                            } else {
                                alert(I18n.t('msg.importError') + 'Unknown file format');
                            }
                        } catch (err) { alert(I18n.t('msg.importError') + err.message); }
                    };
                    reader.readAsText(file);
                };
                input.click();
            }},
        ]);
    }

    function showContextMenu(x, y, obj) {
        createContextMenuAt(x, y, [
            { label: I18n.t('ctx.properties'), action: () => showProperties(obj) },
            { label: I18n.t('ctx.duplicate'), action: () => {
                const dup = State.duplicateObject(obj.id);
                if (dup) { Canvas.selectedId = dup.id; showProperties(dup); Canvas.render(); buildPlacedList(); }
            }},
            { label: I18n.t('ctx.toFront'), action: () => {
                const site = State.activeSite;
                const idx = site.objects.findIndex(o => o.id === obj.id);
                if (idx < site.objects.length - 1) {
                    site.objects.splice(idx, 1);
                    site.objects.push(obj);
                    State.notifyChange();
                    Canvas.render();
                }
            }},
            { label: I18n.t('ctx.toBack'), action: () => {
                const site = State.activeSite;
                const idx = site.objects.findIndex(o => o.id === obj.id);
                if (idx > 0) {
                    site.objects.splice(idx, 1);
                    site.objects.unshift(obj);
                    State.notifyChange();
                    Canvas.render();
                }
            }},
            { label: I18n.t('btn.export'), action: () => {
                const data = { type: 'object_export', version: 1, object: JSON.parse(JSON.stringify(obj)) };
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = (obj.name || 'object').replace(/[^a-zA-Z0-9_-]/g, '_') + '.json'; a.click();
                URL.revokeObjectURL(url);
            }},
            { label: I18n.t('ctx.saveAsTemplate'), action: () => {
                const template = {
                    type: obj.type || 'tent',
                    name: obj.name || 'Vorlage',
                    width: obj.width,
                    height: obj.height,
                    guyRopeDistance: obj.guyRopeDistance || 0,
                    color: obj.color || '#4a90d9',
                    shape: obj.shape || 'rect',
                };
                State.addTemplate(template);
                buildPalette();
            }},
            { sep: true },
            ...(() => {
                const site = State.activeSite;
                if (!site || !site.layers || site.layers.length <= 1) return [];
                return site.layers.filter(l => l.id !== obj.layerId).map(l => ({
                    label: I18n.t('layer.moveToLayer') + ': ' + l.name,
                    action: () => {
                        State.updateObject(obj.id, { layerId: l.id });
                        Canvas.render();
                        buildPlacedList();
                        buildLayers();
                    }
                }));
            })(),
            { sep: true },
            { label: I18n.t('ctx.delete'), className: 'danger', action: () => {
                State.removeObject(obj.id);
                Canvas.clearSelection();
                hideProperties();
                Canvas.render();
                buildPlacedList();
            }},
        ]);
    }

    function createContextMenuAt(x, y, items) {
        removeContextMenu();
        const menu = document.createElement('div');
        menu.className = 'context-menu';
        menu.style.left = x + 'px';
        menu.style.top = y + 'px';

        items.forEach(item => {
            if (item.sep) {
                const sep = document.createElement('div');
                sep.className = 'context-menu-sep';
                menu.appendChild(sep);
                return;
            }
            const btn = document.createElement('button');
            btn.className = 'context-menu-item' + (item.className ? ' ' + item.className : '');
            btn.textContent = item.label;
            btn.addEventListener('click', () => {
                removeContextMenu();
                item.action();
            });
            menu.appendChild(btn);
        });

        document.body.appendChild(menu);
        contextMenuEl = menu;

        const rect = menu.getBoundingClientRect();
        if (rect.right > window.innerWidth) menu.style.left = (x - rect.width) + 'px';
        if (rect.bottom > window.innerHeight) menu.style.top = (y - rect.height) + 'px';
    }

    function showGroundVertexMenu(x, y, gi, vertexIndex) {
        const site = State.activeSite;
        if (!site || !site.grounds || !site.grounds[gi]) return;
        const ground = site.grounds[gi];
        createContextMenuAt(x, y, [
            { label: I18n.t('ctx.deleteVertex'), className: ground.length <= 3 ? '' : 'danger', action: () => {
                if (ground.length <= 3) return;
                ground.splice(vertexIndex, 1);
                State.notifyChange();
                Canvas.render();
            }},
            { sep: true },
            { label: I18n.t('ctx.deleteGround'), className: 'danger', action: () => {
                site.grounds.splice(gi, 1);
                State.notifyChange();
                Canvas.render();
            }},
        ]);
    }

    function showGroundEdgeMenu(x, y, gi, edgeIndex, worldPos) {
        const site = State.activeSite;
        if (!site || !site.grounds || !site.grounds[gi]) return;
        createContextMenuAt(x, y, [
            { label: I18n.t('ctx.addVertex'), action: () => {
                site.grounds[gi].splice(edgeIndex + 1, 0, { x: worldPos.x, y: worldPos.y });
                State.notifyChange();
                Canvas.render();
            }},
            { sep: true },
            { label: I18n.t('ctx.deleteGround'), className: 'danger', action: () => {
                site.grounds.splice(gi, 1);
                State.notifyChange();
                Canvas.render();
            }},
        ]);
    }

    function showAreaVertexMenu(x, y, obj, vertexIndex) {
        createContextMenuAt(x, y, [
            { label: I18n.t('ctx.deleteAreaVertex'), className: obj.points.length <= 3 ? '' : 'danger', action: () => {
                if (obj.points.length <= 3) return;
                obj.points.splice(vertexIndex, 1);
                let cx = 0, cy = 0;
                obj.points.forEach(p => { cx += p.x; cy += p.y; });
                obj.x = cx / obj.points.length;
                obj.y = cy / obj.points.length;
                State.notifyChange();
                Canvas.render();
            }},
        ]);
    }

    function showAreaEdgeMenu(x, y, obj, edgeIndex, worldPos) {
        createContextMenuAt(x, y, [
            { label: I18n.t('ctx.addAreaVertex'), action: () => {
                obj.points.splice(edgeIndex + 1, 0, { x: worldPos.x, y: worldPos.y });
                let cx = 0, cy = 0;
                obj.points.forEach(p => { cx += p.x; cy += p.y; });
                obj.x = cx / obj.points.length;
                obj.y = cy / obj.points.length;
                State.notifyChange();
                Canvas.render();
            }},
        ]);
    }

    function showFenceVertexMenu(x, y, obj, vertexIndex) {
        createContextMenuAt(x, y, [
            { label: I18n.t('ctx.deleteAreaVertex'), className: obj.points.length <= 2 ? '' : 'danger', action: () => {
                if (obj.points.length <= 2) return;
                obj.points.splice(vertexIndex, 1);
                let cx = 0, cy = 0;
                obj.points.forEach(p => { cx += p.x; cy += p.y; });
                obj.x = cx / obj.points.length;
                obj.y = cy / obj.points.length;
                State.notifyChange();
                Canvas.render();
            }},
        ]);
    }

    function showFenceEdgeMenu(x, y, obj, edgeIndex, worldPos) {
        createContextMenuAt(x, y, [
            { label: I18n.t('ctx.addAreaVertex'), action: () => {
                obj.points.splice(edgeIndex + 1, 0, { x: worldPos.x, y: worldPos.y });
                let cx = 0, cy = 0;
                obj.points.forEach(p => { cx += p.x; cy += p.y; });
                obj.x = cx / obj.points.length;
                obj.y = cy / obj.points.length;
                State.notifyChange();
                Canvas.render();
            }},
        ]);
    }

    function removeContextMenu() {
        if (contextMenuEl) { contextMenuEl.remove(); contextMenuEl = null; }
    }

    function bindContextMenuClose() {
        document.addEventListener('click', (e) => {
            if (contextMenuEl && !contextMenuEl.contains(e.target)) removeContextMenu();
        });
    }

    // --- Status Bar ---
    function updateCoords(x, y) {
        document.getElementById('status-coords').textContent = `X: ${x.toFixed(1)} m   Y: ${y.toFixed(1)} m`;
        const site = State.activeSite;
        if (site) document.getElementById('status-grid').textContent = site.gridSize + ' m';
        // Status info for selected object
        const info = document.getElementById('status-info');
        if (Canvas.selectionCount === 1) {
            const obj = site ? site.objects.find(o => o.id === Canvas.selectedId) : null;
            if (obj) {
                const t = obj.type;
                const sz = (t === 'area' || t === 'ground' || t === 'fence' || t === 'text' || t === 'guideline')
                    ? t : `${obj.width}\u00d7${obj.height}m`;
                info.textContent = `${obj.name} (${sz})`;
            } else info.textContent = '';
        } else if (Canvas.selectionCount > 1) {
            info.textContent = Canvas.selectionCount + ' objects';
        } else {
            info.textContent = '';
        }
    }

    function updateZoom(z) {
        document.getElementById('status-zoom').textContent = Math.round(z * 100) + '%';
    }

    function showHint(text) {
        const el = document.getElementById('canvas-hint');
        el.textContent = text;
        el.classList.toggle('visible', !!text);
    }

    // --- Translate static UI ---
    function translateUI() {
        I18n.updateDOM();
        // Rebuild dynamic elements
        buildPalette();
        buildTabs();
        buildPlacedList();
    }

    // --- Collab Messages ---

    function showCollabMessage(msg) {
        const container = document.getElementById('collab-messages');
        const toast = document.createElement('div');
        toast.style.cssText = 'background:rgba(0,0,0,0.85);color:#fff;padding:8px 12px;border-radius:8px;font-size:12px;line-height:1.4;pointer-events:auto;animation:fadeInMsg 0.3s ease';
        toast.innerHTML = '<strong style="color:#3b82f6">' + escapeHtml(msg.user_name) + '</strong> <span style="color:#94a3b8;font-size:10px">' + formatMsgTime(msg.created_at) + '</span><br>' + escapeHtml(msg.message);
        container.appendChild(toast);
        // Nach 8 Sekunden ausblenden
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.5s';
            setTimeout(() => toast.remove(), 500);
        }, 8000);
        // Max 5 Toasts
        while (container.children.length > 5) container.firstChild.remove();
    }

    function formatMsgTime(dateStr) {
        try {
            const d = new Date(dateStr + 'Z');
            return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch (e) { return ''; }
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // --- Collab Status ---
    let _collabNamesExpanded = false;
    let _collabCountdownTimer = null;

    function formatCountdown(ms) {
        if (ms <= 0) return '0:00';
        const totalSec = Math.floor(ms / 1000);
        const h = Math.floor(totalSec / 3600);
        const m = Math.floor((totalSec % 3600) / 60);
        const s = totalSec % 60;
        if (h > 0) return h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
        return m + ':' + String(s).padStart(2, '0');
    }

    function updateCollabStatus() {
        const indicator = document.getElementById('collab-indicator');
        const text = document.getElementById('collab-indicator-text');
        if (typeof Collab === 'undefined' || !Collab.isConnected()) {
            indicator.style.display = 'none';
            if (_collabCountdownTimer) { clearInterval(_collabCountdownTimer); _collabCountdownTimer = null; }
            return;
        }
        indicator.style.display = 'flex';
        indicator.style.cursor = 'pointer';
        indicator.style.pointerEvents = 'auto';
        const locked = Collab.isLocked();
        const dot = indicator.querySelector('span');
        dot.style.background = locked ? '#f59e0b' : '#22c55e';
        indicator.style.background = locked ? 'rgba(245,158,11,0.85)' : 'rgba(0,0,0,0.7)';
        const users = Collab.getOnlineUsers();
        const count = Math.max(1, users.length);

        // Countdown-Timer starten falls Ablaufzeit vorhanden
        const deadline = Collab.getExpiresDeadline();
        if (deadline && !_collabCountdownTimer) {
            _collabCountdownTimer = setInterval(updateCollabCountdown, 1000);
        }
        if (!deadline && _collabCountdownTimer) {
            clearInterval(_collabCountdownTimer);
            _collabCountdownTimer = null;
        }

        buildCollabLabel(count, locked, deadline, users);
    }

    function updateCollabCountdown() {
        if (typeof Collab === 'undefined' || !Collab.isConnected()) return;
        const deadline = Collab.getExpiresDeadline();
        if (!deadline) return;
        const remaining = deadline - Date.now();
        if (remaining <= 0) {
            Collab.disconnect();
            alert(I18n.t('collab.roomExpired'));
            return;
        }
        const users = Collab.getOnlineUsers();
        const count = Math.max(1, users.length);
        buildCollabLabel(count, Collab.isLocked(), deadline, users);
    }

    function buildCollabLabel(count, locked, deadline, users) {
        const text = document.getElementById('collab-indicator-text');
        let parts = [];
        if (locked) parts.push(I18n.t('collab.locked'));
        if (deadline) {
            const remaining = deadline - Date.now();
            parts.push(formatCountdown(Math.max(0, remaining)));
        }
        parts.push(count + ' ' + I18n.t('collab.connected'));
        if (_collabNamesExpanded) {
            const names = users.map(u => u.user_name).filter(Boolean).join(', ');
            if (names) parts[parts.length - 1] += ' (' + names + ')';
        }
        text.textContent = parts.join(' | ');
    }

    document.addEventListener('DOMContentLoaded', () => {
        document.getElementById('collab-indicator').addEventListener('click', () => {
            _collabNamesExpanded = !_collabNamesExpanded;
            updateCollabStatus();
        });
    });

    return {
        init, buildTabs, buildPalette, buildPlacedList, buildLayers, syncSettings, translateUI,
        showProperties, hideProperties, getActiveColor,
        updateToolButtons, updateCoords, updateZoom, showHint,
        showContextMenu, showCanvasContextMenu, showGroundVertexMenu, showGroundEdgeMenu,
        showAreaVertexMenu, showAreaEdgeMenu, showFenceVertexMenu, showFenceEdgeMenu,
        removeContextMenu, openTextModal, showMultiProperties,
        updateCollabStatus,
    };
})();
