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
    let highlightGroundVertex = null; // {gi, vi} or null
    // selectedGroundIndex removed - grounds are now regular objects
    let placementPreview = null;
    let pathPreview = []; // for path/area drawing
    let _treasureMode = false; // treasure map rendering mode

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
            case 'decagon': return 10;
            case 'dodecagon': return 12;
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
        if (activeSite.mapLayer && activeSite.mapLayer.enabled && typeof MapTiles !== 'undefined') {
            MapTiles.drawMapTiles(ctx, canvas, activeSite, w2s, s2w, zoom);
        }
        drawBgImages(activeSite);
        drawGrid(activeSite);

        // Draw only the active site
        drawGround(activeSite);
        drawObjects(activeSite);

        // Permanent distances
        if (State.showDistances) {
            activeSite.objects.forEach(obj => {
                if (obj.type === 'ground' || obj.type === 'bgimage' || obj.type === 'guideline' || obj.type === 'symbol') return;
                computeDistancesForObj(obj.id).forEach(d => {
                    const p1 = w2s(d.x1, d.y1), p2 = w2s(d.x2, d.y2);
                    ctx.strokeStyle = d.color; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
                    ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
                    ctx.setLineDash([]);
                    const text = d.dist.toFixed(1) + ' m';
                    ctx.font = 'bold 10px sans-serif';
                    const tw = ctx.measureText(text).width;
                    const mx = (p1.x+p2.x)/2, my = (p1.y+p2.y)/2;
                    ctx.fillStyle = 'rgba(255,255,255,0.8)';
                    ctx.fillRect(mx-tw/2-2, my-7, tw+4, 14);
                    ctx.fillStyle = d.color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.fillText(text, mx, my);
                });
            });
        }

        // Active site overlays
        drawGroundPreview();
        drawPlacementPreview();
        drawPathPreview();
        drawDragDistances();
        drawMeasureLine();
        drawSelectionRect();
        drawGroupRotHandle(activeSite);
        drawSiteLabel(activeSite);
        drawScaleBar(activeSite);
        drawCompass();
        drawMinimap(activeSite);
    }

    // --- Minimap ---
    let _minimapEnabled = true;
    const MINIMAP_W = 160, MINIMAP_H = 110, MINIMAP_PAD = 8;
    let _minimapX = -1, _minimapY = -1; // -1 = default position

    function drawMinimap(site) {
        if (!_minimapEnabled) return;
        const bounds = State.getSiteContentBounds(site);
        if (!bounds) return;

        const mx = _minimapX >= 0 ? _minimapX : canvas.width - MINIMAP_W - MINIMAP_PAD;
        const my = _minimapY >= 0 ? _minimapY : MINIMAP_PAD;

        // Background
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1;
        ctx.fillRect(mx, my, MINIMAP_W, MINIMAP_H);
        ctx.strokeRect(mx, my, MINIMAP_W, MINIMAP_H);
        // Drag handle bar
        ctx.fillStyle = '#e2e6ea';
        ctx.fillRect(mx, my, MINIMAP_W, 10);
        ctx.fillStyle = '#aaa';
        ctx.fillRect(mx + MINIMAP_W/2 - 12, my + 3, 24, 2);
        ctx.fillRect(mx + MINIMAP_W/2 - 12, my + 6, 24, 2);

        // Scale to fit content
        const pad = 5;
        const scaleX = (MINIMAP_W - pad * 2) / bounds.width;
        const scaleY = (MINIMAP_H - pad * 2) / bounds.height;
        const sc = Math.min(scaleX, scaleY);

        function mp(wx, wy) {
            return {
                x: mx + pad + (wx - bounds.minX) * sc,
                y: my + pad + (wy - bounds.minY) * sc
            };
        }

        // Draw ground areas
        site.objects.forEach(obj => {
            if (obj.type === 'ground' && obj.points && obj.points.length >= 3) {
                ctx.beginPath();
                const p0 = mp(obj.points[0].x, obj.points[0].y);
                ctx.moveTo(p0.x, p0.y);
                obj.points.forEach((pt, i) => { if (i > 0) { const p = mp(pt.x, pt.y); ctx.lineTo(p.x, p.y); } });
                ctx.closePath();
                ctx.fillStyle = 'rgba(34,197,94,0.15)';
                ctx.fill();
                ctx.strokeStyle = '#22c55e';
                ctx.lineWidth = 0.5;
                ctx.stroke();
            }
        });

        // Draw areas as filled polygons
        site.objects.forEach(obj => {
            if (obj.type === 'area' && obj.points && obj.points.length >= 3) {
                ctx.beginPath();
                const ap0 = mp(obj.points[0].x, obj.points[0].y);
                ctx.moveTo(ap0.x, ap0.y);
                obj.points.forEach((pt, i) => { if (i > 0) { const p = mp(pt.x, pt.y); ctx.lineTo(p.x, p.y); } });
                ctx.closePath();
                ctx.fillStyle = (obj.color || '#d4a574') + '30';
                ctx.fill();
                ctx.strokeStyle = obj.color || '#d4a574';
                ctx.lineWidth = 0.5;
                ctx.stroke();
            }
        });

        // Draw other objects as dots
        site.objects.forEach(obj => {
            if (obj.type === 'bgimage' || obj.type === 'guideline' || obj.type === 'ground' || obj.type === 'area') return;
            const p = mp(obj.x, obj.y);
            const r = Math.max(1.5, Math.min(4, (obj.width || 1) * sc * 0.4));
            ctx.fillStyle = obj.color || '#666';
            ctx.globalAlpha = 0.7;
            ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
        });
        ctx.globalAlpha = 1;

        // Draw viewport rectangle
        const tl = s2w(0, 0);
        const br = s2w(canvas.width, canvas.height);
        const vtl = mp(tl.x, tl.y);
        const vbr = mp(br.x, br.y);
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(
            Math.max(mx, vtl.x), Math.max(my, vtl.y),
            Math.min(MINIMAP_W, vbr.x - vtl.x), Math.min(MINIMAP_H, vbr.y - vtl.y)
        );
    }

    // Minimap drag state
    let _minimapDrag = null;

    function minimapHit(screenX, screenY) {
        const mx = _minimapX >= 0 ? _minimapX : canvas.width - MINIMAP_W - MINIMAP_PAD;
        const my = _minimapY >= 0 ? _minimapY : MINIMAP_PAD;
        return screenX >= mx && screenX <= mx + MINIMAP_W && screenY >= my && screenY <= my + MINIMAP_H;
    }

    function minimapStartDrag(screenX, screenY) {
        if (!_minimapEnabled) return false;
        const mx = _minimapX >= 0 ? _minimapX : canvas.width - MINIMAP_W - MINIMAP_PAD;
        const my = _minimapY >= 0 ? _minimapY : MINIMAP_PAD;
        // Check if clicking the top 12px (title bar area) for dragging
        if (screenX >= mx && screenX <= mx + MINIMAP_W && screenY >= my && screenY <= my + 12) {
            _minimapDrag = { offX: screenX - mx, offY: screenY - my };
            return true;
        }
        return false;
    }

    function minimapMoveDrag(screenX, screenY) {
        if (!_minimapDrag) return false;
        _minimapX = Math.max(0, Math.min(canvas.width - MINIMAP_W, screenX - _minimapDrag.offX));
        _minimapY = Math.max(0, Math.min(canvas.height - MINIMAP_H, screenY - _minimapDrag.offY));
        render();
        return true;
    }

    function minimapEndDrag() {
        if (_minimapDrag) { _minimapDrag = null; return true; }
        return false;
    }

    // Minimap click handler - called from tools.js
    function minimapClick(screenX, screenY) {
        if (!_minimapEnabled) return false;
        if (_minimapDrag) return false;
        const mx = _minimapX >= 0 ? _minimapX : canvas.width - MINIMAP_W - MINIMAP_PAD;
        const my = _minimapY >= 0 ? _minimapY : MINIMAP_PAD;
        if (screenX < mx || screenX > mx + MINIMAP_W || screenY < my || screenY > my + MINIMAP_H) return false;

        const site = State.activeSite;
        if (!site) return false;
        const bounds = State.getSiteContentBounds(site);
        if (!bounds) return false;

        const pad = 5;
        const scaleX = (MINIMAP_W - pad * 2) / bounds.width;
        const scaleY = (MINIMAP_H - pad * 2) / bounds.height;
        const sc = Math.min(scaleX, scaleY);

        const worldX = bounds.minX + (screenX - mx - pad) / sc;
        const worldY = bounds.minY + (screenY - my - pad) / sc;

        site.view.panX = -worldX;
        site.view.panY = -worldY;
        render();
        return true;
    }

    function drawSiteLabel(site) {
        // Empty site placeholder - prominent call to action
        const bounds = State.getSiteContentBounds(site);
        if (!bounds) {
            const cp = w2s(0, 0);
            // Large dashed box
            ctx.strokeStyle = '#cbd5e1';
            ctx.lineWidth = 2;
            ctx.setLineDash([12, 6]);
            ctx.strokeRect(cp.x - 120, cp.y - 60, 240, 120);
            ctx.setLineDash([]);
            // Main text
            ctx.font = 'bold 20px sans-serif';
            ctx.fillStyle = '#64748b';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(I18n.t('canvas.drawGround'), cp.x, cp.y - 12);
            // Hint text
            ctx.font = '13px sans-serif';
            ctx.fillStyle = '#94a3b8';
            ctx.fillText('Press  G  or use the ground tool', cp.x, cp.y + 16);
        }

        // Small site name top-left
        ctx.font = '600 7px sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(site.name, 8, 6);
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
    function loadBgImage(dataUrl) {
        if (_bgImageCache[dataUrl]) return _bgImageCache[dataUrl];
        const img = new Image();
        img.src = dataUrl;
        img.onload = () => { _bgImageCache[dataUrl] = img; render(); };
        return null;
    }

    function isLayerVisible(site, layerId) {
        if (!layerId || !site.layers) return true;
        const layer = site.layers.find(l => l.id === layerId);
        return !layer || layer.visible;
    }

    function getLayerOpacity(site, layerId) {
        if (!layerId || !site.layers) return 1;
        const layer = site.layers.find(l => l.id === layerId);
        return (layer && layer.opacity !== undefined) ? layer.opacity : 1;
    }

    function drawBgImages(site) {
        site.objects.forEach(obj => {
            if (obj.type !== 'bgimage' || !obj.dataUrl) return;
            if (!isLayerVisible(site, obj.layerId)) return;
            drawBgImageObj(obj);
        });
    }

    function drawBgImageObj(obj) {
        const img = loadBgImage(obj.dataUrl);
        if (!img) return;
        const z = zoom();
        const pos = w2s(obj.x, obj.y);
        const w = obj.width * z;
        const h = obj.height * z;
        const isSel = selectedIds.has(obj.id);
        const isHov = obj.id === hoveredId;

        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.rotate((obj.rotation || 0) * Math.PI / 180);
        ctx.globalAlpha = obj.opacity || 0.3;
        ctx.drawImage(img, -w / 2, -h / 2, w, h);
        ctx.globalAlpha = 1;

        if (isSel) {
            ctx.strokeStyle = '#2563eb';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 3]);
            ctx.strokeRect(-w / 2 - 2, -h / 2 - 2, w + 4, h + 4);
            ctx.setLineDash([]);

            // Resize handles at corners
            const hs = 5;
            [[-1,-1],[1,-1],[1,1],[-1,1]].forEach(([cx, cy]) => {
                const hx = cx * w / 2, hy = cy * h / 2;
                ctx.fillStyle = '#fff';
                ctx.fillRect(hx - hs, hy - hs, hs * 2, hs * 2);
                ctx.strokeStyle = '#2563eb';
                ctx.lineWidth = 1.5;
                ctx.strokeRect(hx - hs, hy - hs, hs * 2, hs * 2);
            });

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
            ctx.strokeRect(-w / 2 - 1, -h / 2 - 1, w + 2, h + 2);
            ctx.setLineDash([]);
        }
        ctx.restore();
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

    // Weighted area centroid of polygon (more accurate than simple average)
    function polygonCentroid(pts) {
        let cx = 0, cy = 0, a = 0;
        for (let i = 0; i < pts.length; i++) {
            const j = (i + 1) % pts.length;
            const cross = pts[i].x * pts[j].y - pts[j].x * pts[i].y;
            cx += (pts[i].x + pts[j].x) * cross;
            cy += (pts[i].y + pts[j].y) * cross;
            a += cross;
        }
        if (Math.abs(a) < 1e-10) {
            // Degenerate: fall back to simple average
            let sx = 0, sy = 0;
            pts.forEach(p => { sx += p.x; sy += p.y; });
            return { x: sx / pts.length, y: sy / pts.length };
        }
        a /= 2;
        cx /= (6 * a);
        cy /= (6 * a);
        // If centroid is outside polygon, find nearest interior point
        if (!pointInPolygon(cx, cy, pts)) {
            // Try midpoints of edges, pick the one closest to centroid that's inside
            let best = null, bestD = Infinity;
            for (let i = 0; i < pts.length; i++) {
                const j = (i + 1) % pts.length;
                const mx = (pts[i].x + pts[j].x) / 2;
                const my = (pts[i].y + pts[j].y) / 2;
                // Nudge toward centroid
                const nx = mx * 0.7 + cx * 0.3;
                const ny = my * 0.7 + cy * 0.3;
                if (pointInPolygon(nx, ny, pts)) {
                    const d = (nx - cx) ** 2 + (ny - cy) ** 2;
                    if (d < bestD) { bestD = d; best = { x: nx, y: ny }; }
                }
            }
            if (best) return best;
            // Last resort: simple average
            let sx = 0, sy = 0;
            pts.forEach(p => { sx += p.x; sy += p.y; });
            return { x: sx / pts.length, y: sy / pts.length };
        }
        return { x: cx, y: cy };
    }

    function drawGround(site) {
        // Draw ground-type objects (rendered before other objects)
        site.objects.forEach(obj => {
            if (obj.type !== 'ground' || !obj.points || obj.points.length < 2) return;
            if (!isLayerVisible(site, obj.layerId)) return;
            const pts = obj.points;
            const isSel = selectedIds.has(obj.id);
            const isHov = obj.id === hoveredId;
            const color = obj.color || '#22c55e';
            const darkColor = color.replace(/[0-9a-f]{2}/gi, (m) => {
                return Math.max(0, parseInt(m, 16) - 40).toString(16).padStart(2, '0');
            });

            const screenPts = pts.map(pt => w2s(pt.x, pt.y));
            const p0 = screenPts[0];
            if (_treasureMode) {
                // Wobbly ground outline
                ctx.beginPath();
                ctx.moveTo(p0.x, p0.y);
                for (let i = 0; i < screenPts.length; i++) {
                    const a = screenPts[i], b = screenPts[(i + 1) % screenPts.length];
                    const dx = b.x - a.x, dy = b.y - a.y;
                    const len = Math.sqrt(dx*dx + dy*dy);
                    if (len < 1) continue;
                    const nx = -dy/len, ny = dx/len;
                    const steps = Math.max(4, Math.floor(len / 8));
                    for (let j = 1; j <= steps; j++) {
                        const t = j / steps;
                        const wobble = (Math.sin(j * 2.3 + a.x * 0.05) + Math.cos(j * 1.7 + a.y * 0.05)) * 1.5;
                        ctx.lineTo(a.x + dx*t + nx*wobble, a.y + dy*t + ny*wobble);
                    }
                }
                ctx.closePath();
                ctx.fillStyle = 'rgba(61,43,31,0.04)';
                ctx.fill();
                ctx.strokeStyle = '#3d2b1f';
            } else {
                ctx.beginPath();
                ctx.moveTo(p0.x, p0.y);
                for (let i = 1; i < screenPts.length; i++) ctx.lineTo(screenPts[i].x, screenPts[i].y);
                if (pts.length >= 3) {
                    ctx.closePath();
                    ctx.fillStyle = color + '14';
                    ctx.fill();
                }
                ctx.strokeStyle = isSel ? '#2563eb' : color;
            }
            ctx.lineWidth = isSel ? 3 : 2;
            if (isSel) { ctx.setLineDash([6, 3]); }
            ctx.stroke();
            if (isSel) { ctx.setLineDash([]); }

            // Vertices + rotation handle (when selected)
            if (isSel) {
                pts.forEach(pt => {
                    const p = w2s(pt.x, pt.y);
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
                    ctx.fillStyle = '#2563eb';
                    ctx.fill();
                    ctx.strokeStyle = '#fff';
                    ctx.lineWidth = 1.5;
                    ctx.stroke();
                });
                // Rotation handle above topmost point
                let minYpt = screenPts[0];
                screenPts.forEach(p => { if (p.y < minYpt.y) minYpt = p; });
                const rhY = minYpt.y - 28;
                ctx.strokeStyle = '#2563eb'; ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.moveTo(minYpt.x, minYpt.y - 4); ctx.lineTo(minYpt.x, rhY); ctx.stroke();
                ctx.beginPath(); ctx.arc(minYpt.x, rhY, 5, 0, Math.PI * 2);
                ctx.fillStyle = '#2563eb'; ctx.fill();
                ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
            } else if (isHov) {
                ctx.strokeStyle = '#2563eb55';
                ctx.lineWidth = 2;
                ctx.setLineDash([4, 3]);
                ctx.beginPath();
                ctx.moveTo(p0.x, p0.y);
                for (let i = 1; i < pts.length; i++) { const p = w2s(pts[i].x, pts[i].y); ctx.lineTo(p.x, p.y); }
                ctx.closePath(); ctx.stroke();
                ctx.setLineDash([]);
            }

            // Edge lengths (skip in treasure mode)
            if (!_treasureMode) {
                ctx.font = '10px sans-serif';
                ctx.fillStyle = darkColor;
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
            }

            // Area + name display
            if (pts.length >= 3) {
                const center = polygonCentroid(pts);
                const cp = w2s(center.x, center.y);
                const glox = (obj.labelOffsetX || 0) * zoom();
                const gloy = (obj.labelOffsetY || 0) * zoom();
                if (_treasureMode) {
                    if (obj.name) {
                        ctx.font = "14px 'PirateFont', 'Georgia', serif";
                        ctx.fillStyle = '#2a1a0a';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(obj.name, cp.x + glox, cp.y + gloy);
                    }
                } else {
                    const area = polygonArea(pts);
                    const gfs = obj.labelSize ? Math.round(12 * obj.labelSize) : 12;
                    ctx.font = `bold ${gfs}px sans-serif`;
                    ctx.fillStyle = darkColor;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    const lockIcon = obj.locked ? ' \u{1F512}' : '';
                    ctx.fillText(area.toFixed(1) + ' m\u00b2' + lockIcon, cp.x + glox, cp.y + gloy);
                    if (obj.name) {
                        ctx.font = `${Math.round(gfs * 0.8)}px sans-serif`;
                        ctx.fillText(obj.name, cp.x + glox, cp.y + gloy + gfs + 2);
                    }
                }
            }
        });
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

        // --- Background image and ground (rendered separately) ---
        if (obj.type === 'bgimage' || obj.type === 'ground') return;

        // Treasure mode: skip symbols, post-its, guidelines
        if (_treasureMode && (obj.type === 'symbol' || obj.type === 'postit' || obj.type === 'guideline')) return;

        // --- Post-it ---
        if (obj.type === 'postit') {
            const pos = w2s(obj.x, obj.y);
            const w = obj.width * z, h = obj.height * z;
            ctx.save();
            ctx.translate(pos.x, pos.y);
            ctx.rotate((obj.rotation || 0) * Math.PI / 180);
            // Shadow
            ctx.shadowColor = 'rgba(0,0,0,0.15)';
            ctx.shadowBlur = 6;
            ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 2;
            // Paper
            ctx.fillStyle = obj.color || '#fef08a';
            ctx.fillRect(-w/2, -h/2, w, h);
            ctx.shadowColor = 'transparent';
            // Fold corner
            ctx.fillStyle = 'rgba(0,0,0,0.08)';
            ctx.beginPath();
            ctx.moveTo(w/2 - w*0.2, h/2);
            ctx.lineTo(w/2, h/2 - h*0.2);
            ctx.lineTo(w/2, h/2);
            ctx.closePath();
            ctx.fill();
            // Text
            const fs = Math.max(7, Math.min(11, z * 0.35));
            ctx.font = `${fs}px sans-serif`;
            ctx.fillStyle = '#333';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            const lines = (obj.text || obj.name || '').split('\n');
            let ty = -h/2 + 4;
            lines.forEach(line => {
                if (ty < h/2 - 4) ctx.fillText(line, -w/2 + 4, ty, w - 8);
                ty += fs + 2;
            });
            // Selection
            if (isSel) {
                ctx.strokeStyle = '#2563eb'; ctx.lineWidth = 2; ctx.setLineDash([5, 3]);
                ctx.strokeRect(-w/2-2, -h/2-2, w+4, h+4); ctx.setLineDash([]);
            } else if (isHov) {
                ctx.strokeStyle = '#2563eb55'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
                ctx.strokeRect(-w/2-1, -h/2-1, w+2, h+2); ctx.setLineDash([]);
            }
            ctx.restore();
            ctx.globalAlpha = 1;
            return;
        }

        // --- Symbol ---
        if (obj.type === 'symbol') {
            drawSymbol(obj, z, isSel, isHov);
            ctx.globalAlpha = 1;
            return;
        }

        // Skip objects on hidden layers
        if (obj.layerId) {
            const site = State.activeSite;
            if (site && site.layers) {
                const layer = site.layers.find(l => l.id === obj.layerId);
                if (layer && !layer.visible) return;
            }
        }

        // Apply layer + object opacity
        const layerOp = getLayerOpacity(State.activeSite, obj.layerId);
        const objOp = obj.objectOpacity !== undefined ? obj.objectOpacity : 1;
        const combinedOp = layerOp * objOp;
        if (combinedOp < 1) ctx.globalAlpha = combinedOp;

        // --- Area annotation ---
        if (obj.type === 'area' && obj.points && obj.points.length >= 3) {
            drawArea(obj, z, isSel, isHov);
            ctx.globalAlpha = 1;
            return;
        }
        // --- Guideline ---
        if (obj.type === 'guideline' && obj.points && obj.points.length === 2) {
            drawGuideline(obj, z, isSel, isHov);
            ctx.globalAlpha = 1;
            return;
        }
        // --- Fence ---
        if (obj.type === 'fence' && obj.points && obj.points.length >= 2) {
            drawFence(obj, z, isSel, isHov);
            ctx.globalAlpha = 1;
            return;
        }
        // --- Text ---
        if (obj.type === 'text') {
            drawTextField(obj, z, isSel, isHov);
            ctx.globalAlpha = 1;
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

        // Guy ropes (skip in treasure mode)
        if (_treasureMode && obj.guyRopeDistance > 0) { /* skip */ }
        else
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
        if (_treasureMode) {
            // Treasure: wobbly outlines only, no fill, thicker stroke
            ctx.strokeStyle = '#3d2b1f';
            ctx.lineWidth = 2;
            const amp = Math.max(0.5, Math.min(w, h) * 0.015);
            const sides = getShapeSides(obj.shape);
            if (obj.shape === 'circle') {
                ctx.beginPath();
                for (let i = 0; i <= 20; i++) {
                    const a = (i / 20) * Math.PI * 2;
                    const r = w / 2 + Math.sin(a * 5 + obj.x) * amp;
                    if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
                    else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
                }
                ctx.closePath();
            } else if (sides >= 3) {
                ctx.beginPath();
                const pts = [];
                for (let i = 0; i < sides; i++) {
                    const a = (i / sides) * Math.PI * 2 - Math.PI / 2;
                    pts.push({ x: Math.cos(a) * w / 2, y: Math.sin(a) * h / 2 });
                }
                for (let i = 0; i < pts.length; i++) {
                    const a = pts[i], b = pts[(i + 1) % pts.length];
                    const dx = b.x - a.x, dy = b.y - a.y, len = Math.sqrt(dx*dx+dy*dy);
                    const nx = -dy/len, ny = dx/len;
                    const steps = Math.max(3, Math.floor(len / 5));
                    if (i === 0) ctx.moveTo(a.x, a.y);
                    for (let j = 1; j <= steps; j++) {
                        const t = j / steps;
                        const wobble = Math.sin(j * 2.7 + a.x * 0.1) * amp;
                        ctx.lineTo(a.x + dx*t + nx*wobble, a.y + dy*t + ny*wobble);
                    }
                }
                ctx.closePath();
            } else {
                // Wobbly rect
                ctx.beginPath();
                const hw = w/2, hh = h/2;
                function wline(x1,y1,x2,y2) {
                    const ddx=x2-x1,ddy=y2-y1,len=Math.sqrt(ddx*ddx+ddy*ddy);
                    const nnx=-ddy/len,nny=ddx/len;
                    const st=Math.max(3,Math.floor(len/5));
                    for(let j=1;j<=st;j++){
                        const t=j/st;
                        const wb=Math.sin(j*2.7+x1*0.1)*amp;
                        ctx.lineTo(x1+ddx*t+nnx*wb,y1+ddy*t+nny*wb);
                    }
                }
                ctx.moveTo(-hw,-hh);
                wline(-hw,-hh,hw,-hh);
                wline(hw,-hh,hw,hh);
                wline(hw,hh,-hw,hh);
                wline(-hw,hh,-hw,-hh);
                ctx.closePath();
            }
            ctx.fillStyle = 'rgba(61,43,31,0.06)';
            ctx.fill();
            ctx.stroke();
        } else {
            const alpha = '99';
            ctx.fillStyle = obj.color + alpha;
            ctx.strokeStyle = obj.color;
            ctx.lineWidth = 1.5 * ls;
            traceShapePath(obj, z, 0);
            ctx.fill();
            ctx.stroke();
        }

        // Tent center line (skip in treasure mode)
        if (!_treasureMode && obj.type === 'tent' && obj.shape === 'rect') {
            ctx.strokeStyle = obj.color;
            ctx.globalAlpha = 0.4;
            ctx.lineWidth = 0.8 * ls;
            ctx.beginPath();
            ctx.moveTo(0, -h / 2); ctx.lineTo(0, h / 2);
            ctx.stroke();
            ctx.globalAlpha = 1;
        }

        // Entrance marker (skip in treasure mode)
        if (!_treasureMode && obj.entranceSide && obj.entranceSide !== 'none') {
            const es = obj.entranceSide;
            const ew = Math.min(w, h) * 0.4;
            const eh = Math.max(8, Math.min(w, h) * 0.12);
            ctx.fillStyle = '#16a34a';
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            if (es === 'top') {
                ctx.moveTo(-ew/2, -h/2); ctx.lineTo(0, -h/2 - eh); ctx.lineTo(ew/2, -h/2);
            } else if (es === 'bottom') {
                ctx.moveTo(-ew/2, h/2); ctx.lineTo(0, h/2 + eh); ctx.lineTo(ew/2, h/2);
            } else if (es === 'left') {
                ctx.moveTo(-w/2, -ew/2); ctx.lineTo(-w/2 - eh, 0); ctx.lineTo(-w/2, ew/2);
            } else if (es === 'right') {
                ctx.moveTo(w/2, -ew/2); ctx.lineTo(w/2 + eh, 0); ctx.lineTo(w/2, ew/2);
            }
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            // Opening gap (white line on the tent wall)
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            if (es === 'top') { ctx.moveTo(-ew/2 + 1, -h/2); ctx.lineTo(ew/2 - 1, -h/2); }
            else if (es === 'bottom') { ctx.moveTo(-ew/2 + 1, h/2); ctx.lineTo(ew/2 - 1, h/2); }
            else if (es === 'left') { ctx.moveTo(-w/2, -ew/2 + 1); ctx.lineTo(-w/2, ew/2 - 1); }
            else if (es === 'right') { ctx.moveTo(w/2, -ew/2 + 1); ctx.lineTo(w/2, ew/2 - 1); }
            ctx.stroke();
        }

        // Name/description rendered AFTER ctx.restore() so they don't rotate
        // Store values needed for post-restore rendering
        const _labelFs = Math.max(9, Math.min(13, z * 0.4)) * fs;
        const _labelName = obj.name || '';
        const _labelFitsInside = _labelName ? (ctx.measureText(_labelName).width < (w - 4) && _labelFs < h * 0.5) : true;

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
        ctx.globalAlpha = 1;

        // Name label (rendered after restore = always horizontal)
        const lox = (obj.labelOffsetX || 0) * z;
        const loy = (obj.labelOffsetY || 0) * z;
        if (_treasureMode) {
            const tfs = Math.max(10, Math.min(16, z * 0.5)) * fs;
            ctx.font = `${tfs}px 'PirateFont', 'Georgia', serif`;
            ctx.fillStyle = '#2a1a0a';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const nameLines = (obj.name || '').split('\n');
            let ny = pos.y + loy - (nameLines.length - 1) * tfs * 0.55;
            nameLines.forEach(line => { ctx.fillText(line, pos.x + lox, ny); ny += tfs * 1.3; });
        } else {
            const fontSize = _labelFs;
            ctx.font = `600 ${fontSize}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillStyle = '#1e293b';
            const nameLines = (obj.name || '').split('\n');
            if (_labelFitsInside) {
                ctx.textBaseline = 'middle';
                const nlh = fontSize * 1.1;
                let ny = pos.y + loy - fontSize * 0.35 - (nameLines.length - 1) * nlh / 2;
                nameLines.forEach(line => { ctx.fillText(line, pos.x + lox, ny); ny += nlh; });
                ctx.font = `${Math.max(8, fontSize - 2)}px sans-serif`;
                ctx.fillStyle = '#64748b';
                ctx.fillText(`${obj.width}\u00d7${obj.height}m`, pos.x + lox, ny - nlh / 2 + fontSize * 0.6);
            } else {
                ctx.textBaseline = 'bottom';
                let ny = pos.y + loy - h / 2 - 4 - (nameLines.length - 1) * fontSize * 1.1;
                nameLines.forEach(line => { ctx.fillText(line, pos.x + lox, ny); ny += fontSize * 1.1; });
                ctx.font = `${Math.max(8, fontSize - 2)}px sans-serif`;
                ctx.fillStyle = '#64748b';
                ctx.textBaseline = 'top';
                ctx.fillText(`${obj.width}\u00d7${obj.height}m`, pos.x + lox, pos.y + loy + h / 2 + 3);
            }
        }

        // Description (after restore, horizontal)
        if (obj.description && !_treasureMode) {
            const fontSize = _labelFs;
            const descFs = obj.descSize ? Math.max(6, obj.descSize * z * 0.4) : Math.max(7, fontSize - 2);
            ctx.font = `italic ${descFs}px sans-serif`;
            ctx.fillStyle = obj.descColor || '#94a3b8';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            let descY = _labelFitsInside ? pos.y + loy + fontSize * 0.55 + descFs + 1 : pos.y + loy + h / 2 + 3 + descFs + 2;
            obj.description.split('\n').forEach(line => {
                ctx.fillText(line, pos.x + lox, descY - descFs);
                descY += descFs + 1;
            });
        }
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

        // Vertex handles + rotation handle when selected
        if (isSel) {
            let minYs = Infinity, minYx = 0;
            obj.points.forEach(pt => {
                const p = w2s(pt.x, pt.y);
                ctx.beginPath();
                ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
                ctx.fillStyle = '#2563eb';
                ctx.fill();
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 1.5;
                ctx.stroke();
                if (p.y < minYs) { minYs = p.y; minYx = p.x; }
            });
            // Rotation handle
            const rhY = minYs - 28;
            ctx.strokeStyle = '#2563eb'; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(minYx, minYs - 4); ctx.lineTo(minYx, rhY); ctx.stroke();
            ctx.beginPath(); ctx.arc(minYx, rhY, 5, 0, Math.PI * 2);
            ctx.fillStyle = '#2563eb'; ctx.fill();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
        }

        // Label at centroid (with offset)
        const center = polygonCentroid(obj.points);
        const cp = w2s(center.x, center.y);
        const alox = (obj.labelOffsetX || 0) * (typeof z === 'number' ? z : zoom());
        const aloy = (obj.labelOffsetY || 0) * (typeof z === 'number' ? z : zoom());
        const afs = obj.labelSize ? Math.round(11 * obj.labelSize) : 11;
        ctx.font = `bold ${afs}px sans-serif`;
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const areaLockIcon = obj.locked ? ' \u{1F512}' : '';
        ctx.fillText((obj.name || I18n.t('msg.defaultArea')) + areaLockIcon, cp.x + alox, cp.y + aloy);
    }

    function drawTextField(obj, z, isSel, isHov) {
        const pos = w2s(obj.x, obj.y);
        const fontSize = (obj.fontSize || 1) * z;
        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.rotate((obj.rotation || 0) * Math.PI / 180);

        const fs = Math.max(8, fontSize);
        ctx.font = `bold ${fs}px sans-serif`;
        ctx.fillStyle = obj.color || '#1a1a2e';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const textContent = obj.text || obj.name || 'Text';
        const textLines = textContent.split('\n');
        const totalH = textLines.length * fs * 1.2;
        let ty = -(totalH / 2) + fs * 0.6;
        textLines.forEach(line => {
            ctx.fillText(line, 0, ty);
            ty += fs * 1.2;
        });

        if (isSel) {
            let maxW = 0;
            textLines.forEach(l => { maxW = Math.max(maxW, ctx.measureText(l).width); });
            const tw = maxW;
            ctx.strokeStyle = '#2563eb';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 3]);
            ctx.strokeRect(-tw / 2 - 4, -totalH / 2 - 2, tw + 8, totalH + 4);
            ctx.setLineDash([]);
        } else if (isHov) {
            let maxW = 0;
            textLines.forEach(l => { maxW = Math.max(maxW, ctx.measureText(l).width); });
            ctx.strokeStyle = '#2563eb55';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 3]);
            ctx.strokeRect(-maxW / 2 - 4, -totalH / 2 - 2, maxW + 8, totalH + 4);
            ctx.setLineDash([]);
        }

        ctx.restore();
    }

    function drawGuideline(obj, z, isSel, isHov) {
        const a = obj.points[0], b = obj.points[1];
        const p1 = w2s(a.x, a.y), p2 = w2s(b.x, b.y);
        const color = obj.color || '#6366f1';
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Line
        ctx.strokeStyle = color;
        ctx.lineWidth = isSel ? 2 : 1.5;
        ctx.setLineDash(isSel ? [6, 3] : [8, 4]);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Arrow ends (perpendicular ticks)
        const len = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
        if (len > 0) {
            const nx = -(p2.y - p1.y) / len * 6;
            const ny = (p2.x - p1.x) / len * 6;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(p1.x + nx, p1.y + ny);
            ctx.lineTo(p1.x - nx, p1.y - ny);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(p2.x + nx, p2.y + ny);
            ctx.lineTo(p2.x - nx, p2.y - ny);
            ctx.stroke();
        }

        // Distance label
        const mx = (p1.x + p2.x) / 2;
        const my = (p1.y + p2.y) / 2;
        const text = dist.toFixed(2) + ' m';
        ctx.font = 'bold 11px sans-serif';
        const tw = ctx.measureText(text).width;
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillRect(mx - tw / 2 - 4, my - 8, tw + 8, 16);
        ctx.strokeStyle = color;
        ctx.lineWidth = 0.5;
        ctx.strokeRect(mx - tw / 2 - 4, my - 8, tw + 8, 16);
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, mx, my);

        // Endpoint handles when selected
        if (isSel) {
            [p1, p2].forEach(p => {
                ctx.beginPath();
                ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
                ctx.fillStyle = '#6366f1';
                ctx.fill();
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 1.5;
                ctx.stroke();
            });
        }
    }

    function drawFence(obj, z, isSel, isHov) {
        if (!obj.points || obj.points.length < 2) return;
        const color = obj.color || '#8B4513';
        const thickness = (obj.lineThickness || 4);
        const vtxSize = obj.vertexSize || 0;

        // Draw thick line
        ctx.beginPath();
        const p0 = w2s(obj.points[0].x, obj.points[0].y);
        ctx.moveTo(p0.x, p0.y);
        for (let i = 1; i < obj.points.length; i++) {
            const p = w2s(obj.points[i].x, obj.points[i].y);
            ctx.lineTo(p.x, p.y);
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = thickness;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();

        // Vertex dots (junction points)
        obj.points.forEach(pt => {
            const p = w2s(pt.x, pt.y);
            const r = vtxSize > 0 ? vtxSize + thickness / 2 : thickness / 2 + 1;
            ctx.beginPath();
            ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
            if (vtxSize > 0) {
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 1;
                ctx.stroke();
            }
        });

        // Selection/hover
        if (isSel || isHov) {
            ctx.beginPath();
            ctx.moveTo(p0.x, p0.y);
            for (let i = 1; i < obj.points.length; i++) {
                const p = w2s(obj.points[i].x, obj.points[i].y);
                ctx.lineTo(p.x, p.y);
            }
            ctx.strokeStyle = isSel ? '#2563eb' : '#2563eb55';
            ctx.lineWidth = thickness + 4;
            ctx.setLineDash([5, 3]);
            ctx.stroke();
            ctx.setLineDash([]);

            if (isSel) {
                let fMinY = Infinity, fMinX = 0;
                obj.points.forEach(pt => {
                    const p = w2s(pt.x, pt.y);
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
                    ctx.fillStyle = '#2563eb';
                    ctx.fill();
                    ctx.strokeStyle = '#fff';
                    ctx.lineWidth = 1.5;
                    ctx.stroke();
                    if (p.y < fMinY) { fMinY = p.y; fMinX = p.x; }
                });
                // Rotation handle
                const frhY = fMinY - 28;
                ctx.strokeStyle = '#2563eb'; ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.moveTo(fMinX, fMinY - 4); ctx.lineTo(fMinX, frhY); ctx.stroke();
                ctx.beginPath(); ctx.arc(fMinX, frhY, 5, 0, Math.PI * 2);
                ctx.fillStyle = '#2563eb'; ctx.fill();
                ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
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
            ctx.fillText(obj.name || I18n.t('msg.defaultFence'), mp.x, mp.y - thickness - 4);
        }
    }

    // --- Safety/Info Symbols ---
    const _symbolImgCache = {};
    function loadSymbolImg(id) {
        if (_symbolImgCache[id]) return _symbolImgCache[id];
        const sym = SYMBOLS[id];
        if (!sym || !sym.src) return null;
        const img = new Image();
        img.onload = () => { _symbolImgCache[id] = img; render(); };
        img.src = sym.src;
        return null;
    }

    const SYMBOLS = {
        firstaid:    { name: 'First Aid',    src: 'img/symbols/first_aid.svg' },
        fire_ext:    { name: 'Fire Ext.',     src: 'img/symbols/fire_ext.svg' },
        gas:         { name: 'Gas Bottle',    src: 'img/symbols/gas_bottle.svg' },
        electric:    { name: 'Electric',      src: 'img/symbols/electric.svg' },
        exit:        { name: 'Exit',          src: 'img/symbols/exit.svg' },
        assembly:    { name: 'Assembly',      src: 'img/symbols/assembly.svg' },
        water:       { name: 'Water',         bg: '#0ea5e9', fg: '#fff', draw: (c,s) => { c.beginPath(); c.moveTo(0,-s*0.35); c.bezierCurveTo(-s*0.3,s*0.05,-s*0.25,s*0.35,0,s*0.35); c.bezierCurveTo(s*0.25,s*0.35,s*0.3,s*0.05,0,-s*0.35); c.fill(); }},
        wc:          { name: 'WC',            bg: '#2563eb', fg: '#fff', draw: (c,s) => { c.font=`bold ${s*0.5}px sans-serif`; c.textAlign='center'; c.textBaseline='middle'; c.fillText('WC',0,0); }},
        parking:     { name: 'Parking',       bg: '#2563eb', fg: '#fff', draw: (c,s) => { c.font=`bold ${s*0.55}px sans-serif`; c.textAlign='center'; c.textBaseline='middle'; c.fillText('P',0,0); }},
        info:        { name: 'Info',          bg: '#2563eb', fg: '#fff', draw: (c,s) => { c.font=`bold ${s*0.55}px serif`; c.textAlign='center'; c.textBaseline='middle'; c.fillText('i',0,0); }},
        no_fire:     { name: 'No Fire',       bg: '#fff', fg: '#ef4444', draw: (c,s) => { c.beginPath(); c.arc(0,0,s*0.35,0,Math.PI*2); c.stroke(); c.beginPath(); c.moveTo(-s*0.25,-s*0.25); c.lineTo(s*0.25,s*0.25); c.stroke(); }},
        trash:       { name: 'Waste',         bg: '#6b7280', fg: '#fff', draw: (c,s) => { c.fillRect(-s*0.2,-s*0.15,s*0.4,s*0.4); c.fillRect(-s*0.25,-s*0.2,s*0.5,s*0.08); c.fillRect(-s*0.06,-s*0.28,s*0.12,s*0.1); }},
        recycling:   { name: 'Recycling',     bg: '#f0f0f0', fg: '#333', draw: (c,s) => {
            const bw = s*0.22, bh = s*0.38, by = s*0.05, lr = s*0.04;
            [['#eab308',-s*0.28], ['#2563eb',0], ['#22c55e',s*0.28]].forEach(([col,bx]) => {
                c.fillStyle = col; c.beginPath();
                c.moveTo(bx-bw/2, by+bh); c.lineTo(bx-bw*0.4, by); c.lineTo(bx+bw*0.4, by); c.lineTo(bx+bw/2, by+bh); c.closePath(); c.fill();
                c.fillRect(bx-bw*0.35, by-s*0.06, bw*0.7, s*0.06);
                c.fillStyle = '#555'; c.fillRect(bx-s*0.02, by-s*0.14, s*0.04, s*0.09);
            });
        }},
    };

    function drawSymbol(obj, z, isSel, isHov) {
        const pos = w2s(obj.x, obj.y);
        const sym = SYMBOLS[obj.symbolId];
        if (!sym) return;
        const s = Math.max(obj.width, obj.height) * z;

        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.rotate((obj.rotation || 0) * Math.PI / 180);

        if (sym.src) {
            // Image-based symbol (SVG file)
            const img = loadSymbolImg(obj.symbolId);
            if (img) {
                ctx.drawImage(img, -s/2, -s/2, s, s);
            } else {
                // Placeholder while loading
                ctx.fillStyle = '#ddd';
                ctx.fillRect(-s/2, -s/2, s, s);
            }
        } else {
            // Programmatic symbol
            ctx.fillStyle = sym.bg;
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.roundRect(-s/2, -s/2, s, s, s * 0.12);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = sym.fg;
            ctx.strokeStyle = sym.fg;
            ctx.lineWidth = s * 0.06;
            sym.draw(ctx, s);
        }

        // Selection
        if (isSel) {
            ctx.strokeStyle = '#2563eb';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 3]);
            ctx.strokeRect(-s/2 - 3, -s/2 - 3, s + 6, s + 6);
            ctx.setLineDash([]);
        } else if (isHov) {
            ctx.strokeStyle = '#2563eb55';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 3]);
            ctx.strokeRect(-s/2 - 2, -s/2 - 2, s + 4, s + 4);
            ctx.setLineDash([]);
        }

        // Name below
        ctx.font = '9px sans-serif';
        ctx.fillStyle = '#333';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(obj.name, 0, s/2 + 3);

        ctx.restore();
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

    function drawGroupRotHandle(site) {
        if (selectedIds.size <= 1) return;
        const selObjs = site.objects.filter(o => selectedIds.has(o.id));
        if (selObjs.length < 2) return;
        let cx = 0, cy = 0, minY = Infinity;
        selObjs.forEach(o => {
            cx += o.x; cy += o.y;
            minY = Math.min(minY, o.y - (o.height || 0) / 2);
        });
        cx /= selObjs.length; cy /= selObjs.length;
        const cp = w2s(cx, cy);
        const tp = w2s(cx, minY);
        const handleY = tp.y - 28;

        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.moveTo(cp.x, tp.y); ctx.lineTo(cp.x, handleY); ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(cp.x, handleY, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#2563eb';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
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

        const site = State.activeSite;
        const rot = (site && site.compassRotation) || 0;
        ctx.globalAlpha = 0.7;
        ctx.save();
        ctx.translate(cx + size / 2, cy + size / 2);
        ctx.rotate(rot * Math.PI / 180);
        ctx.drawImage(_compassImg, -size / 2, -size / 2, size, size);
        ctx.restore();
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
        // Post-it / Symbol: rect hit test
        if (obj.type === 'postit') {
            const hw = obj.width / 2, hh = obj.height / 2;
            const dx = px - obj.x, dy = py - obj.y;
            return Math.abs(dx) <= hw && Math.abs(dy) <= hh;
        }
        if (obj.type === 'symbol') {
            const s = Math.max(obj.width, obj.height) / 2;
            const dx = px - obj.x, dy = py - obj.y;
            const rad = -(obj.rotation || 0) * Math.PI / 180;
            const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
            const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
            return Math.abs(lx) <= s && Math.abs(ly) <= s;
        }
        // Background image: rotated rect
        if (obj.type === 'bgimage') {
            const dx = px - obj.x, dy = py - obj.y;
            const rad = -(obj.rotation || 0) * Math.PI / 180;
            const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
            const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
            return Math.abs(lx) <= obj.width / 2 && Math.abs(ly) <= obj.height / 2;
        }
        // Area/Ground: point in polygon
        if ((obj.type === 'area' || obj.type === 'ground') && obj.points && obj.points.length >= 3) {
            return pointInPolygon(px, py, obj.points);
        }
        // Guideline: proximity to line segment
        if (obj.type === 'guideline' && obj.points && obj.points.length === 2) {
            const d = pointToSegDist(px, py, obj.points[0], obj.points[1]);
            return d < 0.5;
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
        // For polygon objects (ground, area, fence): handle above topmost point
        if (obj.points && obj.points.length >= 2 && (obj.type === 'ground' || obj.type === 'area' || obj.type === 'fence')) {
            let minY = Infinity, minX = 0;
            obj.points.forEach(p => { if (p.y < minY) { minY = p.y; minX = p.x; } });
            const handleY = minY - 28 / z;
            const d = Math.sqrt((px - minX) ** 2 + (py - handleY) ** 2);
            return d < 10 / z;
        }
        // Regular objects: handle above center
        const localY = -(obj.height / 2 + 28 / z);
        const rad = (obj.rotation || 0) * Math.PI / 180;
        const hx = obj.x + 0 * Math.cos(rad) - localY * Math.sin(rad);
        const hy = obj.y + 0 * Math.sin(rad) + localY * Math.cos(rad);
        const d = Math.sqrt((px - hx) ** 2 + (py - hy) ** 2);
        return d < 10 / z;
    }

    // Check if point is on a resize handle corner of a bgimage object
    // Returns corner index 0-3 (TL, TR, BR, BL) or -1
    function pointOnResizeHandle(px, py, obj) {
        if (obj.type !== 'bgimage') return -1;
        const z = zoom();
        const threshold = 10 / z;
        const hw = obj.width / 2, hh = obj.height / 2;
        const rad = (obj.rotation || 0) * Math.PI / 180;
        const cos = Math.cos(rad), sin = Math.sin(rad);
        const corners = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
        for (let i = 0; i < 4; i++) {
            const [lx, ly] = corners[i];
            const wx = obj.x + lx * cos - ly * sin;
            const wy = obj.y + lx * sin + ly * cos;
            const d = Math.sqrt((px - wx) ** 2 + (py - wy) ** 2);
            if (d < threshold) return i;
        }
        return -1;
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
        // No distance measurement for ground, bgimage, guideline, symbol
        if (obj.type === 'ground' || obj.type === 'bgimage' || obj.type === 'guideline' || obj.type === 'symbol') return [];
        const results = [];
        const minD = State.minDistance;

        site.objects.forEach(other => {
            if (other.id === obj.id) return;
            if (other.type === 'ground' || other.type === 'bgimage' || other.type === 'guideline' || other.type === 'symbol') return;
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
        // Snap nearest edge to grid (left/top edge vs right/bottom edge)
        const hw = obj.width / 2;
        const hh = obj.height / 2;

        function edgeSnap(pos, half, gs) {
            // Snap left/top edge
            const e1 = Math.round((pos - half) / gs) * gs + half;
            // Snap right/bottom edge
            const e2 = Math.round((pos + half) / gs) * gs - half;
            // Pick whichever edge is closer to the cursor
            return Math.abs(e1 - pos) <= Math.abs(e2 - pos) ? e1 : e2;
        }

        return {
            x: edgeSnap(worldX, hw, gridSize),
            y: edgeSnap(worldY, hh, gridSize),
        };
    }

    // Render the current site onto an offscreen canvas
    // pxW/pxH: logical pixel dimensions (96 DPI equivalent)
    // options: { showGrid, showDistances, margin, dpiScale }
    function renderOffscreen(pxW, pxH, worldBounds, options) {
        const site = State.activeSite;
        if (!site) return null;

        const dpiScale = (options && options.dpiScale) || 1;
        const origTreasure = _treasureMode;
        const origMinimap = _minimapEnabled;
        _minimapEnabled = false; // no minimap in print
        _treasureMode = !!(options && options.treasureMap);

        // Save state
        const origCanvas = canvas;
        const origCtx = ctx;
        const origView = { ...site.view };
        const origSel = new Set(selectedIds);
        const origHov = hoveredId;

        // Create high-res offscreen canvas, but render in logical coordinates
        const oc = document.createElement('canvas');
        oc.width = Math.round(pxW * dpiScale);
        oc.height = Math.round(pxH * dpiScale);
        const octx = oc.getContext('2d');
        octx.scale(dpiScale, dpiScale);

        // Fake canvas object with logical dimensions (for w2s/s2w)
        canvas = { width: pxW, height: pxH, getContext: () => octx, style: {} };
        ctx = octx;

        // Clear selection visuals for print
        selectedIds.clear();
        hoveredId = null;
        selectionRect = null;

        // Calculate view to fit bounds into the logical canvas
        const marginPx = (options && options.margin) || 40;
        const availW = pxW - 2 * marginPx;
        const availH = pxH - 2 * marginPx;
        const scaleX = availW / worldBounds.width;
        const scaleY = availH / worldBounds.height;
        const ppm = Math.min(scaleX, scaleY);
        const viewZoom = ppm / PPM;

        const centerX = worldBounds.minX + worldBounds.width / 2;
        const centerY = worldBounds.minY + worldBounds.height / 2;
        site.view.zoom = viewZoom;
        site.view.panX = -centerX;
        site.view.panY = -centerY;

        // White background (full physical size)
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, pxW, pxH);

        // Render using exact same functions as on-screen
        if (site.mapLayer && site.mapLayer.enabled && typeof MapTiles !== 'undefined') {
            MapTiles.drawMapTiles(ctx, canvas, site, w2s, s2w, zoom);
        }
        drawBgImages(site);
        if (!options || options.showGrid !== false) drawGrid(site);
        drawGround(site);
        drawObjects(site);

        // Distances
        if (options && options.showDistances) {
            site.objects.forEach(obj => {
                const dists = computeDistancesForObj(obj.id);
                dists.forEach(d => {
                    const p1 = w2s(d.x1, d.y1);
                    const p2 = w2s(d.x2, d.y2);
                    ctx.strokeStyle = d.color;
                    ctx.lineWidth = 1;
                    ctx.setLineDash([4, 3]);
                    ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
                    ctx.setLineDash([]);
                    ctx.font = 'bold 11px sans-serif';
                    ctx.fillStyle = d.color;
                    ctx.textAlign = 'center';
                    ctx.fillText(d.dist.toFixed(1) + ' m', (p1.x + p2.x) / 2, (p1.y + p2.y) / 2 - 4);
                });
            });
        }

        drawScaleBar(site);
        drawCompass();

        // Restore state
        canvas = origCanvas;
        ctx = origCtx;
        site.view.panX = origView.panX;
        site.view.panY = origView.panY;
        site.view.zoom = origView.zoom;
        selectedIds.clear();
        origSel.forEach(id => selectedIds.add(id));
        hoveredId = origHov;
        _treasureMode = origTreasure;
        _minimapEnabled = origMinimap;

        return oc;
    }

    return {
        init, render, resize, w2s, s2w, zoom, snapToGrid, snapObjToGrid,
        pointInObj, pointOnRotHandle, pointOnResizeHandle, computeDistancesForObj,
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
        get selectedGroundIndex() { return -1; }, // legacy compat
        set selectedGroundIndex(v) {},
        get placementPreview() { return placementPreview; },
        set placementPreview(p) { placementPreview = p; },
        get pathPreview() { return pathPreview; },
        set pathPreview(p) { pathPreview = p; },
        renderOffscreen,
        minimapClick, minimapHit, minimapStartDrag, minimapMoveDrag, minimapEndDrag,
        get minimapEnabled() { return _minimapEnabled; },
        set minimapEnabled(v) { _minimapEnabled = v; },
        polygonArea,
        SYMBOLS,
        pointInPolygonCheck: pointInPolygon,
        AREA_TEXTURES,
    };
})();
