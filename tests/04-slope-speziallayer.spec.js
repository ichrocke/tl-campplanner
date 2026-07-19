if (process.env.SKIP_ONLINE === '1') { console.log('SKIP | online test (SKIP_ONLINE=1)'); process.exit(0); }
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const TIF = path.resolve(__dirname, '../temp/lwe_detail.tif');
if (!fs.existsSync(TIF)) { console.log('SKIP | example GeoTIFF missing (temp/lwe_detail.tif)'); process.exit(0); }

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

    // --- 1. GeoTIFF importieren -> eigene Ebene ---
    await page.click('#btn-maptiles');
    await page.waitForSelector('#map-geotiff');
    const [chooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.click('#map-geotiff'),
    ]);
    await chooser.setFiles(TIF);
    await page.waitForSelector('.dialog-overlay .dialog-message', { timeout: 30000 });
    const placedMsg = await page.$eval('.dialog-overlay .dialog-message', e => e.textContent);
    step(/own layer/.test(placedMsg), 'Dialog mentions own layer', placedMsg.split('\n')[0]);
    await page.click('.dialog-overlay .btn-primary');
    await page.waitForFunction(() => !document.querySelector('.dialog-overlay'));

    const tifLayer = await page.evaluate(() => {
        const site = State.activeSite;
        const l = site.layers.find(x => x.name === 'lwe_detail');
        const o = site.objects.find(x => x.type === 'bgimage');
        return { layerFound: !!l, atEnd: l && site.layers[site.layers.length - 1].id === l.id,
                 objOnLayer: o && l && o.layerId === l.id,
                 activeUnchanged: site.activeLayerId !== (l && l.id) };
    });
    step(tifLayer.layerFound && tifLayer.objOnLayer, 'GeoTIFF got its own layer with the image on it', JSON.stringify(tifLayer));
    step(tifLayer.atEnd, 'Import layer sits at the bottom (background)');
    step(tifLayer.activeUnchanged, 'Active layer unchanged by import');

    // Ebene ausblenden -> Bild effektiv unsichtbar
    const rowIdx = await page.$$eval('#layers-list .layer-item .layer-name', els => els.findIndex(e => e.textContent === 'lwe_detail') + 1);
    await page.click(`#layers-list .layer-item:nth-child(${rowIdx} of .layer-item) .layer-vis-btn`);
    const hidden = await page.evaluate(() => {
        const site = State.activeSite;
        const o = site.objects.find(x => x.type === 'bgimage');
        return !Canvas.isLayerVisible(site, o.layerId);
    });
    step(hidden, 'Hiding the GeoTIFF layer hides the image');
    await page.click(`#layers-list .layer-item:nth-child(${rowIdx} of .layer-item) .layer-vis-btn`);

    // --- 2. Kartenansicht-Spezialzeile ---
    const special = await page.$('#layers-list .layer-item.special-layer');
    step(!!special, 'Map view special row appears (map anchored by import)');
    const mlBefore = await page.evaluate(() => State.activeSite.mapLayer.enabled);
    await page.click('#layers-list .layer-item.special-layer .layer-vis-btn');
    const mlAfter = await page.evaluate(() => State.activeSite.mapLayer.enabled);
    step(mlBefore !== mlAfter, 'Special row eye toggles map enabled', `${mlBefore} -> ${mlAfter}`);

    // Deckkraft per Rechtsklick
    await page.click('#layers-list .layer-item.special-layer', { button: 'right' });
    await page.waitForSelector('.context-menu');
    await page.click('.context-menu >> text=Layer opacity');
    await page.waitForSelector('.dialog-overlay .dialog-input');
    await page.fill('.dialog-overlay .dialog-input', '0.9');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => !document.querySelector('.dialog-overlay'));
    const opac = await page.evaluate(() => State.activeSite.mapLayer.opacity);
    step(Math.abs(opac - 0.9) < 0.001, 'Special row context menu sets map opacity', String(opac));
    const pctShown = await page.$eval('#layers-list .layer-item.special-layer', e => e.textContent);
    step(/90%/.test(pctShown), 'Special row shows opacity percent', pctShown.trim().slice(0, 40));

    // Klick auf Zeile oeffnet Karten-Modal
    await page.click('#layers-list .layer-item.special-layer .layer-name');
    const modalOpen = await page.$eval('#modal-maptiles', e => !e.classList.contains('hidden'));
    step(modalOpen, 'Clicking special row opens map settings');
    await page.click('#map-cancel');

    // --- 3. Hangneigung von hoehendaten.de (Live-API, Region Edersee/Hessen) ---
    await page.click('#btn-maptiles');
    await page.waitForSelector('#map-slope');
    await page.click('#map-slope');
    await page.waitForSelector('.dialog-overlay .dialog-message', { timeout: 60000 });
    const slopeMsg = await page.$eval('.dialog-overlay .dialog-message', e => e.textContent);
    await page.click('.dialog-overlay .btn-primary');
    await page.waitForFunction(() => !document.querySelector('.dialog-overlay'));
    const slopeOk = /Slope map loaded/.test(slopeMsg);
    step(slopeOk, 'Slope API call succeeded', slopeMsg.split('\n')[0]);
    if (slopeOk) {
        const slope = await page.evaluate(() => {
            const site = State.activeSite;
            const l = site.layers.find(x => x.name === 'Slope');
            const objs = site.objects.filter(o => l && o.layerId === l.id);
            return { layer: !!l, n: objs.length,
                     size: objs[0] && `${objs[0].width.toFixed(0)}x${objs[0].height.toFixed(0)}`,
                     opacity: objs[0] && objs[0].opacity, locked: objs[0] && objs[0].locked };
        });
        step(slope.layer && slope.n >= 1, 'Slope tiles on their own "Slope" layer', JSON.stringify(slope));
        step(slope.size && /^9[5-9]\dx9[5-9]\d|^10[0-4]\dx/.test(slope.size), 'Slope tile ~1000x1000 m', slope.size);
        await page.evaluate(() => { State.activeSite.view.zoom = 0.5; Canvas.render(); });
        await page.waitForTimeout(800);
        await page.screenshot({ path: require('path').resolve(__dirname, 'artifacts', 'shot-slope.png') });
    }

    const realErrors = consoleErrors.filter(e => !/favicon|404|net::ERR/i.test(e));
    step(realErrors.length === 0, 'No console/page errors', realErrors.join(' || ').slice(0, 300));

    console.log(results.join('\n'));
    await browser.close();
})().catch(e => { console.log(results.join('\n')); console.error('SCRIPT ERROR:', e.message); process.exit(2); });
