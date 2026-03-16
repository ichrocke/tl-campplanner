/* ========================================
   Canvas – Rendering-Engine
   ======================================== */

const Canvas = (() => {
    let canvas, ctx;
    const PPM = 30; // base pixels per meter

    let selectedIds = new Set();
    let hoveredId = null;
    let selectionRect = null; // {x1,y1,x2,y2} in world coords for rect-select
    let dragDistances = [];
    let measureLine = null;
    let groundPreview = [];
    let highlightGroundVertex = -1;
    let placementPreview = null;
    let pathPreview = []; // for path/area drawing

    function init(el) {
        canvas = el;
        ctx = canvas.getContext('2d');
        resize();
        window.addEventListener('resize', resize);
    }

    function resize() {
        const r = canvas.parentElement.getBoundingClientRect();
        canvas.width = r.width;
        canvas.height = r.height;
    }

    function zoom() {
        const s = State.activeSite;
        return s ? s.view.zoom * PPM : PPM;
    }

    function w2s(wx, wy) {
        const s = State.activeSite;
        if (!s) return { x: 0, y: 0 };
        const z = s.view.zoom * PPM;
        return {
            x: canvas.width / 2 + (wx + s.view.panX) * z,
            y: canvas.height / 2 + (wy + s.view.panY) * z
        };
    }

    function s2w(sx, sy) {
        const s = State.activeSite;
        if (!s) return { x: 0, y: 0 };
        const z = s.view.zoom * PPM;
        return {
            x: (sx - canvas.width / 2) / z - s.view.panX,
            y: (sy - canvas.height / 2) / z - s.view.panY
        };
    }

    function snapToGrid(val, gridSize) {
        return Math.round(val / gridSize) * gridSize;
    }

    // --- Regular polygon points (local coords, radius = 1) ---
    function regularPolygonPoints(sides) {
        const pts = [];
        for (let i = 0; i < sides; i++) {
            const a = (i / sides) * Math.PI * 2 - Math.PI / 2;
            pts.push({ x: Math.cos(a), y: Math.sin(a) });
        }
        return pts;
    }

    function getShapeSides(shape) {
        switch (shape) {
            case 'triangle': return 3;
            case 'hexagon': return 6;
            case 'octagon': return 8;
            default: return 0; // rect or circle handled separately
        }
    }

    // Get local polygon path for an object shape (unscaled, centered at 0,0)
    // Returns array of {x,y} in local coords scaled to width/height
    function getLocalShapePath(obj, extraPad) {
        const pad = extraPad || 0;
        const hw = obj.width / 2 + pad;
        const hh = obj.height / 2 + pad;
        const sides = getShapeSides(obj.shape);
        if (sides >= 3) {
            const pts = regularPolygonPoints(sides);
            return pts.map(p => ({ x: p.x * hw, y: p.y * hh }));
        }
        if (obj.shape === 'circle') {
            // Approximate with 16 segments
            const pts = [];
            for (let i = 0; i < 16; i++) {
                const a = (i / 16) * Math.PI * 2;
                pts.push({ x: Math.cos(a) * hw, y: Math.sin(a) * hh });
            }
            return pts;
        }
        // rect
        return [
            { x: -hw, y: -hh },
            { x: hw, y: -hh },
            { x: hw, y: hh },
            { x: -hw, y: hh },
        ];
    }

    // --- Render pipeline ---
    function render() {
        if (!canvas || !ctx) return;
        const activeSite = State.activeSite;
        if (!activeSite) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawBgImage(activeSite);
        drawGrid(activeSite);

        // Draw only the active site
        drawGround(activeSite);
        drawObjects(activeSite);

        // Active site overlays
        drawGroundPreview();
        drawPlacementPreview();
        drawPathPreview();
        drawDragDistances();
        drawMeasureLine();
        drawSelectionRect();
        drawScaleBar(activeSite);
        drawCompass();
    }

    function drawSiteLabel(site, isActive) {
        const bounds = State.getSiteContentBounds(site);
        let labelX, labelY;
        if (bounds) {
            labelX = (bounds.minX + bounds.maxX) / 2;
            labelY = bounds.minY - 2.5;
        } else {
            labelX = 0;
            labelY = -8;
            // Draw empty site placeholder
            if (isActive) {
                const cp = w2s(0, 0);
                ctx.strokeStyle = '#d1d5db';
                ctx.lineWidth = 1;
                ctx.setLineDash([8, 5]);
                ctx.strokeRect(cp.x - 60, cp.y - 40, 120, 80);
                ctx.setLineDash([]);
                ctx.font = '12px sans-serif';
                ctx.fillStyle = '#9ca3af';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(I18n.t('canvas.drawGround'), cp.x, cp.y);
            }
        }
        const p = w2s(labelX, labelY);

        // Background pill
        ctx.font = `bold 13px sans-serif`;
        const tw = ctx.measureText(site.name).width;
        const px = p.x - tw / 2 - 8;
        const py = p.y - 10;
        ctx.fillStyle = isActive ? '#2563eb' : '#64748b';
        ctx.globalAlpha = isActive ? 1 : 0.7;
        ctx.beginPath();
        roundRect(ctx, px, py, tw + 16, 22, 11);
        ctx.fill();
        ctx.globalAlpha = 1;

        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(site.name, p.x, p.y + 1);
    }

    function roundRect(c, x, y, w, h, r) {
        c.moveTo(x + r, y);
        c.lineTo(x + w - r, y);
        c.arcTo(x + w, y, x + w, y + r, r);
        c.lineTo(x + w, y + h - r);
        c.arcTo(x + w, y + h, x + w - r, y + h, r);
        c.lineTo(x + r, y + h);
        c.arcTo(x, y + h, x, y + h - r, r);
        c.lineTo(x, y + r);
        c.arcTo(x, y, x + r, y, r);
    }

    // Background image cache
    const _bgImageCache = {};
    function drawBgImage(site) {
        const bg = site.bgImage;
        if (!bg || !bg.dataUrl) return;
        // Load/cache image
        if (!_bgImageCache[bg.dataUrl]) {
            const img = new Image();
            img.src = bg.dataUrl;
            img.onload = () => { _bgImageCache[bg.dataUrl] = img; render(); };
            return;
        }
        const img = _bgImageCache[bg.dataUrl];
        const z = zoom();
        const p = w2s(bg.x || 0, bg.y || 0);
        const w = (bg.width || 50) * z;
        const h = w * (img.naturalHeight / img.naturalWidth);
        ctx.globalAlpha = bg.opacity || 0.3;
        ctx.drawImage(img, p.x, p.y, w, h);
        ctx.globalAlpha = 1;
    }

    function drawGrid(site) {
        const z = zoom();
        const gpx = site.gridSize * z;
        if (gpx < 4) return;

        const origin = w2s(0, 0);

        ctx.strokeStyle = '#f0f0f0';
        ctx.lineWidth = 0.5;
        const sx = ((origin.x % gpx) + gpx) % gpx;
        for (let x = sx; x < canvas.width; x += gpx) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
        }
        const sy = ((origin.y % gpx) + gpx) % gpx;
        for (let y = sy; y < canvas.height; y += gpx) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
        }

        const majorPx = gpx * 5;
        if (majorPx > 20) {
            ctx.strokeStyle = '#e0e0e0';
            ctx.lineWidth = 0.8;
            const smx = ((origin.x % majorPx) + majorPx) % majorPx;
            for (let x = smx; x < canvas.width; x += majorPx) {
                ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
            }
            const smy = ((origin.y % majorPx) + majorPx) % majorPx;
            for (let y = smy; y < canvas.height; y += majorPx) {
                ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
            }
        }

        ctx.strokeStyle = '#ccc';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(origin.x, 0); ctx.lineTo(origin.x, canvas.height); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, origin.y); ctx.lineTo(canvas.width, origin.y); ctx.stroke();
    }

    // Shoelace formula for polygon area
    function polygonArea(pts) {
        let area = 0;
        for (let i = 0; i < pts.length; i++) {
            const j = (i + 1) % pts.length;
            area += pts[i].x * pts[j].y;
            area -= pts[j].x * pts[i].y;
        }
        return Math.abs(area / 2);
    }

    // Centroid of polygon
    function polygonCentroid(pts) {
        let cx = 0, cy = 0;
        pts.forEach(p => { cx += p.x; cy += p.y; });
        return { x: cx / pts.length, y: cy / pts.length };
    }

    function drawGround(site) {
        const pts = site.ground;
        if (pts.length < 2) return;
        ctx.beginPath();
        const p0 = w2s(pts[0].x, pts[0].y);
        ctx.moveTo(p0.x, p0.y);
        for (let i = 1; i < pts.length; i++) {
            const p = w2s(pts[i].x, pts[i].y);
            ctx.lineTo(p.x, p.y);
        }
        if (pts.length >= 3) {
            ctx.closePath();
            ctx.fillStyle = 'rgba(34, 197, 94, 0.08)';
            ctx.fill();
        }
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Vertices
        pts.forEach((pt, i) => {
            const p = w2s(pt.x, pt.y);
            const isHighlighted = (i === highlightGroundVertex);
            ctx.beginPath();
            ctx.arc(p.x, p.y, isHighlighted ? 7 : 5, 0, Math.PI * 2);
            ctx.fillStyle = isHighlighted ? '#16a34a' : '#22c55e';
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = isHighlighted ? 2.5 : 1.5;
            ctx.stroke();
        });

        // Edge lengths
        ctx.font = '10px sans-serif';
        ctx.fillStyle = '#16a34a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        for (let i = 0; i < pts.length; i++) {
            const a = pts[i];
            const b = pts[(i + 1) % pts.length];
            if (i === pts.length - 1 && pts.length < 3) break;
            const dist = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
            const mp = w2s((a.x + b.x) / 2, (a.y + b.y) / 2);
            ctx.fillText(dist.toFixed(1) + ' m', mp.x, mp.y - 4);
        }

        // Area display
        if (pts.length >= 3) {
            const area = polygonArea(pts);
            const center = polygonCentroid(pts);
            const cp = w2s(center.x, center.y);
            ctx.font = 'bold 12px sans-serif';
            ctx.fillStyle = '#16a34a';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(area.toFixed(1) + ' m\u00b2', cp.x, cp.y);
        }
    }

    function drawGroundPreview() {
        if (groundPreview.length === 0) return;
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = '#22c55e88';
        ctx.lineWidth = 2;
        ctx.beginPath();
        const p0 = w2s(groundPreview[0].x, groundPreview[0].y);
        ctx.moveTo(p0.x, p0.y);
        for (let i = 1; i < groundPreview.length; i++) {
            const p = w2s(groundPreview[i].x, groundPreview[i].y);
            ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
        ctx.setLineDash([]);

        groundPreview.forEach(pt => {
            const p = w2s(pt.x, pt.y);
            ctx.beginPath();
            ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
            ctx.fillStyle = '#22c55e88';
            ctx.fill();
        });
    }

    function drawObjects(site) {
        const sorted = [...site.objects].sort((a, b) => {
            const aSel = selectedIds.has(a.id) ? 1 : 0;
            const bSel = selectedIds.has(b.id) ? 1 : 0;
            return aSel - bSel;
        });
        sorted.forEach(obj => drawObject(obj));
    }

    // Draw a shape path on ctx (local coords, already translated/rotated)
    function traceShapePath(obj, z, extraPad) {
        const sides = getShapeSides(obj.shape);
        const pad = extraPad || 0;
        const hw = (obj.width / 2 + pad) * z;
        const hh = (obj.height / 2 + pad) * z;

        if (sides >= 3) {
            const pts = regularPolygonPoints(sides);
            ctx.beginPath();
            ctx.moveTo(pts[0].x * hw, pts[0].y * hh);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x * hw, pts[i].y * hh);
            ctx.closePath();
        } else if (obj.shape === 'circle') {
            ctx.beginPath();
            ctx.ellipse(0, 0, hw, hh, 0, 0, Math.PI * 2);
        } else {
            // rect – use a path so we can use it uniformly
            ctx.beginPath();
            ctx.rect(-hw, -hh, hw * 2, hh * 2);
        }
    }

    function drawObject(obj) {
        const z = zoom();
        const isSel = selectedIds.has(obj.id);
        const isHov = obj.id === hoveredId;

        // --- Area annotation ---
        if (obj.type === 'area' && obj.points && obj.points.length >= 3) {
            drawArea(obj, z, isSel, isHov);
            return;
        }
        // --- Fence ---
        if (obj.type === 'fence' && obj.points && obj.points.length >= 2) {
            drawFence(obj, z, isSel, isHov);
            return;
        }
        // --- Text ---
        if (obj.type === 'text') {
            drawTextField(obj, z, isSel, isHov);
            return;
        }

        const pos = w2s(obj.x, obj.y);
        const ds = State.displaySettings;
        const ls = obj.lineWidth || ds.lineScale;
        const rs = obj.ropeWidth || ds.ropeScale;
        const fs = obj.labelSize || ds.fontScale;

        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.rotate(obj.rotation * Math.PI / 180);

        const w = obj.width * z;
        const h = obj.height * z;

        // Guy ropes (with per-side control for rect)
        if (obj.guyRopeDistance > 0) {
            const gd = obj.guyRopeDistance;
            const sides = obj.guyRopeSides || { top: true, right: true, bottom: true, left: true };

            if (obj.shape === 'rect') {
                const hw = w / 2, hh = h / 2;
                const ghw = hw + gd * z, ghh = hh + gd * z;
                ctx.setLineDash([4, 4]);
                ctx.strokeStyle = '#9ca3af';
                ctx.lineWidth = 1 * rs;

                // Draw outer dashed lines per side
                if (sides.top) { ctx.beginPath(); ctx.moveTo(-ghw, -ghh); ctx.lineTo(ghw, -ghh); ctx.stroke(); }
                if (sides.right) { ctx.beginPath(); ctx.moveTo(ghw, -ghh); ctx.lineTo(ghw, ghh); ctx.stroke(); }
                if (sides.bottom) { ctx.beginPath(); ctx.moveTo(ghw, ghh); ctx.lineTo(-ghw, ghh); ctx.stroke(); }
                if (sides.left) { ctx.beginPath(); ctx.moveTo(-ghw, ghh); ctx.lineTo(-ghw, -ghh); ctx.stroke(); }
                ctx.setLineDash([]);

                // Corner and mid-edge ropes
                ctx.strokeStyle = '#d1d5db';
                ctx.lineWidth = 0.8 * rs;
                // Corners: draw if both adjacent sides enabled
                if (sides.top && sides.left) { ctx.beginPath(); ctx.moveTo(-hw, -hh); ctx.lineTo(-ghw, -ghh); ctx.stroke(); }
                if (sides.top && sides.right) { ctx.beginPath(); ctx.moveTo(hw, -hh); ctx.lineTo(ghw, -ghh); ctx.stroke(); }
                if (sides.bottom && sides.right) { ctx.beginPath(); ctx.moveTo(hw, hh); ctx.lineTo(ghw, ghh); ctx.stroke(); }
                if (sides.bottom && sides.left) { ctx.beginPath(); ctx.moveTo(-hw, hh); ctx.lineTo(-ghw, ghh); ctx.stroke(); }
                // Mid-edge ropes
                if (sides.top) { ctx.beginPath(); ctx.moveTo(0, -hh); ctx.lineTo(0, -ghh); ctx.stroke(); }
                if (sides.right) { ctx.beginPath(); ctx.moveTo(hw, 0); ctx.lineTo(ghw, 0); ctx.stroke(); }
                if (sides.bottom) { ctx.beginPath(); ctx.moveTo(0, hh); ctx.lineTo(0, ghh); ctx.stroke(); }
                if (sides.left) { ctx.beginPath(); ctx.moveTo(-hw, 0); ctx.lineTo(-ghw, 0); ctx.stroke(); }
            } else {
                // Non-rect: draw full outline as before
                ctx.setLineDash([4, 4]);
                ctx.strokeStyle = '#9ca3af';
                ctx.lineWidth = 1 * rs;
                traceShapePath(obj, z, gd);
                ctx.stroke();
                ctx.setLineDash([]);

                ctx.strokeStyle = '#d1d5db';
                ctx.lineWidth = 0.8 * rs;
                const bodyPts = getLocalShapePath(obj, 0);
                const ropePts = getLocalShapePath(obj, gd);
                const count = Math.min(bodyPts.length, ropePts.length);
                for (let i = 0; i < count; i++) {
                    ctx.beginPath();
                    ctx.moveTo(bodyPts[i].x * z, bodyPts[i].y * z);
                    ctx.lineTo(ropePts[i].x * z, ropePts[i].y * z);
                    ctx.stroke();
                }
            }
        }

        // Object body
        const alpha = '99';
        ctx.fillStyle = obj.color + alpha;
        ctx.strokeStyle = obj.color;
        ctx.lineWidth = 1.5 * ls;
        traceShapePath(obj, z, 0);
        ctx.fill();
        ctx.stroke();

        // Tent center line
        if (obj.type === 'tent' && obj.shape === 'rect') {
            ctx.strokeStyle = obj.color;
            ctx.globalAlpha = 0.4;
            ctx.lineWidth = 0.8 * ls;
            ctx.beginPath();
            ctx.moveTo(0, -h / 2); ctx.lineTo(0, h / 2);
            ctx.stroke();
            ctx.globalAlpha = 1;
        }

        // Name label – if object too small, render above instead of inside
        const fontSize = Math.max(9, Math.min(13, z * 0.4)) * fs;
        ctx.font = `600 ${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#1e293b';
        const nameW = ctx.measureText(obj.name).width;
        const fitsInside = nameW < (w - 4) && fontSize < h * 0.5;

        if (fitsInside) {
            ctx.textBaseline = 'middle';
            ctx.fillText(obj.name, 0, -fontSize * 0.35);
            ctx.font = `${Math.max(8, fontSize - 2)}px sans-serif`;
            ctx.fillStyle = '#64748b';
            ctx.fillText(`${obj.width}\u00d7${obj.height}m`, 0, fontSize * 0.55);
        } else {
            // Render above the object
            ctx.textBaseline = 'bottom';
            ctx.fillText(obj.name, 0, -h / 2 - 4);
            ctx.font = `${Math.max(8, fontSize - 2)}px sans-serif`;
            ctx.fillStyle = '#64748b';
            ctx.textBaseline = 'top';
            ctx.fillText(`${obj.width}\u00d7${obj.height}m`, 0, h / 2 + 3);
        }

        // Description (free text) below dimensions
        if (obj.description) {
            const descFs = Math.max(7, fontSize - 2);
            ctx.font = `italic ${descFs}px sans-serif`;
            ctx.fillStyle = '#94a3b8';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            const descY = fitsInside ? fontSize * 0.55 + descFs + 1 : h / 2 + 3 + descFs + 2;
            ctx.fillText(obj.description, 0, descY - descFs);
        }

        // Selection / hover
        if (isSel) {
            ctx.strokeStyle = '#2563eb';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 3]);
            traceShapePath(obj, z, 0.15);
            ctx.stroke();
            ctx.setLineDash([]);

            // Rotation handle
            const handleY = -h / 2 - 28;
            ctx.strokeStyle = '#2563eb';
            ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(0, -h / 2 - 4); ctx.lineTo(0, handleY); ctx.stroke();
            ctx.beginPath(); ctx.arc(0, handleY, 5, 0, Math.PI * 2);
            ctx.fillStyle = '#2563eb';
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1.5;
            ctx.stroke();
        } else if (isHov) {
            ctx.strokeStyle = '#2563eb55';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 3]);
            traceShapePath(obj, z, 0.1);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        ctx.restore();
    }

    // --- Area texture patterns ---
    const _patternCache = {};
    function getAreaPattern(texture, color) {
        const key = texture + '_' + color;
        if (_patternCache[key]) return _patternCache[key];

        const pc = document.createElement('canvas');
        const pctx = pc.getContext('2d');
        const s = 12; // pattern tile size
        pc.width = s; pc.height = s;

        pctx.strokeStyle = color;
        pctx.fillStyle = color;
        pctx.lineWidth = 1;
        pctx.globalAlpha = 0.35;

        switch (texture) {
            case 'hatch': // Schraffur diagonal
                pctx.beginPath();
                pctx.moveTo(0, s); pctx.lineTo(s, 0);
                pctx.moveTo(-4, 4); pctx.lineTo(4, -4);
                pctx.moveTo(s - 4, s + 4); pctx.lineTo(s + 4, s - 4);
                pctx.stroke();
                break;
            case 'crosshatch': // Kreuzschraffur
                pctx.beginPath();
                pctx.moveTo(0, s); pctx.lineTo(s, 0);
                pctx.moveTo(0, 0); pctx.lineTo(s, s);
                pctx.stroke();
                break;
            case 'dots': // Punkte
                pctx.beginPath();
                pctx.arc(s / 2, s / 2, 1.5, 0, Math.PI * 2);
                pctx.fill();
                break;
            case 'grass': // Gras (kurze Striche)
                pctx.lineWidth = 0.8;
                pctx.beginPath();
                pctx.moveTo(3, s); pctx.lineTo(4, s - 5);
                pctx.moveTo(8, s - 1); pctx.lineTo(9, s - 6);
                pctx.stroke();
                break;
            case 'trees': // Bäume (kleine Kreise)
                pctx.beginPath();
                pctx.arc(s / 2, s / 2, 3, 0, Math.PI * 2);
                pctx.stroke();
                pctx.beginPath();
                pctx.arc(s / 2, s / 2, 0.8, 0, Math.PI * 2);
                pctx.fill();
                break;
            case 'water': // Wasser (Wellenlinien)
                pctx.lineWidth = 0.8;
                pctx.beginPath();
                pctx.moveTo(0, s / 2);
                pctx.bezierCurveTo(s / 4, s / 2 - 3, s * 3 / 4, s / 2 + 3, s, s / 2);
                pctx.stroke();
                break;
            default: // 'solid' or unknown – no pattern
                pctx.globalAlpha = 0.15;
                pctx.fillRect(0, 0, s, s);
                break;
        }

        const pat = ctx.createPattern(pc, 'repeat');
        _patternCache[key] = pat;
        return pat;
    }

    const AREA_TEXTURES = [
        { id: 'solid', name: 'Einfarbig' },
        { id: 'hatch', name: 'Schraffur' },
        { id: 'crosshatch', name: 'Kreuzschraffur' },
        { id: 'dots', name: 'Punkte' },
        { id: 'grass', name: 'Gras' },
        { id: 'trees', name: 'Wald' },
        { id: 'water', name: 'Wasser' },
    ];

    function drawArea(obj, z, isSel, isHov) {
        // Build clipping path
        ctx.beginPath();
        const p0 = w2s(obj.points[0].x, obj.points[0].y);
        ctx.moveTo(p0.x, p0.y);
        for (let i = 1; i < obj.points.length; i++) {
            const p = w2s(obj.points[i].x, obj.points[i].y);
            ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();

        // Fill with texture or solid color
        const texture = obj.texture || 'solid';
        const color = obj.color || '#d4a574';
        if (texture === 'solid') {
            ctx.fillStyle = color + '25';
        } else {
            ctx.fillStyle = getAreaPattern(texture, color) || (color + '25');
        }
        ctx.fill();

        // Border
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.setLineDash([]);

        // Selection
        if (isSel || isHov) {
            ctx.strokeStyle = isSel ? '#2563eb' : '#2563eb55';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 3]);
            ctx.beginPath();
            ctx.moveTo(p0.x, p0.y);
            for (let i = 1; i < obj.points.length; i++) {
                const p = w2s(obj.points[i].x, obj.points[i].y);
                ctx.lineTo(p.x, p.y);
            }
            ctx.closePath();
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Vertex handles when selected
        if (isSel) {
            obj.points.forEach(pt => {
                const p = w2s(pt.x, pt.y);
                ctx.beginPath();
                ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
                ctx.fillStyle = '#2563eb';
                ctx.fill();
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 1.5;
                ctx.stroke();
            });
        }

        // Label at centroid
        const center = polygonCentroid(obj.points);
        const cp = w2s(center.x, center.y);
        ctx.font = 'bold 11px sans-serif';
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(obj.name || I18n.t('msg.defaultArea'), cp.x, cp.y);
    }

    function drawTextField(obj, z, isSel, isHov) {
        const pos = w2s(obj.x, obj.y);
        const fontSize = (obj.fontSize || 1) * z;
        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.rotate((obj.rotation || 0) * Math.PI / 180);

        ctx.font = `bold ${Math.max(8, fontSize)}px sans-serif`;
        ctx.fillStyle = obj.color || '#1a1a2e';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(obj.text || obj.name || 'Text', 0, 0);

        if (isSel) {
            const tw = ctx.measureText(obj.text || obj.name || 'Text').width;
            ctx.strokeStyle = '#2563eb';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 3]);
            ctx.strokeRect(-tw / 2 - 4, -fontSize / 2 - 2, tw + 8, fontSize + 4);
            ctx.setLineDash([]);
        } else if (isHov) {
            const tw = ctx.measureText(obj.text || obj.name || 'Text').width;
            ctx.strokeStyle = '#2563eb55';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 3]);
            ctx.strokeRect(-tw / 2 - 4, -fontSize / 2 - 2, tw + 8, fontSize + 4);
            ctx.setLineDash([]);
        }

        ctx.restore();
    }

    function drawFence(obj, z, isSel, isHov) {
        if (!obj.points || obj.points.length < 2) return;
        const color = obj.color || '#8B4513';
        const fh = (obj.fenceHeight || 1.5) * z * 0.3;

        // Draw fence line
        ctx.beginPath();
        const p0 = w2s(obj.points[0].x, obj.points[0].y);
        ctx.moveTo(p0.x, p0.y);
        for (let i = 1; i < obj.points.length; i++) {
            const p = w2s(obj.points[i].x, obj.points[i].y);
            ctx.lineTo(p.x, p.y);
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Draw posts at each vertex
        obj.points.forEach(pt => {
            const p = w2s(pt.x, pt.y);
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y - fh);
            ctx.lineTo(p.x, p.y + fh);
            ctx.stroke();
            // Post cap
            ctx.beginPath();
            ctx.arc(p.x, p.y - fh, 2, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
        });

        // Draw horizontal rails
        for (let i = 0; i < obj.points.length - 1; i++) {
            const a = w2s(obj.points[i].x, obj.points[i].y);
            const b = w2s(obj.points[i + 1].x, obj.points[i + 1].y);
            ctx.strokeStyle = color;
            ctx.lineWidth = 1;
            // Top rail
            ctx.beginPath();
            ctx.moveTo(a.x, a.y - fh * 0.8);
            ctx.lineTo(b.x, b.y - fh * 0.8);
            ctx.stroke();
            // Bottom rail
            ctx.beginPath();
            ctx.moveTo(a.x, a.y + fh * 0.8);
            ctx.lineTo(b.x, b.y + fh * 0.8);
            ctx.stroke();
        }

        // Selection/hover
        if (isSel || isHov) {
            ctx.beginPath();
            ctx.moveTo(p0.x, p0.y);
            for (let i = 1; i < obj.points.length; i++) {
                const p = w2s(obj.points[i].x, obj.points[i].y);
                ctx.lineTo(p.x, p.y);
            }
            ctx.strokeStyle = isSel ? '#2563eb' : '#2563eb55';
            ctx.lineWidth = 3;
            ctx.setLineDash([5, 3]);
            ctx.stroke();
            ctx.setLineDash([]);

            // Vertex handles when selected
            if (isSel) {
                obj.points.forEach(pt => {
                    const p = w2s(pt.x, pt.y);
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
                    ctx.fillStyle = '#2563eb';
                    ctx.fill();
                    ctx.strokeStyle = '#fff';
                    ctx.lineWidth = 1.5;
                    ctx.stroke();
                });
            }
        }

        // Name label
        if (obj.points.length >= 2) {
            const mid = Math.floor(obj.points.length / 2);
            const mp = w2s(obj.points[mid].x, obj.points[mid].y);
            ctx.font = 'bold 11px sans-serif';
            ctx.fillStyle = color;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(obj.name || I18n.t('msg.defaultFence'), mp.x, mp.y - fh - 4);
        }
    }

    function drawPlacementPreview() {
        if (!placementPreview) return;
        const z = zoom();
        const pos = w2s(placementPreview.x, placementPreview.y);

        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.globalAlpha = 0.4;

        // Body
        ctx.fillStyle = placementPreview.color;
        ctx.strokeStyle = placementPreview.color;
        ctx.lineWidth = 1.5;
        traceShapePath(placementPreview, z, 0);
        ctx.fill();
        ctx.stroke();

        // Guy rope preview
        if (placementPreview.guyRopeDistance > 0) {
            ctx.setLineDash([4, 4]);
            ctx.strokeStyle = '#9ca3af';
            ctx.lineWidth = 1;
            traceShapePath(placementPreview, z, placementPreview.guyRopeDistance);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        ctx.globalAlpha = 0.7;
        const fontSize = Math.max(9, Math.min(13, z * 0.4));
        ctx.font = `600 ${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#1e293b';
        ctx.fillText(placementPreview.name, 0, 0);

        ctx.restore();
    }

    function drawPathPreview() {
        if (pathPreview.length === 0) return;
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = '#6366f188';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        const p0 = w2s(pathPreview[0].x, pathPreview[0].y);
        ctx.moveTo(p0.x, p0.y);
        for (let i = 1; i < pathPreview.length; i++) {
            const p = w2s(pathPreview[i].x, pathPreview[i].y);
            ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        pathPreview.forEach(pt => {
            const p = w2s(pt.x, pt.y);
            ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
            ctx.fillStyle = '#6366f188'; ctx.fill();
        });
    }

    function drawDragDistances() {
        dragDistances.forEach(d => {
            const p1 = w2s(d.x1, d.y1);
            const p2 = w2s(d.x2, d.y2);

            ctx.strokeStyle = d.color;
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 3]);
            ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
            ctx.setLineDash([]);

            const mx = (p1.x + p2.x) / 2;
            const my = (p1.y + p2.y) / 2;
            const text = d.dist.toFixed(2) + ' m';
            ctx.font = 'bold 11px sans-serif';
            const tw = ctx.measureText(text).width;
            ctx.fillStyle = 'rgba(255,255,255,0.85)';
            ctx.fillRect(mx - tw / 2 - 3, my - 8, tw + 6, 16);
            ctx.fillStyle = d.color;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, mx, my);
        });
    }

    function drawMeasureLine() {
        if (!measureLine) return;
        const p1 = w2s(measureLine.x1, measureLine.y1);
        const p2 = w2s(measureLine.x2, measureLine.y2);

        ctx.strokeStyle = '#6366f1';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
        ctx.setLineDash([]);

        [p1, p2].forEach(p => {
            ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
            ctx.fillStyle = '#6366f1'; ctx.fill();
        });

        const dist = Math.sqrt((measureLine.x2 - measureLine.x1) ** 2 + (measureLine.y2 - measureLine.y1) ** 2);
        const mx = (p1.x + p2.x) / 2;
        const my = (p1.y + p2.y) / 2;
        const text = dist.toFixed(2) + ' m';
        ctx.font = 'bold 12px sans-serif';
        const tw = ctx.measureText(text).width;
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillRect(mx - tw / 2 - 4, my - 18, tw + 8, 20);
        ctx.strokeStyle = '#6366f1';
        ctx.lineWidth = 1;
        ctx.strokeRect(mx - tw / 2 - 4, my - 18, tw + 8, 20);
        ctx.fillStyle = '#6366f1';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, mx, my - 8);
    }

    function drawSelectionRect() {
        if (!selectionRect) return;
        const p1 = w2s(selectionRect.x1, selectionRect.y1);
        const p2 = w2s(selectionRect.x2, selectionRect.y2);
        const x = Math.min(p1.x, p2.x), y = Math.min(p1.y, p2.y);
        const w = Math.abs(p2.x - p1.x), h = Math.abs(p2.y - p1.y);
        ctx.fillStyle = 'rgba(37, 99, 235, 0.08)';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash([]);
    }

    // Check if an object's bounding box overlaps a world-space rectangle
    function objInRect(obj, rx1, ry1, rx2, ry2) {
        const minX = Math.min(rx1, rx2), maxX = Math.max(rx1, rx2);
        const minY = Math.min(ry1, ry2), maxY = Math.max(ry1, ry2);
        if (obj.type === 'area' && obj.points && obj.points.length > 0) {
            return obj.points.some(p => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY);
        }
        if (obj.type === 'text') {
            return obj.x >= minX && obj.x <= maxX && obj.y >= minY && obj.y <= maxY;
        }
        const hw = (obj.width || 0) / 2, hh = (obj.height || 0) / 2;
        return (obj.x + hw >= minX && obj.x - hw <= maxX && obj.y + hh >= minY && obj.y - hh <= maxY);
    }

    // Compass image cache
    let _compassImg = null;
    let _compassLoading = false;
    function drawCompass() {
        const size = 120;
        const cx = 10;
        const cy = canvas.height - size - 10;

        if (!_compassImg && !_compassLoading) {
            _compassLoading = true;
            _compassImg = new Image();
            _compassImg.onload = () => render();
            _compassImg.src = 'img/compass.png';
            return;
        }
        if (!_compassImg || !_compassImg.complete) return;

        ctx.globalAlpha = 0.7;
        ctx.drawImage(_compassImg, cx, cy, size, size);
        ctx.globalAlpha = 1;
    }

    function drawScaleBar(site) {
        const z = zoom();
        const barMeters = z > 40 ? 1 : z > 15 ? 5 : z > 5 ? 10 : 50;
        const barPx = barMeters * z;
        const x = canvas.width - 20 - barPx;
        const y = canvas.height - 16;

        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y - 4); ctx.lineTo(x, y); ctx.lineTo(x + barPx, y); ctx.lineTo(x + barPx, y - 4);
        ctx.stroke();

        ctx.font = '10px sans-serif';
        ctx.fillStyle = '#64748b';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(barMeters + ' m', x + barPx / 2, y - 5);
    }

    // --- Geometry helpers ---

    // Get world-space corners of object body (no guy rope)
    function getObjCorners(obj, includeRope) {
        const pad = includeRope ? obj.guyRopeDistance : 0;
        const localPts = getLocalShapePath(obj, pad);
        const rad = obj.rotation * Math.PI / 180;
        const cos = Math.cos(rad), sin = Math.sin(rad);
        return localPts.map(p => ({
            x: obj.x + p.x * cos - p.y * sin,
            y: obj.y + p.x * sin + p.y * cos,
        }));
    }

    function pointInObj(px, py, obj) {
        // Area: point in polygon
        if (obj.type === 'area' && obj.points && obj.points.length >= 3) {
            return pointInPolygon(px, py, obj.points);
        }
        // Fence: proximity to any segment
        if (obj.type === 'fence' && obj.points && obj.points.length >= 2) {
            const threshold = 1.0; // 1 meter hit zone
            for (let i = 0; i < obj.points.length - 1; i++) {
                const d = pointToSegDist(px, py, obj.points[i], obj.points[i + 1]);
                if (d < threshold) return true;
            }
            return false;
        }
        // Text: simple bounding box
        if (obj.type === 'text') {
            const fs = obj.fontSize || 1;
            const hw = fs * 3; // approximate
            const hh = fs * 0.7;
            const dx = px - obj.x, dy = py - obj.y;
            return Math.abs(dx) <= hw && Math.abs(dy) <= hh;
        }

        const dx = px - obj.x, dy = py - obj.y;
        const rad = -obj.rotation * Math.PI / 180;
        const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
        const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
        const hw = obj.width / 2, hh = obj.height / 2;

        const sides = getShapeSides(obj.shape);
        if (sides >= 3) {
            const pts = regularPolygonPoints(sides).map(p => ({ x: p.x * hw, y: p.y * hh }));
            return pointInPolygon(lx, ly, pts);
        }
        if (obj.shape === 'circle') {
            return (lx * lx / (hw * hw) + ly * ly / (hh * hh)) <= 1;
        }
        return Math.abs(lx) <= hw && Math.abs(ly) <= hh;
    }

    function pointToSegDist(px, py, a, b) {
        const dx = b.x - a.x, dy = b.y - a.y;
        const len2 = dx * dx + dy * dy;
        if (len2 === 0) return Math.sqrt((px - a.x) ** 2 + (py - a.y) ** 2);
        let t = ((px - a.x) * dx + (py - a.y) * dy) / len2;
        t = Math.max(0, Math.min(1, t));
        const proj = { x: a.x + t * dx, y: a.y + t * dy };
        return Math.sqrt((px - proj.x) ** 2 + (py - proj.y) ** 2);
    }

    function pointInPolygon(px, py, pts) {
        let inside = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
            const xi = pts[i].x, yi = pts[i].y;
            const xj = pts[j].x, yj = pts[j].y;
            if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
                inside = !inside;
            }
        }
        return inside;
    }

    function pointOnRotHandle(px, py, obj) {
        const z = zoom();
        // Handle is at local (0, -h/2 - 28px) → convert 28px to meters
        const localY = -(obj.height / 2 + 28 / z);
        const rad = obj.rotation * Math.PI / 180;
        // Rotate local point (0, localY) to world
        const hx = obj.x + 0 * Math.cos(rad) - localY * Math.sin(rad);
        const hy = obj.y + 0 * Math.sin(rad) + localY * Math.cos(rad);
        const d = Math.sqrt((px - hx) ** 2 + (py - hy) ** 2);
        return d < 10 / z;
    }

    // Segment-to-segment distance
    function segDist(a, b, c, d) {
        function dot(u, v) { return u.x * v.x + u.y * v.y; }
        function sub(u, v) { return { x: u.x - v.x, y: u.y - v.y }; }
        function len(u) { return Math.sqrt(u.x * u.x + u.y * u.y); }
        function clamp01(t) { return Math.max(0, Math.min(1, t)); }

        const u = sub(b, a), v = sub(d, c), w = sub(a, c);
        const uu = dot(u, u), uv = dot(u, v), vv = dot(v, v);
        const uw = dot(u, w), vw = dot(v, w);
        const denom = uu * vv - uv * uv;

        let s, t;
        if (denom < 1e-10) {
            s = 0; t = uw / (uv || 1);
        } else {
            s = (uv * vw - vv * uw) / denom;
            t = (uu * vw - uv * uw) / denom;
        }
        s = clamp01(s); t = clamp01(t);
        t = clamp01((uv * s + vw) / (vv || 1));
        s = clamp01((uv * t - uw) / (uu || 1));

        const closest1 = { x: a.x + s * u.x, y: a.y + s * u.y };
        const closest2 = { x: c.x + t * v.x, y: c.y + t * v.y };
        return { dist: len(sub(closest1, closest2)), p1: closest1, p2: closest2 };
    }

    // Distance between object BODIES (not guy ropes)
    function objDistance(obj1, obj2) {
        const c1 = getObjCorners(obj1, false);
        const c2 = getObjCorners(obj2, false);
        const n1 = c1.length, n2 = c2.length;

        let minDist = Infinity, bestP1 = null, bestP2 = null;

        for (let i = 0; i < n1; i++) {
            for (let j = 0; j < n2; j++) {
                const r = segDist(c1[i], c1[(i + 1) % n1], c2[j], c2[(j + 1) % n2]);
                if (r.dist < minDist) {
                    minDist = r.dist;
                    bestP1 = r.p1;
                    bestP2 = r.p2;
                }
            }
        }

        // Check for overlap
        if (pointInObj(obj1.x, obj1.y, obj2) || pointInObj(obj2.x, obj2.y, obj1)) {
            minDist = 0;
        }

        return { dist: minDist, p1: bestP1, p2: bestP2 };
    }

    function computeDistancesForObj(objId) {
        const site = State.activeSite;
        if (!site) return [];
        const obj = site.objects.find(o => o.id === objId);
        if (!obj) return [];
        const results = [];
        const minD = State.minDistance;

        site.objects.forEach(other => {
            if (other.id === obj.id) return;
            const r = objDistance(obj, other);
            if (r.dist < minD * 2 && r.p1 && r.p2) {
                let color;
                if (r.dist < minD) color = '#ef4444';
                else if (r.dist < minD * 1.5) color = '#f59e0b';
                else color = '#22c55e';
                results.push({
                    dist: r.dist, color,
                    x1: r.p1.x, y1: r.p1.y,
                    x2: r.p2.x, y2: r.p2.y,
                });
            }
        });
        return results;
    }

    // Snap object position so that its EDGE aligns with the grid (not center)
    function snapObjToGrid(obj, worldX, worldY, gridSize) {
        // Compute the bounding half-sizes for the object
        const hw = obj.width / 2;
        const hh = obj.height / 2;
        // Snap the left/top edge to grid, then compute center from that
        const leftEdge = worldX - hw;
        const topEdge = worldY - hh;
        const snappedLeft = Math.round(leftEdge / gridSize) * gridSize;
        const snappedTop = Math.round(topEdge / gridSize) * gridSize;
        return {
            x: snappedLeft + hw,
            y: snappedTop + hh,
        };
    }

    return {
        init, render, resize, w2s, s2w, zoom, snapToGrid, snapObjToGrid,
        pointInObj, pointOnRotHandle, computeDistancesForObj,
        getLocalShapePath, getShapeSides,
        get canvas() { return canvas; },
        get selectedIds() { return selectedIds; },
        // Compat: single selectedId getter/setter
        get selectedId() { return selectedIds.size === 1 ? [...selectedIds][0] : (selectedIds.size > 0 ? [...selectedIds][0] : null); },
        set selectedId(id) { selectedIds.clear(); if (id) selectedIds.add(id); },
        selectMultiple(ids) { selectedIds.clear(); ids.forEach(id => selectedIds.add(id)); },
        addToSelection(id) { selectedIds.add(id); },
        removeFromSelection(id) { selectedIds.delete(id); },
        toggleSelection(id) { if (selectedIds.has(id)) selectedIds.delete(id); else selectedIds.add(id); },
        clearSelection() { selectedIds.clear(); },
        isSelected(id) { return selectedIds.has(id); },
        get selectionCount() { return selectedIds.size; },
        get selectionRect() { return selectionRect; },
        set selectionRect(r) { selectionRect = r; },
        objInRect,
        get hoveredId() { return hoveredId; },
        set hoveredId(id) { hoveredId = id; },
        get dragDistances() { return dragDistances; },
        set dragDistances(d) { dragDistances = d; },
        get measureLine() { return measureLine; },
        set measureLine(l) { measureLine = l; },
        get groundPreview() { return groundPreview; },
        set groundPreview(p) { groundPreview = p; },
        get highlightGroundVertex() { return highlightGroundVertex; },
        set highlightGroundVertex(v) { highlightGroundVertex = v; },
        get placementPreview() { return placementPreview; },
        set placementPreview(p) { placementPreview = p; },
        get pathPreview() { return pathPreview; },
        set pathPreview(p) { pathPreview = p; },
        polygonArea,
        AREA_TEXTURES,
    };
})();
