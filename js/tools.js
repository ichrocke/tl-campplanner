/* ========================================
   Tools – Maus-/Tastatur-Interaktionen
   ======================================== */

const Tools = (() => {
    let activeTool = 'select';
    let drag = null;
    let pendingTemplate = null;
    let groundEditVertex = null;
    let lastClickTime = 0;

    function setTool(name) {
        activeTool = name;
        drag = null;
        Canvas.measureLine = null;
        Canvas.groundPreview = [];
        Canvas.dragDistances = [];
        Canvas.placementPreview = null;
        Canvas.pathPreview = [];
        Canvas.selectionRect = null;
        groundEditVertex = null;
        if (name !== 'place') pendingTemplate = null;
        updateHint();
        UI.updateToolButtons(name);
        const crosshairTools = ['place', 'area', 'text', 'fence', 'paint'];
        Canvas.canvas.style.cursor = crosshairTools.includes(name) ? 'crosshair' : 'default';
        Canvas.render();
    }

    function updateHint() {
        const hints = {
            select: I18n.t('hint.select'),
            pan: I18n.t('hint.pan'),
            ground: I18n.t('hint.ground'),
            area: I18n.t('hint.area'),
            text: I18n.t('hint.text'),
            measure: I18n.t('hint.measure'),
            fence: I18n.t('hint.fence'),
            paint: I18n.t('hint.paint'),
            place: pendingTemplate ? I18n.t('hint.place', { name: pendingTemplate.name }) : '',
        };
        UI.showHint(hints[activeTool] || '');
    }

    function setPendingTemplate(template) {
        pendingTemplate = template;
        activeTool = 'place';
        drag = null;
        Canvas.measureLine = null;
        Canvas.groundPreview = [];
        Canvas.dragDistances = [];
        groundEditVertex = null;
        updateHint();
        UI.updateToolButtons('place');
        Canvas.canvas.style.cursor = 'crosshair';
        Canvas.render();
    }

    function getMouseWorld(e) {
        const rect = Canvas.canvas.getBoundingClientRect();
        return Canvas.s2w(e.clientX - rect.left, e.clientY - rect.top);
    }

    function snapWorld(pos) {
        const site = State.activeSite;
        if (!site || !site.snapToGrid) return pos;
        return {
            x: Canvas.snapToGrid(pos.x, site.gridSize),
            y: Canvas.snapToGrid(pos.y, site.gridSize),
        };
    }

    // Returns {gi, vi} or null
    function findGroundVertex(world, site) {
        const grounds = site.grounds || [];
        const threshold = 8 / Canvas.zoom();
        for (let gi = 0; gi < grounds.length; gi++) {
            for (let vi = 0; vi < grounds[gi].length; vi++) {
                const pt = grounds[gi][vi];
                const d = Math.sqrt((world.x - pt.x) ** 2 + (world.y - pt.y) ** 2);
                if (d < threshold) return { gi, vi };
            }
        }
        return null;
    }

    // Returns {gi, ei} or null
    function findGroundEdge(world, site) {
        const grounds = site.grounds || [];
        const threshold = 5 / Canvas.zoom();
        for (let gi = 0; gi < grounds.length; gi++) {
            if (grounds[gi].length < 2) continue;
            for (let i = 0; i < grounds[gi].length; i++) {
                const a = grounds[gi][i];
                const b = grounds[gi][(i + 1) % grounds[gi].length];
                const dist = pointToSegmentDist(world, a, b);
                if (dist < threshold) return { gi, ei: i };
            }
        }
        return null;
    }

    // Find area vertex near world point (for selected area objects)
    function findAreaVertex(world, obj) {
        if (!obj || !obj.points) return -1;
        if (obj.type !== 'area' && obj.type !== 'guideline') return -1;
        const threshold = 8 / Canvas.zoom();
        for (let i = 0; i < obj.points.length; i++) {
            const pt = obj.points[i];
            const d = Math.sqrt((world.x - pt.x) ** 2 + (world.y - pt.y) ** 2);
            if (d < threshold) return i;
        }
        return -1;
    }

    function findAreaEdge(world, obj) {
        if (!obj || obj.type !== 'area' || !obj.points || obj.points.length < 2) return -1;
        const threshold = 5 / Canvas.zoom();
        for (let i = 0; i < obj.points.length; i++) {
            const a = obj.points[i];
            const b = obj.points[(i + 1) % obj.points.length];
            const dist = pointToSegmentDist(world, a, b);
            if (dist < threshold) return i;
        }
        return -1;
    }

    // Find fence vertex near world point
    function findFenceVertex(world, obj) {
        if (!obj || obj.type !== 'fence' || !obj.points) return -1;
        const threshold = 8 / Canvas.zoom();
        for (let i = 0; i < obj.points.length; i++) {
            const pt = obj.points[i];
            const d = Math.sqrt((world.x - pt.x) ** 2 + (world.y - pt.y) ** 2);
            if (d < threshold) return i;
        }
        return -1;
    }

    function pointToSegmentDist(p, a, b) {
        const dx = b.x - a.x, dy = b.y - a.y;
        const len2 = dx * dx + dy * dy;
        if (len2 === 0) return Math.sqrt((p.x - a.x) ** 2 + (p.y - a.y) ** 2);
        let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
        t = Math.max(0, Math.min(1, t));
        const proj = { x: a.x + t * dx, y: a.y + t * dy };
        return Math.sqrt((p.x - proj.x) ** 2 + (p.y - proj.y) ** 2);
    }

    function onMouseDown(e) {
        const site = State.activeSite;
        if (!site) return;
        const world = getMouseWorld(e);
        const snapped = snapWorld(world);

        if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
            drag = { type: 'pan', lastX: e.clientX, lastY: e.clientY };
            return;
        }

        if (e.button !== 0) return;

        switch (activeTool) {
            case 'select': onSelectDown(e, world, snapped, site); break;
            case 'pan': drag = { type: 'pan', lastX: e.clientX, lastY: e.clientY }; break;
            case 'ground': onGroundClick(snapped, site); break;
            case 'area': onAreaClick(snapped, site); break;
            case 'fence': onFenceClick(snapped, site); break;
            case 'text': onTextClick(snapped, site); break;
            case 'measure': drag = { type: 'measure', x1: snapped.x, y1: snapped.y, x2: snapped.x, y2: snapped.y }; break;
            case 'paint': onPaintClick(world, site); break;
            case 'place': onPlaceClick(snapped, site); break;
        }
    }

    function onSelectDown(e, world, snapped, site) {
        const ctrlKey = e.ctrlKey || e.metaKey;

        // 1. Check rotation handle of single-selected object
        if (Canvas.selectionCount === 1) {
            const sel = site.objects.find(o => o.id === Canvas.selectedId);
            if (sel && Canvas.pointOnRotHandle(world.x, world.y, sel)) {
                drag = {
                    type: 'rotate', objId: sel.id,
                    startAngle: Math.atan2(world.x - sel.x, -(world.y - sel.y)) * 180 / Math.PI,
                    origRotation: sel.rotation,
                };
                return;
            }

            // 1a. Check resize handle (bgimage)
            if (sel && sel.type === 'bgimage') {
                const corner = Canvas.pointOnResizeHandle(world.x, world.y, sel);
                if (corner >= 0) {
                    drag = {
                        type: 'resize', objId: sel.id, corner,
                        origWidth: sel.width, origHeight: sel.height,
                        origX: sel.x, origY: sel.y,
                        startDist: Math.sqrt((world.x - sel.x) ** 2 + (world.y - sel.y) ** 2),
                        aspect: sel.width / sel.height,
                    };
                    return;
                }
            }

            // 1b. Check area/fence/guideline vertex drag
            if (sel && (sel.type === 'area' || sel.type === 'fence' || sel.type === 'guideline') && sel.points) {
                const vi = findAreaVertex(world, sel);
                if (vi >= 0) {
                    drag = { type: 'areaVertex', objId: sel.id, vertexIndex: vi };
                    return;
                }
            }
        }

        // 2. Check ground vertex drag
        const gv = findGroundVertex(world, site);
        if (gv) {
            groundEditVertex = gv;
            drag = { type: 'groundVertex', gi: gv.gi, vi: gv.vi };
            Canvas.clearSelection();
            UI.hideProperties();
            Canvas.render();
            return;
        }

        // 3. Check ground polygon hit
        const grounds = site.grounds || [];
        let groundHit = -1;
        for (let gi = grounds.length - 1; gi >= 0; gi--) {
            if (grounds[gi].length >= 3 && Canvas.pointInPolygonCheck(world.x, world.y, grounds[gi])) {
                groundHit = gi;
                break;
            }
        }

        // 4. Check object hit
        const hit = [...site.objects].reverse().find(o => Canvas.pointInObj(world.x, world.y, o));
        if (hit) {
            Canvas.selectedGroundIndex = -1;
            if (ctrlKey) {
                Canvas.toggleSelection(hit.id);
                if (Canvas.selectionCount === 1) {
                    UI.showProperties(site.objects.find(o => o.id === Canvas.selectedId));
                } else {
                    UI.showMultiProperties();
                }
            } else if (Canvas.isSelected(hit.id) && Canvas.selectionCount > 1) {
                // Clicking on already-selected object in multi-selection: start move
            } else {
                Canvas.selectedId = hit.id;
                // Auto-select group members
                if (hit.groupId) {
                    site.objects.forEach(o => { if (o.groupId === hit.groupId) Canvas.addToSelection(o.id); });
                }
                if (Canvas.selectionCount === 1) {
                    UI.showProperties(hit);
                } else {
                    UI.showMultiProperties();
                }
            }
            drag = {
                type: 'move',
                offsetX: world.x, offsetY: world.y,
                origPositions: getSelectedPositions(site),
                moved: false,
            };
        } else if (groundHit >= 0) {
            // Click on ground polygon: select it
            Canvas.clearSelection();
            Canvas.selectedGroundIndex = groundHit;
            UI.showGroundProperties(groundHit);
        } else {
            Canvas.selectedGroundIndex = -1;
            if (ctrlKey) {
                drag = { type: 'rectSelect', x1: world.x, y1: world.y, additive: true };
            } else {
                Canvas.clearSelection();
                UI.hideProperties();
                drag = { type: 'rectSelect', x1: world.x, y1: world.y, additive: false };
            }
        }
        Canvas.render();
    }

    function getSelectedPositions(site) {
        const positions = {};
        site.objects.forEach(o => {
            if (Canvas.isSelected(o.id)) {
                positions[o.id] = { x: o.x, y: o.y, points: o.points ? o.points.map(p => ({...p})) : null };
            }
        });
        return positions;
    }

    function onGroundClick(pos, site) {
        const preview = Canvas.groundPreview;
        // No more replacement confirm - multiple grounds allowed
        if (preview.length >= 3) {
            const first = preview[0];
            const dist = Math.sqrt((pos.x - first.x) ** 2 + (pos.y - first.y) ** 2);
            if (dist < 0.5) { finishGround(site); return; }
        }
        preview.push({ x: pos.x, y: pos.y });
        Canvas.render();
    }

    function finishGround(site) {
        if (Canvas.groundPreview.length >= 3) {
            if (!site.grounds) site.grounds = [];
            site.grounds.push([...Canvas.groundPreview]);
            State.notifyChange();
        }
        Canvas.groundPreview = [];
        setTool('select');
    }

    function onPlaceClick(pos, site) {
        if (!pendingTemplate) return;
        let placeX = pos.x, placeY = pos.y;
        if (site.snapToGrid) {
            const snapped = Canvas.snapObjToGrid(pendingTemplate, pos.x, pos.y, site.gridSize);
            placeX = snapped.x;
            placeY = snapped.y;
        }
        const obj = State.addObject(pendingTemplate, placeX, placeY);
        if (obj) {
            Canvas.selectedId = obj.id;
            UI.showProperties(obj);
        }
        // Single placement: return to select after placing
        Canvas.placementPreview = null;
        setTool('select');
    }

    // --- Area tool ---
    function onAreaClick(pos) {
        const now = Date.now();
        if (now - lastClickTime < 300) return;
        lastClickTime = now;
        const preview = Canvas.pathPreview;
        if (preview.length >= 3) {
            const first = preview[0];
            const dist = Math.sqrt((pos.x - first.x) ** 2 + (pos.y - first.y) ** 2);
            if (dist < 0.5) { finishArea(State.activeSite); return; }
        }
        preview.push({ x: pos.x, y: pos.y });
        Canvas.render();
    }

    function finishArea(site) {
        const pts = Canvas.pathPreview;
        if (pts.length >= 3) {
            const name = prompt(I18n.t('msg.nameArea'), I18n.t('msg.defaultArea')) || I18n.t('msg.defaultArea');
            let cx = 0, cy = 0;
            pts.forEach(p => { cx += p.x; cy += p.y; });
            cx /= pts.length; cy /= pts.length;
            const obj = State.addObject({
                type: 'area', name: name, width: 0, height: 0,
                guyRopeDistance: 0, color: '#d4a574', shape: 'rect',
                points: [...pts],
            }, cx, cy);
            if (obj) obj.points = [...pts];
        }
        Canvas.pathPreview = [];
        setTool('select');
    }

    // --- Fence tool ---
    function onFenceClick(pos) {
        const now = Date.now();
        if (now - lastClickTime < 300) return;
        lastClickTime = now;
        Canvas.pathPreview.push({ x: pos.x, y: pos.y });
        Canvas.render();
    }

    function finishFence(site) {
        const pts = Canvas.pathPreview;
        if (pts.length >= 2) {
            const name = prompt(I18n.t('msg.nameFence'), I18n.t('msg.defaultFence')) || I18n.t('msg.defaultFence');
            let cx = 0, cy = 0;
            pts.forEach(p => { cx += p.x; cy += p.y; });
            cx /= pts.length; cy /= pts.length;
            const obj = State.addObject({
                type: 'fence', name: name, width: 0, height: 0,
                guyRopeDistance: 0, color: '#8B4513', shape: 'rect',
                points: [...pts], fenceHeight: 1.5,
            }, cx, cy);
            if (obj) obj.points = [...pts];
        }
        Canvas.pathPreview = [];
        setTool('select');
    }

    // --- Paint tool ---
    function onPaintClick(world, site) {
        const hit = [...site.objects].reverse().find(o => Canvas.pointInObj(world.x, world.y, o));
        if (hit) {
            const color = UI.getActiveColor();
            if (color) {
                State.updateObject(hit.id, { color: color });
                Canvas.render();
            }
        }
    }

    // --- Text tool ---
    function onTextClick(pos) {
        UI.openTextModal(pos);
    }

    function onMouseMove(e) {
        const site = State.activeSite;
        if (!site) return;
        const world = getMouseWorld(e);
        const snapped = snapWorld(world);

        UI.updateCoords(world.x, world.y);

        if (drag) {
            switch (drag.type) {
                case 'pan': {
                    const dx = e.clientX - drag.lastX;
                    const dy = e.clientY - drag.lastY;
                    site.view.panX += dx / Canvas.zoom();
                    site.view.panY += dy / Canvas.zoom();
                    drag.lastX = e.clientX;
                    drag.lastY = e.clientY;
                    Canvas.render();
                    break;
                }
                case 'move': {
                    let dx = world.x - drag.offsetX;
                    let dy = world.y - drag.offsetY;
                    if (site.snapToGrid) {
                        dx = Canvas.snapToGrid(dx, site.gridSize);
                        dy = Canvas.snapToGrid(dy, site.gridSize);
                    }
                    site.objects.forEach(obj => {
                        if (!Canvas.isSelected(obj.id)) return;
                        const orig = drag.origPositions[obj.id];
                        if (!orig) return;
                        const nx = orig.x + dx;
                        const ny = orig.y + dy;
                        if (obj.points && orig.points) {
                            obj.points.forEach((p, i) => { p.x = orig.points[i].x + dx; p.y = orig.points[i].y + dy; });
                        }
                        obj.x = nx;
                        obj.y = ny;
                    });
                    drag.moved = true;
                    Canvas.dragDistances = [];
                    if (Canvas.selectionCount === 1) {
                        const sel = site.objects.find(o => o.id === Canvas.selectedId);
                        if (sel) Canvas.dragDistances = Canvas.computeDistancesForObj(sel.id);
                    }
                    Canvas.render();
                    break;
                }
                case 'resize': {
                    const obj = site.objects.find(o => o.id === drag.objId);
                    if (obj) {
                        const dist = Math.sqrt((world.x - obj.x) ** 2 + (world.y - obj.y) ** 2);
                        const scale = dist / drag.startDist;
                        if (obj.keepAspectRatio !== false) {
                            // Proportional resize
                            obj.width = Math.max(0.5, drag.origWidth * scale);
                            obj.height = Math.max(0.5, drag.origHeight * scale);
                        } else {
                            // Free resize: project onto local axes
                            const rad = -(obj.rotation || 0) * Math.PI / 180;
                            const dx = world.x - obj.x, dy = world.y - obj.y;
                            const lx = Math.abs(dx * Math.cos(rad) - dy * Math.sin(rad));
                            const ly = Math.abs(dx * Math.sin(rad) + dy * Math.cos(rad));
                            obj.width = Math.max(0.5, lx * 2);
                            obj.height = Math.max(0.5, ly * 2);
                        }
                        Canvas.render();
                        UI.showProperties(obj);
                    }
                    break;
                }
                case 'rotate': {
                    const obj = site.objects.find(o => o.id === drag.objId);
                    if (obj) {
                        const angle = Math.atan2(world.x - obj.x, -(world.y - obj.y)) * 180 / Math.PI;
                        let newRot = drag.origRotation + (angle - drag.startAngle);
                        if (e.shiftKey) newRot = Math.round(newRot / 15) * 15;
                        obj.rotation = ((newRot % 360) + 360) % 360;
                        Canvas.render();
                        UI.showProperties(obj);
                    }
                    break;
                }
                case 'rectSelect': {
                    Canvas.selectionRect = { x1: drag.x1, y1: drag.y1, x2: world.x, y2: world.y };
                    Canvas.render();
                    break;
                }
                case 'groundVertex': {
                    const pt = site.snapToGrid ? snapped : world;
                    if (site.grounds && site.grounds[drag.gi]) {
                        site.grounds[drag.gi][drag.vi] = { x: pt.x, y: pt.y };
                    }
                    Canvas.render();
                    break;
                }
                case 'areaVertex': {
                    const obj = site.objects.find(o => o.id === drag.objId);
                    if (obj && obj.points && obj.points[drag.vertexIndex]) {
                        const pt = site.snapToGrid ? snapped : world;
                        obj.points[drag.vertexIndex] = { x: pt.x, y: pt.y };
                        // Update centroid
                        let cx = 0, cy = 0;
                        obj.points.forEach(p => { cx += p.x; cy += p.y; });
                        obj.x = cx / obj.points.length;
                        obj.y = cy / obj.points.length;
                        // Update guideline distance label
                        if (obj.type === 'guideline' && obj.points.length === 2) {
                            const dx = obj.points[1].x - obj.points[0].x;
                            const dy = obj.points[1].y - obj.points[0].y;
                            obj.name = Math.sqrt(dx * dx + dy * dy).toFixed(2) + ' m';
                        }
                        Canvas.render();
                    }
                    break;
                }
                case 'measure': {
                    drag.x2 = snapped.x;
                    drag.y2 = snapped.y;
                    Canvas.measureLine = { x1: drag.x1, y1: drag.y1, x2: drag.x2, y2: drag.y2 };
                    Canvas.render();
                    break;
                }
            }
        } else {
            if (activeTool === 'select') {
                const gv = findGroundVertex(world, site);
                if (gv) {
                    Canvas.canvas.style.cursor = 'grab';
                    Canvas.hoveredId = null;
                    Canvas.highlightGroundVertex = gv;
                    Canvas.render();
                    return;
                }
                Canvas.highlightGroundVertex = null;

                // Check resize handle hover (bgimage)
                if (Canvas.selectionCount === 1) {
                    const sel = site.objects.find(o => o.id === Canvas.selectedId);
                    if (sel && sel.type === 'bgimage') {
                        const corner = Canvas.pointOnResizeHandle(world.x, world.y, sel);
                        if (corner >= 0) {
                            Canvas.canvas.style.cursor = 'nwse-resize';
                            Canvas.render();
                            return;
                        }
                    }
                }

                // Check area/fence vertex hover
                if (Canvas.selectionCount === 1) {
                    const sel = site.objects.find(o => o.id === Canvas.selectedId);
                    if (sel && (sel.type === 'area' || sel.type === 'fence' || sel.type === 'guideline') && sel.points) {
                        const avi = (sel.type === 'area' || sel.type === 'guideline') ? findAreaVertex(world, sel) : findFenceVertex(world, sel);
                        if (avi >= 0) {
                            Canvas.canvas.style.cursor = 'grab';
                            Canvas.hoveredId = sel.id;
                            Canvas.render();
                            return;
                        }
                    }
                }

                const hit = [...site.objects].reverse().find(o => Canvas.pointInObj(world.x, world.y, o));
                const newHov = hit ? hit.id : null;
                if (newHov !== Canvas.hoveredId) {
                    Canvas.hoveredId = newHov;
                    Canvas.render();
                }
                Canvas.canvas.style.cursor = hit ? 'move' : 'default';
            }
            if (activeTool === 'place' && pendingTemplate) {
                Canvas.canvas.style.cursor = 'crosshair';
                let px = snapped.x, py = snapped.y;
                if (site.snapToGrid) {
                    const s = Canvas.snapObjToGrid(pendingTemplate, world.x, world.y, site.gridSize);
                    px = s.x; py = s.y;
                }
                Canvas.placementPreview = { ...pendingTemplate, x: px, y: py, rotation: 0 };
                Canvas.render();
            }

            if (activeTool === 'ground' && Canvas.groundPreview.length > 0) {
                Canvas.render();
                const ctx = Canvas.canvas.getContext('2d');
                const last = Canvas.groundPreview[Canvas.groundPreview.length - 1];
                const p1 = Canvas.w2s(last.x, last.y);
                const p2 = Canvas.w2s(snapped.x, snapped.y);
                ctx.setLineDash([6, 4]);
                ctx.strokeStyle = '#22c55e88';
                ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
                ctx.setLineDash([]);
                const dist = Math.sqrt((snapped.x - last.x) ** 2 + (snapped.y - last.y) ** 2);
                ctx.font = '11px sans-serif';
                ctx.fillStyle = '#16a34a';
                ctx.textAlign = 'center';
                ctx.fillText(dist.toFixed(1) + ' m', (p1.x + p2.x) / 2, (p1.y + p2.y) / 2 - 8);
            }

            if ((activeTool === 'area' || activeTool === 'fence') && Canvas.pathPreview.length > 0) {
                Canvas.render();
                const ctx = Canvas.canvas.getContext('2d');
                const last = Canvas.pathPreview[Canvas.pathPreview.length - 1];
                const p1 = Canvas.w2s(last.x, last.y);
                const p2 = Canvas.w2s(snapped.x, snapped.y);
                ctx.setLineDash([6, 4]);
                ctx.strokeStyle = activeTool === 'fence' ? '#8B451388' : '#6366f188';
                ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
                ctx.setLineDash([]);
            }
        }
    }

    function onMouseUp(e) {
        if (drag) {
            if (drag.type === 'move' && drag.moved) {
                State.notifyChange();
                if (Canvas.selectionCount === 1) {
                    const sel = State.activeSite?.objects.find(o => o.id === Canvas.selectedId);
                    if (sel) UI.showProperties(sel);
                }
            }
            if (drag.type === 'rotate' || drag.type === 'resize') {
                State.notifyChange();
                const obj = State.activeSite?.objects.find(o => o.id === drag.objId);
                if (obj) UI.showProperties(obj);
            }
            if (drag.type === 'groundVertex') {
                State.notifyChange();
            }
            if (drag.type === 'areaVertex') {
                State.notifyChange();
                const obj = State.activeSite?.objects.find(o => o.id === drag.objId);
                if (obj) UI.showProperties(obj);
            }
            if (drag.type === 'measure') {
                const dx = drag.x2 - drag.x1, dy = drag.y2 - drag.y1;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > 0.1) {
                    const site = State.activeSite;
                    if (site) {
                        const cx = (drag.x1 + drag.x2) / 2;
                        const cy = (drag.y1 + drag.y2) / 2;
                        const obj = State.addObject({
                            type: 'guideline', name: dist.toFixed(2) + ' m',
                            width: 0, height: 0, guyRopeDistance: 0,
                            color: '#6366f1', shape: 'rect',
                            points: [{ x: drag.x1, y: drag.y1 }, { x: drag.x2, y: drag.y2 }],
                        }, cx, cy);
                        if (obj) {
                            Canvas.selectedId = obj.id;
                            UI.showProperties(obj);
                        }
                    }
                }
                Canvas.measureLine = null;
            }
            if (drag.type === 'rectSelect') {
                const site = State.activeSite;
                const r = Canvas.selectionRect;
                if (site && r) {
                    const hits = site.objects.filter(o => Canvas.objInRect(o, r.x1, r.y1, r.x2, r.y2));
                    if (!drag.additive) Canvas.clearSelection();
                    hits.forEach(o => Canvas.addToSelection(o.id));
                    if (Canvas.selectionCount === 1) {
                        UI.showProperties(site.objects.find(o => o.id === Canvas.selectedId));
                    } else if (Canvas.selectionCount > 1) {
                        UI.showMultiProperties();
                    } else {
                        UI.hideProperties();
                    }
                }
                Canvas.selectionRect = null;
            }
            Canvas.dragDistances = [];
            groundEditVertex = null;
            drag = null;
            Canvas.render();
        }
    }

    function onWheel(e) {
        e.preventDefault();
        const site = State.activeSite;
        if (!site) return;
        const factor = e.deltaY < 0 ? 1.1 : 0.9;
        const newZoom = Math.max(0.05, Math.min(20, site.view.zoom * factor));

        const rect = Canvas.canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const worldBefore = Canvas.s2w(mx, my);

        site.view.zoom = newZoom;

        const worldAfter = Canvas.s2w(mx, my);
        site.view.panX += worldAfter.x - worldBefore.x;
        site.view.panY += worldAfter.y - worldBefore.y;

        UI.updateZoom(newZoom);
        Canvas.render();
    }

    function onKeyDown(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;

        // Number keys 1-0 for quick template placement
        if (!e.ctrlKey && !e.metaKey && !e.altKey) {
            const numKeys = ['1','2','3','4','5','6','7','8','9','0'];
            const numIdx = numKeys.indexOf(e.key);
            if (numIdx >= 0) {
                const site = State.activeSite;
                if (site && site.templates && site.templates[numIdx]) {
                    setPendingTemplate(site.templates[numIdx]);
                }
                return;
            }
        }

        switch (e.key) {
            case 'v': case 'V': setTool('select'); break;
            case 'h': case 'H': setTool('pan'); break;
            case 'a': case 'A': setTool('area'); break;
            case 't': case 'T': setTool('text'); break;
            case 'm': case 'M': setTool('measure'); break;
            case 'f': case 'F': setTool('fence'); break;
            case 'p': case 'P': setTool('paint'); break;
            case 'F2':
                // Rename selected object
                if (Canvas.selectionCount === 1) {
                    const sel = State.activeSite?.objects.find(o => o.id === Canvas.selectedId);
                    if (sel) {
                        const newName = prompt(I18n.t('props.name') + ':', sel.name);
                        if (newName && newName.trim()) {
                            State.updateObject(sel.id, { name: newName.trim() });
                            Canvas.render();
                            UI.showProperties(State.activeSite.objects.find(o => o.id === sel.id));
                        }
                    }
                }
                break;
            case 'Escape':
                if (activeTool === 'ground') {
                    Canvas.groundPreview = [];
                    setTool('select');
                } else if (activeTool === 'area' || activeTool === 'fence') {
                    Canvas.pathPreview = [];
                    setTool('select');
                } else if (activeTool === 'place' || activeTool === 'text') {
                    setTool('select');
                } else if (Canvas.selectedGroundIndex >= 0) {
                    Canvas.selectedGroundIndex = -1;
                    UI.hideProperties();
                    Canvas.render();
                } else if (Canvas.selectionCount > 0) {
                    Canvas.clearSelection();
                    UI.hideProperties();
                    Canvas.render();
                }
                break;
            case 'Enter':
                if (activeTool === 'ground') finishGround(State.activeSite);
                if (activeTool === 'area') finishArea(State.activeSite);
                if (activeTool === 'fence') finishFence(State.activeSite);
                break;
            case 'Delete':
            case 'Backspace':
            case 'x': case 'X':
                if ((e.key === 'x' || e.key === 'X') && (e.ctrlKey || e.metaKey)) break;
                if (Canvas.selectedGroundIndex >= 0) {
                    const site = State.activeSite;
                    if (site && site.grounds && site.grounds[Canvas.selectedGroundIndex]) {
                        site.grounds.splice(Canvas.selectedGroundIndex, 1);
                        Canvas.selectedGroundIndex = -1;
                        UI.hideProperties();
                        State.notifyChange();
                        Canvas.render();
                    }
                } else if (Canvas.selectionCount > 0) {
                    [...Canvas.selectedIds].forEach(id => State.removeObject(id));
                    Canvas.clearSelection();
                    UI.hideProperties();
                    Canvas.render();
                }
                break;
            case 'z':
                if (e.ctrlKey || e.metaKey) { e.preventDefault(); State.undo(); Canvas.render(); }
                break;
            case 'g':
                if ((e.ctrlKey || e.metaKey) && !e.shiftKey && Canvas.selectionCount > 1) {
                    e.preventDefault();
                    // Group selected objects
                    const groupId = State.generateId();
                    [...Canvas.selectedIds].forEach(id => State.updateObject(id, { groupId }));
                    Canvas.render();
                    break;
                }
                if ((e.ctrlKey || e.metaKey) && e.shiftKey && Canvas.selectionCount >= 1) {
                    e.preventDefault();
                    // Ungroup
                    [...Canvas.selectedIds].forEach(id => State.updateObject(id, { groupId: '' }));
                    Canvas.render();
                    break;
                }
                if (!e.ctrlKey && !e.metaKey) { setTool('ground'); }
                break;
            case 'G':
                if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
                    e.preventDefault();
                    [...Canvas.selectedIds].forEach(id => State.updateObject(id, { groupId: '' }));
                    Canvas.render();
                    break;
                }
                if (!e.ctrlKey && !e.metaKey) { setTool('ground'); }
                break;
            case 'd':
                if ((e.ctrlKey || e.metaKey) && Canvas.selectionCount > 0) {
                    e.preventDefault();
                    const newIds = [];
                    [...Canvas.selectedIds].forEach(id => {
                        const dup = State.duplicateObject(id);
                        if (dup) newIds.push(dup.id);
                    });
                    Canvas.selectMultiple(newIds);
                    if (newIds.length === 1) {
                        const obj = State.activeSite.objects.find(o => o.id === newIds[0]);
                        if (obj) UI.showProperties(obj);
                    } else if (newIds.length > 1) {
                        UI.showMultiProperties();
                    }
                    Canvas.render();
                }
                break;
        }
    }

    function onContextMenu(e) {
        e.preventDefault();
        const world = getMouseWorld(e);
        const site = State.activeSite;
        if (!site) return;

        // Check area/fence vertex right-click (for selected object)
        if (Canvas.selectionCount === 1) {
            const sel = site.objects.find(o => o.id === Canvas.selectedId);
            if (sel && sel.type === 'area' && sel.points) {
                const avi = findAreaVertex(world, sel);
                if (avi >= 0) {
                    UI.showAreaVertexMenu(e.clientX, e.clientY, sel, avi);
                    return;
                }
                const aei = findAreaEdge(world, sel);
                if (aei >= 0) {
                    UI.showAreaEdgeMenu(e.clientX, e.clientY, sel, aei, snapWorld(world));
                    return;
                }
            }
            if (sel && sel.type === 'fence' && sel.points) {
                const fvi = findFenceVertex(world, sel);
                if (fvi >= 0) {
                    UI.showFenceVertexMenu(e.clientX, e.clientY, sel, fvi);
                    return;
                }
            }
        }

        // Check ground vertex/edge right-click
        const gv = findGroundVertex(world, site);
        if (gv) {
            UI.showGroundVertexMenu(e.clientX, e.clientY, gv.gi, gv.vi);
            return;
        }
        const ge = findGroundEdge(world, site);
        if (ge) {
            UI.showGroundEdgeMenu(e.clientX, e.clientY, ge.gi, ge.ei, snapWorld(world));
            return;
        }

        const hit = [...site.objects].reverse().find(o => Canvas.pointInObj(world.x, world.y, o));
        if (hit) {
            Canvas.selectedId = hit.id;
            Canvas.render();
            UI.showContextMenu(e.clientX, e.clientY, hit);
        }
    }

    function onDblClick(e) {
        if (activeTool === 'ground') { finishGround(State.activeSite); return; }
        if (activeTool === 'area') { finishArea(State.activeSite); return; }
        if (activeTool === 'fence') { finishFence(State.activeSite); return; }
        const world = getMouseWorld(e);
        const site = State.activeSite;
        if (!site) return;
        const hit = [...site.objects].reverse().find(o => Canvas.pointInObj(world.x, world.y, o));
        if (hit) {
            Canvas.selectedId = hit.id;
            UI.showProperties(hit);
            Canvas.render();
        }
    }

    return {
        get activeTool() { return activeTool; },
        setTool, setPendingTemplate,
        onMouseDown, onMouseMove, onMouseUp, onWheel, onKeyDown, onContextMenu, onDblClick,
    };
})();
