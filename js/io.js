/* ========================================
   IO – Export, Import, Drucken
   ======================================== */

const IO = (() => {

    // Preload compass image
    const _compassImg = new Image();
    _compassImg.src = 'img/compass.png';

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

        const papers = {
            a4: { w: 297, h: 210 },
            a3: { w: 420, h: 297 },
            a2: { w: 594, h: 420 },
        };
        let paper = papers[paperSel] || papers.a4;
        if (orientation === 'portrait') paper = { w: paper.h, h: paper.w };

        const bounds = getContentBounds(site);
        if (!bounds) { alert(I18n.t('msg.noPrintContent')); return; }

        const margin = 15;
        const printableW = paper.w - 2 * margin;
        const printableH = paper.h - 2 * margin - (title ? 10 : 0);

        let mmPerMeter;
        if (scaleOption === 'auto') {
            mmPerMeter = Math.min(printableW / bounds.width, printableH / bounds.height);
        } else {
            mmPerMeter = 1000 / parseFloat(scaleOption);
        }

        const pxPerMm = 3.78;
        const canvasW = Math.round(paper.w * pxPerMm);
        const canvasH = Math.round(paper.h * pxPerMm);
        const ppm = mmPerMeter * pxPerMm;

        // Create offscreen canvas
        const pc = document.createElement('canvas');
        pc.width = canvasW;
        pc.height = canvasH;
        const pctx = pc.getContext('2d');
        const ds = State.displaySettings;

        // Background
        pctx.fillStyle = '#fff';
        pctx.fillRect(0, 0, canvasW, canvasH);

        const ox = margin * pxPerMm;
        const oy = margin * pxPerMm + (title ? 20 : 0);

        if (title) {
            const titleFont = treasureMap
                ? `italic bold ${20 * ds.fontScale}px 'Georgia', 'Times New Roman', serif`
                : `bold ${16 * ds.fontScale}px sans-serif`;
            pctx.font = titleFont;
            pctx.fillStyle = treasureMap ? '#3d2b1f' : '#1a1a2e';
            pctx.textAlign = 'left';
            pctx.fillText(title, ox, margin * pxPerMm + 14);
        }

        function wp(wx, wy) {
            return { x: ox + (wx - bounds.minX) * ppm, y: oy + (wy - bounds.minY) * ppm };
        }

        // Grid
        if (showGrid) {
            pctx.strokeStyle = '#ddd';
            pctx.lineWidth = 0.5 * ds.lineScale;
            const gridStep = site.gridSize;
            let gridCount = 0;
            for (let x = Math.floor(bounds.minX / gridStep) * gridStep; x <= bounds.maxX; x += gridStep) {
                const p = wp(x, bounds.minY), p2 = wp(x, bounds.maxY);
                pctx.beginPath(); pctx.moveTo(p.x, p.y); pctx.lineTo(p2.x, p2.y); pctx.stroke();
                // Label every 5th line
                if (gridCount % 5 === 0) {
                    pctx.font = `${7 * ds.fontScale}px sans-serif`;
                    pctx.fillStyle = '#bbb';
                    pctx.textAlign = 'center';
                    pctx.textBaseline = 'top';
                    pctx.fillText(x.toFixed(1), p2.x, p2.y + 2);
                }
                gridCount++;
            }
            gridCount = 0;
            for (let y = Math.floor(bounds.minY / gridStep) * gridStep; y <= bounds.maxY; y += gridStep) {
                const p = wp(bounds.minX, y), p2 = wp(bounds.maxX, y);
                pctx.beginPath(); pctx.moveTo(p.x, p.y); pctx.lineTo(p2.x, p2.y); pctx.stroke();
                if (gridCount % 5 === 0) {
                    pctx.font = `${7 * ds.fontScale}px sans-serif`;
                    pctx.fillStyle = '#bbb';
                    pctx.textAlign = 'right';
                    pctx.textBaseline = 'middle';
                    pctx.fillText(y.toFixed(1), p.x - 3, p.y);
                }
                gridCount++;
            }
            // Grid size indicator
            pctx.font = `${8 * ds.fontScale}px sans-serif`;
            pctx.fillStyle = '#999';
            pctx.textAlign = 'left';
            pctx.textBaseline = 'top';
            pctx.fillText(I18n.t('canvas.grid') + ': ' + gridStep + ' m', ox, oy + bounds.height * ppm + 4);
        }

        // Grounds (multiple)
        (site.grounds || []).forEach(ground => {
            if (ground.length >= 3) {
                pctx.beginPath();
                const g0 = wp(ground[0].x, ground[0].y);
                pctx.moveTo(g0.x, g0.y);
                ground.forEach((pt, i) => { if (i > 0) { const p = wp(pt.x, pt.y); pctx.lineTo(p.x, p.y); } });
                pctx.closePath();
                pctx.fillStyle = 'rgba(34,197,94,0.06)';
                pctx.fill();
                pctx.strokeStyle = '#22c55e';
                pctx.lineWidth = 1.5 * ds.lineScale;
                pctx.stroke();
            }
        });

        // Objects
        site.objects.forEach(obj => {
            if (obj.type === 'bgimage') return;
            if (obj.type === 'guideline' && obj.points && obj.points.length === 2) {
                const p1 = wp(obj.points[0].x, obj.points[0].y);
                const p2 = wp(obj.points[1].x, obj.points[1].y);
                const color = obj.color || '#6366f1';
                const dx = obj.points[1].x - obj.points[0].x;
                const dy = obj.points[1].y - obj.points[0].y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                pctx.strokeStyle = color;
                pctx.lineWidth = 1;
                pctx.setLineDash([6, 3]);
                pctx.beginPath(); pctx.moveTo(p1.x, p1.y); pctx.lineTo(p2.x, p2.y); pctx.stroke();
                pctx.setLineDash([]);
                // Ticks
                const len = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
                if (len > 0) {
                    const nx = -(p2.y - p1.y) / len * 4, ny = (p2.x - p1.x) / len * 4;
                    pctx.beginPath(); pctx.moveTo(p1.x + nx, p1.y + ny); pctx.lineTo(p1.x - nx, p1.y - ny); pctx.stroke();
                    pctx.beginPath(); pctx.moveTo(p2.x + nx, p2.y + ny); pctx.lineTo(p2.x - nx, p2.y - ny); pctx.stroke();
                }
                // Label
                const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
                pctx.font = `${8 * ds.fontScale}px sans-serif`;
                pctx.fillStyle = color;
                pctx.textAlign = 'center';
                pctx.fillText(dist.toFixed(2) + ' m', mx, my - 4);
                return;
            }
            if (obj.type === 'text') {
                const pos = wp(obj.x, obj.y);
                pctx.save();
                pctx.translate(pos.x, pos.y);
                pctx.rotate((obj.rotation || 0) * Math.PI / 180);
                const tfs = (obj.fontSize || 1) * ppm * ds.fontScale;
                pctx.font = `bold ${Math.max(6, tfs)}px sans-serif`;
                pctx.fillStyle = obj.color || '#333';
                pctx.textAlign = 'center';
                pctx.textBaseline = 'middle';
                pctx.fillText(obj.text || obj.name, 0, 0);
                pctx.restore();
                return;
            }
            if (obj.type === 'area' && obj.points && obj.points.length >= 3) {
                pctx.beginPath();
                const ap0 = wp(obj.points[0].x, obj.points[0].y);
                pctx.moveTo(ap0.x, ap0.y);
                obj.points.forEach((pt, i) => { if (i > 0) { const p = wp(pt.x, pt.y); pctx.lineTo(p.x, p.y); } });
                pctx.closePath();
                pctx.fillStyle = (obj.color || '#d4a574') + '25';
                pctx.fill();
                pctx.setLineDash([4, 3]);
                pctx.strokeStyle = obj.color || '#d4a574';
                pctx.lineWidth = 1 * ds.lineScale;
                pctx.stroke();
                pctx.setLineDash([]);
                return;
            }

            const pos = wp(obj.x, obj.y);
            pctx.save();
            pctx.translate(pos.x, pos.y);
            pctx.rotate(obj.rotation * Math.PI / 180);
            const w = obj.width * ppm;
            const h = obj.height * ppm;

            // Guy ropes
            if (obj.guyRopeDistance > 0) {
                const gd = obj.guyRopeDistance * ppm;
                pctx.setLineDash([3, 3]);
                pctx.strokeStyle = '#aaa';
                pctx.lineWidth = 0.5 * ds.ropeScale;
                if (obj.shape === 'circle') {
                    pctx.beginPath(); pctx.arc(0, 0, w / 2 + gd, 0, Math.PI * 2); pctx.stroke();
                } else {
                    pctx.strokeRect(-w / 2 - gd, -h / 2 - gd, w + 2 * gd, h + 2 * gd);
                }
                pctx.setLineDash([]);
                pctx.strokeStyle = '#ccc';
                pctx.lineWidth = 0.3 * ds.ropeScale;
                if (obj.shape !== 'circle') {
                    [[-1,-1],[1,-1],[1,1],[-1,1],[0,-1],[1,0],[0,1],[-1,0]].forEach(([cx, cy]) => {
                        pctx.beginPath();
                        pctx.moveTo(cx * w / 2, cy * h / 2);
                        pctx.lineTo(cx * (w / 2 + gd * (Math.abs(cx) || 0.001)), cy * (h / 2 + gd * (Math.abs(cy) || 0.001)));
                        pctx.stroke();
                    });
                }
            }

            // Body
            if (obj.shape === 'circle') {
                pctx.beginPath(); pctx.arc(0, 0, w / 2, 0, Math.PI * 2);
                pctx.fillStyle = obj.color + '66'; pctx.fill();
                pctx.strokeStyle = obj.color; pctx.lineWidth = 1 * ds.lineScale; pctx.stroke();
            } else {
                pctx.fillStyle = obj.color + '66';
                pctx.fillRect(-w / 2, -h / 2, w, h);
                pctx.strokeStyle = obj.color; pctx.lineWidth = 1 * ds.lineScale;
                pctx.strokeRect(-w / 2, -h / 2, w, h);
            }

            // Name
            const fs = Math.max(7, Math.min(11, ppm * 0.4)) * ds.fontScale;
            pctx.font = `600 ${fs}px sans-serif`;
            pctx.textAlign = 'center'; pctx.textBaseline = 'middle';
            pctx.fillStyle = '#333';
            pctx.fillText(obj.name, 0, -fs * 0.3);
            pctx.font = `${fs - 1}px sans-serif`;
            pctx.fillStyle = '#666';
            pctx.fillText(`${obj.width}\u00d7${obj.height}m`, 0, fs * 0.6);

            pctx.restore();
        });

        // Distances
        if (showDistances) {
            site.objects.forEach(obj => {
                Canvas.computeDistancesForObj(obj.id).forEach(d => {
                    const p1 = wp(d.x1, d.y1), p2 = wp(d.x2, d.y2);
                    pctx.strokeStyle = d.color;
                    pctx.lineWidth = 0.8 * ds.lineScale;
                    pctx.setLineDash([3, 2]);
                    pctx.beginPath(); pctx.moveTo(p1.x, p1.y); pctx.lineTo(p2.x, p2.y); pctx.stroke();
                    pctx.setLineDash([]);
                    pctx.font = `${8 * ds.fontScale}px sans-serif`;
                    pctx.fillStyle = d.color;
                    pctx.textAlign = 'center';
                    pctx.fillText(d.dist.toFixed(1) + 'm', (p1.x + p2.x) / 2, (p1.y + p2.y) / 2 - 3);
                });
            });
        }

        // Scale bar
        const scaleBarMeters = mmPerMeter > 15 ? 1 : mmPerMeter > 5 ? 5 : 10;
        const sbPx = scaleBarMeters * ppm;
        const sbx = canvasW - margin * pxPerMm - sbPx;
        const sby = canvasH - margin * pxPerMm;
        pctx.strokeStyle = '#333'; pctx.lineWidth = 1.5;
        pctx.beginPath();
        pctx.moveTo(sbx, sby - 4); pctx.lineTo(sbx, sby);
        pctx.lineTo(sbx + sbPx, sby); pctx.lineTo(sbx + sbPx, sby - 4);
        pctx.stroke();
        pctx.font = `${9 * ds.fontScale}px sans-serif`;
        pctx.fillStyle = '#333';
        pctx.textAlign = 'center';
        pctx.fillText(scaleBarMeters + ' m', sbx + sbPx / 2, sby - 6);
        if (scaleOption !== 'auto') {
            pctx.textAlign = 'right';
            pctx.fillText('Ma\u00dfstab 1:' + scaleOption, canvasW - margin * pxPerMm, margin * pxPerMm + 14);
        }

        // Compass image
        if (_compassImg.complete && _compassImg.naturalWidth > 0) {
            const compSize = 90;
            pctx.globalAlpha = 0.7;
            pctx.drawImage(_compassImg, ox, canvasH - margin * pxPerMm - compSize, compSize, compSize);
            pctx.globalAlpha = 1;
        }

        // --- Treasure map effect ---
        if (treasureMap) {
            applyTreasureMapEffect(pctx, canvasW, canvasH);
        }

        // --- Page 2: Object list table ---
        let page2 = null;
        if (showObjList && site.objects.length > 0) {
            page2 = document.createElement('canvas');
            page2.width = canvasW; page2.height = canvasH;
            const p2 = page2.getContext('2d');
            p2.fillStyle = '#fff';
            p2.fillRect(0, 0, canvasW, canvasH);

            const tx = ox, ty = margin * pxPerMm;
            // Title
            p2.font = `bold ${14 * ds.fontScale}px sans-serif`;
            p2.fillStyle = '#1a1a2e';
            p2.textAlign = 'left';
            p2.fillText((title || site.name) + ' \u2013 ' + I18n.t('print.objectList'), tx, ty + 12);

            const rowH = 18;
            const colW = [30, 130, 120, 55, 55, 55, 55];
            const headers = [I18n.t('print.nr'), I18n.t('print.name'), I18n.t('print.description'), I18n.t('print.width'), I18n.t('print.depth'), I18n.t('print.rotation'), I18n.t('print.type')];
            const totalW = colW.reduce((a, b) => a + b, 0);
            const headerY = ty + 28;

            // Header
            p2.fillStyle = '#f0f0f0';
            p2.fillRect(tx, headerY, totalW, rowH);
            p2.strokeStyle = '#999'; p2.lineWidth = 0.5;
            p2.strokeRect(tx, headerY, totalW, rowH);
            p2.font = `bold ${9 * ds.fontScale}px sans-serif`;
            p2.fillStyle = '#333'; p2.textAlign = 'left'; p2.textBaseline = 'middle';
            let cx = tx;
            headers.forEach((h, i) => { p2.fillText(h, cx + 4, headerY + rowH / 2); cx += colW[i]; });

            // Rows
            site.objects.forEach((obj, idx) => {
                const rowY = headerY + rowH + idx * rowH;
                if (rowY + rowH > canvasH - margin * pxPerMm) return;
                // Zebra
                if (idx % 2 === 1) { p2.fillStyle = '#fafafa'; p2.fillRect(tx, rowY, totalW, rowH); }
                p2.strokeStyle = '#e5e5e5'; p2.lineWidth = 0.3;
                p2.strokeRect(tx, rowY, totalW, rowH);
                // Color swatch
                p2.fillStyle = obj.color;
                p2.fillRect(tx + 3, rowY + 4, 10, 10);
                p2.font = `${9 * ds.fontScale}px sans-serif`;
                p2.fillStyle = '#333'; p2.textBaseline = 'middle';
                const vals = [
                    (idx + 1).toString(), obj.name, obj.description || '',
                    obj.width ? obj.width + ' m' : '-',
                    obj.height ? obj.height + ' m' : '-',
                    obj.rotation ? Math.round(obj.rotation) + '\u00b0' : '-',
                    obj.type,
                ];
                cx = tx;
                vals.forEach((v, i) => {
                    p2.fillText(v, cx + (i === 0 ? 16 : 4), rowY + rowH / 2, colW[i] - 8);
                    cx += colW[i];
                });
            });
        }

        // Output based on format
        if (format === 'png' || format === 'jpeg') {
            const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
            const ext = format;
            // For image export: combine both pages vertically
            if (page2) {
                const combined = document.createElement('canvas');
                combined.width = canvasW;
                combined.height = canvasH * 2 + 20;
                const cc = combined.getContext('2d');
                cc.fillStyle = '#fff';
                cc.fillRect(0, 0, combined.width, combined.height);
                cc.drawImage(pc, 0, 0);
                cc.drawImage(page2, 0, canvasH + 20);
                const a = document.createElement('a');
                a.href = combined.toDataURL(mimeType, 0.95);
                a.download = `${site.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.${ext}`;
                a.click();
            } else {
                const a = document.createElement('a');
                a.href = pc.toDataURL(mimeType, 0.95);
                a.download = `${site.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.${ext}`;
                a.click();
            }
        } else {
            // Print via popup window – page 1 (map) + page 2 (object list)
            const mapUrl = pc.toDataURL('image/png');
            const listUrl = page2 ? page2.toDataURL('image/png') : null;
            const win = window.open('', '_blank');
            if (!win) { alert(I18n.t('msg.popupBlocked')); return; }
            win.document.write(`<!DOCTYPE html><html><head><title>${title || site.name}</title>
                <style>
                    @page { size: ${orientation}; margin: 0; }
                    body { margin: 0; }
                    img { display: block; width: ${paper.w}mm; page-break-after: always; }
                    @media screen { img { width: 100%; max-width: 900px; margin: 10px auto; } }
                </style></head><body>
                <img src="${mapUrl}">
                ${listUrl ? '<img src="' + listUrl + '">' : ''}
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
