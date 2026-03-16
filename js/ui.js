/* ========================================
   UI – DOM-Interaktionen, Panels, Dialoge
   ======================================== */

const UI = (() => {
    let contextMenuEl = null;

    function init() {
        buildPalette();
        buildTabs();
        buildPlacedList();
        bindToolbar();
        bindSettings();
        bindModals();
        bindContextMenuClose();
        bindPaletteToggle();
    }

    // --- Object Palette (uses site.templates, deletable) ---
    function buildPalette() {
        const container = document.getElementById('object-palette');
        container.innerHTML = '';
        const site = State.activeSite;
        if (!site) return;
        const templates = site.templates || [];
        templates.forEach((t, idx) => {
            const el = document.createElement('div');
            el.className = 'palette-item';
            const shapeStyle = t.shape === 'circle' ? 'border-radius:50%'
                : t.shape === 'hexagon' ? 'clip-path:polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%)'
                : t.shape === 'octagon' ? 'clip-path:polygon(30% 0%,70% 0%,100% 30%,100% 70%,70% 100%,30% 100%,0% 70%,0% 30%)'
                : t.shape === 'triangle' ? 'clip-path:polygon(50% 0%,100% 100%,0% 100%)'
                : '';
            el.innerHTML = `
                <div class="palette-swatch" style="background:${t.color};${shapeStyle}"></div>
                <div class="palette-info">
                    <div class="palette-name">${t.name}</div>
                    <div class="palette-dims">${t.width} \u00d7 ${t.height} m</div>
                </div>
                <button class="palette-delete" title="Vorlage entfernen">&times;</button>`;
            el.querySelector('.palette-delete').addEventListener('click', (e) => {
                e.stopPropagation();
                State.removeTemplate(idx);
                buildPalette();
            });
            el.addEventListener('click', () => Tools.setPendingTemplate(t));
            container.appendChild(el);
        });
    }

    // --- Placed Objects List ---
    function buildPlacedList() {
        const container = document.getElementById('placed-objects-list');
        container.innerHTML = '';
        const site = State.activeSite;
        if (!site) return;
        site.objects.forEach(obj => {
            const el = document.createElement('div');
            el.className = 'placed-item' + (Canvas.isSelected(obj.id) ? ' active' : '');
            const dims = (obj.type === 'area' || obj.type === 'text') ? obj.type : `${obj.width}\u00d7${obj.height}`;
            const desc = obj.description ? ` - ${obj.description}` : '';
            el.innerHTML = `
                <div class="placed-item-color" style="background:${obj.color}"></div>
                <span class="placed-item-name" title="${obj.name}${desc}">${obj.name}</span>
                <span class="placed-item-dims">${dims}</span>`;
            el.addEventListener('click', (e) => {
                if (e.ctrlKey || e.metaKey) {
                    Canvas.toggleSelection(obj.id);
                } else {
                    Canvas.selectedId = obj.id;
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
            container.appendChild(el);
        });
    }

    // --- Tabs ---
    let _renamingTabIndex = -1; // prevent rebuild while renaming

    function buildTabs() {
        const container = document.getElementById('tabs-container');
        // Don't rebuild if an inline rename is active
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
            editBtn.title = 'Umbenennen';
            editBtn.innerHTML = '&#9998;';

            const closeBtn = document.createElement('button');
            closeBtn.className = 'tab-close';
            closeBtn.title = 'Schlie\u00dfen';
            closeBtn.innerHTML = '&times;';

            tab.appendChild(nameSpan);
            tab.appendChild(editBtn);
            tab.appendChild(closeBtn);

            // Click to select
            tab.addEventListener('click', (e) => {
                if (e.target === closeBtn) {
                    if (State.sites.length > 1 && confirm(`"${site.name}" wirklich l\u00f6schen?`)) {
                        State.deleteSite(i);
                    }
                    return;
                }
                if (e.target === editBtn || e.target.tagName === 'INPUT') return;
                Canvas.clearSelection();
                hideProperties();
                State.activeSiteIndex = i;
            });

            // Edit button or double-click to rename
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
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.addEventListener('click', () => Tools.setTool(btn.dataset.tool));
        });

        document.getElementById('btn-undo').addEventListener('click', () => {
            State.undo();
            Canvas.render();
        });

        document.getElementById('btn-add-tab').addEventListener('click', () => {
            // Blur any focused input first to flush pending change events
            if (document.activeElement && document.activeElement.blur) {
                document.activeElement.blur();
            }
            // Force-clear all canvas state
            Canvas.clearSelection();
            Canvas.placementPreview = null;
            Canvas.dragDistances = [];
            Canvas.measureLine = null;
            Canvas.groundPreview = [];
            Canvas.pathPreview = [];
            hideProperties();
            State.createSite();
        });

        document.getElementById('btn-custom-object').addEventListener('click', () => {
            openModal('modal-custom-object');
        });

        document.getElementById('btn-clear-all').addEventListener('click', () => {
            if (confirm('Wirklich ALLES l\u00f6schen? Alle Zeltpl\u00e4tze und Objekte werden unwiderruflich entfernt.\n\nTipp: Vorher exportieren, um nichts zu verlieren!')) {
                Canvas.clearSelection();
                hideProperties();
                State.clear();
            }
        });
    }

    function updateToolButtons(activeName) {
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tool === activeName);
        });
        const toolNames = { select: 'Ausw\u00e4hlen', pan: 'Verschieben', ground: 'Grundfl\u00e4che', area: 'Gebiet', text: 'Text', measure: 'Messen', place: 'Platzieren' };
        document.getElementById('status-tool').textContent = toolNames[activeName] || activeName;
    }

    // --- Palette dropdown toggle ---
    function bindPaletteToggle() {
        document.getElementById('palette-toggle').addEventListener('click', () => {
            document.getElementById('object-palette').classList.toggle('collapsed');
            document.getElementById('palette-arrow').classList.toggle('collapsed');
        });
    }

    // --- Settings (now in modal) ---
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
        // Display scale settings
        ['fontScale', 'lineScale', 'ropeScale', 'hatchScale'].forEach(key => {
            const id = 'set-' + key.replace('Scale', 'scale');
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', () => {
                State.displaySettings[key] = parseFloat(el.value) || 1;
                Canvas.render();
            });
        });
        // Background image
        document.getElementById('btn-bg-image').addEventListener('click', () => {
            document.getElementById('bg-file-input').click();
        });
        document.getElementById('bg-file-input').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                const site = State.activeSite;
                if (!site) return;
                site.bgImage = { dataUrl: ev.target.result, x: 0, y: 0, width: 50, opacity: 0.3 };
                document.getElementById('bg-image-controls').classList.remove('hidden');
                State.notifyChange(true);
                Canvas.render();
            };
            reader.readAsDataURL(file);
        });
        document.getElementById('bg-opacity').addEventListener('input', (e) => {
            const site = State.activeSite;
            if (site && site.bgImage) { site.bgImage.opacity = parseFloat(e.target.value); Canvas.render(); }
        });
        document.getElementById('bg-width').addEventListener('change', (e) => {
            const site = State.activeSite;
            if (site && site.bgImage) { site.bgImage.width = parseFloat(e.target.value) || 50; Canvas.render(); }
        });
        document.getElementById('btn-bg-remove').addEventListener('click', () => {
            const site = State.activeSite;
            if (site) { site.bgImage = null; document.getElementById('bg-image-controls').classList.add('hidden'); Canvas.render(); }
        });
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
        // Background image controls visibility
        const bgCtrl = document.getElementById('bg-image-controls');
        if (site.bgImage && site.bgImage.dataUrl) {
            bgCtrl.classList.remove('hidden');
            document.getElementById('bg-opacity').value = site.bgImage.opacity || 0.3;
            document.getElementById('bg-width').value = site.bgImage.width || 50;
        } else {
            bgCtrl.classList.add('hidden');
        }
    }

    // --- Properties Panel ---
    function showProperties(obj) {
        const panel = document.getElementById('properties');
        const content = document.getElementById('prop-content');
        panel.classList.remove('hidden');

        const descVal = (obj.description || '').replace(/"/g, '&quot;');
        let html = '';

        // --- Section: Allgemein ---
        html += `<div class="prop-section">
            <div class="prop-section-title">Allgemein</div>
            <label>Name <input type="text" id="prop-name" value="${obj.name}"></label>
            <label>Beschreibung <input type="text" id="prop-desc" value="${descVal}" placeholder="Freitext..."></label>`;
        if (obj.type === 'text') {
            html += `<label>Text <input type="text" id="prop-text" value="${obj.text || ''}"></label>`;
        }
        html += `<label>Farbe <input type="color" id="prop-color" value="${obj.color}"></label>`;
        if (obj.type === 'area') {
            let texOpts = '';
            Canvas.AREA_TEXTURES.forEach(t => {
                texOpts += `<option value="${t.id}" ${(obj.texture || 'solid') === t.id ? 'selected' : ''}>${t.name}</option>`;
            });
            html += `<label>Textur <select id="prop-texture">${texOpts}</select></label>`;
        }
        html += `</div>`;

        // --- Section: Position & Größe ---
        if (obj.type !== 'area' && obj.type !== 'text') {
            html += `<div class="prop-section">
                <div class="prop-section-title">Position &amp; Gr\u00f6\u00dfe</div>
                <div class="prop-grid">
                    <label>X <input type="number" id="prop-x" value="${obj.x}" step="0.1"></label>
                    <label>Y <input type="number" id="prop-y" value="${obj.y}" step="0.1"></label>
                    <label>Breite <input type="number" id="prop-width" value="${obj.width}" min="0.1" step="0.1"></label>
                    <label>Tiefe <input type="number" id="prop-height" value="${obj.height}" min="0.1" step="0.1"></label>
                </div>
                <label>Form
                    <select id="prop-shape">
                        <option value="rect" ${obj.shape === 'rect' ? 'selected' : ''}>Rechteck</option>
                        <option value="hexagon" ${obj.shape === 'hexagon' ? 'selected' : ''}>Sechseck</option>
                        <option value="octagon" ${obj.shape === 'octagon' ? 'selected' : ''}>Achteck</option>
                        <option value="circle" ${obj.shape === 'circle' ? 'selected' : ''}>Kreis</option>
                    </select>
                </label>
            </div>`;
        }

        if (obj.type === 'text') {
            html += `<div class="prop-section">
                <div class="prop-section-title">Text</div>
                <label>Schriftgr\u00f6\u00dfe (m) <input type="number" id="prop-fontsize" value="${obj.fontSize || 1}" min="0.2" step="0.1"></label>
            </div>`;
        }

        // --- Section: Drehung ---
        if (obj.type !== 'area' && obj.type !== 'text') {
            html += `<div class="prop-section">
                <div class="prop-section-title">Drehung</div>
                <div class="prop-row">
                    <input type="number" id="prop-rotation" value="${Math.round(obj.rotation)}" step="15" class="prop-rot-input">&deg;
                </div>
                <input type="range" id="prop-rotation-slider" min="0" max="360" step="1" value="${Math.round(obj.rotation)}" class="rotation-slider">
                <div class="rotation-presets">
                    <button class="rot-preset" data-rot="0">0&deg;</button>
                    <button class="rot-preset" data-rot="90">90&deg;</button>
                    <button class="rot-preset" data-rot="180">180&deg;</button>
                    <button class="rot-preset" data-rot="270">270&deg;</button>
                </div>
            </div>`;
        }

        // --- Section: Abspannung ---
        if (obj.type !== 'area' && obj.type !== 'text') {
            html += `<div class="prop-section">
                <div class="prop-section-title">Abspannung</div>
                <label>Abstand (m) <input type="number" id="prop-guyrope" value="${obj.guyRopeDistance}" min="0" step="0.1"></label>
                ${obj.guyRopeDistance > 0 ? '<label>Schnurdicke <input type="number" id="prop-ropewidth" value="' + (obj.ropeWidth || 0) + '" min="0" max="3" step="0.1" placeholder="auto"></label>' : ''}
            </div>`;
        }

        // --- Section: Darstellung ---
        if (obj.type !== 'text') {
            html += `<div class="prop-section">
                <div class="prop-section-title">Darstellung</div>
                <div class="prop-grid">
                    <label>Textgr. <input type="number" id="prop-labelsize" value="${obj.labelSize || 0}" min="0" max="3" step="0.1" placeholder="auto"></label>
                    <label>Linien <input type="number" id="prop-linewidth" value="${obj.lineWidth || 0}" min="0" max="3" step="0.1" placeholder="auto"></label>
                </div>
            </div>`;
        }

        // --- Actions ---
        html += `<div class="prop-actions">
            <button class="btn-duplicate" id="prop-duplicate">Duplizieren</button>
            <button class="btn-danger" id="prop-delete">L\u00f6schen</button>
        </div>`;

        content.innerHTML = html;

        const bind = (id, key, parser) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('change', () => {
                // Don't update if selection was cleared (e.g. site switched)
                if (!Canvas.isSelected(obj.id)) return;
                const val = parser ? parser(el.value) : el.value;
                State.updateObject(obj.id, { [key]: val });
                Canvas.render();
                buildPlacedList();
            });
        };

        bind('prop-name', 'name');
        bind('prop-desc', 'description');
        bind('prop-text', 'text');
        bind('prop-fontsize', 'fontSize', parseFloat);
        bind('prop-texture', 'texture');
        bind('prop-labelsize', 'labelSize', parseFloat);
        bind('prop-linewidth', 'lineWidth', parseFloat);
        bind('prop-ropewidth', 'ropeWidth', parseFloat);
        bind('prop-x', 'x', parseFloat);
        bind('prop-y', 'y', parseFloat);
        bind('prop-width', 'width', parseFloat);
        bind('prop-height', 'height', parseFloat);
        bind('prop-rotation', 'rotation', parseFloat);

        // Rotation slider sync
        const rotSlider = document.getElementById('prop-rotation-slider');
        const rotInput = document.getElementById('prop-rotation');
        if (rotSlider && rotInput) {
            rotSlider.addEventListener('input', () => {
                if (!Canvas.isSelected(obj.id)) return;
                rotInput.value = rotSlider.value;
                State.updateObject(obj.id, { rotation: parseFloat(rotSlider.value) });
                Canvas.render();
            });
            rotInput.addEventListener('change', () => {
                rotSlider.value = rotInput.value;
            });
        }
        // Rotation preset buttons
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
        bind('prop-guyrope', 'guyRopeDistance', parseFloat);
        bind('prop-color', 'color');
        bind('prop-shape', 'shape');

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

    function showMultiProperties() {
        const panel = document.getElementById('properties');
        const content = document.getElementById('prop-content');
        panel.classList.remove('hidden');
        const count = Canvas.selectionCount;
        content.innerHTML = `
            <div style="text-align:center;padding:8px 0;color:var(--text-secondary);font-size:12px;">
                <strong>${count} Objekte</strong> ausgew\u00e4hlt
            </div>
            <div class="prop-actions">
                <button class="btn-duplicate" id="prop-multi-dup">Alle duplizieren</button>
                <button class="btn-danger" id="prop-multi-del">Alle l\u00f6schen</button>
            </div>`;
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
        document.getElementById('co-create').addEventListener('click', () => {
            const template = {
                type: document.getElementById('co-type').value,
                name: document.getElementById('co-name').value || 'Objekt',
                width: parseFloat(document.getElementById('co-width').value) || 2,
                height: parseFloat(document.getElementById('co-height').value) || 2,
                shape: document.getElementById('co-shape').value,
                guyRopeDistance: parseFloat(document.getElementById('co-guyrope').value) || 0,
                color: document.getElementById('co-color').value,
            };
            // Add to site templates so it appears in palette
            State.addTemplate(template);
            buildPalette();
            closeModal();
            Tools.setPendingTemplate(template);
        });

        document.getElementById('btn-print').addEventListener('click', () => {
            const site = State.activeSite;
            if (site) document.getElementById('print-title').value = site.name;
            openModal('modal-print');
        });
        document.getElementById('print-cancel').addEventListener('click', closeModal);
        document.getElementById('print-go').addEventListener('click', () => {
            closeModal();
            IO.print();
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

        // Settings modal
        document.getElementById('btn-settings').addEventListener('click', () => {
            syncSettings();
            openModal('modal-settings');
        });
        document.getElementById('settings-ok').addEventListener('click', closeModal);

        // Text modal
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
                const obj = State.addObject({
                    type: 'text', name: text, text: text,
                    width: 0, height: 0, guyRopeDistance: 0,
                    color: color, shape: 'rect', fontSize: fontSize,
                }, pos.x, pos.y);
            }
            Tools.setTool('select');
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

    function openRenameTabModal(index) {
        const site = State.sites[index];
        const input = document.getElementById('rename-tab-input');
        input.value = site.name;
        input.dataset.siteIndex = index;
        openModal('modal-rename-tab');
        setTimeout(() => input.select(), 50);
    }

    // --- Context Menu ---
    function showContextMenu(x, y, obj) {
        createContextMenuAt(x, y, [
            { label: 'Eigenschaften...', action: () => showProperties(obj) },
            { label: 'Duplizieren', action: () => {
                const dup = State.duplicateObject(obj.id);
                if (dup) { Canvas.selectedId = dup.id; showProperties(dup); Canvas.render(); buildPlacedList(); }
            }},
            { label: 'Nach vorne', action: () => {
                const site = State.activeSite;
                const idx = site.objects.findIndex(o => o.id === obj.id);
                if (idx < site.objects.length - 1) {
                    site.objects.splice(idx, 1);
                    site.objects.push(obj);
                    State.notifyChange();
                    Canvas.render();
                }
            }},
            { label: 'Nach hinten', action: () => {
                const site = State.activeSite;
                const idx = site.objects.findIndex(o => o.id === obj.id);
                if (idx > 0) {
                    site.objects.splice(idx, 1);
                    site.objects.unshift(obj);
                    State.notifyChange();
                    Canvas.render();
                }
            }},
            { sep: true },
            { label: 'L\u00f6schen', className: 'danger', action: () => {
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

    function showGroundVertexMenu(x, y, vertexIndex) {
        const site = State.activeSite;
        if (!site) return;
        createContextMenuAt(x, y, [
            { label: 'Eckpunkt l\u00f6schen', className: site.ground.length <= 3 ? '' : 'danger', action: () => {
                if (site.ground.length <= 3) return;
                site.ground.splice(vertexIndex, 1);
                State.notifyChange();
                Canvas.render();
            }},
            { sep: true },
            { label: 'Grundfl\u00e4che l\u00f6schen', className: 'danger', action: () => {
                site.ground = [];
                State.notifyChange();
                Canvas.render();
            }},
        ]);
    }

    function showGroundEdgeMenu(x, y, edgeIndex, worldPos) {
        const site = State.activeSite;
        if (!site) return;
        createContextMenuAt(x, y, [
            { label: 'Eckpunkt hier einf\u00fcgen', action: () => {
                site.ground.splice(edgeIndex + 1, 0, { x: worldPos.x, y: worldPos.y });
                State.notifyChange();
                Canvas.render();
            }},
            { sep: true },
            { label: 'Grundfl\u00e4che l\u00f6schen', className: 'danger', action: () => {
                site.ground = [];
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
    }

    function updateZoom(z) {
        document.getElementById('status-zoom').textContent = Math.round(z * 100) + '%';
    }

    function showHint(text) {
        const el = document.getElementById('canvas-hint');
        el.textContent = text;
        el.classList.toggle('visible', !!text);
    }

    return {
        init, buildTabs, buildPalette, buildPlacedList, syncSettings,
        showProperties, hideProperties,
        updateToolButtons, updateCoords, updateZoom, showHint,
        showContextMenu, showGroundVertexMenu, showGroundEdgeMenu, removeContextMenu, openTextModal, showMultiProperties,
    };
})();
