/* Autosave in IndexedDB: schreiben, localStorage-Ausfall ueberleben, Migration */
const H = require('./helpers');

(async () => {
    const state = await H.launch();
    const { page } = state;
    const step = H.stepper(state);
    try {
        await H.open(state);

        // Aenderung erzeugen -> Autosave (500ms Debounce) abwarten
        await H.addLayer(page, 'IDB-Testebene');
        await page.waitForTimeout(1500);

        // 1. IndexedDB enthaelt den Stand
        const idb = await page.evaluate(async () => {
            const json = await Backup.loadAutosave();
            return { has: !!json, containsLayer: !!json && json.indexOf('IDB-Testebene') >= 0, size: json ? json.length : 0 };
        });
        step(idb.has && idb.containsLayer, 'IndexedDB autosave contains current state', `${idb.size} bytes`);

        // 2. localStorage-Spiegel existiert ebenfalls (Fallback/Multi-Tab)
        const ls = await page.evaluate(() => {
            const v = localStorage.getItem('zeltplaner_autosave');
            return !!v && v.indexOf('IDB-Testebene') >= 0;
        });
        step(ls, 'localStorage mirror written too');

        // 3. localStorage loeschen -> Reload stellt aus IndexedDB wieder her
        await page.evaluate(() => localStorage.removeItem('zeltplaner_autosave'));
        await page.reload({ waitUntil: 'domcontentloaded' });
        await H.setup(page);
        const restored = await page.evaluate(() =>
            State.activeSite.layers.some(l => l.name === 'IDB-Testebene'));
        step(restored, 'Reload without localStorage restores from IndexedDB');

        // 4. Migrationspfad: IndexedDB leeren, nur localStorage vorhanden.
        // Autosave abschalten, sonst ueberschreibt der beforeunload-Save
        // beim Reload den praeparierten Zustand wieder.
        await page.evaluate(async () => {
            localStorage.setItem('zeltplaner_autosave_enabled', '0');
            const json = State.exportJSON(true);
            localStorage.setItem('zeltplaner_autosave', json.replace(/IDB-Testebene/g, 'LS-Migration'));
            await Backup.clearAutosave();
        });
        await page.reload({ waitUntil: 'domcontentloaded' });
        await H.setup(page);
        const migrated = await page.evaluate(() => {
            localStorage.setItem('zeltplaner_autosave_enabled', '1');
            return State.activeSite.layers.some(l => l.name === 'LS-Migration');
        });
        step(migrated, 'Old localStorage-only autosave still restores (migration path)');

        await H.finish(state);
    } catch (e) { await H.fail(state, e); }
})();
