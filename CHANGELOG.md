# Changelog

## [2.0.5] - 2026-03-16

### Hinzugefügt
- **Bild-Resize per Maus**: Hintergrundbilder an den Ecken per Drag skalierbar (weisse Anfasser)
- **Seitenverhältnis-Sperre**: Standardmäßig bleibt das Seitenverhältnis beim Skalieren erhalten. Per Checkbox "Seitenverhältnis beibehalten" im Eigenschaftspanel abschaltbar
- Cursor ändert sich beim Hover über Resize-Handles

## [2.0.4] - 2026-03-16

### Geändert
- **Hintergrundbilder als Objekte**: Bilder sind jetzt normale Objekte, die verschoben, gedreht, skaliert und gelöscht werden können
- **Mehrere Hintergrundbilder**: Beliebig viele Bilder pro Zeltplatz möglich
- **Bild-Button in Werkzeugleiste**: Bild laden über den Bild-Icon-Button in der schwebenden Werkzeugleiste
- **Eigenschaftspanel für Bilder**: Position, Größe, Drehung, Deckkraft direkt einstellbar
- Hintergrundbild aus den Einstellungen entfernt
- Alte Exporte mit einzelnem Hintergrundbild werden automatisch migriert

## [2.0.3] - 2026-03-16

### Hinzugefügt
- **Grundflächen auswählbar**: Klick auf eine Grundfläche selektiert sie (blau hervorgehoben, gestrichelt)
- **Grundflächen löschbar**: Ausgewählte Grundfläche per Entf/X oder Löschen-Button im Eigenschaftspanel entfernen
- Eigenschaftspanel zeigt bei ausgewählter Grundfläche Anzahl Eckpunkte und Fläche

## [2.0.2] - 2026-03-16

### Geändert
- **Mehrere Grundflächen**: Beliebig viele Grundflächen pro Zeltplatz möglich (keine Ersetzungs-Abfrage mehr)
- **Toolbar-Icons**: Import, Export, Drucken, Rückgängig und Einstellungen als kompakte Icons in der Toolbar
- Alte Exporte mit einzelner Grundfläche werden automatisch migriert

## [2.0.1] - 2026-03-16

### Geändert
- **Werkzeugleiste**: Werkzeuge als schwebende, frei verschiebbare Leiste auf dem Zeichenfeld (nur Icons, kompakt, Drag-Handle)
- **Toolbar vereinfacht**: Nur noch Logo, Sprachflaggen, Rückgängig, Drucken, Einstellungen in der oberen Leiste
- **Import/Export/Alles löschen**: In den Einstellungen-Dialog verschoben
- **Sprachauswahl mit Flaggen**: DE/EN/ES/IT Flaggen direkt in der oberen Leiste sichtbar

### Hinzugefügt
- **Italienisch**: Neue Sprache (Italiano) hinzugefügt

## [2.0.0] - 2026-03-16

