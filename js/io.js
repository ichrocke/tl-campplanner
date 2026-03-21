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
        const blackWhite = document.getElementById('print-bw').checked;
        const multiPage = document.getElementById('print-multipage').checked;
        const treasureMap = document.getElementById('print-treasure').checked;
        const title = document.getElementById('print-title').value;
        const format = overrideFormat || 'print';

        // Check for ground-only print filter
        const filter = State._printFilter;
        if (filter) {
            State._printFilter = null;
            const origObjects = site.objects;
            site.objects = filter.objects;
            printNew(site, paperSel, orientation, scaleOption, showGrid, showDistances, showObjList, treasureMap, blackWhite, multiPage, title, format);
            site.objects = origObjects;
        } else {
            printNew(site, paperSel, orientation, scaleOption, showGrid, showDistances, showObjList, treasureMap, blackWhite, multiPage, title, format);
        }
    }

    async function printNew(site, paperSel, orientation, scaleOption, showGrid, showDistances, showObjList, treasureMap, blackWhite, multiPage, title, format) {
        const papers = { a4: { w: 297, h: 210 }, a3: { w: 420, h: 297 }, a2: { w: 594, h: 420 } };
        let paper = papers[paperSel] || papers.a4;
        if (orientation === 'portrait') paper = { w: paper.h, h: paper.w };

        const bounds = getContentBounds(site);
        if (!bounds) { alert(I18n.t('msg.noPrintContent')); return; }

        const basePxPerMm = 3.78; // 96 DPI
        const dpiScale = (format === 'png' || format === 'jpeg') ? 3 : 1;
        const canvasW = Math.round(paper.w * basePxPerMm);
        const canvasH = Math.round(paper.h * basePxPerMm);
        const marginPx = Math.round(15 * basePxPerMm);

        if (treasureMap) {
            try {
                await document.fonts.load("20px 'PirateFont'");
                await new Promise(r => setTimeout(r, 100));
            } catch(e) {}
        }

        // Multi-page: split large plans into page tiles
        const allPages = [];
        if (multiPage && !treasureMap) {
            // Determine scale: use fixed scale or calculate from content
            let scale;
            if (scaleOption === 'auto') {
                // Calculate scale that gives ~1:100 feel, or fit longest side to 2 pages
                const printW = paper.w - 30;
                const printH = paper.h - 40;
                const scaleFromW = Math.ceil((bounds.width * 1000) / (printW * 2));
                const scaleFromH = Math.ceil((bounds.height * 1000) / (printH * 2));
                scale = Math.max(scaleFromW, scaleFromH);
                // Round to nice number
                if (scale <= 50) scale = 50;
                else if (scale <= 100) scale = 100;
                else if (scale <= 200) scale = 200;
                else if (scale <= 500) scale = 500;
                else scale = Math.ceil(scale / 100) * 100;
            } else {
                scale = parseInt(scaleOption);
            }
            const mPerMm = scale / 1000;
            // Printable area in mm (minus margins)
            const printW = paper.w - 30; // 15mm margin each side
            const printH = paper.h - 40; // extra for header/footer
            // Printable area in meters
            const viewW = printW * mPerMm;
            const viewH = printH * mPerMm;
            // How many pages needed
            const cols = Math.max(1, Math.ceil(bounds.width / viewW));
            const rows = Math.max(1, Math.ceil(bounds.height / viewH));
            const totalPages = cols * rows;

            for (let row = 0; row < rows; row++) {
                for (let col = 0; col < cols; col++) {
                    const pageIdx = row * cols + col + 1;
                    const tileBounds = {
                        minX: bounds.minX + col * viewW,
                        minY: bounds.minY + row * viewH,
                        maxX: bounds.minX + (col + 1) * viewW,
                        maxY: bounds.minY + (row + 1) * viewH,
                        width: viewW,
                        height: viewH,
                    };
                    const tileCanvas = Canvas.renderOffscreen(canvasW, canvasH, tileBounds, {
                        showGrid: showGrid,
                        showDistances: showDistances,
                        margin: marginPx,
                        dpiScale: dpiScale,
                    });
                    if (!tileCanvas) continue;
                    const tc = tileCanvas.getContext('2d');
                    tc.scale(dpiScale, dpiScale);

                    // Title top-left
                    if (title) {
                        tc.font = '600 8px sans-serif';
                        tc.fillStyle = '#64748b';
                        tc.textAlign = 'left';
                        tc.textBaseline = 'top';
                        tc.fillText(title, 8, 6);
                    }

                    // Page number + scale bottom-right
                    tc.font = '600 8px sans-serif';
                    tc.fillStyle = '#94a3b8';
                    tc.textAlign = 'right';
                    tc.textBaseline = 'bottom';
                    tc.fillText(`${I18n.t('modal.print.paper')} ${pageIdx}/${totalPages}  \u2014  1:${scale}`, canvasW - 8, canvasH - 6);

                    // Overview mini-map bottom-left
                    if (totalPages > 1) {
                        const ovW = 60, ovH = ovW * (bounds.height / bounds.width) || 40;
                        const ovX = 8, ovY = canvasH - ovH - 8;
                        tc.fillStyle = 'rgba(255,255,255,0.9)';
                        tc.fillRect(ovX, ovY, ovW, ovH);
                        tc.strokeStyle = '#cbd5e1';
                        tc.lineWidth = 0.5;
                        tc.strokeRect(ovX, ovY, ovW, ovH);
                        // Grid lines
                        for (let c = 1; c < cols; c++) {
                            const lx = ovX + (c / cols) * ovW;
                            tc.beginPath(); tc.moveTo(lx, ovY); tc.lineTo(lx, ovY + ovH); tc.stroke();
                        }
                        for (let r = 1; r < rows; r++) {
                            const ly = ovY + (r / rows) * ovH;
                            tc.beginPath(); tc.moveTo(ovX, ly); tc.lineTo(ovX + ovW, ly); tc.stroke();
                        }
                        // Highlight current tile
                        const hx = ovX + (col / cols) * ovW;
                        const hy = ovY + (row / rows) * ovH;
                        const hw = ovW / cols, hh = ovH / rows;
                        tc.fillStyle = 'rgba(37, 99, 235, 0.25)';
                        tc.fillRect(hx, hy, hw, hh);
                        tc.strokeStyle = '#2563eb';
                        tc.lineWidth = 1;
                        tc.strokeRect(hx, hy, hw, hh);
                    }

                    tc.setTransform(1, 0, 0, 1, 0, 0);
                    if (blackWhite) {
                        const bwData = tc.getImageData(0, 0, tileCanvas.width, tileCanvas.height);
                        const d = bwData.data;
                        for (let i = 0; i < d.length; i += 4) {
                            const gray = d[i] * 0.299 + d[i+1] * 0.587 + d[i+2] * 0.114;
                            d[i] = d[i+1] = d[i+2] = gray;
                        }
                        tc.putImageData(bwData, 0, 0);
                    }
                    allPages.push(tileCanvas);
                }
            }
        } else {
            // Single page (original behavior)
            const mapCanvas = Canvas.renderOffscreen(canvasW, canvasH, bounds, {
                showGrid: treasureMap ? false : showGrid,
                showDistances: treasureMap ? false : showDistances,
                margin: marginPx,
                dpiScale: dpiScale,
                treasureMap: treasureMap,
            });
            if (!mapCanvas) return;
            const pctx = mapCanvas.getContext('2d');
            pctx.scale(dpiScale, dpiScale);
            if (title) {
                pctx.font = treasureMap ? "18px 'PirateFont', 'Georgia', serif" : '600 8px sans-serif';
                pctx.fillStyle = treasureMap ? '#2a1a0a' : '#64748b';
                pctx.textAlign = 'left';
                pctx.textBaseline = 'top';
                pctx.fillText(title, treasureMap ? 20 : 8, treasureMap ? 12 : 6);
            }
            pctx.setTransform(1, 0, 0, 1, 0, 0);
            if (treasureMap) applyTreasureMapEffect(pctx, mapCanvas.width, mapCanvas.height);
            if (blackWhite) {
                const bwData = pctx.getImageData(0, 0, mapCanvas.width, mapCanvas.height);
                const d = bwData.data;
                for (let i = 0; i < d.length; i += 4) {
                    const gray = d[i] * 0.299 + d[i+1] * 0.587 + d[i+2] * 0.114;
                    d[i] = d[i+1] = d[i+2] = gray;
                }
                pctx.putImageData(bwData, 0, 0);
            }
            allPages.push(mapCanvas);
        }

        // Object list page
        if (showObjList && site.objects.length > 0) {
            const page2 = document.createElement('canvas');
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
            allPages.push(page2);
        }

        if (format === 'png' || format === 'jpeg') {
            const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
            const ext = format;
            if (allPages.length > 1) {
                const pw = allPages[0].width, ph = allPages[0].height;
                const gap = 20 * dpiScale;
                const combined = document.createElement('canvas');
                combined.width = pw;
                combined.height = ph * allPages.length + (allPages.length - 1) * gap;
                const cc = combined.getContext('2d');
                cc.fillStyle = '#fff';
                cc.fillRect(0, 0, combined.width, combined.height);
                allPages.forEach((p, i) => cc.drawImage(p, 0, i * (ph + gap)));
                const a = document.createElement('a');
                a.href = combined.toDataURL(mimeType, 0.95);
                a.download = `${site.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.${ext}`;
                a.click();
            } else {
                const a = document.createElement('a');
                a.href = allPages[0].toDataURL(mimeType, 0.95);
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

        // 3. Noise/grain texture (heavy)
        ctx.globalAlpha = 0.08;
        for (let i = 0; i < 15000; i++) {
            const x = Math.random() * w;
            const y = Math.random() * h;
            const s = Math.random() * 2 + 0.5;
            ctx.fillStyle = Math.random() > 0.5 ? '#3d2b1f' : '#8b7355';
            ctx.fillRect(x, y, s, s);
        }
        ctx.globalAlpha = 1;

        // 4. Stain spots (more and bigger)
        for (let i = 0; i < 8; i++) {
            const sx = Math.random() * w;
            const sy = Math.random() * h;
            const sr = 40 + Math.random() * 120;
            const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
            sg.addColorStop(0, 'rgba(101, 67, 33, 0.12)');
            sg.addColorStop(0.5, 'rgba(101, 67, 33, 0.04)');
            sg.addColorStop(1, 'rgba(101, 67, 33, 0)');
            ctx.fillStyle = sg;
            ctx.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
        }
        // Extra dark age spots
        for (let i = 0; i < 3; i++) {
            const sx = Math.random() * w;
            const sy = Math.random() * h;
            const sr = 15 + Math.random() * 30;
            const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
            sg.addColorStop(0, 'rgba(60, 30, 10, 0.15)');
            sg.addColorStop(1, 'rgba(60, 30, 10, 0)');
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

        // 6. Torn/ripped edges - natural paper tear simulation
        function tearEdge(len) {
            const pts = [];
            let depth = 3;
            let vel = 0; // velocity for smooth curves
            for (let i = 0; i < len; i += 2) {
                if (Math.random() < 0.003 && depth < 30) {
                    // Start a big rip - sudden inward
                    vel = 8 + Math.random() * 15;
                }
                // Apply velocity with damping
                depth += vel;
                vel *= 0.92; // dampen
                vel += (Math.random() - 0.5) * 2; // wobble
                // Gentle pull back to edge
                if (depth > 5) depth -= depth * 0.008;
                // Clamp
                depth = Math.max(2, Math.min(200, depth));
                pts.push(depth);
            }
            return pts;
        }
        ctx.fillStyle = '#e8d5a3';
        ctx.globalAlpha = 1;
        const topTear = tearEdge(w), botTear = tearEdge(w);
        const leftTear = tearEdge(h), rightTear = tearEdge(h);
        // Top
        ctx.beginPath(); ctx.moveTo(0, 0);
        topTear.forEach((d, i) => ctx.lineTo(i * 2, d));
        ctx.lineTo(w, 0); ctx.closePath(); ctx.fill();
        // Bottom
        ctx.beginPath(); ctx.moveTo(0, h);
        botTear.forEach((d, i) => ctx.lineTo(i * 2, h - d));
        ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
        // Left
        ctx.beginPath(); ctx.moveTo(0, 0);
        leftTear.forEach((d, i) => ctx.lineTo(d, i * 2));
        ctx.lineTo(0, h); ctx.closePath(); ctx.fill();
        // Right
        ctx.beginPath(); ctx.moveTo(w, 0);
        rightTear.forEach((d, i) => ctx.lineTo(w - d, i * 2));
        ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
        // Dark shadow along tears
        ctx.strokeStyle = '#654321';
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.5;
        ctx.beginPath(); topTear.forEach((d, i) => ctx.lineTo(i * 2, d)); ctx.stroke();
        ctx.beginPath(); botTear.forEach((d, i) => ctx.lineTo(i * 2, h - d)); ctx.stroke();
        ctx.beginPath(); leftTear.forEach((d, i) => ctx.lineTo(d, i * 2)); ctx.stroke();
        ctx.beginPath(); rightTear.forEach((d, i) => ctx.lineTo(w - d, i * 2)); ctx.stroke();
        ctx.globalAlpha = 1;

        // 7. Paper fold creases (gradient-based for realism)
        function drawFold(x1, y1, x2, y2) {
            const dx = x2-x1, dy = y2-y1;
            const len = Math.sqrt(dx*dx+dy*dy);
            const nx = -dy/len, ny = dx/len;
            // Dark shadow side (wide)
            for (let offset = -40; offset <= 0; offset += 2) {
                ctx.globalAlpha = 0.025 * (1 - Math.abs(offset) / 40);
                ctx.strokeStyle = '#2a0a00';
                ctx.lineWidth = 3;
                ctx.beginPath();
                for (let t = 0; t <= 1; t += 0.003) {
                    const wobble = Math.sin(t*20 + offset*0.1) * 2;
                    const px = x1 + dx*t + nx*(offset + wobble);
                    const py = y1 + dy*t + ny*(offset + wobble);
                    if (t === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
                }
                ctx.stroke();
            }
            // Center line (sharp)
            ctx.globalAlpha = 0.12;
            ctx.strokeStyle = '#1a0a00';
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (let t = 0; t <= 1; t += 0.003) {
                const px = x1 + dx*t + nx*Math.sin(t*20)*1;
                const py = y1 + dy*t + ny*Math.sin(t*20)*1;
                if (t === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.stroke();
            // Light highlight side (wide)
            for (let offset = 2; offset <= 30; offset += 2) {
                ctx.globalAlpha = 0.02 * (1 - offset / 30);
                ctx.strokeStyle = '#fffef0';
                ctx.lineWidth = 3;
                ctx.beginPath();
                for (let t = 0; t <= 1; t += 0.003) {
                    const wobble = Math.sin(t*20 + offset*0.1) * 2;
                    const px = x1 + dx*t + nx*(offset + wobble);
                    const py = y1 + dy*t + ny*(offset + wobble);
                    if (t === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
                }
                ctx.stroke();
            }
        }
        // Horizontal fold
        const foldY = h * (0.3 + Math.random() * 0.4);
        drawFold(0, foldY, w, foldY);
        // Vertical fold
        const foldX = w * (0.35 + Math.random() * 0.3);
        drawFold(foldX, 0, foldX, h);
        ctx.globalAlpha = 1;

        // 8. Decorative corner flourishes
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
        const s = 30; // pixels per meter
        const vbX = (bounds.minX - pad) * s;
        const vbY = (bounds.minY - pad) * s;
        const vbW = (bounds.width + pad * 2) * s;
        const vbH = (bounds.height + pad * 2) * s;
        const esc = str => (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

        function polyPoints(pts) { return pts.map(p => `${(p.x*s).toFixed(1)},${(p.y*s).toFixed(1)}`).join(' '); }
        function regPoly(cx, cy, hw, hh, sides, rot) {
            const pts = [];
            const rad = (rot || 0) * Math.PI / 180;
            for (let i = 0; i < sides; i++) {
                const a = (i / sides) * Math.PI * 2 - Math.PI / 2;
                const px = Math.cos(a) * hw, py = Math.sin(a) * hh;
                const rx = px * Math.cos(rad) - py * Math.sin(rad);
                const ry = px * Math.sin(rad) + py * Math.cos(rad);
                pts.push({ x: (cx * s + rx * s), y: (cy * s + ry * s) });
            }
            return pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
        }
        function rotRect(cx, cy, hw, hh, rot) {
            const rad = (rot || 0) * Math.PI / 180;
            const cos = Math.cos(rad), sin = Math.sin(rad);
            const corners = [[-hw,-hh],[hw,-hh],[hw,hh],[-hw,hh]];
            return corners.map(([dx,dy]) => {
                const rx = dx * cos - dy * sin, ry = dx * sin + dy * cos;
                return `${(cx * s + rx * s).toFixed(1)},${(cy * s + ry * s).toFixed(1)}`;
            }).join(' ');
        }

        let els = '';

        // Ground areas
        site.objects.forEach(obj => {
            if (obj.type !== 'ground' || !obj.points || obj.points.length < 3) return;
            const fill = obj.color || '#22c55e';
            els += `<polygon points="${polyPoints(obj.points)}" fill="${fill}" fill-opacity="0.08" stroke="${fill}" stroke-width="2"/>\n`;
            const cx = obj.points.reduce((a,p) => a + p.x, 0) / obj.points.length;
            const cy = obj.points.reduce((a,p) => a + p.y, 0) / obj.points.length;
            if (obj.name) els += `<text x="${(cx*s).toFixed(1)}" y="${(cy*s).toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-size="10" font-weight="bold" fill="${fill}">${esc(obj.name)}</text>\n`;
        });

        // Areas
        site.objects.forEach(obj => {
            if (obj.type !== 'area' || !obj.points || obj.points.length < 3) return;
            const fill = obj.color || '#d4a574';
            els += `<polygon points="${polyPoints(obj.points)}" fill="${fill}" fill-opacity="0.15" stroke="${fill}" stroke-width="1.5" stroke-dasharray="6,4"/>\n`;
            const cx = obj.points.reduce((a,p) => a + p.x, 0) / obj.points.length;
            const cy = obj.points.reduce((a,p) => a + p.y, 0) / obj.points.length;
            if (obj.name) els += `<text x="${(cx*s).toFixed(1)}" y="${(cy*s).toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-size="9" font-weight="bold" fill="${fill}">${esc(obj.name)}</text>\n`;
        });

        // Fences/Pipes
        site.objects.forEach(obj => {
            if (obj.type !== 'fence' || !obj.points || obj.points.length < 2) return;
            const color = obj.color || '#8B4513';
            const thick = obj.lineThickness || 4;
            const pts = obj.points.map(p => `${(p.x*s).toFixed(1)},${(p.y*s).toFixed(1)}`).join(' ');
            els += `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="${thick}" stroke-linecap="round" stroke-linejoin="round"/>\n`;
            obj.points.forEach(p => {
                const r = (obj.vertexSize || 0) + thick / 2;
                if (r > 0) els += `<circle cx="${(p.x*s).toFixed(1)}" cy="${(p.y*s).toFixed(1)}" r="${r}" fill="${color}"/>\n`;
            });
            if (obj.name) {
                const mx = obj.points.reduce((a,p) => a + p.x, 0) / obj.points.length;
                const my = obj.points.reduce((a,p) => a + p.y, 0) / obj.points.length;
                els += `<text x="${(mx*s).toFixed(1)}" y="${(my*s - 6).toFixed(1)}" text-anchor="middle" font-size="9" font-weight="bold" fill="${color}">${esc(obj.name)}</text>\n`;
            }
        });

        // Guidelines
        site.objects.forEach(obj => {
            if (obj.type !== 'guideline' || !obj.points || obj.points.length !== 2) return;
            const color = obj.color || '#6366f1';
            const a = obj.points[0], b = obj.points[1];
            const dist = Math.sqrt((b.x-a.x)**2 + (b.y-a.y)**2);
            els += `<line x1="${(a.x*s).toFixed(1)}" y1="${(a.y*s).toFixed(1)}" x2="${(b.x*s).toFixed(1)}" y2="${(b.y*s).toFixed(1)}" stroke="${color}" stroke-width="1.5" stroke-dasharray="8,4"/>\n`;
            // Ticks
            const len = Math.sqrt((b.x-a.x)**2 + (b.y-a.y)**2) * s;
            if (len > 0) {
                const nx = -(b.y-a.y)/dist * 0.2, ny = (b.x-a.x)/dist * 0.2;
                [a, b].forEach(p => {
                    els += `<line x1="${((p.x+nx)*s).toFixed(1)}" y1="${((p.y+ny)*s).toFixed(1)}" x2="${((p.x-nx)*s).toFixed(1)}" y2="${((p.y-ny)*s).toFixed(1)}" stroke="${color}" stroke-width="1.5"/>\n`;
                });
            }
            const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
            els += `<rect x="${(mx*s - 25).toFixed(1)}" y="${(my*s - 8).toFixed(1)}" width="50" height="16" rx="2" fill="white" fill-opacity="0.9" stroke="${color}" stroke-width="0.5"/>\n`;
            els += `<text x="${(mx*s).toFixed(1)}" y="${(my*s).toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-size="9" font-weight="bold" fill="${color}">${dist.toFixed(2)} m</text>\n`;
        });

        // Post-its
        site.objects.forEach(obj => {
            if (obj.type !== 'postit') return;
            const w = (obj.width || 3), h = (obj.height || 3);
            const color = obj.color || '#fef08a';
            els += `<polygon points="${rotRect(obj.x, obj.y, w/2, h/2, obj.rotation)}" fill="${color}" stroke="#d4d400" stroke-width="0.5"/>\n`;
            if (obj.text) els += `<text x="${(obj.x*s).toFixed(1)}" y="${(obj.y*s).toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-size="8" fill="#333">${esc(obj.text.split('\n')[0])}</text>\n`;
        });

        // Text objects
        site.objects.forEach(obj => {
            if (obj.type !== 'text') return;
            const fs = (obj.fontSize || 1) * 10;
            const color = obj.color || '#1a1a2e';
            els += `<text x="${(obj.x*s).toFixed(1)}" y="${(obj.y*s).toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-size="${fs}" font-weight="bold" fill="${color}"${obj.rotation ? ` transform="rotate(${obj.rotation},${(obj.x*s).toFixed(1)},${(obj.y*s).toFixed(1)})"` : ''}>${esc(obj.text || obj.name || '')}</text>\n`;
        });

        // Symbols
        site.objects.forEach(obj => {
            if (obj.type !== 'symbol') return;
            const r = Math.max(obj.width || 1, obj.height || 1) / 2 * s;
            els += `<circle cx="${(obj.x*s).toFixed(1)}" cy="${(obj.y*s).toFixed(1)}" r="${r.toFixed(1)}" fill="#e5e7eb" stroke="#333" stroke-width="1"/>\n`;
            if (obj.name) els += `<text x="${(obj.x*s).toFixed(1)}" y="${(obj.y*s + r + 10).toFixed(1)}" text-anchor="middle" font-size="7" fill="#333">${esc(obj.name)}</text>\n`;
        });

        // Tents & other objects (rect, circle, polygon shapes)
        site.objects.forEach(obj => {
            if (!obj.width && !obj.height) return;
            if (['ground','area','fence','guideline','postit','text','symbol','bgimage'].includes(obj.type)) return;
            const color = obj.color || '#4a90d9';
            const hw = obj.width / 2, hh = obj.height / 2;
            const shape = obj.shape || 'rect';
            const rot = obj.rotation || 0;

            // Guy ropes
            if (obj.guyRopeDistance > 0 && shape === 'rect') {
                const gd = obj.guyRopeDistance;
                els += `<polygon points="${rotRect(obj.x, obj.y, hw + gd, hh + gd, rot)}" fill="none" stroke="#9ca3af" stroke-width="0.8" stroke-dasharray="4,4"/>\n`;
            }
            if (obj.guyRopeDistance > 0 && shape === 'circle') {
                els += `<circle cx="${(obj.x*s).toFixed(1)}" cy="${(obj.y*s).toFixed(1)}" r="${((Math.max(hw,hh) + obj.guyRopeDistance)*s).toFixed(1)}" fill="none" stroke="#9ca3af" stroke-width="0.8" stroke-dasharray="4,4"/>\n`;
            }

            // Body
            if (shape === 'circle') {
                els += `<ellipse cx="${(obj.x*s).toFixed(1)}" cy="${(obj.y*s).toFixed(1)}" rx="${(hw*s).toFixed(1)}" ry="${(hh*s).toFixed(1)}" fill="${color}" fill-opacity="0.6" stroke="${color}" stroke-width="1.5"/>\n`;
            } else if (shape === 'triangle') {
                els += `<polygon points="${regPoly(obj.x, obj.y, hw, hh, 3, rot)}" fill="${color}" fill-opacity="0.6" stroke="${color}" stroke-width="1.5"/>\n`;
            } else if (['hexagon','octagon','decagon','dodecagon'].includes(shape)) {
                const sides = shape === 'hexagon' ? 6 : shape === 'octagon' ? 8 : shape === 'decagon' ? 10 : 12;
                els += `<polygon points="${regPoly(obj.x, obj.y, hw, hh, sides, rot)}" fill="${color}" fill-opacity="0.6" stroke="${color}" stroke-width="1.5"/>\n`;
            } else {
                els += `<polygon points="${rotRect(obj.x, obj.y, hw, hh, rot)}" fill="${color}" fill-opacity="0.6" stroke="${color}" stroke-width="1.5"/>\n`;
            }

            // Entrance marker
            if (obj.entranceSide && obj.entranceSide !== 'none') {
                const rad = rot * Math.PI / 180;
                const cos = Math.cos(rad), sin = Math.sin(rad);
                let ex = 0, ey = 0, tw = Math.min(hw, hh) * 0.4, th = 0.15;
                if (obj.entranceSide === 'top') { ey = -hh - th; }
                else if (obj.entranceSide === 'bottom') { ey = hh + th; }
                else if (obj.entranceSide === 'left') { ex = -hw - th; }
                else if (obj.entranceSide === 'right') { ex = hw + th; }
                const rx = ex * cos - ey * sin, ry = ex * sin + ey * cos;
                els += `<circle cx="${((obj.x + rx)*s).toFixed(1)}" cy="${((obj.y + ry)*s).toFixed(1)}" r="${(tw*s*0.3).toFixed(1)}" fill="#16a34a"/>\n`;
            }

            // Label
            if (obj.name) {
                els += `<text x="${(obj.x*s).toFixed(1)}" y="${(obj.y*s).toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-size="9" font-weight="600" fill="#1e293b">${esc(obj.name)}</text>\n`;
                els += `<text x="${(obj.x*s).toFixed(1)}" y="${(obj.y*s + 11).toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-size="7" fill="#64748b">${obj.width}\u00d7${obj.height}m</text>\n`;
            }
        });

        const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${(vbW/s*10).toFixed(0)}mm" height="${(vbH/s*10).toFixed(0)}mm" viewBox="${vbX.toFixed(1)} ${vbY.toFixed(1)} ${vbW.toFixed(1)} ${vbH.toFixed(1)}" style="background:#fff">
<style>text { font-family: sans-serif; }</style>
${els}</svg>`;

        const blob = new Blob([svg], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = (site.name || 'plan').replace(/[^a-zA-Z0-9_-]/g, '_') + '.svg';
        a.click();
        URL.revokeObjectURL(url);
    }

    function exportDXF() { }

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
        // Patch all JS files that reference compass
        jsCode.canvas = jsCode.canvas.split("'img/compass.png'").join("'" + compass + "'");
        jsCode.io = jsCode.io.split("'img/compass.png'").join("'" + compass + "'");
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

        // Pack all JS modules into a JSON object
        const modules = {};
        modules._langs = langs;
        for (const n of jsNames) modules[n] = jsCode[n];

        // Store in hidden textarea (HTML-escaped, safe from parser)
        html += '<textarea id="_offline_data" style="display:none">';
        html += JSON.stringify(modules).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        html += '</textarea>\n';

        // Bootstrap: read textarea, create script elements for each module
        html += '<script>\n';
        html += 'var _d=JSON.parse(document.getElementById("_offline_data").value.replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&amp;/g,"&"));\n';
        html += 'window._offlineLangs=_d._langs;\n';
        html += '["i18n","state","canvas","tools","ui","io","touch","app"].forEach(function(n){\n';
        html += '  var s=document.createElement("script");s.textContent=_d[n];document.head.appendChild(s);\n';
        html += '});\n';
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
