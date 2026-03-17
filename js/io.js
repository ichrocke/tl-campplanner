/* ========================================
   IO – Export, Import, Drucken
   ======================================== */

const IO = (() => {

    // Preload compass image (handle offline mode)
    const _compassImg = new Image();
    try { _compassImg.src = 'img/compass.png'; } catch (e) {}

    function exportFile() {
        const json = State.exportJSON();
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const site = State.activeSite;
        const name = site ? site.name.replace(/[^a-zA-Z0-9\u00e4\u00f6\u00fc\u00c4\u00d6\u00dc\u00df_-]/g, '_') : 'zeltplatz';
        a.download = `${name}_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    function importFile() {
        const input = document.getElementById('file-import');
        input.value = '';
        input.onchange = () => {
            const file = input.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    State.importJSON(e.target.result);
                } catch (err) {
                    alert(I18n.t('msg.importError') + err.message);
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }

    function print() {
        const site = State.activeSite;
        if (!site) return;

        const paperSel = document.getElementById('print-paper').value;
        const orientation = document.getElementById('print-orientation').value;
        const scaleOption = document.getElementById('print-scale').value;
        const showGrid = document.getElementById('print-grid').checked;
        const showDistances = document.getElementById('print-distances').checked;
        const showObjList = document.getElementById('print-objlist').checked;
        const treasureMap = document.getElementById('print-treasure').checked;
        const title = document.getElementById('print-title').value;
        const format = document.getElementById('print-format').value;

        // Check for ground-only print filter
        const filter = State._printFilter;
        let printSite = site;
        if (filter) {
            // Create a temporary site copy with filtered data
            printSite = JSON.parse(JSON.stringify(site));
            printSite.grounds = filter.grounds;
            printSite.objects = filter.objects;
            State._printFilter = null;
        }

        printNew(printSite, paperSel, orientation, scaleOption, showGrid, showDistances, showObjList, treasureMap, title, format);
    }

    function printNew(site, paperSel, orientation, scaleOption, showGrid, showDistances, showObjList, treasureMap, title, format) {
        const papers = { a4: { w: 297, h: 210 }, a3: { w: 420, h: 297 }, a2: { w: 594, h: 420 } };
        let paper = papers[paperSel] || papers.a4;
        if (orientation === 'portrait') paper = { w: paper.h, h: paper.w };

        const bounds = getContentBounds(site);
        if (!bounds) { alert(I18n.t('msg.noPrintContent')); return; }

        // Always use 96 DPI logical dimensions, scale up for image export
        const basePxPerMm = 3.78; // 96 DPI
        const dpiScale = (format === 'png' || format === 'jpeg') ? 3 : 1; // 3x = ~300 DPI
        const canvasW = Math.round(paper.w * basePxPerMm);
        const canvasH = Math.round(paper.h * basePxPerMm);
        const marginPx = Math.round(15 * basePxPerMm);

        // Temporarily swap site data for filtered printing
        const realSite = State.activeSite;
        const isFiltered = (site !== realSite);
        if (isFiltered) {
            realSite._origGrounds = realSite.grounds;
            realSite._origObjects = realSite.objects;
            realSite.grounds = site.grounds;
            realSite.objects = site.objects;
        }

        // Use Canvas.renderOffscreen - same rendering as on screen, scaled up for DPI
        const mapCanvas = Canvas.renderOffscreen(canvasW, canvasH, bounds, {
            showGrid: showGrid,
            showDistances: showDistances,
            margin: marginPx,
            dpiScale: dpiScale,
        });

        // Restore original site data
        if (isFiltered) {
            realSite.grounds = realSite._origGrounds;
            realSite.objects = realSite._origObjects;
            delete realSite._origGrounds;
            delete realSite._origObjects;
        }

        if (!mapCanvas) return;
        const pctx = mapCanvas.getContext('2d');

        // Re-apply scale for post-processing (title, treasure map)
        pctx.scale(dpiScale, dpiScale);

        // Title (small, top-left)
        if (title) {
            const fontFamily = treasureMap ? "'Georgia','Times New Roman',serif" : "sans-serif";
            pctx.font = treasureMap
                ? `italic 8px ${fontFamily}`
                : `600 8px sans-serif`;
            pctx.fillStyle = treasureMap ? '#3d2b1f' : '#64748b';
            pctx.textAlign = 'left';
            pctx.textBaseline = 'top';
            pctx.fillText(title, 8, 6);
        }

        // Treasure map effect (post-processing on full physical canvas)
        pctx.setTransform(1, 0, 0, 1, 0, 0); // reset scale for pixel-level effect
        if (treasureMap) {
            applyTreasureMapEffect(pctx, mapCanvas.width, mapCanvas.height);
        }

        // Object list (page 2)
        let page2 = null;
        if (showObjList && site.objects.length > 0) {
            page2 = document.createElement('canvas');
            page2.width = Math.round(canvasW * dpiScale);
            page2.height = Math.round(canvasH * dpiScale);
            const p2 = page2.getContext('2d');
            p2.scale(dpiScale, dpiScale);
            const ds = State.displaySettings;
            p2.fillStyle = '#fff';
            p2.fillRect(0, 0, canvasW, canvasH);
            const tx = marginPx, ty = marginPx;
            p2.font = `bold ${14 * ds.fontScale}px sans-serif`;
            p2.fillStyle = '#1a1a2e';
            p2.textAlign = 'left';
            p2.fillText((title || site.name) + ' \u2013 ' + I18n.t('print.objectList'), tx, ty + 12);
            const rowH = Math.round(18);
            const fs = Math.round(9 * ds.fontScale);
            const colW = [30, 130, 120, 55, 55, 55, 55].map(c => Math.round(c));
            const headers = [I18n.t('print.nr'), I18n.t('print.name'), I18n.t('print.description'), I18n.t('print.width'), I18n.t('print.depth'), I18n.t('print.rotation'), I18n.t('print.type')];
            const totalW = colW.reduce((a, b) => a + b, 0);
            const headerY = ty + Math.round(28);
            p2.fillStyle = '#f0f0f0';
            p2.fillRect(tx, headerY, totalW, rowH);
            p2.strokeStyle = '#999'; p2.lineWidth = 0.5;
            p2.strokeRect(tx, headerY, totalW, rowH);
            p2.font = `bold ${fs}px sans-serif`;
            p2.fillStyle = '#333'; p2.textAlign = 'left'; p2.textBaseline = 'middle';
            let cx = tx;
            headers.forEach((h, i) => { p2.fillText(h, cx + 4, headerY + rowH / 2); cx += colW[i]; });
            site.objects.forEach((obj, idx) => {
                if (obj.type === 'bgimage' || obj.type === 'guideline') return;
                const rowY = headerY + rowH + idx * rowH;
                if (rowY + rowH > canvasH - marginPx) return;
                if (idx % 2 === 1) { p2.fillStyle = '#fafafa'; p2.fillRect(tx, rowY, totalW, rowH); }
                p2.strokeStyle = '#e5e5e5'; p2.lineWidth = 0.3;
                p2.strokeRect(tx, rowY, totalW, rowH);
                p2.fillStyle = obj.color;
                p2.fillRect(tx + 3, rowY + 4, Math.round(10), Math.round(10));
                p2.font = `${fs}px sans-serif`;
                p2.fillStyle = '#333'; p2.textBaseline = 'middle';
                const vals = [(idx + 1).toString(), obj.name, (obj.description || '').split('\n')[0],
                    obj.width ? obj.width + ' m' : '-', obj.height ? obj.height + ' m' : '-',
                    obj.rotation ? Math.round(obj.rotation) + '\u00b0' : '-', obj.type];
                cx = tx;
                vals.forEach((v, i) => { p2.fillText(v, cx + (i === 0 ? Math.round(16) : 4), rowY + rowH / 2, colW[i] - 8); cx += colW[i]; });
            });
        }

        // Output
        const allPages = [mapCanvas];
        if (page2) allPages.push(page2);

        if (format === 'png' || format === 'jpeg') {
            const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
            const ext = format;
            if (allPages.length > 1) {
                const combined = document.createElement('canvas');
                combined.width = canvasW;
                combined.height = canvasH * allPages.length + (allPages.length - 1) * 20;
                const cc = combined.getContext('2d');
                cc.fillStyle = '#fff';
                cc.fillRect(0, 0, combined.width, combined.height);
                allPages.forEach((p, i) => cc.drawImage(p, 0, i * (canvasH + 20)));
                const a = document.createElement('a');
                a.href = combined.toDataURL(mimeType, 0.95);
                a.download = `${site.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.${ext}`;
                a.click();
            } else {
                const a = document.createElement('a');
                a.href = mapCanvas.toDataURL(mimeType, 0.95);
                a.download = `${site.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.${ext}`;
                a.click();
            }
        } else {
            const win = window.open('', '_blank');
            if (!win) { alert(I18n.t('msg.popupBlocked')); return; }
            let imgsHtml = allPages.map(p => '<img src="' + p.toDataURL('image/png') + '">').join('\n');
            win.document.write(`<!DOCTYPE html><html><head><title>${title || site.name}</title>
                <style>
                    @page { size: ${orientation}; margin: 0; }
                    body { margin: 0; }
                    img { display: block; width: ${paper.w}mm; page-break-after: always; }
                    @media screen { img { width: 100%; max-width: 900px; margin: 10px auto; } }
                </style></head><body>
                ${imgsHtml}
                <script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script>
                </body></html>`);
            win.document.close();
        }
    }


    function getContentBounds(site) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        const expand = (x, y) => {
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
        };
        (site.grounds || []).forEach(g => g.forEach(p => expand(p.x, p.y)));
        site.objects.forEach(obj => {
            const pad = Math.max(obj.width || 0, obj.height || 0) / 2 + (obj.guyRopeDistance || 0) + 0.5;
            expand(obj.x - pad, obj.y - pad);
            expand(obj.x + pad, obj.y + pad);
            if (obj.points) obj.points.forEach(p => expand(p.x, p.y));
        });
        if (minX === Infinity) return null;
        const pad = 1;
        return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad,
            width: maxX - minX + 2 * pad, height: maxY - minY + 2 * pad };
    }

    // Draw a wobbly line between two points (hand-drawn effect)
    function wobblyLine(ctx, x1, y1, x2, y2, amplitude) {
        const dx = x2 - x1, dy = y2 - y1;
        const len = Math.sqrt(dx * dx + dy * dy);
        const steps = Math.max(4, Math.floor(len / 6));
        const nx = -dy / len, ny = dx / len; // perpendicular
        ctx.moveTo(x1, y1);
        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            const px = x1 + dx * t;
            const py = y1 + dy * t;
            const wobble = (Math.sin(i * 2.7 + x1 * 0.1) + Math.cos(i * 1.3 + y1 * 0.1)) * amplitude;
            ctx.lineTo(px + nx * wobble, py + ny * wobble);
        }
    }

    // Draw a wobbly rectangle path
    function wobblyRect(ctx, x, y, w, h, amp) {
        ctx.beginPath();
        wobblyLine(ctx, x, y, x + w, y, amp);
        wobblyLine(ctx, x + w, y, x + w, y + h, amp);
        wobblyLine(ctx, x + w, y + h, x, y + h, amp);
        wobblyLine(ctx, x, y + h, x, y, amp);
        ctx.closePath();
    }

    // Draw a wobbly polygon path from points array
    function wobblyPolygon(ctx, points, amp) {
        ctx.beginPath();
        for (let i = 0; i < points.length; i++) {
            const a = points[i], b = points[(i + 1) % points.length];
            if (i === 0) ctx.moveTo(a.x, a.y);
            wobblyLine(ctx, a.x, a.y, b.x, b.y, amp);
        }
        ctx.closePath();
    }

    function applyTreasureMapEffect(ctx, w, h) {
        // 1. Get current image data and convert to sepia
        const imageData = ctx.getImageData(0, 0, w, h);
        const d = imageData.data;
        for (let i = 0; i < d.length; i += 4) {
            const r = d[i], g = d[i + 1], b = d[i + 2];
            // Sepia tone
            d[i]     = Math.min(255, r * 0.393 + g * 0.769 + b * 0.189);
            d[i + 1] = Math.min(255, r * 0.349 + g * 0.686 + b * 0.168);
            d[i + 2] = Math.min(255, r * 0.272 + g * 0.534 + b * 0.131);
        }
        ctx.putImageData(imageData, 0, 0);

        // 2. Parchment background overlay
        ctx.globalCompositeOperation = 'multiply';
        const grad = ctx.createRadialGradient(w / 2, h / 2, w * 0.1, w / 2, h / 2, w * 0.7);
        grad.addColorStop(0, '#f5e6c8');
        grad.addColorStop(0.6, '#e8d5a3');
        grad.addColorStop(1, '#c4a265');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'source-over';

        // 3. Noise/grain texture
        ctx.globalAlpha = 0.06;
        for (let i = 0; i < 8000; i++) {
            const x = Math.random() * w;
            const y = Math.random() * h;
            const s = Math.random() * 2 + 0.5;
            ctx.fillStyle = Math.random() > 0.5 ? '#3d2b1f' : '#8b7355';
            ctx.fillRect(x, y, s, s);
        }
        ctx.globalAlpha = 1;

        // 4. Stain spots
        for (let i = 0; i < 5; i++) {
            const sx = Math.random() * w;
            const sy = Math.random() * h;
            const sr = 30 + Math.random() * 80;
            const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
            sg.addColorStop(0, 'rgba(101, 67, 33, 0.08)');
            sg.addColorStop(1, 'rgba(101, 67, 33, 0)');
            ctx.fillStyle = sg;
            ctx.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
        }

        // 5. Burned/darkened edges (vignette)
        ctx.globalCompositeOperation = 'multiply';
        const vignette = ctx.createRadialGradient(w / 2, h / 2, w * 0.25, w / 2, h / 2, w * 0.75);
        vignette.addColorStop(0, 'rgba(255,255,255,1)');
        vignette.addColorStop(0.7, 'rgba(210,180,140,1)');
        vignette.addColorStop(1, 'rgba(139,90,43,1)');
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'source-over';

        // 6. Torn/rough edge effect
        ctx.strokeStyle = '#8b6914';
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.3;
        // Top edge
        ctx.beginPath();
        ctx.moveTo(0, 0);
        for (let x = 0; x < w; x += 8) {
            ctx.lineTo(x, Math.random() * 4);
        }
        ctx.stroke();
        // Bottom edge
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let x = 0; x < w; x += 8) {
            ctx.lineTo(x, h - Math.random() * 4);
        }
        ctx.stroke();
        // Left edge
        ctx.beginPath();
        ctx.moveTo(0, 0);
        for (let y = 0; y < h; y += 8) {
            ctx.lineTo(Math.random() * 4, y);
        }
        ctx.stroke();
        // Right edge
        ctx.beginPath();
        ctx.moveTo(w, 0);
        for (let y = 0; y < h; y += 8) {
            ctx.lineTo(w - Math.random() * 4, y);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;

        // 7. Decorative corner flourishes
        ctx.strokeStyle = '#654321';
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.25;
        const cs = 40; // corner size
        [[0, 0, 1, 1], [w, 0, -1, 1], [0, h, 1, -1], [w, h, -1, -1]].forEach(([cx, cy, dx, dy]) => {
            ctx.beginPath();
            ctx.moveTo(cx + dx * 5, cy + dy * cs);
            ctx.quadraticCurveTo(cx + dx * 5, cy + dy * 5, cx + dx * cs, cy + dy * 5);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(cx + dx * 10, cy + dy * (cs - 5));
            ctx.quadraticCurveTo(cx + dx * 10, cy + dy * 10, cx + dx * (cs - 5), cy + dy * 10);
            ctx.stroke();
        });
        ctx.globalAlpha = 1;
    }

    async function downloadOffline() {
        const files = {
            css: ['css/style.css'],
            js: ['js/i18n.js', 'js/state.js', 'js/canvas.js', 'js/tools.js', 'js/ui.js', 'js/io.js', 'js/app.js'],
            lang: ['lang/de.json', 'lang/en.json', 'lang/es.json', 'lang/it.json'],
            img: ['img/logo.png', 'img/compass.png'],
        };

        // Fetch all text files
        const fetchText = async (url) => {
            const r = await fetch(url + '?v=' + Date.now());
            return r.text();
        };
        const fetchDataUrl = async (url) => {
            const r = await fetch(url);
            const blob = await r.blob();
            return new Promise(resolve => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.readAsDataURL(blob);
            });
        };

        const css = await fetchText(files.css[0]);
        const jsContents = [];
        for (const f of files.js) jsContents.push(await fetchText(f));
        const langData = {};
        for (const f of files.lang) {
            const key = f.replace('lang/', '').replace('.json', '');
            langData[key] = await fetchText(f);
        }
        const logoDataUrl = await fetchDataUrl(files.img[0]);
        const compassDataUrl = await fetchDataUrl(files.img[1]);

        // Get current index.html and extract the body
        const indexHtml = await fetchText('index.html');

        // Build self-contained HTML
        let html = '<!DOCTYPE html>\n<html lang="en">\n<head>\n';
        html += '<meta charset="UTF-8">\n';
        html += '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n';
        html += '<title>Tyra Lorena Camp Planner (Offline)</title>\n';
        html += '<style>\n' + css + '\n</style>\n';
        html += '</head>\n';

        // Extract body content from index.html (between <body> and </body>)
        const bodyMatch = indexHtml.match(/<body>([\s\S]*?)<\/body>/i);
        let body = bodyMatch ? bodyMatch[1] : '';

        // Replace image src with data URLs
        body = body.replace(/src="img\/logo\.png"/g, 'src="' + logoDataUrl + '"');
        body = body.replace(/src="img\/compass\.png"/g, 'src="' + compassDataUrl + '"');

        // Remove the script loader at the bottom
        body = body.replace(/<script>[\s\S]*?\.forEach[\s\S]*?<\/script>/g, '');

        html += '<body>\n' + body + '\n';

        // Embed translations as global variable
        html += '<script>\nwindow._offlineLangs = ' + JSON.stringify(langData) + ';\n</script>\n';

        // Patch i18n.js to use embedded translations instead of fetch
        let i18nJs = jsContents[0];
        i18nJs = i18nJs.replace(
            /function load\(lang\) \{[\s\S]*?if \(xhr\.status === 200\) \{[\s\S]*?\}\s*\}/,
            `function load(lang) {
        if (window._offlineLangs && window._offlineLangs[lang]) {
            _translations = JSON.parse(window._offlineLangs[lang]);
            _lang = lang;
        } else {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', 'lang/' + lang + '.json?v=' + Date.now(), false);
            xhr.send();
            if (xhr.status === 200) {
                _translations = JSON.parse(xhr.responseText);
                _lang = lang;
            }
        }
    }`
        );

        // Patch canvas.js compass image src
        let canvasJs = jsContents[2];
        canvasJs = canvasJs.replace(
            "_compassImg.src = 'img/compass.png';",
            "_compassImg.src = '" + compassDataUrl + "';"
        );

        // Embed all JS
        html += '<script>\n' + i18nJs + '\n</script>\n';
        for (let i = 1; i < jsContents.length; i++) {
            const js = (i === 2) ? canvasJs : jsContents[i];
            html += '<script>\n' + js + '\n</script>\n';
        }

        html += '</body>\n</html>';

        // Download
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'campplanner-offline.html';
        a.click();
        URL.revokeObjectURL(url);
    }

    return { exportFile, importFile, print, downloadOffline };
})();