### Hinzugefügt
- **Mehrsprachigkeit**: Deutsch, English, Español. Sprache umschaltbar in den Einstellungen. Übersetzungen in JSON-Dateien (lang/*.json), erweiterbar
- **Zaun-Werkzeug** (F): Zäune zeichnen durch Klicken von Punkten. Darstellung als Pfosten mit Querbalken
- **Gebiet-Punkte bearbeiten**: Ausgewählte Gebiete zeigen Vertex-Handles. Punkte per Drag verschieben, per Rechtsklick hinzufügen/löschen
- **Zaun-Punkte bearbeiten**: Zaunpunkte per Drag verschieben, per Rechtsklick löschen
- **Abspannung pro Seite**: Bei Rechteck-Objekten kann die Abspannung pro Seite (Oben, Rechts, Unten, Links) einzeln aktiviert/deaktiviert werden
- **Tastenkürzel 1-0**: Die ersten 10 Objekte in der Palette können per Zifferntaste schnell platziert werden
- **F2**: Tastenkürzel zum Umbenennen des ausgewählten Objekts
- **X**: Zusätzlich zu Entf zum Löschen von Objekten

### Geändert
- **Einzelplatzierung**: Zelte/Objekte werden nur einzeln platziert, danach wechselt das Werkzeug zurück auf Auswählen
- Palette zeigt Tastenkürzel-Nummern neben den Objekten

## [1.8.3] - 2026-03-16

### Geändert
- **Nordkompass**: Verwendet das Kompassrosen-Bild aus img/compass.png, doppelte Größe (120px Canvas, 90px Druck)

## [1.8.2] - 2026-03-16

### Geändert
- Eigenschaftspanel komplett überarbeitet: Sektionen (Allgemein, Position & Größe, Drehung, Abspannung, Darstellung) mit Rahmen und farbigen Überschriften
- Position-Felder (X, Y, Breite, Tiefe) in 2-Spalten-Grid statt untereinander
- Darstellungs-Felder (Textgröße, Liniendicke) in 2-Spalten-Grid
- Kompaktere Abstände, weniger vertikaler Platzbedarf
- Farbfeld kleiner, Inputs einheitlich gestylt mit weißem Hintergrund auf grauem Sektions-Hintergrund

## [1.8.1] - 2026-03-16

### Geändert
- Hintergrundbild von Sidebar in Einstellungen-Dialog verschoben
- Objektliste wird beim Drucken immer auf **Blatt 2** angezeigt (separate Seite, nicht mehr auf der Karte)
- Raster-Beschriftung im Druck: Koordinaten alle 5 Linien + "Raster: X m" Hinweis
- Objektliste im Druck verbessert: Zebra-Streifen, Drehung-Spalte, größere Schrift
- PNG/JPEG-Export: Beide Seiten (Karte + Liste) werden vertikal kombiniert

## [1.8.0] - 2026-03-16

### Hinzugefügt
- **Hintergrundbild**: Bild laden (z.B. Google Maps Screenshot), skalierbar (Breite in m), Deckkraft einstellbar
- **Exportformate**: Drucken als PDF, PNG oder JPEG (Auswahl im Druckdialog)
- **Darstellungs-Einstellungen** (global): Textgröße, Liniendicke, Schnurdicke, Schraffurdicke als Faktor einstellbar
- **Per-Objekt-Einstellungen**: Textgröße, Liniendicke, Schnurdicke individuell pro Objekt überschreibbar (0 = globale Einstellung)
- Display-Settings werden in Export/Import mitgespeichert

### Behoben
- Drucken: Leere zweite Seite behoben (Canvas wird jetzt offscreen gerendert, nur das Bild wird an den Drucker geschickt)

## [1.7.1] - 2026-03-16

### Behoben
- Rotationsgriff war bei gedrehten Objekten nicht mehr klickbar (Vorzeichen-Fehler in der Weltkoordinaten-Berechnung des Griffpunkts)

## [1.7.0] - 2026-03-16

### Hinzugefügt
- **Mehrfachauswahl**: Objekte per Strg+Klick zur Auswahl hinzufügen/entfernen
- **Rechteck-Auswahl**: Auf leere Fläche klicken und ziehen um alle Objekte im Bereich auszuwählen (Strg gedrückt = additiv)
- Mehrfachauswahl in der "Platzierte Objekte"-Liste (Strg+Klick)
- Eigenschaftspanel zeigt bei Mehrfachauswahl Anzahl + "Alle duplizieren" / "Alle löschen" Buttons
- Entf-Taste löscht alle ausgewählten Objekte
- Strg+D dupliziert alle ausgewählten Objekte
- Verschieben bewegt alle ausgewählten Objekte gemeinsam

## [1.6.2] - 2026-03-16

### Geändert
- Donate-Button in die Toolbar-Mitte verschoben (oben, immer sichtbar)
- Einstellungen-Dialog: Zwei-Spalten-Layout (links Einstellungen + Donate, rechts Tastenkürzel)
- Donate im Einstellungen-Dialog größer mit einladendem Text

## [1.6.1] - 2026-03-16

### Behoben
- Eigenschaftspanel verschiebt nicht mehr das Raster der Zeichenfläche (Panel schwebt jetzt absolut über dem Canvas statt den Flex-Container zu verkleinern)

## [1.6.0] - 2026-03-16

### Entfernt
- Weg-Werkzeug komplett entfernt (Button, Shortcuts, Rendering, Hit-Testing, Properties)

### Hinzugefügt
- Gebiete haben jetzt wählbare Texturen: Einfarbig, Schraffur, Kreuzschraffur, Punkte, Gras, Wald, Wasser
- Textur-Auswahl im Eigenschaftspanel für Gebiet-Objekte

## [1.5.0] - 2026-03-16

### Hinzugefügt
- "Alles löschen"-Button in der Toolbar (mit Bestätigungsdialog und Hinweis auf Export)
- Warnung vor Seitenverlassen (F5, Tab schließen, Navigation) wenn Inhalte vorhanden sind

## [1.4.8] - 2026-03-16

### Behoben
- Geisterbild-Bug endgültig behoben: Nur noch der aktive Zeltplatz wird gerendert, neue Zeltplätze sind garantiert leer
- Druck zeigt nur den aktiven Zeltplatz (nicht mehr alle)
- Neue Zeltplätze starten mit frischer View (0,0) ohne Offset-Berechnung

## [1.4.7] - 2026-03-16

### Behoben
- Geisterbild-Bug: Objekte des vorherigen Zeltplatzes wurden als nicht-auswählbares Bild auf neuen Zeltplätzen angezeigt (Ursache: doppelte Koordinaten-Verschiebung durch canvas.translate + View-panX-Anpassung)

## [1.4.6] - 2026-03-16

### Behoben
- Neuer Zeltplatz übernimmt keine Objekte mehr vom vorherigen Platz: Alle Property-Inputs prüfen vor Update ob das Objekt noch ausgewählt ist, fokussierte Inputs werden vor Site-Erstellung geblurt

## [1.4.5] - 2026-03-16

### Behoben
- Neuer Zeltplatz ist jetzt garantiert leer (Auswahl und Properties werden direkt beim Tab-Wechsel und beim Erstellen zurückgesetzt, nicht mehr über unzuverlässigen onChange-Diff)
- Aktives Tool wird beim Erstellen eines neuen Zeltplatzes auf "Auswählen" zurückgesetzt

## [1.4.4] - 2026-03-16

### Behoben
- Inline-Umbenennung von Zeltplätzen funktioniert jetzt zuverlässig (Rebuild-Guard verhindert DOM-Zerstörung während Eingabe)

### Hinzugefügt
- Stift-Button am Tab zum Umbenennen (zusätzlich zu Doppelklick)

## [1.4.3] - 2026-03-16

### Behoben
- Beim Erstellen eines neuen Zeltplatzes wird die aktuelle Objekt-Auswahl korrekt aufgehoben (Objekt wird nicht mehr in den neuen Platz "mitgenommen")

### Entfernt
- Zeltplatzname wird nicht mehr auf der Zeichenfläche angezeigt (nur noch in den Tabs)

## [1.4.2] - 2026-03-16

### Behoben
- Zeltplatz-Tabs werden jetzt korrekt **nebeneinander** angezeigt (fehlende `display: flex` auf `#tabs-container`)

### Geändert
- Zeltplatz-Name direkt per Doppelklick auf den Tab inline editierbar (kein Popup-Dialog mehr)
- Tab-Name zeigt beim Hover eine dezente Unterstreichung als Hinweis auf Editierbarkeit

## [1.4.1] - 2026-03-16

### Hinzugefügt
- Schieberegler für Drehung im Eigenschaftspanel (0°–360°, synchron mit Zahlenfeld)
- Schnellwahl-Buttons für Drehung: 0°, 90°, 180°, 270°

## [1.4.0] - 2026-03-16

### Geändert
- Mehrere Zeltplätze werden jetzt **nebeneinander** auf derselben Zeichenfläche angezeigt
- Jeder Zeltplatz hat ein farbiges Namens-Label über seiner Fläche (blau = aktiv, grau = inaktiv)
- Neuer Zeltplatz wird automatisch rechts neben dem vorhandenen positioniert
- Leere Zeltplätze zeigen einen Platzhalter mit "Grundfläche hier zeichnen"
- Druckausgabe enthält alle Zeltplätze mit Labels
- Tabs wechseln den aktiven Zeltplatz (für Bearbeitung), alle bleiben sichtbar
- Zeltplätze sind über Doppelklick auf den Tab benennbar (wie bisher)

## [1.3.0] - 2026-03-16

### Behoben
- Gebiete (Area) lassen sich jetzt verschieben (alle Punkte werden mit verschoben)
- Wege (Path) lassen sich jetzt verschieben
- Weg-Zeichnung: Doppelklick fügt keine Extrapunkte mehr hinzu
- Name wird bei kleinen Objekten (z.B. Eingang) jetzt oberhalb des Objekts angezeigt statt abgeschnitten

### Hinzugefügt
- Beschreibung/Freitextfeld für alle Objekte (im Eigenschaftspanel, wird auf der Karte und im Druck angezeigt)
- Drucktabelle enthält jetzt Beschreibungsspalte

## [1.2.1] - 2026-03-16

### Hinzugefügt
- "Einen Kaffee spendieren"-Donate-Button in der Statusleiste (PayPal: marc85444)
- Tastenkürzel-Legende im Einstellungen-Dialog mit allen verfügbaren Shortcuts

## [1.2.0] - 2026-03-16

### Hinzugefügt
- **Weg-Werkzeug** (W): Wege einzeichnen mit mehreren Punkten, benennbar, konfigurierbare Breite
- **Gebiet-Werkzeug** (A): Angrenzende Gebiete als Fläche markieren, benennbar, farbig
- **Text-Werkzeug** (T): Freie Textfelder auf der Karte platzieren mit konfigurierbarer Schriftgröße
- **Einstellungen-Popup**: Rastergröße, Raster-Snap und Mindestabstand jetzt im Einstellungen-Dialog
- **Quadratmeter-Anzeige**: Grundfläche zeigt automatisch die berechnete Fläche in m² an
- Objekte-Palette ist als Dropdown klappbar ("Objekte")
- "Neues Objekt"-Button prominent über der Palette

### Geändert
- Dreieckzelt und Zaun aus Standard-Vorlagen entfernt
- Theke: 3 × 1 m (vorher 4 × 1.5 m)
- Eingang: 2 × 0.25 m (vorher 3 × 0.8 m)

## [1.1.0] - 2026-03-16

### Hinzugefügt
- Logo aus img/logo.png in der Toolbar mit dunkelgrauem Hintergrund
- App umbenannt zu "Tyra Lorena Zeltplaner"
- Objekt-Vorlagen in der Palette können per Hover-X-Button gelöscht werden
- Eigene Objekte werden als Vorlage in die Palette aufgenommen
- Bei frischem Start sind immer alle Standard-Vorlagen da
- "Platzierte Objekte"-Liste in der Sidebar (klickbar zur Auswahl)
- Objektliste wird beim Drucken als Tabelle unter der Karte ausgegeben
- Beim Zeichnen einer neuen Grundfläche wird gefragt, ob die alte ersetzt werden soll

### Geändert
- Vorlagen sind jetzt pro Zeltplatz gespeichert (können gelöscht/ergänzt werden)
- Export/Import speichert nur die tatsächlich vorhandenen Vorlagen

## [1.0.2] - 2026-03-16

### Behoben
- Placement-Ghost-Vorschau blieb nach ESC/Auswählen sichtbar
- Grid-Snap orientiert sich jetzt an der Zeltkante (nicht am Mittelpunkt)
- Abstandsmessung basiert jetzt auf der Grundfläche des Objekts (nicht auf den Abspannseilen)

### Geändert
- Standard-Rastergröße auf 0.5 m geändert
- Standard-Mindestabstand auf 2 m geändert

### Hinzugefügt
- Neue Zeltformen: Dreieck, Sechseck, Achteck (reguläre Polygone)
- Polygon-Formen in Palette, Eigenschaftspanel und Objekt-Dialog verfügbar
- Palette-Swatches zeigen die tatsächliche Objektform an

## [1.0.1] - 2026-03-16

### Behoben
- Zelte/Objekte konnten nicht platziert werden (pendingTemplate wurde beim Tool-Wechsel gelöscht)
- Doppelte const-Deklaration verhinderte Script-Laden (Cache-Busting-Variable)

### Hinzugefügt
- Grundflächen-Eckpunkte per Drag verschieben (im Auswählen-Modus)
- Rechtsklick auf Eckpunkt: Eckpunkt löschen
- Rechtsklick auf Kante: neuen Eckpunkt einfügen
- Rechtsklick: Grundfläche komplett löschen
- Eckpunkt-Highlighting beim Hover
- Vorschau-Ghost des Objekts beim Platzieren (folgt dem Cursor)

## [1.0.0] - 2026-03-16

### Erstveröffentlichung

- **Grundfläche**: Beliebige Polygone als Platzgeometrie zeichnen mit Kantenlängen-Anzeige
- **Raster**: Einstellbare Rastergröße (0.25m, 0.5m, 1m, 2m, 5m) mit optionalem Einrasten
- **Zelte**: Vordefinierte Zelttypen (2P, 4P, Familie, Gruppe, Jurte) mit Abspannseilen
- **Weitere Objekte**: Feuerstelle, Theke, Eingang, Zaun als vordefinierte Typen
- **Eigene Objekte**: Benutzerdefinierte Objekte mit frei wählbarer Form, Größe und Farbe
- **Abspannseile**: Visuelle Darstellung der Abspannumrandung mit Seil-Linien
- **Abstandsmesser**: Automatische Abstandsanzeige beim Verschieben (rot/gelb/grün)
- **Freihand-Messen**: Messwerkzeug für manuelle Abstandsmessung
- **Rotation**: Objekte per Rotationsgriff oder Eigenschaftspanel drehen (Shift: 15°-Raster)
- **Mehrere Zeltplätze**: Tab-System für verschiedene Plätze, Umbenennen per Doppelklick
- **Eigenschaften-Panel**: Alle Objekteigenschaften bearbeiten (Name, Position, Größe, etc.)
- **Kontextmenü**: Rechtsklick auf Objekte für Schnellaktionen
- **JSON Export/Import**: Kompletter Planungszustand als JSON-Datei speichern/laden
- **Druckfunktion**: Druckdialog mit Papierformat, Ausrichtung, Maßstab und Optionen
- **Rückgängig**: Undo-Funktion (Strg+Z) mit bis zu 50 Schritten
- **Tastenkürzel**: V (Auswählen), H (Verschieben), G (Grundfläche), M (Messen), Entf (Löschen), Strg+D (Duplizieren)
- **Cache-Busting**: JS und CSS werden bei jedem Laden frisch geladen
- **Kein Browser-Speicher**: Keine Verwendung von localStorage/sessionStorage
