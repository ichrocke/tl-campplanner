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

    function print(overrideFormat) {
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
        const format = overrideFormat || 'print';

        // Check for ground-only print filter
        const filter = State._printFilter;
        if (filter) {
            State._printFilter = null;
            // Temporarily swap objects for filtered printing
            const origObjects = site.objects;
            site.objects = filter.objects;
            printNew(site, paperSel, orientation, scaleOption, showGrid, showDistances, showObjList, treasureMap, title, format);
            site.objects = origObjects;
        } else {
            printNew(site, paperSel, orientation, scaleOption, showGrid, showDistances, showObjList, treasureMap, title, format);
        }
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

        // Use Canvas.renderOffscreen - same rendering as on screen, scaled up for DPI
        const mapCanvas = Canvas.renderOffscreen(canvasW, canvasH, bounds, {
            showGrid: showGrid,
            showDistances: showDistances,
            margin: marginPx,
            dpiScale: dpiScale,
        });

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
        // Ground objects have points
        site.objects.forEach(obj => {
            if (obj.type === 'ground' && obj.points) obj.points.forEach(p => expand(p.x, p.y));
        });
        (site.grounds || []).forEach(g => g.forEach(p => expand(p.x, p.y))); // legacy
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



    function exportSVG() {
        const site = State.activeSite;
        if (!site) return;
        const bounds = getContentBounds(site);
        if (!bounds) return;
        const pad = 2;
        const ppm = 30;
        const w = bounds.width * ppm + pad * 2 * ppm;
        const h = bounds.height * ppm + pad * 2 * ppm;
        // Render to canvas then convert
        const mapCanvas = Canvas.renderOffscreen(
            Math.round(w), Math.round(h), bounds,
            { showGrid: false, showDistances: false, margin: pad * ppm, dpiScale: 2 }
        );
        if (!mapCanvas) return;
        const dataUrl = mapCanvas.toDataURL('image/png');
        const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${w}mm" height="${h}mm" viewBox="0 0 ${mapCanvas.width} ${mapCanvas.height}">
  <image width="${mapCanvas.width}" height="${mapCanvas.height}" href="${dataUrl}"/>
</svg>`;
        const blob = new Blob([svg], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = (site.name || 'plan').replace(/[^a-zA-Z0-9_-]/g, '_') + '.svg';
        a.click();
        URL.revokeObjectURL(url);
    }

    function exportDXF() {
        const site = State.activeSite;
        if (!site) return;
        const bounds = getContentBounds(site);
        if (!bounds) return;
        let dxf = '0\nSECTION\n2\nENTITIES\n';
        site.objects.forEach(obj => {
            if (obj.type === 'ground' && obj.points && obj.points.length >= 3) {
                // Polyline for ground
                dxf += '0\nLWPOLYLINE\n8\nGround\n70\n1\n';
                obj.points.forEach(p => { dxf += `10\n${p.x.toFixed(3)}\n20\n${(-p.y).toFixed(3)}\n`; });
            } else if (obj.type === 'fence' && obj.points && obj.points.length >= 2) {
                dxf += '0\nLWPOLYLINE\n8\nPipes\n70\n0\n';
                obj.points.forEach(p => { dxf += `10\n${p.x.toFixed(3)}\n20\n${(-p.y).toFixed(3)}\n`; });
            } else if (obj.type === 'area' && obj.points && obj.points.length >= 3) {
                dxf += '0\nLWPOLYLINE\n8\nAreas\n70\n1\n';
                obj.points.forEach(p => { dxf += `10\n${p.x.toFixed(3)}\n20\n${(-p.y).toFixed(3)}\n`; });
            } else if (obj.width && obj.height && obj.type !== 'bgimage' && obj.type !== 'guideline' && obj.type !== 'symbol') {
                // Rectangle as insert point + text
                const hw = obj.width / 2, hh = obj.height / 2;
                dxf += `0\nLWPOLYLINE\n8\nObjects\n70\n1\n`;
                dxf += `10\n${(obj.x-hw).toFixed(3)}\n20\n${(-(obj.y-hh)).toFixed(3)}\n`;
                dxf += `10\n${(obj.x+hw).toFixed(3)}\n20\n${(-(obj.y-hh)).toFixed(3)}\n`;
                dxf += `10\n${(obj.x+hw).toFixed(3)}\n20\n${(-(obj.y+hh)).toFixed(3)}\n`;
                dxf += `10\n${(obj.x-hw).toFixed(3)}\n20\n${(-(obj.y+hh)).toFixed(3)}\n`;
                dxf += `0\nTEXT\n8\nLabels\n10\n${obj.x.toFixed(3)}\n20\n${(-obj.y).toFixed(3)}\n40\n0.3\n1\n${obj.name}\n`;
            }
        });
        dxf += '0\nENDSEC\n0\nEOF\n';
        const blob = new Blob([dxf], { type: 'application/dxf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = (site.name || 'plan').replace(/[^a-zA-Z0-9_-]/g, '_') + '.dxf'; a.click();
        URL.revokeObjectURL(url);
    }

    async function downloadOffline() {
        const fetchText = async (u) => (await fetch(u + '?v=' + Date.now())).text();
        const fetchB64 = async (u) => {
            const b = await (await fetch(u)).blob();
            return new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); });
        };

        // Gather all assets
        const css = await fetchText('css/style.css');
        const jsNames = ['i18n','state','canvas','tools','ui','io','touch','app'];
        const jsCode = {};
        for (const n of jsNames) jsCode[n] = await fetchText('js/' + n + '.js');

        const langs = {};
        for (const l of ['de','en','es','it']) langs[l] = await fetchText('lang/' + l + '.json');

        const logo = await fetchB64('img/logo.png');
        const compass = await fetchB64('img/compass.png');

        const symbolIds = ['first_aid','fire_ext','gas_bottle','electric','exit','assembly'];
        const symbolB64 = {};
        for (const s of symbolIds) {
            try {
                const svg = await fetchText('img/symbols/' + s + '.svg');
                symbolB64['img/symbols/' + s + '.svg'] = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
            } catch(e) {}
        }

        // Patch canvas.js: replace image paths with data URLs
        jsCode.canvas = jsCode.canvas.split("'img/compass.png'").join("'" + compass + "'");
        Object.entries(symbolB64).forEach(([p, d]) => {
            jsCode.canvas = jsCode.canvas.split("'" + p + "'").join("'" + d + "'");
        });

        // Get body from index.html
        const idx = await fetchText('index.html');
        const m = idx.match(/<body>([\s\S]*)<\/body>/i);
        let body = m ? m[1] : '';
        body = body.replace(/src="img\/logo\.png"/g, 'src="' + logo + '"');
        body = body.replace(/<script>[\s\S]*?\.forEach[\s\S]*?<\/script>/g, '');

        // Build single HTML
        let html = '<!DOCTYPE html>\n<html lang="en">\n<head>\n';
        html += '<meta charset="UTF-8">\n';
        html += '<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">\n';
        html += '<title>Camp Planner (Offline)</title>\n';
        html += '<style>\n' + css + '\n</style>\n';
        html += '</head>\n<body>\n' + body + '\n';

        // All code goes into ONE script block as a JSON object
        // JSON.stringify handles quotes/newlines, \u003c replaces ALL < to prevent HTML parser issues
        const modules = {};
        modules._langs = langs;
        for (const n of jsNames) modules[n] = jsCode[n];

        const payload = JSON.stringify(modules).replace(/</g, '\\u003c');

        html += '<script>\n';
        html += '(function(){\n';
        html += 'var _m = JSON.parse(\'' + payload.replace(/'/g, "\\'").replace(/\\/g, '\\\\').replace(/\\\\u003c/g, '\\u003c') + '\');\n';
        // Hmm this gets complicated with escaping. Let me use a different approach.
        html += '})();\n';
        html += '</script>\n';
        html += '</body></html>';

        // Actually, let me use a simpler approach
        // Store payload in a hidden textarea, read it via DOM
        html = '<!DOCTYPE html>\n<html lang="en">\n<head>\n';
        html += '<meta charset="UTF-8">\n';
        html += '<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">\n';
        html += '<title>Camp Planner (Offline)</title>\n';
        html += '<style>\n' + css + '\n</style>\n';
        html += '</head>\n<body>\n' + body + '\n';

        // Store all JS code in a hidden textarea (HTML-safe, no script parsing)
        html += '<textarea id="_offline_data" style="display:none">';
        html += JSON.stringify(modules).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        html += '</textarea>\n';

        // Tiny bootstrap script that reads the textarea and evals each module
        html += '<script>\n';
        html += 'var _d=JSON.parse(document.getElementById("_offline_data").value.replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&amp;/g,"&"));\n';
        html += 'window._offlineLangs=_d._langs;\n';
        html += '["i18n","state","canvas","tools","ui","io","touch","app"].forEach(function(n){try{(0,eval)(_d[n])}catch(e){console.error(n,e)}});\n';
        html += '</script>\n';
        html += '</body>\n</html>';

        const blob = new Blob([html], { type: 'text/html' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'campplanner-offline.html';
        a.click();
    }

    return { exportFile, importFile, print, exportSVG, exportDXF, downloadOffline };
})();
