if (process.env.SKIP_ONLINE === '1') { console.log('SKIP | online test (SKIP_ONLINE=1)'); process.exit(0); }
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

    // Karte verankern (Edersee/Hessen) und Hangneigung laden
    await page.click('#btn-maptiles');
    await page.waitForSelector('#map-lat');
    await page.fill('#map-lat', '51.187');
    await page.fill('#map-lng', '8.963');
    await page.click('#map-ok');
    await page.click('#btn-maptiles');
    await page.waitForSelector('#map-slope');
    await page.click('#map-slope');
    await page.waitForSelector('.dialog-overlay .dialog-message', { timeout: 60000 });
    const msg = await page.$eval('.dialog-overlay .dialog-message', e => e.textContent);
    step(/Slope map loaded/.test(msg), 'Slope loaded via live API', msg.split('\n')[0]);
    step(/legend/i.test(msg), 'Dialog mentions the legend');
    await page.click('.dialog-overlay .btn-primary');
    await page.waitForFunction(() => !document.querySelector('.dialog-overlay'));

    // Legenden-Objekt pruefen
    const legend = await page.evaluate(() => {
        const site = State.activeSite;
        const slopeLayer = site.layers.find(l => l.name === 'Slope');
        const leg = site.objects.find(o => o.name === 'Slope – legend');
        const tile = site.objects.find(o => o.type === 'bgimage');
        if (!leg) return { found: false };
        return {
            found: true,
            type: leg.type,
            locked: leg.locked,
            onSlopeLayer: slopeLayer && leg.layerId === slopeLayer.id,
            png: leg.dataUrl.startsWith('data:image/png'),
            w: leg.width, h: leg.height,
            aspectOk: leg.height > leg.width * 0.8 && leg.height < leg.width * 1.4,
            insideTile: tile && Math.abs(leg.x - tile.x) < tile.width / 2 && Math.abs(leg.y - tile.y) < tile.height / 2,
        };
    });
    step(legend.found, 'Legend object exists ("Slope – legend")');
    step(legend.found && legend.type === 'image' && legend.locked && legend.png,
        'Legend is a locked PNG image object', JSON.stringify({ type: legend.type, locked: legend.locked }));
    step(legend.found && legend.onSlopeLayer, 'Legend sits on the Slope layer');
    step(legend.found && legend.w > 60 && legend.aspectOk && legend.insideTile,
        'Legend sized and positioned inside the tile', `w=${legend.w && legend.w.toFixed(0)} h=${legend.h && legend.h.toFixed(0)}`);

    // Ebene ausblenden -> Legende verschwindet mit
    const rowIdx = await page.$$eval('#layers-list .layer-item .layer-name', els => els.findIndex(e => e.textContent === 'Slope') + 1);
    await page.click(`#layers-list .layer-item:nth-child(${rowIdx} of .layer-item) .layer-vis-btn`);
    const legHidden = await page.evaluate(() => {
        const site = State.activeSite;
        const leg = site.objects.find(o => o.name === 'Slope – legend');
        return !Canvas.isLayerVisible(site, leg.layerId);
    });
    step(legHidden, 'Hiding Slope layer hides the legend too');
    await page.click(`#layers-list .layer-item:nth-child(${rowIdx} of .layer-item) .layer-vis-btn`);

    // Zweiter Lade-Vorgang -> keine doppelte Legende
    await page.click('#btn-maptiles');
    await page.click('#map-slope');
    await page.waitForSelector('.dialog-overlay .dialog-message', { timeout: 60000 });
    await page.click('.dialog-overlay .btn-primary');
    await page.waitForFunction(() => !document.querySelector('.dialog-overlay'));
    const counts = await page.evaluate(() => ({
        legend: State.activeSite.objects.filter(o => o.name === 'Slope – legend').length,
        tiles: State.activeSite.objects.filter(o => o.type === 'bgimage').length,
    }));
    step(counts.legend === 1, 'Second slope load does not duplicate the legend', `count=${counts.legend}`);
    step(counts.tiles === 1, 'Second slope load does not duplicate the tile', `tiles=${counts.tiles}`);

    // Screenshot: auf Legende zoomen
    await page.evaluate(() => {
        if (typeof Tutorial !== 'undefined') Tutorial.stop();
        ['tutorial-overlay', 'tutorial-popup'].forEach(id => { const t = document.getElementById(id); if (t) t.remove(); });
        const site = State.activeSite;
        const leg = site.objects.find(o => o.name === 'Slope – legend');
        site.view.zoom = 0.25;
        Canvas.render();
        const cv = document.getElementById('canvas');
        const s = Canvas.w2s(leg.x, leg.y);
        site.view.panX += cv.width / 2 - s.x;
        site.view.panY += cv.height / 2 - s.y;
        Canvas.render();
    });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: require('path').resolve(__dirname, 'artifacts', 'shot-legend.png') });

    const realErrors = consoleErrors.filter(e => !/favicon|404|net::ERR/i.test(e));
    step(realErrors.length === 0, 'No console/page errors', realErrors.join(' || ').slice(0, 300));

    console.log(results.join('\n'));
    await browser.close();
})().catch(e => { console.log(results.join('\n')); console.error('SCRIPT ERROR:', e.message); process.exit(2); });
