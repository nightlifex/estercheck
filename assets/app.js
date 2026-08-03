const DATA_URL = "data/estr.json";
const ETF_SPREAD_PERCENTAGE_POINTS = 0.085;
const ETF_COST_PERCENTAGE_POINTS = 0.1;

const dateFormatter = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

const shortDateFormatter = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "short",
  year: "2-digit",
  timeZone: "UTC",
});

const state = {
  dataset: null,
  range: "365",
};

const elements = {
  content: document.querySelector("#dashboard-content"),
  errorPanel: document.querySelector("#error-panel"),
  retryButton: document.querySelector("#retry-button"),
  currentRate: document.querySelector("#current-rate"),
  referenceDate: document.querySelector("#reference-date"),
  publicationDate: document.querySelector("#publication-date"),
  marketStatus: document.querySelector("#market-status"),
  signalTitle: document.querySelector("#signal-title"),
  signalCopy: document.querySelector("#signal-copy"),
  scaleMarker: document.querySelector("#scale-marker"),
  dailyChange: document.querySelector("#daily-change"),
  previousRate: document.querySelector("#previous-rate"),
  estimatedYield: document.querySelector("#estimated-yield"),
  dataStatus: document.querySelector("#data-status"),
  chart: document.querySelector("#chart"),
  chartPeriod: document.querySelector("#chart-period"),
  historyTable: document.querySelector("#history-table"),
  rangeButtons: [...document.querySelectorAll("[data-range]")],
};

function parseDate(dateString) {
  return new Date(`${dateString}T00:00:00Z`);
}

function formatDate(dateString) {
  return dateFormatter.format(parseDate(dateString));
}

function formatRate(value) {
  return Number(value).toLocaleString("de-DE", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
}

function formatChange(value) {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "±";
  return `${sign}${formatRate(Math.abs(value))} %-Pkt.`;
}

function classifyRate(rate) {
  if (rate > 0.05) {
    return {
      key: "positive",
      label: "Positiver Zins",
      title: "Der €STR ist positiv.",
      copy: "Kurzfristige Euro-Geldmarktanlagen bewegen sich damit in einem positiven Zinsumfeld.",
      marker: 88,
    };
  }

  if (rate < -0.05) {
    return {
      key: "negative",
      label: "Negativer Zins",
      title: "Der €STR ist negativ.",
      copy: "Der Tagesgeldsatz liegt unter null. Kurzfristige Geldmarktanlagen können dadurch belastet werden.",
      marker: 12,
    };
  }

  return {
    key: "neutral",
    label: "Nahe null",
    title: "Der €STR liegt nahe null.",
    copy: "Das kurzfristige Zinsumfeld ist weitgehend neutral. Kleine Kosten können die Rendite bereits aufzehren.",
    marker: 50,
  };
}

function validateDataset(dataset) {
  if (!dataset || !Array.isArray(dataset.observations) || dataset.observations.length < 2) {
    throw new Error("Die Datendatei enthält nicht genügend Beobachtungen.");
  }

  for (const observation of dataset.observations) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(observation.date) || !Number.isFinite(observation.rate)) {
      throw new Error("Die Datendatei enthält eine ungültige Beobachtung.");
    }
  }

  return dataset;
}

