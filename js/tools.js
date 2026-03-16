/* ========================================
   Tools – Maus-/Tastatur-Interaktionen
   ======================================== */

const Tools = (() => {
    let activeTool = 'select';
    let drag = null;
    let pendingTemplate = null;
    let groundEditVertex = -1;
    let lastClickTime = 0; // to prevent dblclick adding extra points

    function setTool(name) {
        activeTool = name;
        drag = null;
        Canvas.measureLine = null;
        Canvas.groundPreview = [];
        Canvas.dragDistances = [];
        Canvas.placementPreview = null;
        Canvas.pathPreview = [];
        Canvas.selectionRect = null;
        groundEditVertex = -1;
        if (name !== 'place') pendingTemplate = null;
        updateHint();
        UI.updateToolButtons(name);
        const crosshairTools = ['place', 'area', 'text'];
        Canvas.canvas.style.cursor = crosshairTools.includes(name) ? 'crosshair' : 'default';
        Canvas.render();
    }

    function updateHint() {
        const hints = {
            select: 'Objekte anklicken zum Ausw\u00e4hlen. Grundfl\u00e4chen-Eckpunkte ziehbar.',
            pan: 'Klicken und ziehen zum Verschieben der Ansicht',
            ground: 'Klicken um Eckpunkte zu setzen. Doppelklick oder Enter zum Abschlie\u00dfen. Esc zum Abbrechen.',
            area: 'Klicken um Gebietspunkte zu setzen. Doppelklick oder Enter zum Abschlie\u00dfen. Esc zum Abbrechen.',
            text: 'Klicken um ein Textfeld zu platzieren.',
            measure: 'Klicken und ziehen um Abst\u00e4nde zu messen',
            place: pendingTemplate ? `"${pendingTemplate.name}" platzieren \u2013 Klick auf die Fl\u00e4che. Esc zum Abbrechen.` : '',
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
        groundEditVertex = -1;
        updateHint();
        UI.updateToolButtons('place');
        Canvas.canvas.style.cursor = 'crosshair';
        Canvas.render();
    }

    // --- Mouse position helpers ---
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

    // --- Ground vertex hit-testing ---
    function findGroundVertex(world, site) {
        if (!site.ground || site.ground.length === 0) return -1;
        const threshold = 8 / Canvas.zoom(); // 8 screen pixels
        for (let i = 0; i < site.ground.length; i++) {
            const pt = site.ground[i];
            const d = Math.sqrt((world.x - pt.x) ** 2 + (world.y - pt.y) ** 2);
            if (d < threshold) return i;
        }
        return -1;
    }

    function findGroundEdge(world, site) {
        if (!site.ground || site.ground.length < 2) return -1;
        const threshold = 5 / Canvas.zoom();
        for (let i = 0; i < site.ground.length; i++) {
            const a = site.ground[i];
            const b = site.ground[(i + 1) % site.ground.length];
            const dist = pointToSegmentDist(world, a, b);
            if (dist < threshold) return i;
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

    // --- Event handlers ---
    function onMouseDown(e) {
        const site = State.activeSite;
        if (!site) return;
        const world = getMouseWorld(e);
        const snapped = snapWorld(world);

        // Middle mouse or shift+click: always pan
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
            case 'text': onTextClick(snapped, site); break;
            case 'measure': drag = { type: 'measure', x1: snapped.x, y1: snapped.y, x2: snapped.x, y2: snapped.y }; break;
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
        }

        // 2. Check ground vertex drag
        const vi = findGroundVertex(world, site);
        if (vi >= 0) {
            groundEditVertex = vi;
            drag = { type: 'groundVertex', vertexIndex: vi };
            Canvas.clearSelection();
            UI.hideProperties();
            Canvas.render();
            return;
        }

        // 3. Check object hit
        const hit = [...site.objects].reverse().find(o => Canvas.pointInObj(world.x, world.y, o));
        if (hit) {
            if (ctrlKey) {
                // Ctrl+click: toggle selection
                Canvas.toggleSelection(hit.id);
                if (Canvas.selectionCount === 1) {
                    UI.showProperties(site.objects.find(o => o.id === Canvas.selectedId));
                } else {
                    UI.showMultiProperties();
                }
            } else if (Canvas.isSelected(hit.id) && Canvas.selectionCount > 1) {
                // Clicking on already-selected object in multi-selection: start move
            } else {
                // Normal click: select only this one
                Canvas.selectedId = hit.id;
                UI.showProperties(hit);
            }
            // Start move drag for all selected
            drag = {
                type: 'move',
                offsetX: world.x, offsetY: world.y,
                origPositions: getSelectedPositions(site),
                moved: false,
            };
        } else {
            if (ctrlKey) {
                // Ctrl+click on empty: don't clear, start rect select additive
                drag = { type: 'rectSelect', x1: world.x, y1: world.y, additive: true };
            } else {
                // Click on empty: clear and start rect select
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

        // First click: if ground already exists, ask whether to replace
        if (preview.length === 0 && site.ground.length >= 3) {
            if (!confirm('Es gibt bereits eine Grundfl\u00e4che. Soll diese ersetzt werden?')) {
                setTool('select');
                return;
            }
        }

        // Close polygon if clicking near first point
        if (preview.length >= 3) {
            const first = preview[0];
            const dist = Math.sqrt((pos.x - first.x) ** 2 + (pos.y - first.y) ** 2);
            if (dist < 0.5) {
                finishGround(site);
                return;
            }
        }
        preview.push({ x: pos.x, y: pos.y });
        Canvas.render();
    }

    function finishGround(site) {
        if (Canvas.groundPreview.length >= 3) {
            site.ground = [...Canvas.groundPreview];
            State.notifyChange();
        }
        Canvas.groundPreview = [];
        setTool('select');
    }

    function onPlaceClick(pos, site) {
        if (!pendingTemplate) return;
        // Snap edge to grid instead of center
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
        Canvas.render();
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
            const name = prompt('Gebiet benennen:', 'Gebiet') || 'Gebiet';
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

    // --- Text tool ---
    function onTextClick(pos, site) {
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
                    // Move all selected objects by delta from original positions
                    site.objects.forEach(obj => {
                        if (!Canvas.isSelected(obj.id)) return;
                        const orig = drag.origPositions[obj.id];
                        if (!orig) return;
                        const nx = orig.x + dx;
                        const ny = orig.y + dy;
                        if (obj.points && orig.points) {
                            const ddx = nx - obj.x, ddy = ny - obj.y;
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
                    site.ground[drag.vertexIndex] = { x: pt.x, y: pt.y };
                    Canvas.render();
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
            // Hover detection for select tool
            if (activeTool === 'select') {
                // Check ground vertices first
                const vi = findGroundVertex(world, site);
                if (vi >= 0) {
                    Canvas.canvas.style.cursor = 'grab';
                    Canvas.hoveredId = null;
                    Canvas.render();
                    // Highlight the vertex
                    Canvas.highlightGroundVertex = vi;
                    Canvas.render();
                    return;
                }
                Canvas.highlightGroundVertex = -1;

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

            // Ground tool: preview line to cursor
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

            // Path/Area tool: preview line to cursor
            if (activeTool === 'area' && Canvas.pathPreview.length > 0) {
                Canvas.render();
                const ctx = Canvas.canvas.getContext('2d');
                const last = Canvas.pathPreview[Canvas.pathPreview.length - 1];
                const p1 = Canvas.w2s(last.x, last.y);
                const p2 = Canvas.w2s(snapped.x, snapped.y);
                ctx.setLineDash([6, 4]);
                ctx.strokeStyle = '#6366f188';
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
            if (drag.type === 'rotate') {
                State.notifyChange();
                const obj = State.activeSite?.objects.find(o => o.id === drag.objId);
                if (obj) UI.showProperties(obj);
            }
            if (drag.type === 'groundVertex') {
                State.notifyChange();
            }
            if (drag.type === 'rectSelect') {
                // Select objects within rectangle
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
            groundEditVertex = -1;
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

        switch (e.key) {
            case 'v': case 'V': setTool('select'); break;
            case 'h': case 'H': setTool('pan'); break;
            case 'g': case 'G': setTool('ground'); break;
            case 'a': case 'A': setTool('area'); break;
            case 't': case 'T': setTool('text'); break;
            case 'm': case 'M': setTool('measure'); break;
            case 'Escape':
                if (activeTool === 'ground') {
                    Canvas.groundPreview = [];
                    setTool('select');
                } else if (activeTool === 'area') {
                    Canvas.pathPreview = [];
                    setTool('select');
                } else if (activeTool === 'place' || activeTool === 'text') {
                    setTool('select');
                } else if (Canvas.selectionCount > 0) {
                    Canvas.clearSelection();
                    UI.hideProperties();
                    Canvas.render();
                }
                break;
            case 'Enter':
                if (activeTool === 'ground') finishGround(State.activeSite);
                if (activeTool === 'area') finishArea(State.activeSite);
                break;
            case 'Delete':
            case 'Backspace':
                if (Canvas.selectionCount > 0) {
                    [...Canvas.selectedIds].forEach(id => State.removeObject(id));
                    Canvas.clearSelection();
                    UI.hideProperties();
                    Canvas.render();
                }
                break;
            case 'z':
                if (e.ctrlKey || e.metaKey) { e.preventDefault(); State.undo(); Canvas.render(); }
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

        // Check ground vertex right-click (to delete/add)
        const vi = findGroundVertex(world, site);
        if (vi >= 0) {
            UI.showGroundVertexMenu(e.clientX, e.clientY, vi);
            return;
        }

        // Check ground edge right-click (to add vertex)
        const ei = findGroundEdge(world, site);
        if (ei >= 0) {
            UI.showGroundEdgeMenu(e.clientX, e.clientY, ei, snapWorld(world));
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
