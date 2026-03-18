# Changelog

## [4.0.0] - 2026-03-18

### Added
- **Redo** (Ctrl+Y / Ctrl+Shift+Z): Undo steps can now be redone
- **Clipboard** (Ctrl+C / Ctrl+V): Copy and paste objects between sites
- **Ctrl+A**: Select all objects on the active layer
- **Arrow keys**: Move selected objects by 1 grid step
- **Layer opacity**: Right-click layer to set transparency (0.1-1.0)
- **Layer colors**: Click color dot on layer to set identification color
- **Layer merge**: Right-click to merge layer into the one below
- **Layer flatten**: Right-click to flatten all layers into one
- **Pipe length calculator**: Total pipe length shown in properties
- **Notebook**: Per-site notepad accessible from toolbar
- **Bulk color change**: Color picker in multi-selection properties to recolor all selected
- **Alignment tools**: Align left/right/top/bottom, distribute horizontally/vertically (multi-selection)
- **SVG export**: Export plan as SVG file (in settings)
- **Escape route tool**: Right-click canvas to start drawing an escape route (green dashed pipe)
- **Responsive layout**: Sidebar collapses on small screens with toggle button
- **Status bar info**: Shows selected object name, type and size

### Changed
- No distance measurements for ground areas, bgimages, guidelines, symbols

## [3.1.0] - 2026-03-18

### Added
- **Symbol library**: 12 safety/info symbols (First Aid, Fire Extinguisher, Gas Bottle, Electric, Water, WC, Parking, Info, Exit, No Fire, Assembly Point, Waste). Official SVG files for 6 symbols, programmatic for 6. Picker popup in toolbar
- **Pipe vertex editing**: Right-click to add/remove pipe vertices. Pipe vertices now draggable
- **Right-click edit for palette**: Right-click templates to rename, resize, recolor, change shape, adjust guy ropes. Right-click folders to rename or delete
- **Resizable layers panel**: Second sidebar divider between placed objects and layers. All three sections independently resizable
- **New layers on top**: New layers inserted above existing ones and auto-activated
- **Auto-switch active layer**: Clicking an object switches the active layer to that object's layer

### Changed
- **Layer delete**: Now deletes all objects on the layer (previously moved them)
- **Paint tool**: Now also works on ground areas (not just tents)
- **Default pipe color**: Blue (#0ea5e9) instead of brown

### Fixed
- Layers visible immediately on page load
- Sidebar divider no longer causes layout jump on first drag
- Layer panel stays visible when sidebar sections are resized

## [3.0.0] - 2026-03-18

### Added
- **Layer system**: Full layer management in sidebar with visibility toggle, layer locking, reorder, move objects between layers via context menu
- **Lock/freeze objects**: Ground areas and background images lockable via properties. Locked objects can't be moved or edited
- **Ground area rotation**: Full rotation support for ground polygons
- **Pipe tool** (F): Renamed from "Fence". Thick rounded lines with configurable thickness (1-20px) and junction point sizes. Color presets for Water/Electric/Fence/Gas
- **Ground areas as objects**: Full object capabilities - movable, groupable, colorable, rotatable, vertex-editable, shown in placed objects list. Export/import individual grounds with contained objects
- **Complete shortcuts table**: P (paint), +/- (grid size), Ctrl+G (group), Ctrl+Shift+G (ungroup)

## [2.4.0] - 2026-03-17

### Added
- **Tablet/touch support**: Tap, drag, pinch-to-zoom, long-press context menu, double-tap
- **Object grouping**: Ctrl+G to group, Ctrl+Shift+G to ungroup. Group names, rotation, placed list with indented members
- **Color palette**: 6-10 saveable colors + paint tool (P) for tent/ground recoloring
- **Tent entrance markers**: Green triangle marker with configurable side
- **Multiline text**: Descriptions and text fields support multiple lines with color/size options
- **Persistent guide lines**: Measure tool (M) creates permanent measurement annotations

### Changed
- **Print engine rewrite**: Uses real canvas renderer for pixel-perfect output at 300 DPI
- **Grid snapping**: Edge-based snapping, re-snaps after toggle

## [2.0.0] - 2026-03-16

### Added
- **Internationalization**: DE, EN, ES, IT with SVG flag buttons. JSON translation files
- **Floating tool palette**: Draggable icon-only toolbar on canvas
- **Background images as objects**: Multiple images, movable, rotatable, scalable with resize handles
- **Multiple ground areas**: Any number per site, selectable, deletable
- **Area/fence vertex editing**: Drag, add, remove points
- **Per-side guy ropes**: Enable/disable per side for rectangles
- **Keyboard shortcuts**: 1-0 quick placement, F2 rename, X delete

### Changed
- Single object placement mode, simplified toolbar, import/export in settings

## [1.8.0] - 2026-03-16

### Added
- Background image support, export formats (PDF/PNG/JPEG), display settings, north compass
- Properties panel redesign with sections

## [1.0.0] - 2026-03-16

### Initial Release
- Ground areas with edge lengths and m² display
- Grid with adjustable size and snapping
- Predefined tents (2P, 4P, Family, Group, Yurt) with guy ropes
- Objects: fire pit, bar, entrance + custom objects
- Shapes: rectangle, triangle, hexagon, octagon, circle
- Distance indicators (red/yellow/green), rotation, multi-selection
- Tab system for multiple camp sites
- JSON export/import, print dialog, undo (50 steps)
- Area tool, text tool, area textures
- Treasure map print style (experimental)
- Auto-save to localStorage, offline download (experimental)
- Object folders, palette reordering, object transparency
- Tab duplication, guide lines, zoom buttons
