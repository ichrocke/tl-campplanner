/* Import akzeptiert beide Formate: Voll-Export {sites} und Einzel-Tab {site} */
const H = require('./helpers');
const fs = require('fs');
const path = require('path');

(async () => {
    const state = await H.launch({ acceptDownloads: true });
    const { page } = state;
    const step = H.stepper(state);
    try {
        await H.open(state);

        // Tab mit Inhalt anlegen und als Einzel-Tab exportieren
        await page.evaluate(() => {
            State.activeSite.name = 'RoundtripTab';
            State.addObject({ type: 'tent', name: 'RT-Zelt', width: 3, height: 2, guyRopeDistance: 0, color: '#4a90d9', shape: 'rect' }, 0, 0);
        });
        const [dl] = await Promise.all([
            page.waitForEvent('download', { timeout: 15000 }),
            page.evaluate(() => IO.exportTab(State.activeSiteIndex)),
        ]);
        const file = path.resolve(__dirname, 'artifacts', 'single-tab-export.json');
        await dl.saveAs(file);
        const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
        step(parsed.type === 'single-tab' && !!parsed.site, 'Tab export produces single-tab format', Object.keys(parsed).join(','));

        // Einzel-Tab-Datei ueber den NORMALEN Import-Button laden
        const tabsBefore = await page.evaluate(() => State.sites.length);
        const [chooser] = await Promise.all([
            page.waitForEvent('filechooser'),
            page.evaluate(() => IO.importFile()),
        ]);
        await chooser.setFiles(file);
        await page.waitForTimeout(500);
        const after = await page.evaluate(() => ({
            tabs: State.sites.length,
            imported: State.activeSite.name,
            hasObj: State.activeSite.objects.some(o => o.name === 'RT-Zelt'),
        }));
        step(after.tabs === tabsBefore + 1, 'Single-tab file imports via main import button', `tabs ${tabsBefore}->${after.tabs}`);
        step(after.imported === 'RoundtripTab' && after.hasObj, 'Imported tab has name and objects', after.imported);

        // Kaputte Datei zeigt weiterhin eine verstaendliche Fehlermeldung
        const bad = path.resolve(__dirname, 'artifacts', 'bad-import.json');
        fs.writeFileSync(bad, '{"foo": 1}');
        const [chooser2] = await Promise.all([
            page.waitForEvent('filechooser'),
            page.evaluate(() => IO.importFile()),
        ]);
        await chooser2.setFiles(bad);
        await page.waitForSelector('.dialog-overlay .dialog-message', { timeout: 5000 });
        const err = await page.$eval('.dialog-overlay .dialog-message', e => e.textContent);
        await page.click('.dialog-overlay .btn-primary');
        step(/Invalid format/.test(err), 'Invalid file still shows error dialog', err.slice(0, 60));

        await H.finish(state);
    } catch (e) { await H.fail(state, e); }
})();
