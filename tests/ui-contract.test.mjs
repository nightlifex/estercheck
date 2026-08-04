import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";

const indexUrl = new URL("../index.html", import.meta.url);
const appUrl = new URL("../assets/app.js", import.meta.url);
const stylesUrl = new URL("../assets/styles.css", import.meta.url);
const serverUrl = new URL("../scripts/serve.mjs", import.meta.url);

test("dashboard keeps one concise information hierarchy and public trust links", async () => {
  const html = await readFile(indexUrl, "utf8");

  assert.match(html, /Der €STR zeigt, zu welchen Zinssätzen Banken im Euroraum über Nacht/);
  assert.match(html, /€STR-Stand: <strong id="reference-date"/);
  assert.match(html, /id="last-successful-check"/);
  assert.match(html, /Geschätzte Geldmarkt-ETF-Rendite/);
  assert.match(html, /Die dargestellten Berechnungen dienen ausschließlich der allgemeinen Information/);
  assert.match(html, /data-range="1826" aria-pressed="false">5 Jahre</);
  assert.match(html, /https:\/\/github\.com\/nightlifex\/estercheck/);
  assert.match(html, /https:\/\/data\.ecb\.europa\.eu\/data\/datasets\/EST\/EST\.B\.EU000A2X2A25\.WT/);
  assert.match(html, /https:\/\/www\.ecb\.europa\.eu\/stats\/financial_markets_and_interest_rates\/euro_short-term_rate\/html\/index\.en\.html/);
  assert.match(html, /EST\.B\.EU000A2X2A25\.WT/);
  assert.doesNotMatch(html, /class="source-link"/);
  assert.ok(
    html.indexOf("data.ecb.europa.eu/data/datasets/EST") >
      html.indexOf('<section class="source-panel"'),
  );
  assert.ok(html.indexOf('<aside class="legal-notice"') > html.indexOf('<footer class="site-footer"'));
  assert.ok(html.indexOf('id="workflow-delay-warning"') > html.indexOf('<aside class="legal-notice"'));
  assert.match(
    html,
    /Zeitgesteuerter GitHub Workflow durch hohe Auslastung noch nicht ausgeführt/,
  );
  assert.doesNotMatch(html, /ETF-Nettorendite|Ein transparenter Näherungswert|Datenstatus/);
});

test("metadata and favicon paths remain relative for GitHub Pages", async () => {
  const html = await readFile(indexUrl, "utf8");
  const server = await readFile(serverUrl, "utf8");

  assert.match(html, /<title>€STR Monitor<\/title>/);
  assert.match(html, /name="theme-color" content="#49d976"/);
  assert.match(html, /rel="icon" href="favicon-32\.png"[^>]+sizes="32x32"/);
  assert.match(html, /rel="icon" href="favicon-16\.png"[^>]+sizes="16x16"/);
  assert.match(html, /rel="icon" href="favicon\.png"/);
  assert.match(html, /rel="icon" href="favicon\.ico"/);
  assert.match(html, /rel="apple-touch-icon" href="apple-touch-icon\.png"/);
  assert.match(html, /rel="manifest" href="site\.webmanifest"/);
  assert.doesNotMatch(html, /href="\/(?:favicon|apple-touch-icon)/);

  const faviconAssets = [
    "favicon-16.png",
    "favicon-32.png",
    "favicon.png",
    "favicon.ico",
    "apple-touch-icon.png",
    "icon-192.png",
    "icon-512.png",
    "site.webmanifest",
  ];
  for (const asset of faviconAssets) {
    assert.ok((await stat(new URL(`../${asset}`, import.meta.url))).size > 0);
    assert.equal(
      new URL(asset, "https://nightlifex.github.io/estercheck/").pathname,
      `/estercheck/${asset}`,
    );
  }

  const pngSizes = {
    "favicon-16.png": 16,
    "favicon-32.png": 32,
    "favicon.png": 32,
    "apple-touch-icon.png": 180,
    "icon-192.png": 192,
    "icon-512.png": 512,
  };
  for (const [asset, expectedSize] of Object.entries(pngSizes)) {
    const png = await readFile(new URL(`../${asset}`, import.meta.url));
    assert.equal(png.readUInt32BE(16), expectedSize);
    assert.equal(png.readUInt32BE(20), expectedSize);
  }

  const manifest = JSON.parse(await readFile(new URL("../site.webmanifest", import.meta.url), "utf8"));
  assert.equal(manifest.theme_color, "#49d976");
  assert.deepEqual(
    manifest.icons.map((icon) => icon.src),
    ["icon-192.png", "icon-512.png"],
  );

  assert.match(server, /"\.ico": "image\/x-icon"/);
  assert.match(server, /"\.png": "image\/png"/);
  assert.match(server, /"\.webmanifest": "application\/manifest\+json; charset=utf-8"/);
});

test("client keeps a valid fallback and exposes interactive chart details", async () => {
  const app = await readFile(appUrl, "utf8");
  const styles = await readFile(stylesUrl, "utf8");

  assert.match(app, /localStorage\.setItem\(CACHE_KEY/);
  assert.match(app, /readCachedDataset/);
  assert.match(app, /chart-tooltip/);
  assert.match(app, /pointermove/);
  assert.match(app, /positionRangeIndicator/);
  assert.match(app, /ResizeObserver/);
  assert.match(app, /lastSuccessfulCheck/);
  assert.match(app, /Europe\/Berlin/);
  assert.match(app, /STALE_CHECK_AGE_MS/);
  assert.match(app, /WORKFLOW_DEADLINE_HOUR = 9/);
  assert.match(app, /shouldShowWorkflowDelayWarning/);
  assert.match(app, /WORKFLOW_STATUS_POLL_INTERVAL_MS = 5 \* 60 \* 1000/);
  assert.match(app, /isSuccessfulCheckToday/);
  assert.match(app, /stopWorkflowStatusPolling/);
  assert.match(app, /window\.clearInterval\(workflowStatusTimer\)/);
  assert.match(app, /renderTableOnDemand/);
  assert.match(app, /dataTableDetails\.addEventListener\("toggle", renderTableOnDemand\)/);
  assert.doesNotMatch(app, /renderChart\(\);\s*renderTable\(observations\);/);
  assert.match(app, /rate < 0\.015/);
  assert.match(app, /rate <= 0\.25/);
  assert.match(app, /status-positive/);
  assert.match(app, /Die aktuellen Daten konnten derzeit nicht geladen werden/);
  assert.match(app, /Es wird der letzte erfolgreich geladene Datenstand angezeigt/);
  assert.match(styles, /width 260ms cubic-bezier\(0\.22, 1, 0\.36, 1\)/);
  assert.match(styles, /transition: color 260ms cubic-bezier\(0\.22, 1, 0\.36, 1\)/);
  assert.doesNotMatch(styles, /transition: color[^;]+\s80ms/);
  assert.match(styles, /width: min\(80vw, 1680px\)/);
  assert.match(styles, /height: 400px/);
  assert.match(styles, /height: 360px/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /\.status-positive \.status-indicator/);
  assert.match(styles, /@keyframes positive-status-pulse/);
});
