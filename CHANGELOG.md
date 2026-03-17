# Changelog

## [2.3.0] - 2026-03-17

### Added
- **Color palette**: Floating color swatch panel (6 default colors, up to 10). Right-click swatches to change color, + to add, x to remove
- **Paint tool** (P): Select a color from the palette and click objects to recolor them
- **Object grouping**: Select multiple objects and group via Ctrl+G or "Group" button. Click one grouped object to select all. Ungroup with Ctrl+Shift+G
- **Tent entrance markers**: Green triangle marker on tent objects, configurable side (top/right/bottom/left) in properties
- **Multiline descriptions**: Object descriptions now support multiple lines with configurable color and text size
- **Multiline text fields**: Text tool and text properties now use textarea for multiline text
- **Export reminder**: Browser shows a reminder to export data when closing/refreshing the page
- **Donate hint in print dialog**: Small PayPal link shown in print settings

### Fixed
- Sidebar scrolling: Both palette and placed objects list now properly scroll with many items

## [2.2.0] - 2026-03-16

### Added
- **Treasure map print style** (experimental): Sepia tones, parchment texture, vignette, coffee stains, torn edges, corner flourishes, hand-drawn wobbly lines on all shapes, serif fonts. Guy ropes hidden, only object body shown
- **Persistent guide lines**: Measure tool (M) creates permanent measurement annotations with distance labels and draggable endpoints
- **Object folders**: Organize palette templates into collapsible folders, drag items between folders
- **Object transparency**: Opacity slider (5%-100%) for all objects
- **Triangle shape**: Available in shape selector for objects
- **Tab duplication**: Duplicate entire camp sites with all objects and grounds
- **Offline download**: Settings dialog has a button to download the entire app as a single self-contained HTML file
- **Zoom +/- buttons** in floating tool palette
- **Print options**: Optional object list (page 2), ground edge lengths shown in print

### Fixed
- Print now correctly renders triangle, hexagon, octagon shapes (were shown as rectangles)
- Guy ropes in print correctly follow polygon outlines for non-rectangular shapes
- Scale bar text positioned above the bar (was overlapping)
- Area labels always rendered inside polygon (weighted centroid with fallback)

## [2.1.0] - 2026-03-16

### Added
- **Auto-save**: State automatically saved to localStorage and restored on page load
- **Palette reordering**: Drag-and-drop to reorder palette objects, keyboard shortcuts 1-0 adapt to new order
- Language preference persisted in browser

### Changed
- English set as default language
- Translated empty object list placeholder text

## [2.0.0] - 2026-03-16

### Added
- **Internationalization**: German, English, Spanish, Italian. Language switchable via flag buttons in toolbar. Translations stored in JSON files (lang/*.json), easily extensible
- **Floating tool palette**: Tools moved from toolbar to a draggable floating palette on the canvas (icon-only, compact)
- **Fence tool** (F): Draw fences by clicking points. Rendered as posts with horizontal rails
- **Background images as objects**: Load multiple images, move, rotate, scale, adjust opacity. Corner resize handles with aspect ratio lock
- **Multiple ground areas**: Draw any number of ground polygons per camp site
- **Selectable/deletable grounds**: Click to select (blue highlight), delete via Del/X or properties panel
- **Area/fence vertex editing**: Drag vertices, right-click to add/remove points on selected areas and fences
- **Per-side guy ropes**: Enable/disable guy ropes per side (top, right, bottom, left) for rectangular objects
- **Keyboard shortcuts**: 1-0 for quick template placement, F2 to rename, X to delete, F for fence tool
- **SVG language flags** in toolbar (cross-platform, works on Windows)

### Changed
- **Single object placement**: Returns to select tool after placing one object
- **Toolbar simplified**: Only logo, language flags, undo, print, settings icons
- **Import/Export/Clear all** moved to settings dialog
- Background image controls removed from settings (now via floating toolbar image button)

## [1.8.0] - 2026-03-16

### Added
- **Background image**: Load image (e.g. Google Maps screenshot), adjustable width and opacity
- **Export formats**: Print as PDF, PNG or JPEG
- **Display settings**: Global text size, line width, rope width, hatch width as factors
- **Per-object display settings**: Override text size, line width, rope width individually
- **North compass**: Compass rose image on canvas and in print output

### Changed
- Object properties panel redesigned with sections (General, Position & Size, Rotation, Guy Ropes, Display)
- Object list printed on separate page 2
- Grid labels in print every 5th line

## [1.7.0] - 2026-03-16

### Added
- **Multi-selection**: Ctrl+Click to add/remove objects, rectangle selection by dragging on empty area
- Properties panel shows count + "Duplicate all" / "Delete all" for multi-selection
- Del key and Ctrl+D work on all selected objects

## [1.6.0] - 2026-03-16

### Added
- **Area textures**: Solid, hatching, cross-hatching, dots, grass, forest, water patterns for area objects
- **Settings dialog**: Grid size, snap, minimum distance, display settings in modal

### Removed
- Path tool removed

## [1.5.0] - 2026-03-16

### Added
- "Clear all" button with confirmation dialog
- Unsaved changes warning on page leave

## [1.4.0] - 2026-03-16

### Added
- **Tab system**: Multiple camp sites as tabs, inline rename via double-click or edit button
- Rotation slider (0-360) and preset buttons (0/90/180/270) in properties panel

### Fixed
- Various tab switching and object state bugs resolved

## [1.3.0] - 2026-03-16

### Added
- **Area tool** (A): Mark areas as colored polygons with textures
- **Text tool** (T): Place text labels on the canvas
- **Description field** for all objects (shown on canvas and in print)
- Area display in m² on ground polygons

### Fixed
- Areas and paths now movable (all points move together)
- Small object names displayed above instead of clipped inside

## [1.2.0] - 2026-03-16

### Added
- Donate button (PayPal)
- Keyboard shortcut legend in settings

## [1.1.0] - 2026-03-16

### Added
- App logo and branding ("Tyra Lorena Camp Planner")
- Deletable/addable palette templates
- Placed objects list in sidebar
- Object list printed as table
- Ground replacement confirmation

## [1.0.0] - 2026-03-16

### Initial Release
- **Ground areas**: Draw polygons with edge length display
- **Grid**: Adjustable grid size (0.25m - 5m) with optional snapping
- **Tents**: Predefined types (2P, 4P, Family, Group, Yurt) with guy ropes
- **Objects**: Fire pit, bar, entrance as predefined types + custom objects
- **Shapes**: Rectangle, triangle, hexagon, octagon, circle
- **Guy ropes**: Visual display with rope lines, edge-to-edge distance calculation
- **Distance indicators**: Automatic color-coded distances while dragging (red/yellow/green)
- **Rotation**: Via rotation handle or properties panel (Shift: 15 degree snap)
- **Properties panel**: Edit all object properties (name, position, size, color, shape)
- **Context menu**: Right-click for quick actions
- **JSON Export/Import**: Save/load complete planning state
- **Print**: Paper size, orientation, scale, grid and distance options
- **Undo**: Up to 50 steps (Ctrl+Z)
- **Keyboard shortcuts**: V (Select), H (Pan), G (Ground), M (Measure), Del (Delete), Ctrl+D (Duplicate)
