import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const dataUrl = new URL("../data/estr.json", import.meta.url);

test("committed €STR data is internally consistent", async () => {
  const dataset = JSON.parse(await readFile(dataUrl, "utf8"));
  const { observations } = dataset;

  assert.equal(dataset.seriesKey, "EST.B.EU000A2X2A25.WT");
  assert.equal(dataset.unit, "percent");
  assert.ok(observations.length > 1_000);
  assert.equal(observations[0].date, "2019-10-01");
  assert.match(dataset.publicationTime, /^\d{2}:\d{2}$/);
  assert.doesNotMatch(dataset.source.apiUrl, /lastNObservations/i);

  const dates = observations.map((item) => item.date);
  assert.deepEqual(dates, [...dates].sort());
  assert.equal(new Set(dates).size, dates.length);

  for (const item of observations) {
    assert.match(item.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(Number.isFinite(item.rate));
  }

  const latest = observations.at(-1);
  const previous = observations.at(-2);
  assert.equal(dataset.referenceDate, latest.date);
  assert.equal(dataset.current.rate, latest.rate);
  assert.equal(dataset.current.previousRate, previous.rate);
  assert.equal(
    dataset.current.changePercentagePoints,
    Number((latest.rate - previous.rate).toFixed(3)),
  );
  assert.equal(dataset.current.estimatedNetYield, Number((latest.rate + 0.085 - 0.1).toFixed(3)));
});

test("GitHub Actions workflow includes update and no-change safeguards", async () => {
  const workflow = await readFile(new URL("../.github/workflows/update-estr.yml", import.meta.url), "utf8");

  assert.match(workflow, /cron:\s*["']30 7 \* \* \*["']/);
  assert.match(workflow, /permissions:\s*\n\s+contents:\s+write/);
  assert.match(workflow, /npm run update-data/);
  assert.match(workflow, /git diff --quiet -- data\/estr\.json/);
  assert.match(workflow, /git add -- data\/estr\.json/);
});
