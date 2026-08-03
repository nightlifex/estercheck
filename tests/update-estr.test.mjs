import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDataset,
  classifyRate,
  observationsFromCsv,
  parseCsv,
  parsePublicationPage,
} from "../scripts/update-estr.mjs";

test("parseCsv handles quoted commas and escaped quotes", () => {
  const rows = parseCsv('TIME_PERIOD,OBS_VALUE,NOTE\n2026-07-30,2.185,"Official, revised"\n');
  assert.deepEqual(rows, [
    { TIME_PERIOD: "2026-07-30", OBS_VALUE: "2.185", NOTE: "Official, revised" },
  ]);
});

test("observationsFromCsv sorts, deduplicates and ignores invalid values", () => {
  const csv = [
    "TIME_PERIOD,OBS_VALUE",
    "2026-07-31,2.184",
    "invalid,2.000",
    "2026-07-30,2.185",
    "2026-07-31,2.184",
  ].join("\n");

  assert.deepEqual(observationsFromCsv(csv), [
    { date: "2026-07-30", rate: 2.185 },
    { date: "2026-07-31", rate: 2.184 },
  ]);
});

test("parsePublicationPage extracts the official dates and rate", () => {
  const html = `
    <html><body>
      <p>last update: 03 August 2026 08:00</p>
      <table><tr><th>Rate</th><td>2.184</td></tr>
      <tr><th>Reference date</th><td>31-07-2026</td></tr></table>
    </body></html>`;

  assert.deepEqual(parsePublicationPage(html), {
    publicationDate: "2026-08-03",
    referenceDate: "2026-07-31",
    rate: 2.184,
  });
});

test("buildDataset calculates change and estimated ETF net yield", () => {
  const observations = [
    { date: "2026-07-30", rate: 2.185 },
    { date: "2026-07-31", rate: 2.184 },
  ];
  const publication = {
    publicationDate: "2026-08-03",
    referenceDate: "2026-07-31",
    rate: 2.184,
  };
  const dataset = buildDataset(observations, publication);

  assert.equal(dataset.publicationDate, "2026-08-03");
  assert.equal(dataset.current.changePercentagePoints, -0.001);
  assert.equal(dataset.current.estimatedNetYield, 2.169);
  assert.equal(dataset.current.classification, "positive");
});

test("buildDataset does not use a publication date that belongs to another observation", () => {
  const observations = [
    { date: "2026-07-30", rate: 2.185 },
    { date: "2026-07-31", rate: 2.184 },
  ];
  const stalePublication = {
    publicationDate: "2026-08-04",
    referenceDate: "2026-08-03",
    rate: 2.186,
  };

  assert.equal(buildDataset(observations, stalePublication).publicationDate, "2026-07-31");
});

test("classifyRate covers positive, near-zero and negative values", () => {
  assert.equal(classifyRate(2.184), "positive");
  assert.equal(classifyRate(0.02), "near-zero");
  assert.equal(classifyRate(-0.25), "negative");
});
