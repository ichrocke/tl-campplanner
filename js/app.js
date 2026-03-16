/* ========================================
   App – Initialisierung & Event-Binding
   ======================================== */

(function () {
    // Initialize state
    State.clear(); // creates first site

    // Initialize canvas
    Canvas.init(document.getElementById('canvas'));

    // Initialize UI
    UI.init();
    UI.syncSettings();
    I18n.updateDOM();

    // Language change handler
    I18n.onChange(() => {
        UI.translateUI();
        UI.syncSettings();
        Canvas.render();
    });

    // State change handler
    State.onChange(() => {
        UI.buildTabs();
        UI.buildPalette();
        UI.buildPlacedList();
        UI.syncSettings();
        Canvas.render();
    });

    // Canvas events
    const c = Canvas.canvas;
    c.addEventListener('mousedown', (e) => Tools.onMouseDown(e));
    c.addEventListener('mousemove', (e) => Tools.onMouseMove(e));
    c.addEventListener('mouseup', (e) => Tools.onMouseUp(e));
    c.addEventListener('wheel', (e) => Tools.onWheel(e), { passive: false });
    c.addEventListener('contextmenu', (e) => Tools.onContextMenu(e));
    c.addEventListener('dblclick', (e) => Tools.onDblClick(e));

    // Keyboard events
    document.addEventListener('keydown', (e) => Tools.onKeyDown(e));

    // Prevent browser context menu on canvas
    c.addEventListener('contextmenu', (e) => e.preventDefault());

    // Warn before leaving page
    window.addEventListener('beforeunload', (e) => {
        const hasContent = State.sites.some(s => s.objects.length > 0 || (s.grounds && s.grounds.length > 0));
        if (hasContent) {
            e.preventDefault();
            e.returnValue = '';
        }
    });

    // Initial render
    Canvas.render();

    // Resize observer for canvas
    const ro = new ResizeObserver(() => {
        Canvas.resize();
        Canvas.render();
    });
    ro.observe(document.getElementById('canvas-container'));
})();
