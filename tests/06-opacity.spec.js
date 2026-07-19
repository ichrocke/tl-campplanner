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
    page.on('dialog', async d => { if (d.type() === 'beforeunload') await d.accept(); else await d.dismiss(); });

    await page.goto('http://127.0.0.1:8931/index.html');
    await page.waitForSelector('#layers-list .layer-item');
    const u = await page.$('button:has-text("Understood"), button:has-text("Verstanden")');
    if (u) await u.click();
    await page.evaluate(() => {
        if (typeof Tutorial !== 'undefined') Tutorial.stop();
        ['tutorial-overlay', 'tutorial-popup'].forEach(id => { const t = document.getElementById(id); if (t) t.remove(); });
    });

    // Hintergrundbild programmatisch anlegen und auswaehlen (1px-PNG reicht)
    await page.evaluate(() => {
        const px = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
        const obj = State.addObject({
            type: 'bgimage', name: 'TestBG', width: 20, height: 20,
            guyRopeDistance: 0, color: '#888', shape: 'rect', dataUrl: px, opacity: 0.3,
        }, 0, 0);
        Canvas.selectedId = obj.id;
        UI.showProperties(obj);
    });
    await page.waitForSelector('#prop-opacity-num');

    // --- 1. Prozentfeld vorhanden und synchron zum Regler ---
    const init = await page.evaluate(() => ({
        slider: parseFloat(document.getElementById('prop-opacity').value),
        num: parseFloat(document.getElementById('prop-opacity-num').value),
    }));
    step(init.num === 30 && Math.abs(init.slider - 0.3) < 0.001, 'Number field shows 30% initially', JSON.stringify(init));

    // --- 2. Exakten Wert eintippen -> Objekt uebernimmt ihn ---
    await page.fill('#prop-opacity-num', '37');
    const after = await page.evaluate(() => ({
        op: State.activeSite.objects.find(o => o.name === 'TestBG').opacity,
        slider: parseFloat(document.getElementById('prop-opacity').value),
    }));
    step(Math.abs(after.op - 0.37) < 0.001, 'Typing 37 sets opacity to exactly 0.37', String(after.op));
    step(Math.abs(after.slider - 0.37) < 0.001, 'Slider follows the typed value', String(after.slider));

    // --- 3. Regler bewegen -> Zahlfeld folgt ---
    await page.$eval('#prop-opacity', el => { el.value = 0.62; el.dispatchEvent(new Event('input')); });
    const after2 = await page.evaluate(() => ({
        num: parseFloat(document.getElementById('prop-opacity-num').value),
        op: State.activeSite.objects.find(o => o.name === 'TestBG').opacity,
    }));
    step(after2.num === 62 && Math.abs(after2.op - 0.62) < 0.001, 'Slider updates number field + object', JSON.stringify(after2));

    // --- 4. Grenzwerte geklemmt ---
    await page.fill('#prop-opacity-num', '2');
    const clamped = await page.evaluate(() => State.activeSite.objects.find(o => o.name === 'TestBG').opacity);
    step(Math.abs(clamped - 0.05) < 0.001, 'Typing 2% clamps to minimum 5%', String(clamped));

    // --- 5. Objekt-Deckkraft (normales Objekt) hat ebenfalls ein Prozentfeld ---
    await page.evaluate(() => {
        const obj = State.addObject({
            type: 'tent', name: 'TestZelt', width: 3, height: 3,
            guyRopeDistance: 0, color: '#4a90d9', shape: 'rect',
        }, 5, 5);
        Canvas.selectedId = obj.id;
        UI.showProperties(obj);
    });
    await page.waitForSelector('#prop-obj-opacity-num');
    await page.fill('#prop-obj-opacity-num', '45');
    const tentOp = await page.evaluate(() => State.activeSite.objects.find(o => o.name === 'TestZelt').objectOpacity);
    step(Math.abs(tentOp - 0.45) < 0.001, 'Object opacity number field sets exactly 45%', String(tentOp));

    // --- 6. Karten-Modal: Prozentfeld statt reiner Anzeige ---
    await page.click('#btn-maptiles');
    await page.waitForSelector('#map-opacity-val');
    const isInput = await page.$eval('#map-opacity-val', e => e.tagName === 'INPUT');
    await page.fill('#map-lat', '51.217');
    await page.fill('#map-lng', '9.043');
    await page.fill('#map-opacity-val', '73');
    await page.click('#map-ok');
    const mapOp = await page.evaluate(() => State.activeSite.mapLayer.opacity);
    step(isInput && Math.abs(mapOp - 0.73) < 0.001, 'Map modal opacity accepts exact percent', `input=${isInput}, op=${mapOp}`);

    // Spezialzeile zeigt neuen Wert
    const rowTxt = await page.$eval('#layers-list .layer-item.special-layer', e => e.textContent);
    step(/73%/.test(rowTxt), 'Special map row shows 73%');

    const realErrors = consoleErrors.filter(e => !/favicon|404|net::ERR/i.test(e));
    step(realErrors.length === 0, 'No console/page errors', realErrors.join(' || ').slice(0, 300));

    console.log(results.join('\n'));
    await browser.close();
})().catch(e => { console.log(results.join('\n')); console.error('SCRIPT ERROR:', e.message); process.exit(2); });
