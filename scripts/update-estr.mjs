#!/usr/bin/env node

/**
 * Official ECB sources used by this project:
 *
 * - ECB Data Portal API, dataset EST, series EST.B.EU000A2X2A25.WT
 *   (Euro short-term rate, daily-businessweek, volume-weighted trimmed mean rate)
 * - ECB's official €STR publication page for publication/reference-date verification
 *
 * No third-party market data is used. The API returns the observation history; the
 * publication page provides the official release date. See README.md for full URLs.
 */

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const SERIES_KEY = "EST.B.EU000A2X2A25.WT";
export const API_URL =
  "https://data-api.ecb.europa.eu/service/data/EST/B.EU000A2X2A25.WT?format=csvdata&lastNObservations=400";
export const SERIES_URL = "https://data.ecb.europa.eu/data/datasets/EST/EST.B.EU000A2X2A25.WT";
export const OFFICIAL_PAGE_URL =
  "https://www.ecb.europa.eu/stats/financial_markets_and_interest_rates/euro_short-term_rate/html/index.en.html";
export const OUTPUT_PATH = fileURLToPath(new URL("../data/estr.json", import.meta.url));

const ETF_SPREAD_PERCENTAGE_POINTS = 0.085;
const ETF_COST_PERCENTAGE_POINTS = 0.1;

export function parseCsv(input) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    const next = input[index + 1];

    if (character === '"' && quoted && next === '"') {
      field += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(field);
      field = "";
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
    } else {
      field += character;
    }
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  if (rows.length < 2) return [];
  const headers = rows[0].map(normalizeHeader);

  return rows.slice(1).map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])),
  );
}

function normalizeHeader(header) {
  return header.trim().replace(/^\uFEFF/, "").toUpperCase().replace(/[\s-]+/g, "_");
}

export function observationsFromCsv(csv) {
  const byDate = new Map();

  for (const row of parseCsv(csv)) {
    const date = row.TIME_PERIOD;
    const rate = Number.parseFloat(String(row.OBS_VALUE).replace(",", "."));

    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(rate)) {
      byDate.set(date, { date, rate: round(rate) });
    }
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function parsePublicationPage(html) {
  const text = decodeHtml(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " "),
  );
  const publicationMatch = text.match(
    /last update:\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\s+\d{1,2}:\d{2}/i,
  );
  const referenceMatch = text.match(/Reference date\s*\|?\s*(\d{2})-(\d{2})-(\d{4})/i);
  const rateMatch = text.match(/Rate\s*\|?\s*(-?\d+(?:[.,]\d+)?)/i);

  if (!publicationMatch || !referenceMatch || !rateMatch) return null;

  const month = monthNumber(publicationMatch[2]);
  if (!month) return null;

  return {
    publicationDate: `${publicationMatch[3]}-${month}-${publicationMatch[1].padStart(2, "0")}`,
    referenceDate: `${referenceMatch[3]}-${referenceMatch[2]}-${referenceMatch[1]}`,
    rate: round(Number.parseFloat(rateMatch[1].replace(",", "."))),
  };
}

function decodeHtml(value) {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&euro;|&#8364;/gi, "€")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function monthNumber(monthName) {
  const months = {
    january: "01",
    february: "02",
    march: "03",
    april: "04",
    may: "05",
    june: "06",
    july: "07",
    august: "08",
    september: "09",
    october: "10",
    november: "11",
    december: "12",
  };
  return months[monthName.toLowerCase()];
}

export function classifyRate(rate) {
  if (rate > 0.05) return "positive";
  if (rate < -0.05) return "negative";
  return "near-zero";
}

export function buildDataset(observations, publication = null, existing = null) {
  if (!Array.isArray(observations) || observations.length < 2) {
    throw new Error("ECB response must contain at least two valid €STR observations.");
  }

  const latest = observations.at(-1);
  const previous = observations.at(-2);
  const pageMatchesLatest =
    publication &&
    publication.referenceDate === latest.date &&
    Math.abs(publication.rate - latest.rate) < 0.0005;
  const publicationDate = pageMatchesLatest
    ? publication.publicationDate
    : existing?.referenceDate === latest.date
      ? existing.publicationDate
      : latest.date;

  return {
    schemaVersion: 1,
    seriesKey: SERIES_KEY,
    source: {
      name: "European Central Bank — ECB Data Portal",
      apiUrl: API_URL,
      seriesUrl: SERIES_URL,
      officialPageUrl: OFFICIAL_PAGE_URL,
    },
    unit: "percent",
    publicationDate,
    referenceDate: latest.date,
    current: {
      rate: latest.rate,
      previousRate: previous.rate,
      changePercentagePoints: round(latest.rate - previous.rate),
      estimatedNetYield: round(
        latest.rate + ETF_SPREAD_PERCENTAGE_POINTS - ETF_COST_PERCENTAGE_POINTS,
      ),
      classification: classifyRate(latest.rate),
    },
    observations,
  };
}

function round(value) {
  return Number(value.toFixed(3));
}

async function fetchText(url, accept) {
  const response = await fetch(url, {
    headers: {
      Accept: accept,
      "User-Agent": "estercheck-data-updater/1.0 (+https://github.com/nightlifex/estercheck)",
    },
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`ECB request failed with HTTP ${response.status}: ${url}`);
  }

  return response.text();
}

async function readExistingDataset() {
  try {
    return JSON.parse(await readFile(OUTPUT_PATH, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export async function updateDataset() {
  const [csv, publicationHtml, existing] = await Promise.all([
    fetchText(API_URL, "text/csv"),
    fetchText(OFFICIAL_PAGE_URL, "text/html"),
    readExistingDataset(),
  ]);
  const observations = observationsFromCsv(csv);
  const publication = parsePublicationPage(publicationHtml);
  const nextDataset = buildDataset(observations, publication, existing);
  const nextJson = `${JSON.stringify(nextDataset, null, 2)}\n`;
  const currentJson = existing ? `${JSON.stringify(existing, null, 2)}\n` : null;

  if (nextJson === currentJson) {
    console.log("No new or revised ECB observation. data/estr.json remains unchanged.");
    return false;
  }

  await writeFile(OUTPUT_PATH, nextJson, "utf8");
  console.log(
    `Updated data/estr.json through ${nextDataset.referenceDate} (${nextDataset.current.rate.toFixed(3)}%).`,
  );
  return true;
}

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMainModule) {
  updateDataset().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
