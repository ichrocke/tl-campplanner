# End-to-End-Tests (Playwright)

Browser-Tests, die die App wie ein Nutzer bedienen: Dialoge, Ebenen,
Gruppen, GeoTIFF-Import, Hangneigung, Deckkraft, Autosave, Snapping,
Druck-Attribution.

## Einmalig einrichten

```bash
cd tests
npm install          # installiert nur playwright
```

Voraussetzung: Google Chrome ist installiert (die Tests nutzen
`channel: 'chrome'`, kein separater Browser-Download noetig) und
`python3` ist verfuegbar (lokaler Webserver).

## Ausfuehren

```bash
cd tests
node run-all.js      # alle Specs, startet den Server selbst
node 01-dialogs-layers.spec.js   # einzelner Spec (Server muss laufen:
                                 # python3 -m http.server 8931 im Repo-Root)
```

## Hinweise

- `04-slope-legend.spec.js` ruft die echte hoehendaten.de-API auf
  (Internet noetig). Mit `SKIP_ONLINE=1 node run-all.js` ueberspringen.
- `03-geotiff.spec.js` braucht die Beispieldatei `temp/lwe_detail.tif`
  im Repo-Root und wird sonst uebersprungen.
- Jeder Spec gibt `OK |`/`FAIL |`-Zeilen aus; Exit-Code != 0 bei Fehlern.
- macOS: Multi-Select-Klicks nutzen die Cmd-Taste (`Meta`), weil
  Ctrl+Klick dort ein Rechtsklick ist.
- Die Specs raeumen den Startbildschirm auf (Datenschutz-Hinweis,
  Auto-Tutorial) — siehe `helpers.js`.
