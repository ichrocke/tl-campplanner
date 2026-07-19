/* Objekt-Snapping (Kanten/Mittelpunkte) + Pfeiltasten-Nudge mit Shift/Alt */
const H = require('./helpers');

(async () => {
    const state = await H.launch();
    const { page } = state;
    const step = H.stepper(state);
    try {
        await H.open(state);

        // Zwei Zelte: eines bewusst NEBEN dem Raster (x=0.37), eines weiter weg
        await page.evaluate(() => {
            const mk = (name, x, y) => State.addObject({
                type: 'tent', name, width: 3, height: 2,
                guyRopeDistance: 0, color: '#4a90d9', shape: 'rect',
            }, x, y);
            window._t1 = mk('Anker', 0.37, 0).id;
            window._t2 = mk('Beweglich', 8, 6).id;
            Canvas.render();
        });

        // --- 1. Pfeiltasten-Nudge: normal (Raster), Shift (1m), Alt (5cm) ---
        await page.evaluate(() => {
            Canvas.clearSelection();
            Canvas.selectedId = window._t2;
            Canvas.render();
        });
        await page.click('#canvas', { position: { x: 5, y: 5 } }); // Fokus weg von Sidebar
        await page.evaluate(() => { Canvas.clearSelection(); Canvas.selectedId = window._t2; });
        const x0 = await page.evaluate(() => State.activeSite.objects.find(o => o.id === window._t2).x);
        await page.keyboard.press('ArrowRight');
        const x1 = await page.evaluate(() => State.activeSite.objects.find(o => o.id === window._t2).x);
        step(Math.abs(x1 - x0 - 0.5) < 0.001, 'Arrow nudges by grid size (0.5m)', `${x0} -> ${x1}`);
        await page.keyboard.press('Shift+ArrowRight');
        const x2 = await page.evaluate(() => State.activeSite.objects.find(o => o.id === window._t2).x);
        step(Math.abs(x2 - x1 - 1) < 0.001, 'Shift+Arrow nudges 1m', `${x1} -> ${x2}`);
        await page.keyboard.press('Alt+ArrowRight');
        const x3 = await page.evaluate(() => State.activeSite.objects.find(o => o.id === window._t2).x);
        step(Math.abs(x3 - x2 - 0.05) < 0.001, 'Alt+Arrow nudges 5cm', `${x2} -> ${x3}`);

        // --- 2. Objekt-Snap beim Ziehen: linke Kante rastet auf Ankers linke Kante ---
        // Beweglich in Snap-Naehe der Kanten-Ausrichtung bringen und ziehen
        const drag = await page.evaluate(() => {
            const site = State.activeSite;
            const t2 = site.objects.find(o => o.id === window._t2);
            t2.x = 0.55; t2.y = 6; // linke Kante bei -0.95, Anker-Kante bei -1.13 -> 0.18m daneben
            Canvas.clearSelection();
            Canvas.selectedId = window._t2;
            Canvas.render();
            const rect = document.getElementById('canvas').getBoundingClientRect();
            const from = Canvas.w2s(t2.x, t2.y);
            return { fx: rect.left + from.x, fy: rect.top + from.y };
        });
        await page.mouse.move(drag.fx, drag.fy);
        await page.mouse.down();
        // RICHTUNG Ausrichtung ziehen (-3px = -0.1m -> Abstand 0.08m < Schwelle)
        await page.mouse.move(drag.fx - 3, drag.fy, { steps: 3 });
        const during = await page.evaluate(() => ({
            guides: Canvas.snapGuides.length,
        }));
        await page.mouse.up();
        const after = await page.evaluate(() => {
            const site = State.activeSite;
            const t1 = site.objects.find(o => o.id === window._t1);
            const t2 = site.objects.find(o => o.id === window._t2);
            return { edge1: t1.x - t1.width / 2, edge2: t2.x - t2.width / 2, guidesCleared: Canvas.snapGuides.length === 0 };
        });
        step(during.guides > 0, 'Alignment guide shown while dragging', `guides=${during.guides}`);
        step(Math.abs(after.edge1 - after.edge2) < 0.001,
            'Left edges snapped exactly (object snap beats 0.5m grid)', `${after.edge2} vs ${after.edge1}`);
        step(after.guidesCleared, 'Guides cleared after mouseup');

        // --- 3. Schalter in den Einstellungen deaktiviert Objekt-Snap ---
        await page.click('#btn-settings');
        await page.waitForSelector('#snap-to-objects');
        await page.uncheck('#snap-to-objects');
        await page.click('#settings-ok');
        const drag2 = await page.evaluate(() => {
            const t2 = State.activeSite.objects.find(o => o.id === window._t2);
            t2.x = 0.55;
            Canvas.clearSelection();
            Canvas.selectedId = window._t2;
            Canvas.render();
            const rect = document.getElementById('canvas').getBoundingClientRect();
            const from = Canvas.w2s(t2.x, t2.y);
            return { fx: rect.left + from.x, fy: rect.top + from.y };
        });
        await page.mouse.move(drag2.fx, drag2.fy);
        await page.mouse.down();
        await page.mouse.move(drag2.fx + 3, drag2.fy, { steps: 3 });
        const during2 = await page.evaluate(() => Canvas.snapGuides.length);
        await page.mouse.up();
        const off = await page.evaluate(() => {
            const t1 = State.activeSite.objects.find(o => o.id === window._t1);
            const t2 = State.activeSite.objects.find(o => o.id === window._t2);
            return Math.abs((t1.x - t1.width / 2) - (t2.x - t2.width / 2));
        });
        step(during2 === 0 && off > 0.01, 'Toggle off: no guides, no object snap', `delta=${off.toFixed(3)}`);

        await H.finish(state);
    } catch (e) { await H.fail(state, e); }
})();
