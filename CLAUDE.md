# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Zeltplatzplaner (Camp Site Planner) – a vanilla HTML/JS/CSS desktop-first web application for planning tent camp layouts. No build system, no framework, no dependencies. Open `index.html` directly in a browser.

## Architecture

- **State management**: `js/state.js` – singleton IIFE (`State`) holding all data (sites, objects, undo stack). Single source of truth.
- **Rendering**: `js/canvas.js` – HTML5 Canvas 2D rendering engine (`Canvas`). Handles world↔screen coordinate transforms, grid, object drawing, distance computation, hit-testing.
- **Interaction**: `js/tools.js` – mouse/keyboard event handling (`Tools`). Tool state machine (select, pan, ground, measure, place).
- **UI**: `js/ui.js` – DOM manipulation for sidebar, tabs, property panel, modals, context menus (`UI`).
- **IO**: `js/io.js` – JSON export/import and print-to-window (`IO`).
- **Bootstrap**: `js/app.js` – wires everything together, loaded last.

All JS files use the IIFE/revealing module pattern exposing global singletons. Load order matters: state → canvas → tools → ui → io → app.

## Key Design Decisions

- **No browser storage**: No localStorage/sessionStorage. All persistence via JSON export/import.
- **Cache busting**: `index.html` uses `document.write` with `Date.now()` query params to force-reload all JS/CSS.
- **Coordinate system**: World coordinates in meters. `Canvas.w2s()` / `Canvas.s2w()` convert between world and screen pixels. Base scale: 30px per meter × zoom factor.
- **Distance calculation**: Edge-to-edge distance between rotated rectangles using segment-to-segment distance algorithm. Guy rope distances included in boundary. Color coding: red (< min), yellow (< 1.5× min), green (>= 1.5× min).

## Conventions

- All UI text is in German.
- CHANGELOG.md must be updated with every feature change.
- Desktop-first design; light/modern theme using CSS custom properties in `:root`.
- No emoji in code or UI labels (Unicode symbols for icons only).
