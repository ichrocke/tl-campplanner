/* ========================================
   Touch – Touch-Event-Handling für Tablets
   ======================================== */

const Touch = (() => {
    let _lastTap = 0;
    let _longPressTimer = null;
    let _pinchStartDist = 0;
    let _pinchStartZoom = 1;
    let _isPinching = false;
    let _isPanning = false;
    let _touchStartPos = null;
    let _hasMoved = false;

    function init(canvasEl) {
        canvasEl.addEventListener('touchstart', onTouchStart, { passive: false });
        canvasEl.addEventListener('touchmove', onTouchMove, { passive: false });
        canvasEl.addEventListener('touchend', onTouchEnd, { passive: false });
        canvasEl.addEventListener('touchcancel', onTouchEnd, { passive: false });

        // Make floating panels draggable with touch
        initPanelDrag('floating-tools', 'floating-tools-handle');
        initPanelDrag('color-palette', 'color-palette-handle');
    }

    function touchToMouse(touch, type, extras) {
        return {
            clientX: touch.clientX,
            clientY: touch.clientY,
            button: (extras && extras.button) || 0,
            shiftKey: false,
            ctrlKey: false,
            metaKey: false,
            preventDefault: () => {},
            stopPropagation: () => {},
            target: touch.target,
            ...extras,
        };
    }

    function getTouchDist(t1, t2) {
        const dx = t2.clientX - t1.clientX;
        const dy = t2.clientY - t1.clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    function getTouchCenter(t1, t2) {
        return {
            clientX: (t1.clientX + t2.clientX) / 2,
            clientY: (t1.clientY + t2.clientY) / 2,
        };
    }

    function onTouchStart(e) {
        e.preventDefault();

        if (e.touches.length === 2) {
            // Pinch-to-zoom start
            clearTimeout(_longPressTimer);
            _isPinching = true;
            _isPanning = false;
            _pinchStartDist = getTouchDist(e.touches[0], e.touches[1]);
            const site = State.activeSite;
            _pinchStartZoom = site ? site.view.zoom : 1;
            Tools.onMouseUp(touchToMouse(e.touches[0], 'mouseup'));
            return;
        }

        if (e.touches.length === 1) {
            _isPinching = false;
            _hasMoved = false;
            _touchStartPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };

            // Long press for context menu (500ms)
            _longPressTimer = setTimeout(() => {
                if (!_hasMoved) {
                    Tools.onContextMenu(touchToMouse(e.touches[0], 'contextmenu'));
                }
            }, 500);

            // Double tap detection
            const now = Date.now();
            if (now - _lastTap < 300) {
                clearTimeout(_longPressTimer);
                Tools.onDblClick(touchToMouse(e.touches[0], 'dblclick'));
                _lastTap = 0;
                return;
            }
            _lastTap = now;

            Tools.onMouseDown(touchToMouse(e.touches[0], 'mousedown'));
        }
    }

    function onTouchMove(e) {
        e.preventDefault();

        if (_isPinching && e.touches.length === 2) {
            // Pinch zoom
            const dist = getTouchDist(e.touches[0], e.touches[1]);
            const scale = dist / _pinchStartDist;
            const site = State.activeSite;
            if (site) {
                const newZoom = Math.max(0.05, Math.min(20, _pinchStartZoom * scale));
                const center = getTouchCenter(e.touches[0], e.touches[1]);
                const rect = Canvas.canvas.getBoundingClientRect();
                const mx = center.clientX - rect.left;
                const my = center.clientY - rect.top;
                const worldBefore = Canvas.s2w(mx, my);
                site.view.zoom = newZoom;
                const worldAfter = Canvas.s2w(mx, my);
                site.view.panX += worldAfter.x - worldBefore.x;
                site.view.panY += worldAfter.y - worldBefore.y;
                UI.updateZoom(newZoom);
                Canvas.render();
            }
            return;
        }

        if (e.touches.length === 1) {
            const dx = e.touches[0].clientX - (_touchStartPos ? _touchStartPos.x : 0);
            const dy = e.touches[0].clientY - (_touchStartPos ? _touchStartPos.y : 0);
            if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                _hasMoved = true;
                clearTimeout(_longPressTimer);
            }
            Tools.onMouseMove(touchToMouse(e.touches[0], 'mousemove'));
        }
    }

    function onTouchEnd(e) {
        clearTimeout(_longPressTimer);

        if (_isPinching) {
            if (e.touches.length === 0) {
                _isPinching = false;
            }
            return;
        }

        if (e.changedTouches.length > 0) {
            Tools.onMouseUp(touchToMouse(e.changedTouches[0], 'mouseup'));
        }
    }

    // --- Panel drag with touch ---
    function initPanelDrag(panelId, handleId) {
        const panel = document.getElementById(panelId);
        const handle = document.getElementById(handleId);
        if (!panel || !handle) return;

        let dragging = false, offX = 0, offY = 0;

        handle.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                dragging = true;
                offX = e.touches[0].clientX - panel.offsetLeft;
                offY = e.touches[0].clientY - panel.offsetTop;
                e.preventDefault();
            }
        }, { passive: false });

        document.addEventListener('touchmove', (e) => {
            if (!dragging) return;
            const container = document.getElementById('canvas-container');
            const rect = container.getBoundingClientRect();
            let nx = e.touches[0].clientX - offX;
            let ny = e.touches[0].clientY - offY;
            nx = Math.max(0, Math.min(rect.width - panel.offsetWidth, nx));
            ny = Math.max(0, Math.min(rect.height - panel.offsetHeight, ny));
            panel.style.left = nx + 'px';
            panel.style.top = ny + 'px';
        }, { passive: true });

        document.addEventListener('touchend', () => { dragging = false; });
    }

    return { init };
})();
