/* ========================================
   State – Datenmodell & Zustandsverwaltung
   ======================================== */

const State = (() => {
    let _sites = [];
    let _activeSiteIndex = 0;
    let _minDistance = 2;
    let _displaySettings = { fontScale: 1, lineScale: 1, ropeScale: 1, hatchScale: 1 };
    let _listeners = [];
    let _undoStack = [];
    let _undoPointer = -1;

    function defaultTemplates() {
        return [
            { type: 'tent', name: I18n.t('template.tent2p'), width: 2, height: 1.5, guyRopeDistance: 0.5, color: '#4a90d9', shape: 'rect' },
            { type: 'tent', name: I18n.t('template.tent4p'), width: 3, height: 2.5, guyRopeDistance: 0.6, color: '#3b82f6', shape: 'rect' },
            { type: 'tent', name: I18n.t('template.familyTent'), width: 4, height: 3, guyRopeDistance: 0.8, color: '#2563eb', shape: 'rect' },
            { type: 'tent', name: I18n.t('template.groupTent'), width: 6, height: 4, guyRopeDistance: 1.0, color: '#1d4ed8', shape: 'rect' },
            { type: 'tent', name: I18n.t('template.yurtRound'), width: 5, height: 5, guyRopeDistance: 1.0, color: '#7c3aed', shape: 'circle' },
            { type: 'tent', name: I18n.t('template.yurt6'), width: 5, height: 5, guyRopeDistance: 1.0, color: '#6d28d9', shape: 'hexagon' },
            { type: 'tent', name: I18n.t('template.yurt8'), width: 5, height: 5, guyRopeDistance: 1.0, color: '#5b21b6', shape: 'octagon' },
            { type: 'firepit', name: I18n.t('template.firepit'), width: 2, height: 2, guyRopeDistance: 0, color: '#ea580c', shape: 'circle' },
            { type: 'bar', name: I18n.t('template.bar'), width: 3, height: 1, guyRopeDistance: 0, color: '#9333ea', shape: 'rect' },
            { type: 'entrance', name: I18n.t('template.entrance'), width: 2, height: 0.25, guyRopeDistance: 0, color: '#16a34a', shape: 'rect' },
        ];
    }

    function generateId() {
        return Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 6);
    }

    function notify(skipUndo) {
        if (!skipUndo) pushUndo();
        _listeners.forEach(fn => fn());
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
            view: { panX: 0, panY: 0, zoom: 1 }
        };
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
            notify(true);
        },
        get activeSite() { return _sites[_activeSiteIndex]; },
        get defaultTemplates() { return defaultTemplates(); },
        get minDistance() { return _minDistance; },
        set minDistance(v) { _minDistance = v; },
        get displaySettings() { return _displaySettings; },

        onChange(fn) { _listeners.push(fn); },

        createSite,

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
                color: template.color,
                shape: template.shape || 'rect',
                description: template.description || '',
                labelSize: template.labelSize || 0,
                lineWidth: template.lineWidth || 0,
                ropeWidth: template.ropeWidth || 0,
            };
            if (template.type === 'area') {
                obj.texture = template.texture || 'solid';
                obj.points = template.points ? [...template.points] : [];
            }
            if (template.type === 'text') {
                obj.text = template.text || 'Text';
                obj.fontSize = template.fontSize || 1;
            }
            if (template.type === 'fence') {
                obj.points = template.points ? [...template.points] : [];
                obj.fenceHeight = template.fenceHeight || 1.5;
            }
            if (template.type === 'bgimage') {
                obj.dataUrl = template.dataUrl || '';
                obj.opacity = template.opacity || 0.3;
            }
            site.objects.push(obj);
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
            notify();
            return obj;
        },

        removeObject(id) {
            const site = this.activeSite;
            if (!site) return;
            site.objects = site.objects.filter(o => o.id !== id);
            notify();
        },

        updateObject(id, props) {
            const site = this.activeSite;
            if (!site) return;
            const obj = site.objects.find(o => o.id === id);
            if (!obj) return;
            Object.assign(obj, props);
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
            _listeners.forEach(fn => fn());
        },

        exportJSON() {
            return JSON.stringify({
                version: 1,
                exportDate: new Date().toISOString(),
                sites: _sites,
                minDistance: _minDistance,
                displaySettings: _displaySettings,
            }, null, 2);
        },

        importJSON(json) {
            const data = JSON.parse(json);
            if (!data.sites || !Array.isArray(data.sites)) throw new Error('Invalid format');
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
                // Migrate: ground → grounds (array of polygons)
                if (s.ground && !s.grounds) {
                    s.grounds = s.ground.length >= 3 ? [s.ground] : [];
                    delete s.ground;
                }
                if (!s.grounds) s.grounds = [];
                // Migrate: ensure guyRopeSides exists on all objects
                s.objects.forEach(o => {
                    if (!o.guyRopeSides) o.guyRopeSides = { top: true, right: true, bottom: true, left: true };
                });
            });
            _minDistance = data.minDistance || 2;
            if (data.displaySettings) Object.assign(_displaySettings, data.displaySettings);
            _activeSiteIndex = 0;
            notify();
        },

        clear() {
            _sites = [];
            _activeSiteIndex = 0;
            _undoStack = [];
            _undoPointer = -1;
            createSite();
        },

        generateId,
        getSiteContentBounds,
    };
})();
