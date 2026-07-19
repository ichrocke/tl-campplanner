/* Attribution im Druckfuss: PNG-Export enthaelt Quellenangabe wenn Karte aktiv */
const H = require('./helpers');
const fs = require('fs');
const path = require('path');

(async () => {
    const state = await H.launch({ acceptDownloads: true });
    const { page } = state;
    const step = H.stepper(state);

    // PNG exportieren und den unteren Mittelstreifen auf Text-Pixel pruefen
    async function exportAndScan() {
        const [download] = await Promise.all([
            page.waitForEvent('download', { timeout: 30000 }),
            page.evaluate(() => IO.print('png')),
        ]);
        const file = path.resolve(__dirname, 'artifacts', 'print-' + Date.now() + '.png');
        await download.saveAs(file);
        const b64 = fs.readFileSync(file).toString('base64');
        return page.evaluate(async (data) => {
            const img = new Image();
            await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = 'data:image/png;base64,' + data; });
            const c = document.createElement('canvas');
            c.width = img.width; c.height = img.height;
            const x = c.getContext('2d');
            x.drawImage(img, 0, 0);
            // unterer Streifen, mittleres Drittel (dort sitzt die Attribution)
            const y0 = Math.floor(img.height * 0.965);
            const strip = x.getImageData(Math.floor(img.width / 3), y0, Math.floor(img.width / 3), img.height - y0 - 1).data;
            let textPixels = 0;
            for (let i = 0; i < strip.length; i += 4) {
                const r = strip[i], g = strip[i + 1], b = strip[i + 2];
                // grauer Attribution-Text (#94a3b8), Antialiasing eingerechnet
                if (r > 100 && r < 220 && Math.abs(r - g) < 25 && Math.abs(g - b) < 30 && b > r) textPixels++;
            }
            return { w: img.width, h: img.height, textPixels };
        }, b64);
    }

    try {
        await H.open(state);

        // Objekt platzieren, damit es Druckinhalt gibt
        await page.evaluate(() => {
            State.addObject({ type: 'tent', name: 'Druckzelt', width: 4, height: 3, guyRopeDistance: 0.5, color: '#4a90d9', shape: 'rect' }, 0, 0);
            Canvas.render();
        });

        // 1. Ohne Karte: keine Attribution im Fussbereich
        const before = await exportAndScan();
        step(before.textPixels < 30, 'No attribution text without map', `pixels=${before.textPixels}`);

        // 2. Karte verankern und aktivieren -> Attribution erscheint
        await page.click('#btn-maptiles');
        await page.waitForSelector('#map-lat');
        await page.fill('#map-lat', '51.217');
        await page.fill('#map-lng', '9.043');
        const en = await page.$('#map-enabled');
        if (!(await en.isChecked())) await en.check();
        await page.click('#map-ok');
        await page.waitForTimeout(500);
        const after = await exportAndScan();
        step(after.textPixels > 100, 'Attribution footer rendered with map enabled', `pixels=${after.textPixels} (${after.w}x${after.h})`);

        // 3. Attribution am Slope-Objekt wird eingesammelt (ohne Online-API:
        //    Objekt mit attribution-Feld simulieren und Sammel-Logik pruefen)
        const collected = await page.evaluate(() => {
            const site = State.activeSite;
            const o = State.addObject({ type: 'bgimage', name: 'FakeSlope', width: 10, height: 10, guyRopeDistance: 0, color: '#888', shape: 'rect', dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', opacity: 0.5 }, 20, 20);
            o.attribution = 'Geobasisdaten Test dl-de/by-2-0';
            return true;
        });
        const withSlope = await exportAndScan();
        step(collected && withSlope.textPixels > after.textPixels,
            'Object attribution adds to the footer', `pixels=${withSlope.textPixels} > ${after.textPixels}`);

        await H.finish(state);
    } catch (e) { await H.fail(state, e); }
})();
