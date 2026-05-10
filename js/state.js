/* ========================================
   State – Datenmodell & Zustandsverwaltung
   ======================================== */

const State = (() => {
    let _sites = [];
    let _activeSiteIndex = 0;
    let _minDistance = 2;
    let _displaySettings = { fontScale: 1, lineScale: 1, ropeScale: 1, hatchScale: 1, showNames: true, showDimensions: true, showDescriptions: true, defaultGroundColor: '#22c55e', defaultAreaColor: '#d4a574' };
    let _listeners = [];
    let _undoStack = [];
    let _undoPointer = -1;

    function defaultTemplates() {
        return [
            { type: 'tent', name: I18n.t('template.tent2p'), width: 2, height: 1.5, guyRopeDistance: 0.5, color: '#4a90d9', shape: 'rect' },
            { type: 'tent', name: I18n.t('template.tent4p'), width: 3, height: 2.5, guyRopeDistance: 0.6, color: '#3b82f6', shape: 'rect' },
            { type: 'tent', name: I18n.t('template.familyTent'), width: 4, height: 3, guyRopeDistance: 0.8, color: '#2563eb', shape: 'rect' },
            { type: 'tent', name: I18n.t('template.groupTent'), width: 6, height: 4, guyRopeDistance: 1.0, color: '#1d4ed8', shape: 'rect' },
            { type: 'tent', name: I18n.t('template.saxonTent'), width: 8, height: 4, guyRopeDistance: 1, color: '#0e7490', shape: 'stadium', vorbauExtended: true, vorbauLength: 2 },
            { type: 'tent', name: I18n.t('template.yurtRound'), width: 5, height: 5, guyRopeDistance: 1.0, color: '#7c3aed', shape: 'circle' },
            { type: 'tent', name: I18n.t('template.yurt6'), width: 5, height: 5, guyRopeDistance: 1.0, color: '#6d28d9', shape: 'hexagon' },
            { type: 'tent', name: I18n.t('template.yurt8'), width: 5, height: 5, guyRopeDistance: 1.0, color: '#5b21b6', shape: 'octagon' },
            { type: 'tent', name: I18n.t('template.yurt10'), width: 6, height: 6, guyRopeDistance: 1.2, color: '#4c1d95', shape: 'decagon' },
            { type: 'tent', name: I18n.t('template.yurt12'), width: 7, height: 7, guyRopeDistance: 1.5, color: '#3b0764', shape: 'dodecagon' },
            { type: 'firepit', name: I18n.t('template.firepit'), width: 2, height: 2, guyRopeDistance: 0, color: '#ea580c', shape: 'circle' },
            { type: 'bar', name: I18n.t('template.bar'), width: 3, height: 1, guyRopeDistance: 0, color: '#9333ea', shape: 'rect' },
            { type: 'entrance', name: I18n.t('template.entrance'), width: 2, height: 0.25, guyRopeDistance: 0, color: '#16a34a', shape: 'rect' },
        ];
    }

    function generateId() {
        return Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 6);
    }

    function notify(skipUndo, skipSync) {
        if (!skipUndo) pushUndo();
        _listeners.forEach(fn => fn(skipSync));
    }

    function pushUndo() {
        const snapshot = JSON.stringify({ sites: _sites, activeSiteIndex: _activeSiteIndex, minDistance: _minDistance });
        _undoStack = _undoStack.slice(0, _undoPointer + 1);
        _undoStack.push(snapshot);
        if (_undoStack.length > 50) _undoStack.shift();
        _undoPointer = _undoStack.length - 1;
    }

    function getSiteContentBounds(site) {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        const expand = (x, y) => {
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
        };
        (site.grounds || []).forEach(g => g.forEach(p => expand(p.x, p.y)));
        site.objects.forEach(o => {
            const pad = Math.max(o.width || 0, o.height || 0) / 2 + (o.guyRopeDistance || 0) + 1;
            expand(o.x - pad, o.y - pad);
            expand(o.x + pad, o.y + pad);
            if (o.points) o.points.forEach(p => expand(p.x, p.y));
        });
        if (minX === Infinity) return null;
        return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
    }

    function createSite(name) {
        const site = {
            id: generateId(),
            name: name || I18n.t('site.default') + ' ' + (_sites.length + 1),
            grounds: [],
            gridSize: 0.5,
            snapToGrid: true,
            objects: [],
            templates: defaultTemplates(),
            bgImage: null,
            view: { panX: 0, panY: 0, zoom: 1 },
            layers: [{ id: generateId(), name: 'Default', visible: true, locked: false }],
            activeLayerId: null,
            mapLayer: { enabled: false, lat: null, lng: null, source: 'osm', opacity: 0.5, rotation: 0, anchorWorldX: 0, anchorWorldY: 0 },
        };
        site.activeLayerId = site.layers[0].id;
        _sites.push(site);
        _activeSiteIndex = _sites.length - 1;
        notify();
        return site;
    }

    return {
        get sites() { return _sites; },
        get activeSiteIndex() { return _activeSiteIndex; },
        set activeSiteIndex(i) {
            _activeSiteIndex = i;
            notify(true, true); // skipUndo=true, skipSync=true (tab switch is local-only)
        },
        get activeSite() { return _sites[_activeSiteIndex]; },
        get defaultTemplates() { return defaultTemplates(); },
        get minDistance() { return _minDistance; },
        set minDistance(v) { _minDistance = v; },
        showDistances: false,
        _minimapEnabled: true,
        get displaySettings() { return _displaySettings; },

        onChange(fn) { _listeners.push(fn); },

        createSite,

        createSiteFrom(srcSite) {
            const site = {
                id: generateId(),
                name: I18n.t('site.default') + ' ' + (_sites.length + 1),
                grounds: [],
                gridSize: srcSite.gridSize || 0.5,
                snapToGrid: srcSite.snapToGrid !== false,
                objects: [],
                templates: JSON.parse(JSON.stringify(srcSite.templates || [])),
                templateFolders: srcSite.templateFolders ? [...srcSite.templateFolders] : undefined,
                bgImage: null,
                view: { panX: 0, panY: 0, zoom: 1 },
                layers: JSON.parse(JSON.stringify(srcSite.layers || [{ id: generateId(), name: 'Default', visible: true, locked: false }])),
                mapLayer: srcSite.mapLayer ? JSON.parse(JSON.stringify(srcSite.mapLayer)) : { enabled: false, lat: null, lng: null, source: 'osm', opacity: 0.5, rotation: 0, anchorWorldX: 0, anchorWorldY: 0 },
            };
            site.activeLayerId = site.layers[0].id;
            _sites.push(site);
            _activeSiteIndex = _sites.length - 1;
            notify();
            return site;
        },

        duplicateSite(index) {
            const src = _sites[index];
            if (!src) return;
            const copy = JSON.parse(JSON.stringify(src));
            copy.id = generateId();
            copy.name = src.name + ' (Copy)';
            // Give all objects new IDs
            copy.objects.forEach(o => { o.id = generateId(); });
            _sites.splice(index + 1, 0, copy);
            _activeSiteIndex = index + 1;
            notify();
        },

        deleteSite(index) {
            if (_sites.length <= 1) return;
            _sites.splice(index, 1);
            if (_activeSiteIndex >= _sites.length) _activeSiteIndex = _sites.length - 1;
            notify();
        },

        renameSite(index, name) {
            _sites[index].name = name;
            notify(true);
        },

        addObject(template, x, y) {
            const site = this.activeSite;
            if (!site) return null;
            const obj = {
                id: generateId(),
                type: template.type,
                name: template.name,
                x: x || 0,
                y: y || 0,
                width: template.width || 0,
                height: template.height || 0,
                rotation: 0,
                guyRopeDistance: template.guyRopeDistance || 0,
                guyRopeSides: template.guyRopeSides || { top: true, right: true, bottom: true, left: true },
                guyRopeSideDistances: template.guyRopeSideDistances ? { ...template.guyRopeSideDistances } : {},
                guyRopePegs: template.guyRopePegs ? { ...template.guyRopePegs } : {},
                polyGuyRopeSides: template.polyGuyRopeSides ? [...template.polyGuyRopeSides] : null,
                polyGuyRopeSideDistances: template.polyGuyRopeSideDistances ? [...template.polyGuyRopeSideDistances] : null,
                polyGuyRopePegs: template.polyGuyRopePegs ? [...template.polyGuyRopePegs] : null,
                showPegs: template.showPegs !== undefined ? template.showPegs : true,
                color: template.color,
                shape: template.shape || 'rect',
                description: template.description || '',
                labelSize: template.labelSize || 0,
                lineWidth: template.lineWidth || 0,
                ropeWidth: template.ropeWidth || 0,
                entranceSide: template.entranceSide || 'none',
                vorbauExtended: template.vorbauExtended !== undefined ? template.vorbauExtended : true,
                vorbauLength: template.vorbauLength != null ? template.vorbauLength : 0,
                descColor: template.descColor || '',
                descSize: template.descSize || 0,
                groupId: template.groupId || '',
                locked: template.locked || false,
                layerId: template.layerId || (this.activeSite ? this.activeSite.activeLayerId : ''),
            };
            if (template.type === 'area') {
                obj.texture = template.texture || 'solid';
                obj.points = template.points ? [...template.points] : [];
            }
            if (template.type === 'text') {
                obj.text = template.text || 'Text';
                obj.fontSize = template.fontSize || 1;
            }
            if (template.type === 'ground') {
                obj.points = template.points ? template.points.map(p => ({...p})) : [];
            }
            if (template.type === 'guideline') {
                obj.points = template.points ? template.points.map(p => ({...p})) : [];
            }
            if (template.type === 'fence') {
                obj.points = template.points ? [...template.points] : [];
                obj.fenceHeight = template.fenceHeight || 1.5;
                obj.lineThickness = template.lineThickness || 4;
                obj.vertexSize = template.vertexSize || 0;
            }
            if (template.type === 'postit') {
                obj.text = template.text || '';
                obj.width = template.width || 3;
                obj.height = template.height || 3;
            }
            if (template.type === 'symbol') {
                obj.symbolId = template.symbolId || '';
                obj.width = template.width || 1;
                obj.height = template.height || 1;
            }
            if (template.type === 'bgimage' || template.type === 'image') {
                obj.dataUrl = template.dataUrl || '';
                obj.opacity = template.opacity != null ? template.opacity : (template.type === 'image' ? 1 : 0.3);
                obj.keepAspectRatio = template.keepAspectRatio !== false;
            }
            site.objects.push(obj);
            // Collab: Object-Level Op
            if (typeof Collab !== 'undefined' && Collab.isConnected() && !Collab.syncLock) {
                Collab.pushOp({ type: 'add', siteIdx: _activeSiteIndex, object: JSON.parse(JSON.stringify(obj)) });
            }
            notify();
            return obj;
        },

        duplicateObject(id) {
            const site = this.activeSite;
            if (!site) return null;
            const src = site.objects.find(o => o.id === id);
            if (!src) return null;
            const obj = JSON.parse(JSON.stringify(src));
            obj.id = generateId();
            obj.name = src.name + ' (Kopie)';
            obj.x += 1;
            obj.y += 1;
            site.objects.push(obj);
            if (typeof Collab !== 'undefined' && Collab.isConnected() && !Collab.syncLock) {
                Collab.pushOp({ type: 'add', siteIdx: _activeSiteIndex, object: JSON.parse(JSON.stringify(obj)) });
            }
            notify();
            return obj;
        },

        removeObject(id) {
            const site = this.activeSite;
            if (!site) return;
            site.objects = site.objects.filter(o => o.id !== id);
            if (typeof Collab !== 'undefined' && Collab.isConnected() && !Collab.syncLock) {
                Collab.pushOp({ type: 'remove', siteIdx: _activeSiteIndex, objectId: id });
            }
            notify();
        },

        updateObject(id, props) {
            const site = this.activeSite;
            if (!site) return;
            const obj = site.objects.find(o => o.id === id);
            if (!obj) return;
            Object.assign(obj, props);
            if (typeof Collab !== 'undefined' && Collab.isConnected() && !Collab.syncLock) {
                Collab.pushOp({ type: 'update', siteIdx: _activeSiteIndex, objectId: id, props });
            }
            notify();
        },

        removeTemplate(index) {
            const site = this.activeSite;
            if (!site || !site.templates) return;
            site.templates.splice(index, 1);
            notify(true);
        },

        addTemplate(template) {
            const site = this.activeSite;
            if (!site) return;
            if (!site.templates) site.templates = [];
            site.templates.push(template);
            notify(true);
        },

        notifyChange(skipUndo) { notify(skipUndo); },

        undo() {
            if (_undoPointer <= 0) return;
            _undoPointer--;
            const data = JSON.parse(_undoStack[_undoPointer]);
            _sites = data.sites;
            _activeSiteIndex = data.activeSiteIndex;
            _minDistance = data.minDistance;
            _listeners.forEach(fn => fn(false)); // explicit skipSync=false → triggers full push
        },

        redo() {
            if (_undoPointer >= _undoStack.length - 1) return;
            _undoPointer++;
            const data = JSON.parse(_undoStack[_undoPointer]);
            _sites = data.sites;
            _activeSiteIndex = data.activeSiteIndex;
            _minDistance = data.minDistance;
            _listeners.forEach(fn => fn(false)); // explicit skipSync=false → triggers full push
        },

        // Clipboard
        _clipboard: null,
        copyObjects(ids) {
            const site = this.activeSite;
            if (!site) return;
            const objs = site.objects.filter(o => ids.has(o.id));
            this._clipboard = JSON.parse(JSON.stringify(objs));
        },
        pasteObjects(offsetX, offsetY) {
            const site = this.activeSite;
            if (!site || !this._clipboard) return [];
            const newIds = [];
            this._clipboard.forEach(o => {
                const obj = JSON.parse(JSON.stringify(o));
                obj.id = generateId();
                obj.x += (offsetX || 1);
                obj.y += (offsetY || 1);
                if (obj.points) obj.points.forEach(p => { p.x += (offsetX || 1); p.y += (offsetY || 1); });
                obj.layerId = site.activeLayerId;
                site.objects.push(obj);
                newIds.push(obj.id);
                // Collab: send individual ops for each pasted object
                if (typeof Collab !== 'undefined' && Collab.isConnected() && !Collab.syncLock) {
                    Collab.pushOp({ type: 'add', siteIdx: _activeSiteIndex, object: JSON.parse(JSON.stringify(obj)) });
                }
            });
            notify(false, true); // skipSync=true since ops are sent individually
            return newIds;
        },

        exportJSON() {
            return JSON.stringify({
                version: 1,
                exportDate: new Date().toISOString(),
                sites: _sites,
                minDistance: _minDistance,
                displaySettings: _displaySettings,
                showDistances: this.showDistances,
                minimapEnabled: this._minimapEnabled !== undefined ? this._minimapEnabled : true,
                colorPalette: this._colorPalette || null,
            }, null, 2);
        },

        // Color palette storage (set by UI)
        _colorPalette: null,

        importJSON(json, skipSync) {
            const data = JSON.parse(json);
            if (!data.sites || !Array.isArray(data.sites)) throw new Error('Invalid format');

            // Collab: lokale View-Positionen und aktiven Site-Index bewahren
            let savedViews = null;
            let savedSiteIndex = 0;
            if (skipSync && _sites.length > 0) {
                savedViews = {};
                _sites.forEach(s => { if (s.id && s.view) savedViews[s.id] = { ...s.view }; });
                savedSiteIndex = _activeSiteIndex;
            }

            _sites = data.sites;
            let autoOff = 0;
            _sites.forEach(s => {
                if (!s.templates) s.templates = defaultTemplates();
                if (s.offsetX === undefined) {
                    s.offsetX = autoOff;
                    const b = getSiteContentBounds(s);
                    autoOff = b ? b.maxX + 10 : autoOff + 30;
                }
                // Migrate: old single bgImage → bgimage object
                if (s.bgImage && s.bgImage.dataUrl) {
                    s.objects.unshift({
                        id: generateId(), type: 'bgimage', name: 'Hintergrundbild',
                        x: s.bgImage.x || 0, y: s.bgImage.y || 0,
                        width: s.bgImage.width || 50, height: (s.bgImage.width || 50) * 0.7,
                        rotation: 0, guyRopeDistance: 0, color: '#888', shape: 'rect',
                        description: '', labelSize: 0, lineWidth: 0, ropeWidth: 0,
                        guyRopeSides: { top: true, right: true, bottom: true, left: true },
                        dataUrl: s.bgImage.dataUrl, opacity: s.bgImage.opacity || 0.3,
                    });
                    delete s.bgImage;
                }
                // Migrate: old ground/grounds → ground objects
                if (s.ground && !s.grounds) {
                    s.grounds = s.ground.length >= 3 ? [s.ground] : [];
                    delete s.ground;
                }
                if (s.grounds && s.grounds.length > 0) {
                    s.grounds.forEach((pts, i) => {
                        if (pts.length < 3) return;
                        let cx = 0, cy = 0;
                        pts.forEach(p => { cx += p.x; cy += p.y; });
                        cx /= pts.length; cy /= pts.length;
                        s.objects.unshift({
                            id: generateId(), type: 'ground',
                            name: I18n.t('tool.ground') + ' ' + (i + 1),
                            x: cx, y: cy, width: 0, height: 0, rotation: 0,
                            guyRopeDistance: 0, color: '#22c55e', shape: 'rect',
                            description: '', labelSize: 0, lineWidth: 0, ropeWidth: 0,
                            guyRopeSides: { top: true, right: true, bottom: true, left: true },
                            groupId: '', points: pts,
                        });
                    });
                    delete s.grounds;
                }
                // Migrate: ensure layers exist
                if (!s.layers || !s.layers.length) {
                    const lid = generateId();
                    s.layers = [{ id: lid, name: 'Default', visible: true, locked: false }];
                    s.activeLayerId = lid;
                }
                if (!s.activeLayerId) s.activeLayerId = s.layers[0].id;
                // Migrate: ensure guyRopeSides exists on all objects
                s.objects.forEach(o => {
                    if (!o.guyRopeSides) o.guyRopeSides = { top: true, right: true, bottom: true, left: true };
                    if (!o.guyRopeSideDistances) o.guyRopeSideDistances = {};
                    if (!o.guyRopePegs) o.guyRopePegs = {};
                    if (o.showPegs === undefined) o.showPegs = true;
                    if (!o.layerId) o.layerId = s.layers[0].id;
                });
            });
            _minDistance = data.minDistance || 2;
            if (data.displaySettings) Object.assign(_displaySettings, data.displaySettings);
            if (data.showDistances !== undefined) this.showDistances = data.showDistances;
            if (data.minimapEnabled !== undefined) { this._minimapEnabled = data.minimapEnabled; if (typeof Canvas !== 'undefined') Canvas.minimapEnabled = data.minimapEnabled; }
            if (data.colorPalette) this._colorPalette = data.colorPalette;

            // Collab: lokale Views wiederherstellen
            if (savedViews) {
                _sites.forEach(s => {
                    if (s.id && savedViews[s.id]) {
                        s.view = savedViews[s.id];
                    }
                });
                _activeSiteIndex = Math.min(savedSiteIndex, _sites.length - 1);
            } else {
                _activeSiteIndex = 0;
            }

            notify(false, skipSync);
        },

        clear() {
            _sites = [];
            _activeSiteIndex = 0;
            _undoStack = [];
            _undoPointer = -1;
            this._colorPalette = null;
            this.showDistances = false;
            try { localStorage.removeItem('zeltplaner_autosave'); } catch (e) {}
            createSite();
        },

        generateId,
        getSiteContentBounds,
    };
})();
