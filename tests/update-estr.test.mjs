import test from "node:test";
import assert from "node:assert/strict";

import {
  API_URL,
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
    publicationTime: "08:00",
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
    publicationTime: "08:00",
    referenceDate: "2026-07-31",
    rate: 2.184,
  };
  const dataset = buildDataset(
    observations,
    publication,
    null,
    new Date("2026-08-04T07:30:00.000Z"),
  );

  assert.equal(dataset.schemaVersion, 2);
  assert.equal(dataset.publicationDate, "2026-08-03");
  assert.equal(dataset.publicationTime, "08:00");
  assert.equal(dataset.lastSuccessfulCheck, "2026-08-04T07:30:00.000Z");
  assert.equal(dataset.lastDataChange, "2026-08-04T07:30:00.000Z");
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

test("classifyRate applies the ETF-cost thresholds including their boundaries", () => {
  assert.equal(classifyRate(0.014), "negative-after-costs");
  assert.equal(classifyRate(0.015), "very-low");
  assert.equal(classifyRate(0.25), "very-low");
  assert.equal(classifyRate(0.251), "positive");
});

test("a successful check updates its timestamp without duplicating unchanged observations", () => {
  const observations = [
    { date: "2026-07-30", rate: 2.185 },
    { date: "2026-07-31", rate: 2.184 },
  ];
  const first = buildDataset(
    observations,
    null,
    null,
    new Date("2026-08-03T07:30:00.000Z"),
  );
  const checkedAgain = buildDataset(
    observations,
    null,
    first,
    new Date("2026-08-04T07:30:00.000Z"),
  );

  assert.equal(checkedAgain.lastSuccessfulCheck, "2026-08-04T07:30:00.000Z");
  assert.equal(checkedAgain.lastDataChange, "2026-08-03T07:30:00.000Z");
  assert.deepEqual(checkedAgain.observations, observations);
});

test("ECB API URL requests the complete official history", () => {
  assert.match(API_URL, /format=csvdata/);
  assert.doesNotMatch(API_URL, /lastNObservations/i);
});
