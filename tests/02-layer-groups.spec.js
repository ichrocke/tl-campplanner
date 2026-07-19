const { chromium } = require('playwright');

let results = [];
(async () => {
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const step = (ok, label, detail) => {
        results.push(`${ok ? 'OK ' : 'FAIL'} | ${label}${detail ? ' | ' + detail : ''}`);
        if (!ok) process.exitCode = 1;
    };
    const consoleErrors = [];
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
    let nativeDialogs = 0;
    page.on('dialog', async d => {
        if (d.type() === 'beforeunload') { await d.accept(); return; }
        nativeDialogs++; await d.dismiss();
    });

    async function setup(p) {
        await p.waitForSelector('#layers-list .layer-item');
        const u = await p.$('button:has-text("Understood"), button:has-text("Verstanden")');
        if (u) await u.click();
        await p.evaluate(() => {
            if (typeof Tutorial !== 'undefined') Tutorial.stop();
            ['tutorial-overlay', 'tutorial-popup'].forEach(id => { const t = document.getElementById(id); if (t) t.remove(); });
        });
    }
    await page.goto('http://127.0.0.1:8931/index.html');
    await setup(page);

    const layerRows = () => page.$$eval('#layers-list .layer-item', e => e.length);
    const groupRows = () => page.$$eval('#layers-list .layer-group-item', e => e.length);
    const item = n => `#layers-list .layer-item:nth-child(${n} of .layer-item) .layer-name`;

    async function addLayer(name) {
        await page.click('#btn-add-layer');
        await page.waitForSelector('.dialog-overlay .dialog-input');
        await page.fill('.dialog-overlay .dialog-input', name);
        await page.keyboard.press('Enter');
        await page.waitForFunction(() => !document.querySelector('.dialog-overlay'));
    }
    for (const n of ['Ebene A', 'Ebene B', 'Ebene C', 'Ebene D']) await addLayer(n);
    // Reihenfolge jetzt: D, C, B, A, Default (neue oben)
    step(await layerRows() === 5, 'Setup: 5 layers', String(await layerRows()));

    // Objekt auf aktiver Ebene (D) platzieren
    await page.click('.palette-item');
    await page.mouse.click(700, 400);

    // --- 1. Gruppieren aus Mehrfachauswahl: C + B ---
    await page.click(item(2)); // C aktiv, Auswahl leer
    await page.click(item(3), { modifiers: ['Meta'] }); // C (aktiv, implizit) + B
    await page.waitForSelector('#layers-bulkbar [data-act="group"]');
    await page.click('#layers-bulkbar [data-act="group"]');
    await page.waitForSelector('.dialog-overlay .dialog-input');
    await page.fill('.dialog-overlay .dialog-input', 'Zeltdorf 1');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => !document.querySelector('.dialog-overlay'));
    step(await groupRows() === 1, 'Group row rendered', `groups=${await groupRows()}`);
    const inGroup = await page.$$eval('#layers-list .layer-item.in-group .layer-name', e => e.map(x => x.textContent));
    step(inGroup.length === 2 && inGroup.includes('Ebene B') && inGroup.includes('Ebene C'),
        'Both selected layers are group members (indented)', inGroup.join(','));
    await page.screenshot({ path: require('path').resolve(__dirname, 'artifacts', 'shot-group.png') });

    // --- 2. Gruppen-Auge: Mitglieder effektiv unsichtbar, Einzelzustand bleibt ---
    await page.click('#layers-list .layer-group-item .layer-vis-btn');
    const eff = await page.evaluate(() => {
        const site = State.activeSite;
        const c = site.layers.find(l => l.name === 'Ebene C');
        return { layerVisible: c.visible, effective: Canvas.isLayerVisible(site, c.id) };
    });
    step(eff.layerVisible === true && eff.effective === false,
        'Group hide: layer.visible stays true, effective visibility false', JSON.stringify(eff));
    const dimmed = await page.$$eval('#layers-list .layer-item.group-hidden', e => e.length);
    step(dimmed === 2, 'Member rows dimmed while group hidden', `dimmed=${dimmed}`);
    await page.click('#layers-list .layer-group-item .layer-vis-btn'); // wieder an

    // --- 3. Zuklappen / Aufklappen ---
    await page.click('#layers-list .layer-group-item .layer-name');
    step(await layerRows() === 3, 'Collapse hides member rows', `rows=${await layerRows()}`);
    await page.click('#layers-list .layer-group-item .layer-name');
    step(await layerRows() === 5, 'Expand shows member rows again');

    // --- 4. Gruppen-Sperre wirkt auf Objekt-Auswahl ---
    await page.evaluate(() => {
        const site = State.activeSite;
        const c = site.layers.find(l => l.name === 'Ebene C');
        site.objects.push({ ...JSON.parse(JSON.stringify(site.objects[0])), id: 'test_obj_c', layerId: c.id });
        Canvas.render();
    });
    await page.click('#layers-list .layer-group-item .layer-lock-btn');
    const selectable = await page.evaluate(() =>
        Canvas.isObjSelectable(State.activeSite.objects.find(o => o.id === 'test_obj_c')));
    step(selectable === false, 'Group lock makes member objects unselectable');
    await page.click('#layers-list .layer-group-item .layer-lock-btn');

    // --- 5. Per Kontextmenue in Gruppe verschieben (Ebene D) ---
    await page.click('#layers-list .layer-item:nth-child(1 of .layer-item)', { button: 'right' });
    await page.waitForSelector('.context-menu');
    await page.click('.context-menu >> text=Move to group: Zeltdorf 1');
    await page.waitForTimeout(200);
    const members = await page.$$eval('#layers-list .layer-item.in-group .layer-name', e => e.map(x => x.textContent));
    step(members.length === 3 && members.includes('Ebene D'), 'Context menu: move layer into group', members.join(','));

    // --- 6. Aus Gruppe entfernen ---
    const dIdx = await page.$$eval('#layers-list .layer-item .layer-name', els => els.findIndex(e => e.textContent === 'Ebene D') + 1);
    await page.click(`#layers-list .layer-item:nth-child(${dIdx} of .layer-item)`, { button: 'right' });
    await page.waitForSelector('.context-menu');
    await page.click('.context-menu >> text=Remove from group');
    await page.waitForTimeout(200);
    const members2 = await page.$$eval('#layers-list .layer-item.in-group .layer-name', e => e.map(x => x.textContent));
    step(members2.length === 2 && !members2.includes('Ebene D'), 'Context menu: remove layer from group', members2.join(','));

    // --- 7. Gruppe als Block verschieben ---
    const orderBefore = await page.evaluate(() => State.activeSite.layers.map(l => l.name).join(','));
    await page.hover('#layers-list .layer-group-item');
    await page.click('#layers-list .layer-group-item .layer-order-btn[data-dir="down"]');
    await page.waitForTimeout(200);
    const orderAfter = await page.evaluate(() => State.activeSite.layers.map(l => l.name).join(','));
    step(orderBefore !== orderAfter, 'Group block moves down', `${orderBefore} -> ${orderAfter}`);
    const contiguous = await page.evaluate(() => {
        const site = State.activeSite;
        const idxs = site.layers.map((l, i) => l.groupId ? i : -1).filter(i => i >= 0);
        return idxs.every((v, k) => k === 0 || v === idxs[k - 1] + 1);
    });
    step(contiguous, 'Group block stays contiguous after move');

    // --- 8. Export enthaelt Gruppen; Reload stellt sie wieder her ---
    const exportHasGroups = await page.evaluate(() => JSON.parse(State.exportJSON()).sites.some(s => (s.layerGroups || []).length > 0));
    step(exportHasGroups, 'JSON export contains layerGroups');
    await page.waitForTimeout(1200); // Autosave-Debounce
    await page.reload({ waitUntil: 'domcontentloaded' });
    await setup(page);
    step(await groupRows() === 1, 'Reload: group restored from autosave', `groups=${await groupRows()}`);

    // --- 9. Gruppe aufloesen: Ebenen bleiben ---
    await page.click('#layers-list .layer-group-item', { button: 'right' });
    await page.waitForSelector('.context-menu');
    await page.click('.context-menu >> text=Ungroup');
    await page.waitForTimeout(200);
    step(await groupRows() === 0 && await layerRows() === 5, 'Ungroup keeps layers', `rows=${await layerRows()}`);

    // --- 10. Gruppe samt Inhalt loeschen (mit Confirm) + Undo ---
    await page.click(item(2));
    await page.click(item(3), { modifiers: ['Meta'] });
    await page.click('#layers-bulkbar [data-act="group"]');
    await page.waitForSelector('.dialog-overlay .dialog-input');
    await page.keyboard.press('Enter'); // Default-Name
    await page.waitForFunction(() => !document.querySelector('.dialog-overlay'));
    const rowsBefore = await layerRows();
    await page.click('#layers-list .layer-group-item', { button: 'right' });
    await page.waitForSelector('.context-menu');
    await page.click('.context-menu >> text=Delete group with content');
    await page.waitForSelector('.dialog-overlay');
    const confirmText = await page.$eval('.dialog-overlay .dialog-message', e => e.textContent);
    await page.click('.dialog-overlay .btn-primary');
    await page.waitForFunction(() => !document.querySelector('.dialog-overlay'));
    step(await layerRows() === rowsBefore - 2 && await groupRows() === 0,
        'Delete group with content removes member layers', `"${confirmText}"`);
    await page.click('#btn-undo');
    await page.waitForTimeout(300);
    step(await layerRows() === rowsBefore && await groupRows() === 1,
        'Single undo restores group + layers', `rows=${await layerRows()}`);

    await page.screenshot({ path: require('path').resolve(__dirname, 'artifacts', 'shot-groups-final.png') });
    step(nativeDialogs === 0, 'No native dialogs', `count=${nativeDialogs}`);
    const realErrors = consoleErrors.filter(e => !/favicon|404|net::ERR/i.test(e));
    step(realErrors.length === 0, 'No console/page errors', realErrors.join(' || ').slice(0, 300));

    console.log(results.join('\n'));
    await browser.close();
})().catch(e => { console.log(results.join('\n')); console.error('SCRIPT ERROR:', e.message); process.exit(2); });
