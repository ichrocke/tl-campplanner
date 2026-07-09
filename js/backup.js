/* ========================================
   Backup – rollierende Sicherungen in IndexedDB
   (E1 Auto-Backup, E2 benannte Versionen)
   ======================================== */

const Backup = (() => {
    const DB_NAME = 'zeltplaner_backups';
    const STORE = 'snapshots';
    const MAX_AUTO = 10;            // wie viele automatische Sicherungen behalten
    const MIN_INTERVAL = 90 * 1000; // frühestens alle 90s ein Auto-Backup

    let _db = null;
    let _lastAuto = 0;
    let _autoTimer = null;

    function openDB() {
        return new Promise((resolve, reject) => {
            if (_db) return resolve(_db);
            if (!('indexedDB' in window)) return reject(new Error('IndexedDB unavailable'));
            const req = indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(STORE)) {
                    const os = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
                    os.createIndex('ts', 'ts');
                }
            };
            req.onsuccess = () => { _db = req.result; resolve(_db); };
            req.onerror = () => reject(req.error);
        });
    }

    function tx(mode) { return _db.transaction(STORE, mode).objectStore(STORE); }

    async function put(record) {
        await openDB();
        return new Promise((resolve, reject) => {
            const r = tx('readwrite').add(record);
            r.onsuccess = () => resolve(r.result);
            r.onerror = () => reject(r.error);
        });
    }

    // Return all snapshots (newest first), WITHOUT the heavy json payload
    async function list() {
        await openDB();
        return new Promise((resolve, reject) => {
            const out = [];
            const cur = tx('readonly').openCursor();
            cur.onsuccess = () => {
                const c = cur.result;
                if (c) {
                    const v = c.value;
                    out.push({ id: v.id, ts: v.ts, label: v.label || '', manual: !!v.manual, size: v.json ? v.json.length : 0 });
                    c.continue();
                } else {
                    out.sort((a, b) => b.ts - a.ts);
                    resolve(out);
                }
            };
            cur.onerror = () => reject(cur.error);
        });
    }

    async function get(id) {
        await openDB();
        return new Promise((resolve, reject) => {
            const r = tx('readonly').get(id);
            r.onsuccess = () => resolve(r.result ? r.result.json : null);
            r.onerror = () => reject(r.error);
        });
    }

    async function remove(id) {
        await openDB();
        return new Promise((resolve, reject) => {
            const r = tx('readwrite').delete(id);
            r.onsuccess = () => resolve();
            r.onerror = () => reject(r.error);
        });
    }

    // Keep only the newest MAX_AUTO automatic snapshots (manual ones are kept)
    async function pruneAuto() {
        const all = await list();
        const autos = all.filter(s => !s.manual);
        for (let i = MAX_AUTO; i < autos.length; i++) {
            try { await remove(autos[i].id); } catch (e) {}
        }
    }

    // Manual, named snapshot (E2)
    async function saveNamed(label) {
        try {
            await put({ ts: Date.now(), label: label || '', manual: true, json: State.exportJSON(true) });
            return true;
        } catch (e) { console.warn('Backup saveNamed failed:', e); return false; }
    }

    // Throttled automatic backup (E1) – call freely on change
    function autoBackup(tsNow) {
        const now = tsNow || Date.now();
        clearTimeout(_autoTimer);
        _autoTimer = setTimeout(async () => {
            if (Date.now() - _lastAuto < MIN_INTERVAL) return;
            try {
                await put({ ts: Date.now(), label: '', manual: false, json: State.exportJSON(true) });
                _lastAuto = Date.now();
                await pruneAuto();
            } catch (e) { console.warn('Backup autoBackup failed:', e); }
        }, 2000);
    }

    return { openDB, list, get, remove, saveNamed, autoBackup };
})();
