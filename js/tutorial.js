/* ========================================
   Tutorial – Step-by-step intro overlay (experimental)
   ======================================== */
const Tutorial = (() => {
    let _stepIdx = 0;
    let _running = false;
    let _resizeHandler = null;
    let _pollHandle = null;
    let _baseline = null; // snapshot of state used by interactive steps

    function snapshotCounts() {
        const site = State.activeSite;
        if (!site) return { ground: 0, nonGround: 0 };
        let g = 0, n = 0;
        site.objects.forEach(o => { if (o.type === 'ground') g++; else n++; });
        return { ground: g, nonGround: n };
    }

    function steps() {
        return [
            {
                target: null,
                title: I18n.t('tutorial.step1.title'),
                text: I18n.t('tutorial.step1.text'),
            },
            {
                target: '[data-tool="ground"]',
                title: I18n.t('tutorial.step2.title'),
                text: I18n.t('tutorial.step2.text'),
                onEnter() { _baseline = snapshotCounts(); },
                check() { return Tools.activeTool === 'ground'; },
            },
            {
                target: '#canvas',
                title: I18n.t('tutorial.step3.title'),
                text: I18n.t('tutorial.step3.text'),
                check() {
                    const c = snapshotCounts();
                    return _baseline && c.ground > _baseline.ground;
                },
            },
            {
                target: '#object-palette',
                title: I18n.t('tutorial.step4.title'),
                text: I18n.t('tutorial.step4.text'),
                onEnter() { _baseline = snapshotCounts(); },
                check() { return Tools.activeTool === 'place'; },
            },
            {
                target: '#canvas',
                title: I18n.t('tutorial.step4b.title'),
                text: I18n.t('tutorial.step4b.text'),
                check() {
                    const c = snapshotCounts();
                    return _baseline && c.nonGround > _baseline.nonGround;
                },
            },
            {
                target: '#properties',
                title: I18n.t('tutorial.step5.title'),
                text: I18n.t('tutorial.step5.text'),
            },
            {
                target: '#placed-objects-list',
                title: I18n.t('tutorial.step6.title'),
                text: I18n.t('tutorial.step6.text'),
            },
            {
                target: '#layers-list',
                title: I18n.t('tutorial.step7.title'),
                text: I18n.t('tutorial.step7.text'),
            },
            {
                target: '#tabs-container',
                title: I18n.t('tutorial.step8.title'),
                text: I18n.t('tutorial.step8.text'),
            },
            {
                target: '#floating-tools',
                title: I18n.t('tutorial.step9.title'),
                text: I18n.t('tutorial.step9.text'),
            },
            {
                target: '#btn-exportmenu',
                title: I18n.t('tutorial.step10.title'),
                text: I18n.t('tutorial.step10.text'),
                emphasize: true,
            },
            {
                target: '#btn-settings',
                title: I18n.t('tutorial.step11.title'),
                text: I18n.t('tutorial.step11.text'),
            },
            {
                target: null,
                title: I18n.t('tutorial.step12.title'),
                text: I18n.t('tutorial.step12.text'),
            },
        ];
    }

    function start() {
        if (_running) return;
        _running = true;
        _stepIdx = 0;
        ensureDom();
        _resizeHandler = () => render();
        window.addEventListener('resize', _resizeHandler);
        render();
    }

    function stop() {
        _running = false;
        const overlay = document.getElementById('tutorial-overlay');
        const popup = document.getElementById('tutorial-popup');
        if (overlay) overlay.classList.add('hidden');
        if (popup) popup.classList.add('hidden');
        if (_resizeHandler) window.removeEventListener('resize', _resizeHandler);
        _resizeHandler = null;
        stopPolling();
    }

    function next() {
        stopPolling();
        _stepIdx++;
        if (_stepIdx >= steps().length) { stop(); return; }
        render();
    }

    function prev() {
        stopPolling();
        if (_stepIdx > 0) _stepIdx--;
        render();
    }

    function startPolling() {
        stopPolling();
        const step = steps()[_stepIdx];
        if (!step || !step.check) return;
        _pollHandle = setInterval(() => {
            try {
                if (step.check()) next();
            } catch (e) { /* swallow */ }
        }, 300);
    }

    function stopPolling() {
        if (_pollHandle) { clearInterval(_pollHandle); _pollHandle = null; }
    }

    function ensureDom() {
        if (document.getElementById('tutorial-overlay')) return;
        const overlay = document.createElement('div');
        overlay.id = 'tutorial-overlay';
        overlay.className = 'tutorial-overlay hidden';
        overlay.innerHTML = '<div id="tutorial-spotlight" class="tutorial-spotlight"></div>';
        document.body.appendChild(overlay);

        const popup = document.createElement('div');
        popup.id = 'tutorial-popup';
        popup.className = 'tutorial-popup hidden';
        popup.innerHTML = `
            <div class="tutorial-badge">EXPERIMENTAL</div>
            <h3 id="tutorial-title"></h3>
            <p id="tutorial-text"></p>
            <div id="tutorial-hint" class="tutorial-hint"></div>
            <div class="tutorial-footer">
                <span id="tutorial-counter"></span>
                <div class="tutorial-actions">
                    <button id="tutorial-skip" class="btn-secondary"></button>
                    <button id="tutorial-prev" class="btn-secondary"></button>
                    <button id="tutorial-next" class="btn-primary"></button>
                </div>
            </div>`;
        document.body.appendChild(popup);

        document.getElementById('tutorial-skip').addEventListener('click', stop);
        document.getElementById('tutorial-prev').addEventListener('click', prev);
        document.getElementById('tutorial-next').addEventListener('click', next);
        document.addEventListener('keydown', (e) => {
            if (!_running) return;
            if (e.key === 'Escape') stop();
            else if (e.key === 'ArrowRight' || e.key === 'Enter') next();
            else if (e.key === 'ArrowLeft') prev();
        });
    }

    function render() {
        const all = steps();
        const step = all[_stepIdx];
        if (!step) { stop(); return; }
        const overlay = document.getElementById('tutorial-overlay');
        const spotlight = document.getElementById('tutorial-spotlight');
        const popup = document.getElementById('tutorial-popup');
        const titleEl = document.getElementById('tutorial-title');
        const textEl = document.getElementById('tutorial-text');
        const hintEl = document.getElementById('tutorial-hint');
        const counter = document.getElementById('tutorial-counter');
        const skipBtn = document.getElementById('tutorial-skip');
        const prevBtn = document.getElementById('tutorial-prev');
        const nextBtn = document.getElementById('tutorial-next');

        overlay.classList.remove('hidden');
        popup.classList.remove('hidden');
        popup.classList.toggle('emphasize', !!step.emphasize);
        titleEl.textContent = step.title;
        textEl.textContent = step.text;
        if (step.check) {
            hintEl.textContent = I18n.t('tutorial.waitingHint');
            hintEl.classList.remove('hidden');
        } else {
            hintEl.classList.add('hidden');
        }
        counter.textContent = `${_stepIdx + 1} / ${all.length}`;
        skipBtn.textContent = I18n.t('tutorial.skip');
        prevBtn.textContent = I18n.t('tutorial.prev');
        nextBtn.textContent = step.check ? I18n.t('tutorial.skipStep') : ((_stepIdx === all.length - 1) ? I18n.t('tutorial.finish') : I18n.t('tutorial.next'));
        prevBtn.style.visibility = _stepIdx === 0 ? 'hidden' : 'visible';

        if (typeof step.onEnter === 'function') {
            try { step.onEnter(); } catch (e) {}
        }

        let rect = null;
        if (step.target) {
            const el = document.querySelector(step.target);
            if (el) rect = el.getBoundingClientRect();
        }
        if (rect && rect.width > 0 && rect.height > 0) {
            const pad = 6;
            spotlight.style.left = (rect.left - pad) + 'px';
            spotlight.style.top = (rect.top - pad) + 'px';
            spotlight.style.width = (rect.width + pad * 2) + 'px';
            spotlight.style.height = (rect.height + pad * 2) + 'px';
            spotlight.style.display = 'block';
            positionPopupNear(popup, rect);
        } else {
            spotlight.style.display = 'none';
            popup.style.left = '50%';
            popup.style.top = '50%';
            popup.style.transform = 'translate(-50%, -50%)';
        }

        if (step.check) startPolling();
    }

    function positionPopupNear(popup, rect) {
        popup.style.transform = 'none';
        const ww = window.innerWidth, wh = window.innerHeight;
        const pw = popup.offsetWidth, ph = popup.offsetHeight;
        const margin = 16;
        let left, top;
        if (rect.right + margin + pw <= ww - 8) {
            left = rect.right + margin;
            top = Math.max(8, Math.min(wh - ph - 8, rect.top));
        } else if (rect.left - margin - pw >= 8) {
            left = rect.left - margin - pw;
            top = Math.max(8, Math.min(wh - ph - 8, rect.top));
        } else if (rect.bottom + margin + ph <= wh - 8) {
            left = Math.max(8, Math.min(ww - pw - 8, rect.left));
            top = rect.bottom + margin;
        } else {
            left = Math.max(8, Math.min(ww - pw - 8, rect.left));
            top = Math.max(8, rect.top - ph - margin);
        }
        popup.style.left = left + 'px';
        popup.style.top = top + 'px';
    }

    return { start, stop, next, prev, get isRunning() { return _running; } };
})();
