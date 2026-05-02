# Changelog

## [6.0.0] - 2026-05-02

### Added
- **Interactive tutorial**: New step-by-step tour for first-time users. Welcomes the user, walks them through picking the ground tool, drawing a ground area and placing a tent (each interactive step auto-advances when the action is performed), then introduces properties, placed-objects sidebar, layers, tabs, tools, save & export and settings. Auto-starts on a fresh visit and after "Clear all"; can be relaunched anytime via the button at the top of the settings panel. Welcome step has language flags so the user can pick their language right away, and the tutorial re-renders live when the language is switched.
- **Sidebar search & sort**: Magnifier icon next to "Placed Objects" reveals a filter input; sort dropdown to order by Name, Size or Layer.
- **Zoom to object**: Double-click on a sidebar entry centers the canvas on the object and selects it.
- **Hover tooltip**: Hovering an object on the canvas shows its name, dimensions and guy rope distance. Ground and area polygons additionally show their surface in m².
- **Color eyedropper**: Pipette button next to the color input — single-selection and multi-selection — copies the color from any other canvas object onto the selected one(s). ESC cancels.
- **Per-side guy ropes for polygons**: Triangle, hexagon, octagon, decagon and dodecagon shapes now support enabling/disabling each side individually. Outline is computed as a true offset polygon with proper corner intersections.
- **Configurable peg count per rect side**: Each rectangle side accepts 0..20 evenly distributed mid-edge pegs; combined with the corner ropes this supports wall tents with multiple stake points per side.
- **Peg visualization**: Small dots are drawn at the end of every guy rope (corner and mid-edge) on canvas, print/PNG and SVG export. Toggleable per object.

### Changed
- **Drawing tools stay active**: Ground, area and place tools no longer return to "select" after one action. Draw or place several in a row; press ESC or click the select arrow to leave the tool.
- **Area tool**: No longer prompts for a name when finishing a polygon — uses the default "Area" which can be renamed in the properties panel.

## [5.8.6] - 2026-05-02

### Changed
- **Changelog**: Major version groups in the changelog modal are now collapsible. The current major is expanded by default, older majors start collapsed and can be opened with a chevron header.

## [5.8.5] - 2026-05-02

### Fixed
- **Guy ropes**: When disabling individual sides on a rectangular tent (e.g. front/back), the perpendicular side lines no longer extend by the guy rope distance past the body. Each outer dashed line now stops at the body corner if its adjacent side has no guy rope.
- **Guy ropes**: Corner ropes are now also drawn when only one of the two adjacent sides has guy ropes. They run perpendicular from the body corner directly to the dashed line of the active side, instead of being omitted entirely.

### Added
- **Per-side guy rope distance**: Rectangular objects can now have a custom guy rope distance per side (top/right/bottom/left). Empty input falls back to the global distance, `0` disables that side. The dashed outline and rope lines (canvas, PNG/print, SVG export) all respect the asymmetric setup.

## [5.8.4] - 2026-04-27

### Fixed
- **SVG export**: Tent entrances are now rendered as a green triangle marker on the tent edge (matching the canvas display) instead of a small circle, and respect the new `entrancePos` field allowing arbitrary positions along the perimeter for all shapes (rect, circle, triangle, hexagon, etc.)

## [5.8.3] - 2026-04-09

### Added
- **Layers**: Right-click on a layer to copy it (including all objects) to another tab
- **Map**: Press `K` to toggle map layer (satellite/OSM) visibility
- **Shortcuts**: Added `K` to the shortcuts overview in settings
- **Tabs**: Individual tabs can be exported and imported as separate JSON files via right-click context menu

### Fixed
- **Coordinate input**: Comma (`,`) is now accepted as decimal separator in latitude and longitude fields (in addition to period)
- **Collab**: Fix objects disappearing when multiple users work simultaneously – pending local operations are now preserved during remote state updates, paste sends individual ops instead of full-state push, conflict resolution reuses merge logic, tab switching no longer triggers unnecessary sync

## [5.8.2] - 2026-04-03

### Changed
- **Tabs**: Edit/Duplicate/Close buttons no longer appear on hover, replaced by right-click context menu
- **Tabs**: Plus button for new workspace placed directly to the right of the last tab

### Added
- **Changelog popup**: Link in the status bar opens changelog as popup with version navigation on the left (grouped by major version) and content on the right

## [5.8.1] - 2026-04-01

### Fixed
- **SVG export**: Respect per-object `hideName`, `hideDimensions`, and `hideDescription` flags (previously always shown)
- **SVG export**: Text objects now render multiline text correctly with correct font size, matching the canvas display

