import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const indexUrl = new URL("../index.html", import.meta.url);
const appUrl = new URL("../assets/app.js", import.meta.url);

test("dashboard contains the requested explanation, disclaimer and trust links", async () => {
  const html = await readFile(indexUrl, "utf8");

  assert.match(html, /Der €STR zeigt, zu welchen Zinssätzen Banken im Euroraum über Nacht/);
  assert.match(html, /Vereinfachte Schätzung vor Steuern, Spread und Handelskosten/);
  assert.match(html, /data-range="1826">5 J</);
  assert.match(html, /https:\/\/github\.com\/nightlifex\/estercheck/);
  assert.match(html, /EST\.B\.EU000A2X2A25\.WT/);
});

test("client keeps a valid fallback and exposes interactive chart details", async () => {
  const app = await readFile(appUrl, "utf8");

  assert.match(app, /localStorage\.setItem\(CACHE_KEY/);
  assert.match(app, /readCachedDataset/);
  assert.match(app, /chart-tooltip/);
  assert.match(app, /pointermove/);
  assert.match(app, /rate < 0\.015/);
  assert.match(app, /rate <= 0\.25/);
});
