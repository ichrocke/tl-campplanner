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

        // White background
        pctx.fillStyle = '#fff';
        pctx.fillRect(0, 0, canvasW, canvasH);

        const ox = margin * pxPerMm;
        const oy = margin * pxPerMm + (title ? 20 : 0);

        if (title) {
            pctx.font = `bold ${16 * ds.fontScale}px sans-serif`;
            pctx.fillStyle = '#1a1a2e';
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

        // Ground
        if (site.ground.length >= 3) {
            pctx.beginPath();
            const g0 = wp(site.ground[0].x, site.ground[0].y);
            pctx.moveTo(g0.x, g0.y);
            site.ground.forEach((pt, i) => { if (i > 0) { const p = wp(pt.x, pt.y); pctx.lineTo(p.x, p.y); } });
            pctx.closePath();
            pctx.fillStyle = 'rgba(34,197,94,0.06)';
            pctx.fill();
            pctx.strokeStyle = '#22c55e';
            pctx.lineWidth = 1.5 * ds.lineScale;
            pctx.stroke();
        }

        // Objects
        site.objects.forEach(obj => {
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

        // --- Page 2: Object list table ---
        let page2 = null;
        if (site.objects.length > 0) {
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
        site.ground.forEach(p => expand(p.x, p.y));
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

    return { exportFile, importFile, print };
})();
