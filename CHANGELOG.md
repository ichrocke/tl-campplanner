# Changelog

## [5.4.0] - 2026-03-20

### Added
- **Minimap**: Overview map in top-right corner showing all objects and ground areas. Blue rectangle indicates current viewport. Click on minimap to navigate. Automatically hidden in print/export output

## [5.3.0] - 2026-03-20

### Added
- **Black & white print**: Checkbox in export dialog to convert output to grayscale
- **Multi-object export/import**: Export button in multi-selection panel saves all selected objects. Import via right-click recognizes multi-object files and places them centered on click
- **Color palette persistence**: Saved colors included in auto-save and JSON export/import
- **Show distances persistence**: Toggle state saved in export

### Changed
- Label size now affects ground area and area object names (was hardcoded)
- Clear all resets color palette to defaults and showDistances to off
- Post-it toolbar icon uses outline style matching other icons

### Fixed
- Description size, label size, line width, rope width fields show empty with "auto" placeholder instead of "0"

## [5.2.1] - 2026-03-20

### Changed
- **Settings dialog: 4-column layout** - Settings split into Grid/Snap, Display, Shortcuts Tools, Shortcuts Edit for compact overview
- **Keyboard shortcuts** organized in categories with colored headers

### Fixed
- Grid snapping for ground/area objects: uses bounding box of actual points instead of width/height (which is 0)

## [5.2.0] - 2026-03-20

### Added
- **Non-rotating labels**: Object names stay horizontal when objects are rotated
- **Label offset**: Adjustable Label X/Y offset in display section to position names
- **Permanent distance display**: Checkbox in settings + B key to show all distances permanently
- **Compass rotation**: Slider in settings (0-360°) to align compass with actual north
- **Alt+Drag rectangle**: Hold Alt while using Ground (G) or Area (A) tool to drag a rectangle with live width/height/area display
- **Decagon (10-sided)** and **Dodecagon (12-sided)** shapes with Yurt templates
- **Lock for all objects**: Lock/freeze available for all object types (was only ground/bgimage)
- **Paint all objects**: Paint tool works on all object types (was only tent/ground)

### Fixed
- Labels on ground areas and area objects now support offset
- ctx.measureText crash when obj.name is null
- z was zoom function (not number) in drawGround label offset
- Ctrl+drag failed (Ctrl+click = right-click on Mac), changed to Alt+drag

## [5.1.0] - 2026-03-19

### Added
- **Ctrl+S**: Keyboard shortcut for JSON export
- **Offline download** (textarea-based): Single self-contained HTML file with all CSS, JS, images, fonts and languages embedded. Uses hidden textarea + DOM script injection to avoid HTML parser conflicts
- **Pirate font** ("Pieces of Eight"): Used for all text in treasure map mode

### Changed
- **Treasure map complete overhaul**:
  - No meter/m² labels, no symbols, no post-its, no guidelines, no descriptions
  - Objects: only wobbly hand-drawn outlines (no fill, no guy ropes, no entrance markers)
  - Ground areas: irregular wobbly outlines
  - All text in pirate font with slight rotation
  - Title large in pirate font top-left
  - Paper tears: physics-based rip simulation (rare but up to 200px deep, smooth curved returns)
  - Paper creases: wide gradient-based folds (40px shadow + 30px highlight with sharp center line)
  - More grain noise, bigger stain spots, stronger vignette
  - Font preloaded via document.fonts.load() before rendering

### Removed
- PDF HD export
- Responsive sidebar toggle

### Fixed
- Offline mode: all previous approaches (inline scripts, base64, JSON.stringify) failed due to HTML parser conflicts. Final solution uses textarea storage + DOM script element creation
- findGroundVertex reference error removed
- Compass image path patched in both canvas.js and io.js for offline

## [5.0.0] - 2026-03-18

### Added
- **Unified Export/Print dialog**: Single icon in toolbar opens new two-column modal with JSON import/export, print settings, and 6 format buttons (PNG, JPEG, PDF, PDF HD, SVG, DXF) + donate link
- **Prominent empty site placeholder**: Large text "Draw ground area here" with "Press G" hint and ground tool icon when site is empty

### Changed
- Import, Export, Print buttons removed from toolbar (replaced by single export icon)
- Import/Export removed from settings dialog
- Settings dialog cleaned up

### Removed
- Separate print button, import button, export button from toolbar

## [4.2.0] - 2026-03-18

### Added
- **Post-it notes** (N): Yellow sticky notes placeable on canvas with multiline text, shadow effect and folded corner. Editable text, color and size in properties
- **Notebook popup**: Full-size modal with large textarea (was invisible due to wrong DOM placement)

### Changed
- **PDF HD**: Now downloads as high-res PNG directly (was opening browser tab)
- **Settings dialog**: Wider (780px), export buttons in 3-column grid
- **Pipes**: Show as "pipe" in placed objects, "note" for post-its

### Fixed
- Notebook modal was outside modal-overlay, causing invisible popup

### Removed
- Escape route tool
- Responsive sidebar toggle

## [4.1.0] - 2026-03-18

### Added
- **DXF export**: Export plan as DXF file for CAD software (AutoCAD etc.)
- **PDF HD export**: High-resolution zoomable PDF-like export (4x DPI, opens in browser, printable)
- **Notebook popup**: Full-size notepad modal with large textarea (was prompt dialog)

### Changed
- Pipes show as "pipe" in placed objects list (was "fence")

### Removed
- Escape route tool (use pipe tool with green color instead)
- Responsive sidebar toggle (not needed)

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