## [5.8.0] - 2026-03-27

### Added
- **Entrance free positioning**: Entrance markers can be placed anywhere along the object perimeter via slider (0-100%). Works for all shapes including circles, hexagons, octagons etc.
- **Per-object visibility**: Name, dimensions, and description can be hidden individually per object via checkboxes in the property panel
- **Image objects**: Insert arbitrary images as regular canvas objects (movable, rotatable, resizable). Change image later via property panel
- **Default colors**: Configurable default colors for ground areas and areas in settings
- **Object-level collab sync**: New room-ops.php endpoint merges individual add/update/remove operations atomically. Two users editing different objects no longer overwrite each other
- **CSV corner count**: Optional `ecken` column in CSV import to set object shape (3=triangle, 6=hexagon, 8=octagon, etc.)

### Fixed
- Ground/area/fence preview dashed lines no longer disappear when mouse stops moving (moved to render pipeline)

## [5.7.0] - 2026-03-24

### Added
- **Collaborative editing**: Create or join rooms directly from the app (new button in sidebar). Real-time sync with remote cursor display, room locking, expiry countdown, admin messaging, and room archive. Self-hosted PHP + MySQL backend
- **Room management**: Admin panel with room creation, locking/unlocking, configurable expiry (days/hours/minutes), message sending, and 7-day archive with restore
- **Data warning**: Modal with ISO warning sign shown once per session, informing users about missing auto-backup
- **CSV import extended**: Optional columns for hex color (farbe) and description (beschreibung)
- **Admin messaging**: Admin can send messages to rooms, shown as toast notifications to online and later-joining users
- **Admin statistics**: Dashboard with live stats (active rooms, users online, total objects, data size, messages today, rooms created today, locked, archived)
- **French language**: Full French translation added
- **User room creation**: Users can create 8-hour rooms and join via room ID directly from the app
- **Room rename**: Admin can rename rooms in the detail popup
- **Room search & sort**: Search by name/ID and sort by activity, name, creation date, online users, or expiry
- **Message history**: View, delete individual, or clear all messages per room in admin detail popup

### Changed
- Symbol picker no longer shows text labels, only icons with tooltip
- OSM tiles switched to CARTO CDN to avoid 403 errors from tile.openstreetmap.org
- CSV import buttons stacked vertically for better layout
- Admin panel redesigned: hamburger menu on mobile, tab bar on desktop (Rooms/Archive/Stats), room detail popup on card click
- Sensitive config files removed from repository (config.php, CLAUDE.md)

## [5.6.0] - 2026-03-23

### Added
- **CSV example download**: Button to download an example CSV file next to the CSV import button
- **Save as template**: Right-click context menu option to save a placed object as a reusable template in the palette
- **Dynamic map tiles**: Integrate OpenStreetMap or satellite imagery (ESRI) as background layer. Enter coordinates to load tiles scaled to the world coordinate system. Supports rotation with compass auto-sync

## [5.5.0] - 2026-03-21

### Added
- **Recycling symbol**: Muelltrennung-Station with 3 colored bins (yellow/blue/green) in symbol picker
- **Multi-page PDF export**: Checkbox to split large plans across multiple pages at fixed scale. Each page gets page number, scale indicator, and overview mini-map showing current tile position
- **True vector SVG export**: Complete rewrite as native SVG elements (polygon, ellipse, polyline, text). Includes grid (optional), scale bar, guy ropes with rope lines for all shapes, entrance markers, original symbol SVG files embedded, labels with dimensions

### Changed
- SVG export no longer embeds a raster image but generates real scalable vector graphics

### Removed
- DXF export (CAD format)

## [5.4.1] - 2026-03-21

### Added
- **Legal & Privacy**: Links in the status bar, minimal content for private site, including PayPal notice
- **Live rotation in Properties**: Rotation is displayed live in the Properties panel during manual rotation (drag handle), for both single objects and groups

### Fixed
- Group rotation via slider/buttons now rotates polygon points (ground areas, areas, pipes) around group center, matching drag handle behavior
- Properties panel refreshes after drag-based group rotation (slider/origStates stay in sync)
- Locked objects are excluded from rotation (single + group, drag + properties)
- Locked single objects have disabled rotation controls in properties panel
- Area objects now show lock icon next to name on canvas (was only shown for ground areas)

## [5.4.0] - 2026-03-20

### Added
- **Minimap**: Overview map in top-right corner showing ground areas as polygons, areas as filled shapes, objects as dots. Blue rectangle indicates current viewport. Click to navigate, drag handle bar to move minimap. Toggle in settings, state saved in export. Hidden in print

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
