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

    step(await page.evaluate(() => typeof GeoTIFF !== 'undefined'), 'geotiff.js vendor loaded (global GeoTIFF)');

    // --- 1. GeoTIFF ueber Karten-Dialog importieren ---
    await page.click('#btn-maptiles');
    await page.waitForSelector('#map-geotiff');
    const [chooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.click('#map-geotiff'),
    ]);
    await chooser.setFiles(TIF);

    // Erfolgs-Dialog abwarten (Dekodieren von 16 MB dauert einen Moment)
    await page.waitForSelector('.dialog-overlay .dialog-message', { timeout: 30000 });
    const placedMsg = await page.$eval('.dialog-overlay .dialog-message', e => e.textContent);
    step(/19[89]\d × 19[89]\d m/.test(placedMsg), 'Success dialog reports ~2000 × 2000 m (tile-consistent mapping)', placedMsg.split('\n')[0]);
    await page.click('.dialog-overlay .btn-primary');
    await page.waitForFunction(() => !document.querySelector('.dialog-overlay'));

    // --- 2. Objekt- und Anker-Pruefung ---
    const info = await page.evaluate(() => {
        const site = State.activeSite;
        const o = site.objects.find(x => x.type === 'bgimage');
        return {
            found: !!o,
            w: o && o.width, h: o && o.height,
            x: o && o.x, y: o && o.y,
            locked: o && o.locked,
            jpeg: o && o.dataUrl.startsWith('data:image/jpeg'),
            kb: o && Math.round(o.dataUrl.length / 1024),
            lat: site.mapLayer.lat, lng: site.mapLayer.lng,
            anchorX: site.mapLayer.anchorWorldX, anchorY: site.mapLayer.anchorWorldY,
        };
    });
    step(info.found && Math.abs(info.w - 2000) < 12 && Math.abs(info.h - 2000) < 12,
        'Image object is ~2000x2000 world meters', `w=${info.w && info.w.toFixed(1)} h=${info.h && info.h.toFixed(1)}`);
    step(Math.abs(info.x) < 1 && Math.abs(info.y) < 1, 'Image centered on anchor (0,0)', `x=${info.x}, y=${info.y}`);
    step(info.locked === true, 'Image inserted locked');
    step(info.jpeg, 'Stored as JPEG dataURL', `${info.kb} KB`);
    // Unabhaengige Plausibilitaet: UTM32 E502-504k / N5673-5675k liegt bei ~51.217N 9.043E
    step(info.lat > 51.21 && info.lat < 51.225 && info.lng > 9.035 && info.lng < 9.052,
        'Map anchor set to GeoTIFF center (~51.217N 9.043E)', `lat=${info.lat.toFixed(5)} lng=${info.lng.toFixed(5)}`);

    // --- 3. Karte aktivieren: Kacheln muessen zur Region passen ---
    const tileReqs = [];
    page.on('request', r => { const m = r.url().match(/cartocdn\.com\/rastertiles\/voyager\/(\d+)\/(\d+)\/(\d+)/); if (m) tileReqs.push({ z: +m[1], x: +m[2], y: +m[3] }); });
    await page.click('#btn-maptiles');
    await page.waitForSelector('#map-enabled');
    const en = await page.$('#map-enabled');
    if (!(await en.isChecked())) await en.check();
    await page.click('#map-ok');
    await page.evaluate(() => { State.activeSite.view.zoom = 0.03; Canvas.render(); });
    await page.waitForTimeout(3000);
    const tileOk = tileReqs.some(t => {
        const lng = t.x / Math.pow(2, t.z) * 360 - 180;
        const n = Math.PI - 2 * Math.PI * t.y / Math.pow(2, t.z);
        const lat = 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
        return Math.abs(lat - 51.217) < 0.2 && Math.abs(lng - 9.043) < 0.3;
    });
    step(tileReqs.length > 0 && tileOk, 'OSM tiles requested for the GeoTIFF region', `${tileReqs.length} tiles`);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: require('path').resolve(__dirname, 'artifacts', 'shot-geotiff.png') });

    // --- 4. Reload: Bild und Anker ueberleben Autosave ---
    await page.waitForTimeout(1200);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await setup(page);
    const after = await page.evaluate(() => {
        const site = State.activeSite;
        const o = site.objects.find(x => x.type === 'bgimage');
        return { found: !!o, w: o && o.width, lat: site.mapLayer.lat };
    });
    step(after.found && Math.abs(after.w - 2000) < 12 && Math.abs(after.lat - 51.217) < 0.01,
        'Reload keeps image and anchor', `w=${after.w && after.w.toFixed(1)} lat=${after.lat && after.lat.toFixed(4)}`);

    // --- 5. Fehlerpfad: Nicht-TIFF-Datei mit .tif-Endung ---
    const fake = path.resolve(__dirname, 'artifacts', 'fake.tif');
    fs.mkdirSync(path.dirname(fake), { recursive: true });
    fs.writeFileSync(fake, 'this is not a tiff');
    await page.click('#btn-maptiles');
    await page.waitForSelector('#map-geotiff');
    const [chooser2] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.click('#map-geotiff'),
    ]);
    await chooser2.setFiles(fake);
    await page.waitForSelector('.dialog-overlay .dialog-message', { timeout: 10000 });
    const errMsg = await page.$eval('.dialog-overlay .dialog-message', e => e.textContent);
    step(/Could not read GeoTIFF|GeoTIFF konnte nicht/.test(errMsg), 'Invalid file shows friendly error dialog', errMsg.slice(0, 80));
    await page.click('.dialog-overlay .btn-primary');

    const realErrors = consoleErrors.filter(e => !/favicon|404|net::ERR/i.test(e));
    step(realErrors.length === 0, 'No console/page errors', realErrors.join(' || ').slice(0, 300));

    console.log(results.join('\n'));
    await browser.close();
})().catch(e => { console.log(results.join('\n')); console.error('SCRIPT ERROR:', e.message); process.exit(2); });
