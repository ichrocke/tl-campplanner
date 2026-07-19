---
name: verify
description: How to run and verify the Zeltplatzplaner app end-to-end in a headless browser.
---

# Verify Zeltplatzplaner

**Repo test suite exists:** `cd tests && npm install && node run-all.js`
(9 Playwright specs, starts its own server; `SKIP_ONLINE=1` skips the
hoehendaten.de API specs). Prefer extending it over ad-hoc scripts.

Vanilla HTML/JS app, no build step. Serve and drive with Playwright + system Chrome:

```bash
# 1. Serve the repo (any static server works)
python3 -m http.server 8931 --bind 127.0.0.1   # from repo root, run in background

# 2. Playwright in a scratch dir (no repo pollution); uses installed Chrome
npm init -y && npm install playwright
# launch: chromium.launch({ channel: 'chrome', headless: true })
```

Gotchas discovered:
- On first load a "Notice: ... no automatic backups" overlay blocks all clicks —
  click `button:has-text("Understood")` (or "Verstanden") first.
- Tutorial may auto-start on empty state: `Tutorial.stop()` + remove
  `#tutorial-overlay` / `#tutorial-popup`.
- macOS: Ctrl+click is a right-click; use `modifiers: ['Meta']` for
  multi-select interactions (app code checks `ctrlKey || metaKey`).
- Layer list re-renders on every action (`UI.buildLayers()`), so element
  handles go stale — always use fresh selectors like
  `#layers-list .layer-item:nth-child(N) .layer-name`.
- `#btn-clear-all` lives inside the settings modal (`#btn-settings` first).
- App state is reachable via globals: `State.activeSite`, `Canvas`, `UI`.
- Default language is English until a flag is clicked (`#lang-flags`).
- In-app dialogs (confirm/prompt/alert replacement) use `.dialog-overlay`,
  `.dialog-input`, `.btn-primary` / `.btn-secondary`; native browser dialogs
  must never appear (assert with `page.on('dialog', ...)`).