async function loadData() {
  setLoading(true);
  elements.errorPanel.hidden = true;

  try {
    const response = await fetch(`${DATA_URL}?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    state.dataset = validateDataset(await response.json());
    renderDashboard();
    setLoading(false);
  } catch (error) {
    console.error("€STR-Daten konnten nicht geladen werden:", error);
    setLoading(false, true);
  }
}

function setLoading(isLoading, hasError = false) {
  elements.content.setAttribute("aria-busy", String(isLoading));
  elements.errorPanel.hidden = !hasError;

  if (!isLoading) {
    document.querySelectorAll(".skeleton-text").forEach((element) => {
      element.classList.remove("skeleton-text");
    });
  }
}

function renderDashboard() {
  const { observations, publicationDate } = state.dataset;
  const latest = observations.at(-1);
  const previous = observations.at(-2);
  const change = Number((latest.rate - previous.rate).toFixed(3));
  const estimatedYield = Number(
    (latest.rate + ETF_SPREAD_PERCENTAGE_POINTS - ETF_COST_PERCENTAGE_POINTS).toFixed(3),
  );
  const classification = classifyRate(latest.rate);

  elements.currentRate.textContent = formatRate(latest.rate);
  elements.referenceDate.textContent = formatDate(latest.date);
  elements.publicationDate.textContent = formatDate(publicationDate);
  elements.marketStatus.className = `status-pill ${
    classification.key === "negative" ? "status-negative" : ""
  }`;
  elements.marketStatus.innerHTML = `<span class="status-indicator" aria-hidden="true"></span>${classification.label}`;

  elements.signalTitle.textContent = classification.title;
  elements.signalCopy.textContent = classification.copy;
  elements.scaleMarker.style.left = `${classification.marker}%`;

  elements.dailyChange.textContent = formatChange(change);
  elements.dailyChange.classList.toggle("value-positive", change > 0);
  elements.dailyChange.classList.toggle("value-negative", change < 0);
  elements.previousRate.textContent = `Vorheriger €STR: ${formatRate(previous.rate)} %`;
  elements.estimatedYield.textContent = `${formatRate(estimatedYield)} %`;
  elements.dataStatus.textContent = "Offiziell aktualisiert";

  renderChart();
  renderTable(observations);
}

function filterObservations(observations, range) {
  if (range === "all") return observations;

  const latestDate = parseDate(observations.at(-1).date);
  const threshold = new Date(latestDate);
  threshold.setUTCDate(threshold.getUTCDate() - Number(range));
  const filtered = observations.filter((item) => parseDate(item.date) >= threshold);

  // A line chart needs at least two points. Sparse seed data can make a short range smaller.
  return filtered.length >= 2 ? filtered : observations.slice(-2);
}

function renderChart() {
  const observations = filterObservations(state.dataset.observations, state.range);
  const width = 1000;
  const height = 330;
  const margin = { top: 18, right: 18, bottom: 42, left: 58 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const values = observations.map((item) => item.rate);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const naturalSpread = Math.max(rawMax - rawMin, 0.02);
  const min = rawMin - naturalSpread * 0.25;
  const max = rawMax + naturalSpread * 0.25;

  const x = (index) => margin.left + (index / Math.max(observations.length - 1, 1)) * plotWidth;
  const y = (value) => margin.top + ((max - value) / (max - min)) * plotHeight;
  const points = observations.map((item, index) => [x(index), y(item.rate)]);
  const linePath = points.map(([px, py], index) => `${index ? "L" : "M"}${px},${py}`).join(" ");
  const areaPath = `${linePath} L${points.at(-1)[0]},${margin.top + plotHeight} L${points[0][0]},${
    margin.top + plotHeight
  } Z`;

  const svg = createSvg("svg", {
    viewBox: `0 0 ${width} ${height}`,
    "aria-hidden": "true",
    focusable: "false",
  });
  const defs = createSvg("defs");
  const gradient = createSvg("linearGradient", {
    id: "area-gradient",
    x1: "0",
    y1: "0",
    x2: "0",
    y2: "1",
  });
  gradient.append(
    createSvg("stop", { offset: "0%", "stop-color": "#72f49b", "stop-opacity": "0.23" }),
    createSvg("stop", { offset: "100%", "stop-color": "#72f49b", "stop-opacity": "0" }),
  );
  defs.append(gradient);
  svg.append(defs);

  for (let index = 0; index < 4; index += 1) {
    const ratio = index / 3;
    const gridY = margin.top + ratio * plotHeight;
    const value = max - ratio * (max - min);
    svg.append(
      createSvg("line", {
        x1: margin.left,
        y1: gridY,
        x2: width - margin.right,
        y2: gridY,
        class: "chart-grid",
      }),
    );
    const label = createSvg("text", {
      x: margin.left - 12,
      y: gridY + 4,
      "text-anchor": "end",
      class: "chart-axis-label",
    });
    label.textContent = formatRate(value);
    svg.append(label);
  }

  if (min <= 0 && max >= 0) {
    svg.append(
      createSvg("line", {
        x1: margin.left,
        y1: y(0),
        x2: width - margin.right,
        y2: y(0),
        class: "chart-zero-line",
      }),
    );
  }

  svg.append(createSvg("path", { d: areaPath, class: "chart-area" }));
  svg.append(createSvg("path", { d: linePath, class: "chart-line" }));

  const pointIndexes = new Set([0, observations.length - 1]);
  if (observations.length <= 12) {
    observations.forEach((_, index) => pointIndexes.add(index));
  }

  for (const index of pointIndexes) {
    const [px, py] = points[index];
    const circle = createSvg("circle", { cx: px, cy: py, r: 5, class: "chart-point" });
    const title = createSvg("title");
    title.textContent = `${formatDate(observations[index].date)}: ${formatRate(observations[index].rate)} %`;
    circle.append(title);
    svg.append(circle);
  }

  const labelIndexes = [...new Set([0, Math.floor((observations.length - 1) / 2), observations.length - 1])];
  labelIndexes.forEach((index, labelIndex) => {
    const label = createSvg("text", {
      x: x(index),
      y: height - 10,
      "text-anchor": labelIndex === 0 ? "start" : labelIndex === labelIndexes.length - 1 ? "end" : "middle",
      class: "chart-axis-label",
    });
    label.textContent = shortDateFormatter.format(parseDate(observations[index].date));
    svg.append(label);
  });

  elements.chart.replaceChildren(svg);
  elements.chart.setAttribute(
    "aria-label",
    `Historischer Verlauf des €STR von ${formatDate(observations[0].date)} bis ${formatDate(
      observations.at(-1).date,
    )}. Letzter Wert ${formatRate(observations.at(-1).rate)} Prozent.`,
  );
  elements.chartPeriod.textContent = `${formatDate(observations[0].date)} – ${formatDate(
    observations.at(-1).date,
  )}`;
}

function createSvg(tagName, attributes = {}) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", tagName);
  Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
  return element;
}

function renderTable(observations) {
  elements.historyTable.replaceChildren(
    ...observations
      .slice()
      .reverse()
      .map((observation) => {
        const row = document.createElement("tr");
        const dateCell = document.createElement("td");
        const rateCell = document.createElement("td");
        dateCell.textContent = formatDate(observation.date);
        rateCell.textContent = `${formatRate(observation.rate)} %`;
        row.append(dateCell, rateCell);
        return row;
      }),
  );
}

elements.rangeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.range = button.dataset.range;
    elements.rangeButtons.forEach((candidate) => {
      const active = candidate === button;
      candidate.classList.toggle("active", active);
      candidate.setAttribute("aria-pressed", String(active));
    });
    if (state.dataset) renderChart();
  });
});

elements.retryButton.addEventListener("click", loadData);
loadData();
