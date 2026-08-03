# €STR Monitor

Ein modernes, responsives Dark-Mode-Dashboard für den aktuellen Euro Short-Term Rate (€STR).
Die Anwendung kommt ohne Frontend-Framework oder Build-Schritt aus und lädt eine versionierte
JSON-Datei aus dem Repository.

## Funktionen

- aktueller €STR mit offiziellem Referenz- und Veröffentlichungsdatum
- Veränderung gegenüber der vorherigen Beobachtung
- Einordnung als positiv, nahe null oder negativ
- responsives Verlaufsdiagramm mit zugänglicher Datentabelle
- grobe Geldmarkt-ETF-Nettorendite nach der Formel
  `€STR + 0,085 Prozentpunkte − 0,10 Prozentpunkte laufende Kosten`
- Ladezustand, verständliche Fehleranzeige und Wiederholungsfunktion
- tägliche Datenaktualisierung über GitHub Actions ohne Leer-Commits

> Die ETF-Rendite ist nur eine vereinfachte Schätzung. Tracking-Differenz, Steuern, Spreads und
> weitere Kosten sind nicht berücksichtigt. Die Anzeige ist keine Anlageberatung.

## Technischer Aufbau

| Pfad | Zweck |
| --- | --- |
| `index.html` | semantische Seitenstruktur |
| `assets/styles.css` | responsives Dark-Mode-Design |
| `assets/app.js` | Datenladen, Darstellung und SVG-Diagramm |
| `data/estr.json` | aufbereitete, vom Browser gelesene €STR-Daten |
| `scripts/update-estr.mjs` | Abruf, Prüfung und Aufbereitung der EZB-Daten |
| `scripts/serve.mjs` | kleiner lokaler Entwicklungsserver |
| `tests/` | Tests für Parser, Berechnungen, Daten und Workflow-Schutzmechanismen |
| `.github/workflows/update-estr.yml` | täglicher Aktualisierungsablauf |

## Lokale Vorschau

Voraussetzung: Node.js 20 oder neuer.

```bash
npm run serve
```

Danach `http://127.0.0.1:8080` öffnen. Ein direktes Öffnen von `index.html` per `file://` wird
nicht empfohlen, weil Browser lokale JSON-Anfragen üblicherweise blockieren.

Tests ausführen:

```bash
npm test
```

Daten manuell aktualisieren:

```bash
npm run update-data
```

## Offizielle EZB-Datenquelle

Es werden ausschließlich Daten der Europäischen Zentralbank verwendet:

- Datensatz: `EST` — Euro short-term rate
- Zeitreihe: `EST.B.EU000A2X2A25.WT`
- Bedeutung: Daily-Businessweek, €STR, volume-weighted trimmed mean rate, Prozent
- API:
  `https://data-api.ecb.europa.eu/service/data/EST/B.EU000A2X2A25.WT?format=csvdata&lastNObservations=400`
- Serienseite:
  `https://data.ecb.europa.eu/data/datasets/EST/EST.B.EU000A2X2A25.WT`
- offizielle Veröffentlichungsseite:
  `https://www.ecb.europa.eu/stats/financial_markets_and_interest_rates/euro_short-term_rate/html/index.en.html`

Die API liefert den historischen Verlauf. Die offizielle Veröffentlichungsseite wird zusätzlich
verwendet, um Veröffentlichungsdatum, Referenzdatum und aktuellen Wert gegenzuprüfen. Die
aufbereitete Datei enthält maximal 400 Beobachtungen (rund 18 Monate an Geschäftstagen).

## Tägliche GitHub-Action

Der Workflow läuft täglich um **07:30 UTC** und kann zusätzlich manuell gestartet werden. Dieser
Zeitpunkt liegt ganzjährig nach der regulären €STR-Veröffentlichung um 08:00 Uhr mitteleuropäischer
Zeit.

Ablauf:

1. Repository auschecken und Node.js bereitstellen.
2. Parser-, Berechnungs- und Datenvalidierungen ausführen.
3. offizielle EZB-API und Veröffentlichungsseite abrufen.
4. `data/estr.json` nur bei neuen oder revidierten Beobachtungen schreiben.
5. mit `git diff` prüfen, ob sich die Datei tatsächlich geändert hat.
6. ausschließlich `data/estr.json` committen und auf denselben Branch zurückschreiben.

An Wochenenden und TARGET-Feiertagen bleibt die letzte Beobachtung üblicherweise unverändert. In
diesem Fall endet der Workflow erfolgreich, ohne einen Commit zu erzeugen. Bei einem EZB-Ausfall
schlägt der Workflow sichtbar fehl; die zuletzt geprüfte Datei im Repository bleibt erhalten.

Damit geplante Workflows Daten zurückschreiben dürfen, muss unter **Settings → Actions → General →
Workflow permissions** die Option **Read and write permissions** aktiviert sein. In geschützten
Branches kann alternativ eine Pull-Request-basierte Aktualisierung nötig sein.

## Spätere Veröffentlichung mit GitHub Pages

Die Website wird mit diesem Stand **nicht** veröffentlicht. Nach ausdrücklicher Freigabe und Merge
des Pull Requests sind für eine einfache Pages-Veröffentlichung folgende Schritte vorgesehen:

1. Repository auf GitHub öffnen und **Settings → Pages** aufrufen.
2. Unter **Build and deployment** die Quelle **Deploy from a branch** wählen.
3. Branch `main` und Ordner `/(root)` auswählen.
4. Speichern und den anschließend angezeigten Pages-Link prüfen.

Es ist kein Build-Workflow erforderlich, da alle Dateien statisch im Repository liegen.

## Bekannte Einschränkungen

- Die Historie ist auf die letzten 400 offiziellen Beobachtungen begrenzt.
- GitHub Actions und GitHub Pages können aktualisierte Dateien zeitversetzt ausliefern.
- Das Veröffentlichungsdatum wird nur übernommen, wenn Referenzdatum und Rate der offiziellen
  Seite exakt zur neuesten API-Beobachtung passen; bei einem kurzzeitigen Update-Versatz bleibt das
  bisherige Datum erhalten.
- Die ETF-Schätzung bildet keine tatsächliche Fondsperformance und keine individuelle Nettorendite
  nach Steuern ab.
- Die Anwendung zeigt bewusst ausschließlich einen Dark Mode.
