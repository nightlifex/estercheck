# €STR Monitor

Ein modernes, responsives Dark-Mode-Dashboard für den aktuellen Euro Short-Term Rate (€STR).
Die Anwendung kommt ohne Frontend-Framework oder Build-Schritt aus und lädt eine versionierte
JSON-Datei aus dem Repository.

## Funktionen

- aktueller €STR mit offiziellem Referenz- und Veröffentlichungsdatum
- Veränderung gegenüber der vorherigen Beobachtung
- kostenbezogene Einordnung in voraussichtlich negativ, sehr gering oder positiv
- responsives Verlaufsdiagramm mit 5-Jahres-Auswahl, Maximalansicht, Hover-Details und
  zugänglicher Datentabelle
- grobe Geldmarkt-ETF-Nettorendite nach der Formel
  `€STR + 0,085 Prozentpunkte − 0,10 Prozentpunkte laufende Kosten`
- Ladezustand, verständliche Fehleranzeige, Browser-Fallback auf den letzten gültigen Stand und
  Wiederholungsfunktion
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
  `https://data-api.ecb.europa.eu/service/data/EST/B.EU000A2X2A25.WT?format=csvdata`
- Serienseite:
  `https://data.ecb.europa.eu/data/datasets/EST/EST.B.EU000A2X2A25.WT`
- offizielle Veröffentlichungsseite:
  `https://www.ecb.europa.eu/stats/financial_markets_and_interest_rates/euro_short-term_rate/html/index.en.html`

Die API liefert den vollständigen offiziellen Verlauf seit Oktober 2019. Die offizielle
Veröffentlichungsseite wird zusätzlich verwendet, um Veröffentlichungszeitpunkt, Referenzdatum
und aktuellen Wert gegenzuprüfen.

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

## Veröffentlichung mit GitHub Pages

GitHub Pages ist für dieses Repository bereits als statische Veröffentlichung aus dem Branch
`main` und dem Ordner `/(root)` eingerichtet. Nach ausdrücklicher Freigabe und Merge eines Pull
Requests erstellt GitHub Pages automatisch eine neue Version der Website:

1. Pull Request prüfen und nach Freigabe in `main` mergen.
2. Unter **Actions → pages-build-deployment** den erfolgreichen Lauf abwarten.
3. `https://nightlifex.github.io/estercheck/` mit der veröffentlichten Version prüfen.

Es ist kein Build-Workflow erforderlich, da alle Dateien statisch im Repository liegen.

## Bekannte Einschränkungen

- Die vollständige Historie und die Datentabelle vergrößern die JSON-Datei gegenüber dem früheren
  400-Werte-Ausschnitt, bleiben für eine statische Website aber überschaubar.
- GitHub Actions und GitHub Pages können aktualisierte Dateien zeitversetzt ausliefern.
- Das Veröffentlichungsdatum wird nur übernommen, wenn Referenzdatum und Rate der offiziellen
  Seite exakt zur neuesten API-Beobachtung passen; bei einem kurzzeitigen Update-Versatz bleibt das
  bisherige Datum erhalten.
- Die ETF-Schätzung bildet keine tatsächliche Fondsperformance und keine individuelle Nettorendite
  nach Steuern ab.
- Die Anwendung zeigt bewusst ausschließlich einen Dark Mode.
