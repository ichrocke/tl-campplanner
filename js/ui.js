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
        bindFloatingTools();
        bindLangFlags();
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
        site.objects.forEach(obj => {
            const el = document.createElement('div');
            el.className = 'placed-item' + (Canvas.isSelected(obj.id) ? ' active' : '');
            const dims = (obj.type === 'area' || obj.type === 'text' || obj.type === 'fence') ? obj.type : `${obj.width}\u00d7${obj.height}`;
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
            State.createSite();
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
        // Language selector (in settings)
        document.getElementById('lang-select').addEventListener('change', (e) => {
            I18n.setLang(e.target.value);
            document.querySelectorAll('.lang-flag').forEach(b => b.classList.toggle('active', b.dataset.lang === e.target.value));
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
        document.getElementById('lang-select').value = I18n.lang;
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
                : `<label>${I18n.t('props.name')} <input type="text" id="prop-name" value="${obj.name}"></label>
                   <label>${I18n.t('props.description')} <input type="text" id="prop-desc" value="${descVal}" placeholder="${I18n.t('props.descPlaceholder')}"></label>`
            }`;
        if (obj.type === 'text') {
            html += `<label>${I18n.t('props.textSection')} <input type="text" id="prop-text" value="${obj.text || ''}"></label>`;
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
        if (obj.type !== 'area' && obj.type !== 'text' && obj.type !== 'fence' && obj.type !== 'guideline') {
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
                        <option value="circle" ${obj.shape === 'circle' ? 'selected' : ''}>${I18n.t('props.shape.circle')}</option>
                    </select>
                </label>`}
            </div>`;
        }

        // --- Fence height ---
        if (obj.type === 'fence') {
            html += `<div class="prop-section">
                <div class="prop-section-title">${I18n.t('tool.fence')}</div>
                <label>${I18n.t('props.fenceHeight')} <input type="number" id="prop-fenceheight" value="${obj.fenceHeight || 1.5}" min="0.1" step="0.1"></label>
            </div>`;
        }

        if (obj.type === 'text') {
            html += `<div class="prop-section">
                <div class="prop-section-title">${I18n.t('props.textSection')}</div>
                <label>${I18n.t('props.fontSize')} <input type="number" id="prop-fontsize" value="${obj.fontSize || 1}" min="0.2" step="0.1"></label>
            </div>`;
        }

        // --- Section: Rotation ---
        if (obj.type !== 'area' && obj.type !== 'text' && obj.type !== 'fence' && obj.type !== 'guideline') {
            html += `<div class="prop-section">
                <div class="prop-section-title">${I18n.t('props.rotation')}</div>
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

        // --- Section: Guy ropes ---
        if (obj.type !== 'area' && obj.type !== 'text' && obj.type !== 'fence' && obj.type !== 'bgimage' && obj.type !== 'guideline') {
            const sides = obj.guyRopeSides || { top: true, right: true, bottom: true, left: true };
            html += `<div class="prop-section">
                <div class="prop-section-title">${I18n.t('props.guyRope')}</div>
                <label>${I18n.t('props.guyRope.distance')} <input type="number" id="prop-guyrope" value="${obj.guyRopeDistance}" min="0" step="0.1"></label>
                ${obj.guyRopeDistance > 0 ? `<label>${I18n.t('props.guyRope.ropeWidth')} <input type="number" id="prop-ropewidth" value="${obj.ropeWidth || 0}" min="0" max="3" step="0.1" placeholder="auto"></label>` : ''}
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
                    <label>${I18n.t('props.labelSize')} <input type="number" id="prop-labelsize" value="${obj.labelSize || 0}" min="0" max="3" step="0.1" placeholder="auto"></label>
                    <label>${I18n.t('props.lineWidth')} <input type="number" id="prop-linewidth" value="${obj.lineWidth || 0}" min="0" max="3" step="0.1" placeholder="auto"></label>
                </div>` : ''}
                <label>${I18n.t('props.opacity')} <input type="range" id="prop-obj-opacity" min="0.05" max="1" step="0.05" value="${opVal}" style="width:100%"></label>
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

        bind('prop-name', 'name');
        bind('prop-desc', 'description');
        bind('prop-text', 'text');
        bind('prop-fontsize', 'fontSize', parseFloat);
        bind('prop-fenceheight', 'fenceHeight', parseFloat);
        bind('prop-texture', 'texture');
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

    function showGroundProperties(gi) {
        const panel = document.getElementById('properties');
        const content = document.getElementById('prop-content');
        panel.classList.remove('hidden');
        const site = State.activeSite;
        const ground = site && site.grounds ? site.grounds[gi] : null;
        if (!ground) return;
        const area = Canvas.polygonArea(ground);
        content.innerHTML = `
            <div class="prop-section">
                <div class="prop-section-title">${I18n.t('tool.ground')} ${gi + 1}</div>
                <div style="font-size:12px;color:var(--text-secondary);margin-bottom:4px;">
                    ${ground.length} ${I18n.t('ctx.deleteVertex').split(' ')[0]}e &middot; ${area.toFixed(1)} m&sup2;
                </div>
            </div>
            <div class="prop-actions">
                <button class="btn-danger" id="prop-del-ground">${I18n.t('props.delete')}</button>
            </div>`;
        document.getElementById('prop-del-ground').addEventListener('click', () => {
            if (site.grounds) {
                site.grounds.splice(gi, 1);
                Canvas.selectedGroundIndex = -1;
                hideProperties();
                State.notifyChange();
                Canvas.render();
            }
        });
        document.getElementById('btn-close-props').addEventListener('click', () => {
            Canvas.selectedGroundIndex = -1;
            hideProperties();
            Canvas.render();
        });
    }

    function showMultiProperties() {
        const panel = document.getElementById('properties');
        const content = document.getElementById('prop-content');
        panel.classList.remove('hidden');
        const count = Canvas.selectionCount;
        content.innerHTML = `
            <div style="text-align:center;padding:8px 0;color:var(--text-secondary);font-size:12px;">
                <strong>${I18n.t('props.multiSelected', { count: count })}</strong>
            </div>
            <div class="prop-actions">
                <button class="btn-duplicate" id="prop-multi-dup">${I18n.t('props.duplicateAll')}</button>
                <button class="btn-danger" id="prop-multi-del">${I18n.t('props.deleteAll')}</button>
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

    // --- Translate static UI ---
    function translateUI() {
        I18n.updateDOM();
        // Rebuild dynamic elements
        buildPalette();
        buildTabs();
        buildPlacedList();
    }

    return {
        init, buildTabs, buildPalette, buildPlacedList, syncSettings, translateUI,
        showProperties, showGroundProperties, hideProperties,
        updateToolButtons, updateCoords, updateZoom, showHint,
        showContextMenu, showGroundVertexMenu, showGroundEdgeMenu,
        showAreaVertexMenu, showAreaEdgeMenu, showFenceVertexMenu,
        removeContextMenu, openTextModal, showMultiProperties,
    };
})();
