const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:8931/index.html';
const results = [];
function step(ok, label, detail) {
    results.push(`${ok ? 'OK ' : 'FAIL'} | ${label}${detail ? ' | ' + detail : ''}`);
    if (!ok) process.exitCode = 1;
}

(async () => {
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const consoleErrors = [];
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
    let nativeDialogs = 0;
    page.on('dialog', async d => { nativeDialogs++; await d.dismiss(); });

    await page.goto(BASE);
    await page.waitForSelector('#layers-list .layer-item', { timeout: 10000 });

    const layerCount = () => page.$$eval('#layers-list .layer-item', els => els.length);
    const layerNames = () => page.$$eval('#layers-list .layer-name', els => els.map(e => e.textContent));
    const visOff = () => page.$$eval('#layers-list .layer-vis-btn', els => els.map(e => e.classList.contains('off')));
    const dialogVisible = () => page.$('.dialog-overlay');

    // Datenverlust-Hinweis wegklicken
    const understood = await page.$('button:has-text("Understood"), button:has-text("Verstanden")');
    if (understood) await understood.click();
    // Tutorial-Overlay ggf. schliessen
    await page.evaluate(() => {
        if (typeof Tutorial !== 'undefined' && Tutorial.isRunning) Tutorial.stop();
        ['tutorial-overlay', 'tutorial-popup'].forEach(id => {
            const t = document.getElementById(id);
            if (t) t.remove();
        });
    });
    await page.waitForTimeout(200);

    // --- 1. Ebene hinzufuegen via In-App-Prompt ---
    const before = await layerCount();
    await page.click('#btn-add-layer');
    await page.waitForSelector('.dialog-overlay .dialog-input');
    await page.screenshot({ path: require('path').resolve(__dirname, 'artifacts', 'shot-prompt-dialog.png') });
    await page.fill('.dialog-overlay .dialog-input', 'Ebene A');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => !document.querySelector('.dialog-overlay'));
    step(await layerCount() === before + 1, 'Add layer via in-app prompt (Enter)', `count ${before}->${await layerCount()}`);

    // Zwei weitere Ebenen
    for (const n of ['Ebene B', 'Ebene C']) {
        await page.click('#btn-add-layer');
        await page.waitForSelector('.dialog-overlay .dialog-input');
        await page.fill('.dialog-overlay .dialog-input', n);
        await page.keyboard.press('Enter');
        await page.waitForFunction(() => !document.querySelector('.dialog-overlay'));
    }
    step(await layerCount() === before + 3, 'Added 3 layers total', (await layerNames()).join(','));

    // --- 2. Escape bricht Prompt ab ---
    await page.click('#btn-add-layer');
    await page.waitForSelector('.dialog-overlay .dialog-input');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.dialog-overlay'));
    step(await layerCount() === before + 3, 'Escape cancels prompt, no layer added');

    // --- 3. Objekte platzieren (fuer Objekt-Zaehler beim Loeschen) ---
    const hasPalette = await page.$('.palette-item');
    if (hasPalette) {
        for (let k = 0; k < 2; k++) {
            await page.click('.palette-item');
            await page.mouse.click(700 + k * 80, 400);
        }
    }
    const objCount = await page.evaluate(() => State.activeSite.objects.length);
    step(true, 'Placed objects on active layer', `objects=${objCount}`);

    // --- 4. Strg+Klick Mehrfachauswahl + Bulkbar ---
    await page.click('#layers-list .layer-item:nth-child(1) .layer-name', { modifiers: ['Meta'] });
    await page.click('#layers-list .layer-item:nth-child(2) .layer-name', { modifiers: ['Meta'] });
    await page.waitForSelector('#layers-bulkbar .bulkbar-btn');
    const selCount = await page.$$eval('#layers-list .layer-item.multi-selected', e => e.length);
    const barText = await page.$eval('#layers-bulkbar .bulkbar-label', e => e.textContent);
    step(selCount === 2 && /2/.test(barText), 'Ctrl+click selects 2 layers, bulkbar shows', barText);
    await page.screenshot({ path: require('path').resolve(__dirname, 'artifacts', 'shot-bulkbar.png') });

    // --- 5. Bulk ausblenden / einblenden ---
    await page.click('#layers-bulkbar [data-act="hide"]');
    let off = await visOff();
    step(off[0] === true && off[1] === true, 'Bulk hide: both selected layers off', off.join(','));
    await page.click('#layers-bulkbar [data-act="show"]');
    off = await visOff();
    step(off[0] === false && off[1] === false, 'Bulk show: both back on', off.join(','));

    // --- 6. Shift+Klick Bereichsauswahl ---
    await page.click('#layers-list .layer-item:nth-child(1) .layer-name'); // normale Auswahl setzt aktiv + Anker, leert Auswahl
    await page.click('#layers-list .layer-item:nth-child(3) .layer-name', { modifiers: ['Shift'] });
    const selCount2 = await page.$$eval('#layers-list .layer-item.multi-selected', e => e.length);
    step(selCount2 === 3, 'Shift+click selects range of 3', `selected=${selCount2}`);

    // --- 7. Bulk-Loeschen mit Bestaetigung (2 Ebenen) ---
    await page.click('#layers-list .layer-item:nth-child(1) .layer-name'); // Auswahl leeren
    await page.click('#layers-list .layer-item:nth-child(1) .layer-name', { modifiers: ['Meta'] });
    await page.click('#layers-list .layer-item:nth-child(2) .layer-name', { modifiers: ['Meta'] });
    await page.waitForSelector('#layers-bulkbar [data-act="delete"]');
    const cntBeforeDel = await layerCount();
    const objBeforeDel = await page.evaluate(() => State.activeSite.objects.length);
    await page.click('#layers-bulkbar [data-act="delete"]');
    await page.waitForSelector('.dialog-overlay');
    const confirmText = await page.$eval('.dialog-overlay .dialog-message', e => e.textContent);
    await page.screenshot({ path: require('path').resolve(__dirname, 'artifacts', 'shot-bulk-delete-confirm.png') });
    await page.click('.dialog-overlay .btn-primary');
    await page.waitForFunction(() => !document.querySelector('.dialog-overlay'));
    const cntAfterDel = await layerCount();
    const objAfterDel = await page.evaluate(() => State.activeSite.objects.length);
    step(cntAfterDel === cntBeforeDel - 2, 'Bulk delete removed 2 layers', `"${confirmText}" layers ${cntBeforeDel}->${cntAfterDel}, objects ${objBeforeDel}->${objAfterDel}`);

    // --- 8. Undo stellt beide Ebenen (ein Schritt) wieder her ---
    await page.click('#btn-undo');
    await page.waitForTimeout(300);
    step(await layerCount() === cntBeforeDel, 'Single undo restores both deleted layers',
        `count=${await layerCount()}, objects=${await page.evaluate(() => State.activeSite.objects.length)}`);

    // --- 9. Alle Ebenen auswaehlen -> Loeschen blockiert ---
    await page.click('#layers-list .layer-item:nth-child(1) .layer-name');
    const total = await layerCount();
    await page.click('#layers-list .layer-item:nth-child(' + total + ') .layer-name', { modifiers: ['Shift'] });
    await page.click('#layers-bulkbar [data-act="delete"]');
    await page.waitForSelector('.dialog-overlay');
    const blockText = await page.$eval('.dialog-overlay .dialog-message', e => e.textContent);
    await page.click('.dialog-overlay .btn-primary');
    await page.waitForFunction(() => !document.querySelector('.dialog-overlay'));
    step(await layerCount() === cntBeforeDel && /at least|remain/i.test(blockText),
        'Delete-all blocked with info dialog', `"${blockText}"`);

    // --- 10. Kopfzeile: alle ausblenden / einblenden ---
    await page.click('#btn-layers-hide-all');
    step((await visOff()).every(v => v), 'Header hide-all: all layers off');
    await page.click('#btn-layers-show-all');
    step((await visOff()).every(v => !v), 'Header show-all: all layers on');

    // --- 11. Alt+Klick auf Auge = Solo, nochmal = alle wieder an ---
    await page.click('#layers-list .layer-item:nth-child(2) .layer-vis-btn', { modifiers: ['Alt'] });
    let off2 = await visOff();
    step(off2.filter(v => !v).length === 1 && off2[1] === false, 'Alt+click eye = solo', off2.join(','));
    await page.click('#layers-list .layer-item:nth-child(2) .layer-vis-btn', { modifiers: ['Alt'] });
    step((await visOff()).every(v => !v), 'Alt+click again = show all');

    // --- 12. Einzel-Loeschen der Ebene nutzt In-App-Confirm; Cancel bricht ab ---
    await page.hover('#layers-list .layer-item:nth-child(1)');
    await page.$eval('#layers-list .layer-item:nth-child(1) .layer-del-btn', b => b.click());
    await page.waitForSelector('.dialog-overlay');
    await page.click('.dialog-overlay .btn-secondary'); // Abbrechen
    await page.waitForFunction(() => !document.querySelector('.dialog-overlay'));
    step(await layerCount() === cntBeforeDel, 'Single layer delete: cancel keeps layer');

    // --- 13. Clear-all (im Einstellungs-Modal) zeigt In-App-Confirm ueber dem Modal ---
    await page.click('#btn-settings');
    await page.waitForSelector('#modal-settings:not(.hidden)');
    await page.click('#btn-clear-all');
    await page.waitForSelector('.dialog-overlay');
    const dangerBtn = await page.$('.dialog-overlay .btn-primary.dialog-danger');
    await page.screenshot({ path: require('path').resolve(__dirname, 'artifacts', 'shot-dialog-over-modal.png') });
    await page.click('.dialog-overlay .btn-secondary');
    await page.waitForFunction(() => !document.querySelector('.dialog-overlay'));
    await page.click('#settings-ok');
    step(!!dangerBtn && await layerCount() === cntBeforeDel, 'Clear-all shows danger confirm over settings modal, cancel works');

    // --- 14. Kontextmenue einer Ebene: Solo/Alle-Eintraege vorhanden ---
    await page.click('#layers-list .layer-item:nth-child(2)', { button: 'right' });
    await page.waitForTimeout(200);
    const menuText = await page.evaluate(() => {
        const m = document.querySelector('.context-menu');
        return m ? m.textContent : '';
    });
    step(/only this|Show all|Hide all/i.test(menuText), 'Context menu has solo/show-all/hide-all', menuText.slice(0, 120));
    await page.keyboard.press('Escape');
    await page.mouse.click(700, 300);

    // --- 15. Waehrend Dialog offen: Delete-Taste erreicht Canvas nicht ---
    await page.mouse.click(700, 400); // Objekt anwaehlen (falls vorhanden)
    const objsBefore = await page.evaluate(() => State.activeSite.objects.length);
    await page.click('#btn-add-layer');
    await page.waitForSelector('.dialog-overlay .dialog-input');
    await page.keyboard.press('Delete');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.dialog-overlay'));
    const objsAfter = await page.evaluate(() => State.activeSite.objects.length);
    step(objsBefore === objsAfter, 'Delete key inside dialog does not delete canvas objects', `${objsBefore}->${objsAfter}`);

    await page.screenshot({ path: require('path').resolve(__dirname, 'artifacts', 'shot-final.png') });

    // --- Abschluss ---
    step(nativeDialogs === 0, 'No native browser dialogs appeared', `count=${nativeDialogs}`);
    const realErrors = consoleErrors.filter(e => !/favicon|404|net::ERR/i.test(e));
    step(realErrors.length === 0, 'No console/page errors', realErrors.join(' || ').slice(0, 300));

    console.log(results.join('\n'));
    await browser.close();
})().catch(e => { console.error('SCRIPT ERROR:', e); process.exit(2); });
