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
  assert.match(html, /Stand: <strong id="reference-date"/);
  assert.match(html, /Geschätzte Geldmarkt-ETF-Rendite/);
  assert.match(html, /Vereinfachte Schätzung vor Steuern, Spread und Handelskosten/);
  assert.match(html, /data-range="1826" aria-pressed="false">5 Jahre</);
  assert.match(html, /https:\/\/github\.com\/nightlifex\/estercheck/);
  assert.match(html, /EST\.B\.EU000A2X2A25\.WT/);
  assert.doesNotMatch(html, /ETF-Nettorendite|Ein transparenter Näherungswert|Datenstatus/);
});

test("metadata and favicon paths remain relative for GitHub Pages", async () => {
  const html = await readFile(indexUrl, "utf8");
  const server = await readFile(serverUrl, "utf8");

  assert.match(html, /<title>€STR Monitor<\/title>/);
  assert.match(html, /name="theme-color" content="#72f49b"/);
  assert.match(html, /rel="icon" href="favicon\.svg"/);
  assert.match(html, /rel="icon" href="favicon\.ico"/);
  assert.match(html, /rel="apple-touch-icon" href="apple-touch-icon\.png"/);
  assert.doesNotMatch(html, /href="\/(?:favicon|apple-touch-icon)/);

  const faviconAssets = ["favicon.svg", "favicon.ico", "apple-touch-icon.png"];
  for (const asset of faviconAssets) {
    assert.ok((await stat(new URL(`../${asset}`, import.meta.url))).size > 0);
    assert.equal(
      new URL(asset, "https://nightlifex.github.io/estercheck/").pathname,
      `/estercheck/${asset}`,
    );
  }

  assert.match(server, /"\.svg": "image\/svg\+xml; charset=utf-8"/);
  assert.match(server, /"\.ico": "image\/x-icon"/);
  assert.match(server, /"\.png": "image\/png"/);
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
  assert.match(app, /rate < 0\.015/);
  assert.match(app, /rate <= 0\.25/);
  assert.match(app, /Die aktuellen Daten konnten derzeit nicht geladen werden/);
  assert.match(app, /Es wird der letzte erfolgreich geladene Datenstand angezeigt/);
  assert.match(styles, /width 260ms cubic-bezier\(0\.22, 1, 0\.36, 1\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});
