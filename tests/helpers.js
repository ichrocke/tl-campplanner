/* Gemeinsame Helfer fuer die Playwright-Specs (siehe README.md) */
const { chromium } = require('playwright');

const BASE = process.env.CAMP_URL || 'http://127.0.0.1:8931/index.html';

async function launch(opts) {
    const browser = await chromium.launch({ channel: process.env.CAMP_CHROME || 'chrome', headless: true });
    const page = await browser.newPage(Object.assign({ viewport: { width: 1400, height: 900 } }, opts || {}));
    const state = { browser, page, results: [], consoleErrors: [], nativeDialogs: 0 };
    page.on('console', m => { if (m.type() === 'error') state.consoleErrors.push(m.text()); });
    page.on('pageerror', e => state.consoleErrors.push('pageerror: ' + e.message));
    page.on('dialog', async d => {
        if (d.type() === 'beforeunload') { await d.accept(); return; }
        state.nativeDialogs++;
        await d.dismiss();
    });
    return state;
}

// Startbildschirm aufraeumen: Datenverlust-Hinweis + Auto-Tutorial
async function setup(page) {
    await page.waitForSelector('#layers-list .layer-item');
    const u = await page.$('button:has-text("Understood"), button:has-text("Verstanden")');
    if (u) await u.click();
    await page.evaluate(() => {
        if (typeof Tutorial !== 'undefined') Tutorial.stop();
        ['tutorial-overlay', 'tutorial-popup'].forEach(id => {
            const t = document.getElementById(id);
            if (t) t.remove();
        });
    });
}

async function open(state) {
    await state.page.goto(BASE);
    await setup(state.page);
}

function stepper(state) {
    return (ok, label, detail) => {
        state.results.push(`${ok ? 'OK ' : 'FAIL'} | ${label}${detail ? ' | ' + detail : ''}`);
        if (!ok) process.exitCode = 1;
    };
}

// Ebene ueber den In-App-Prompt anlegen
async function addLayer(page, name) {
    await page.click('#btn-add-layer');
    await page.waitForSelector('.dialog-overlay .dialog-input');
    await page.fill('.dialog-overlay .dialog-input', name);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => !document.querySelector('.dialog-overlay'));
}

// Standard-Abschlusschecks (keine nativen Dialoge, keine Konsolenfehler)
async function finish(state) {
    const step = stepper(state);
    step(state.nativeDialogs === 0, 'No native browser dialogs', `count=${state.nativeDialogs}`);
    const realErrors = state.consoleErrors.filter(e => !/favicon|404|net::ERR/i.test(e));
    step(realErrors.length === 0, 'No console/page errors', realErrors.join(' || ').slice(0, 300));
    console.log(state.results.join('\n'));
    await state.browser.close();
}

async function fail(state, e) {
    console.log(state.results.join('\n'));
    console.error('SPEC ERROR:', e && e.message ? e.message : e);
    try { await state.browser.close(); } catch (x) {}
    process.exit(2);
}

module.exports = { BASE, launch, setup, open, stepper, addLayer, finish, fail };
