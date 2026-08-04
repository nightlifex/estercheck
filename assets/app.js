const DATA_URL = "data/estr.json";
const CACHE_KEY = "estercheck:last-valid-dataset:v2";
const ETF_SPREAD_PERCENTAGE_POINTS = 0.085;
const ETF_COST_PERCENTAGE_POINTS = 0.1;
const STALE_CHECK_AGE_MS = 48 * 60 * 60 * 1000;
const WORKFLOW_DEADLINE_HOUR = 9;
const WORKFLOW_STATUS_POLL_INTERVAL_MS = 5 * 60 * 1000;

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

const technicalCheckFormatter = new Intl.DateTimeFormat("de-DE", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "Europe/Berlin",
});

const berlinDateTimePartsFormatter = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "Europe/Berlin",
});

const state = {
  dataset: null,
  range: "365",
};

let renderedChartSize = "";
let renderedTableDataset = null;
let workflowStatusTimer = null;
let hasRevealedCurrentRate = false;

const elements = {
  content: document.querySelector("#dashboard-content"),
  errorPanel: document.querySelector("#error-panel"),
  errorTitle: document.querySelector("#error-title"),
  errorCopy: document.querySelector("#error-copy"),
  errorLastSuccess: document.querySelector("#error-last-success"),
  retryButton: document.querySelector("#retry-button"),
  rateRow: document.querySelector(".rate-row"),
  currentRate: document.querySelector("#current-rate"),
  referenceDate: document.querySelector("#reference-date"),
  lastSuccessfulCheck: document.querySelector("#last-successful-check"),
  checkFreshnessWarning: document.querySelector("#check-freshness-warning"),
  workflowDelayWarning: document.querySelector("#workflow-delay-warning"),
  marketStatus: document.querySelector("#market-status"),
  signalTitle: document.querySelector("#signal-title"),
  signalCopy: document.querySelector("#signal-copy"),
  scaleMarker: document.querySelector("#scale-marker"),
  dailyChange: document.querySelector("#daily-change"),
  previousRate: document.querySelector("#previous-rate"),
  estimatedYield: document.querySelector("#estimated-yield"),
  chart: document.querySelector("#chart"),
  chartPeriod: document.querySelector("#chart-period"),
  historyTable: document.querySelector("#history-table"),
  dataTableDetails: document.querySelector(".data-table-details"),
  rangeSelector: document.querySelector("#range-selector"),
  rangeIndicator: document.querySelector("#range-indicator"),
  rangeButtons: [...document.querySelectorAll("[data-range]")],
};

function parseDate(dateString) {
  return new Date(`${dateString}T00:00:00Z`);
}

function formatDate(dateString) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateString))) return "—";
  if (Number.isNaN(parseDate(dateString).getTime())) return "—";
  return dateFormatter.format(parseDate(dateString));
}

function isValidTimestamp(value) {
  return typeof value === "string" && value.includes("T") && Number.isFinite(Date.parse(value));
}

function formatTechnicalCheck(value) {
  if (!isValidTimestamp(value)) return "—";
  return `${technicalCheckFormatter.format(new Date(value)).replace(" um ", ", ")} Uhr`;
}

function isTechnicalCheckStale(value, now = Date.now()) {
  if (!isValidTimestamp(value)) return true;
  return now - Date.parse(value) > STALE_CHECK_AGE_MS;
}

function getBerlinDateTimeParts(value) {
  return Object.fromEntries(
    berlinDateTimePartsFormatter
      .formatToParts(value)
      .filter(({ type }) => type !== "literal")
      .map(({ type, value: partValue }) => [type, partValue]),
  );
}

function shouldShowWorkflowDelayWarning(lastSuccessfulCheck, now = new Date()) {
  const current = getBerlinDateTimeParts(now);
  if (Number(current.hour) < WORKFLOW_DEADLINE_HOUR) return false;

  return !isSuccessfulCheckToday(lastSuccessfulCheck, now);
}

function isSuccessfulCheckToday(lastSuccessfulCheck, now = new Date()) {
  if (!isValidTimestamp(lastSuccessfulCheck)) return false;

  const current = getBerlinDateTimeParts(now);
  const lastCheck = getBerlinDateTimeParts(new Date(lastSuccessfulCheck));
  return [lastCheck.year, lastCheck.month, lastCheck.day].join("-") ===
    [current.year, current.month, current.day].join("-");
}

function stopWorkflowStatusPolling() {
  if (workflowStatusTimer === null) return;
  window.clearInterval(workflowStatusTimer);
  workflowStatusTimer = null;
}

function updateWorkflowDelayWarning() {
  const lastSuccessfulCheck = state.dataset?.lastSuccessfulCheck;
  elements.workflowDelayWarning.hidden = !shouldShowWorkflowDelayWarning(lastSuccessfulCheck);
  if (isSuccessfulCheckToday(lastSuccessfulCheck)) stopWorkflowStatusPolling();
}

async function pollWorkflowStatus() {
  updateWorkflowDelayWarning();
  if (elements.workflowDelayWarning.hidden) return;

  try {
    const response = await fetch(`${DATA_URL}?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return;

    const dataset = validateDataset(await response.json());
    if (
      !state.dataset ||
      Date.parse(dataset.lastSuccessfulCheck) > Date.parse(state.dataset.lastSuccessfulCheck)
    ) {
      state.dataset = dataset;
      cacheDataset(dataset);
      renderDashboard();
    }
  } catch {
    // The primary loading state handles data errors; this background check remains unobtrusive.
  }

  updateWorkflowDelayWarning();
}

function formatRate(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return "—";
  return numericValue.toLocaleString("de-DE", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
}

function formatChange(value) {
  if (!Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "±";
  return `${sign}${formatRate(Math.abs(value))} %-Pkt.`;
}

function classifyRate(rate) {
  if (rate < 0.015) {
    return {
      key: "negative",
      label: "Voraussichtlich negativ",
      title: "Voraussichtlich negative Rendite nach Fondskosten.",
      copy: "Unter 0,015 % können die laufenden Fondskosten den vereinfachten Renditevorteil voraussichtlich vollständig aufzehren.",
      marker: 12,
    };
  }

  if (rate <= 0.25) {
    return {
      key: "low",
      label: "Sehr geringe Rendite",
      title: "Die laufende Rendite ist sehr gering.",
      copy: "Zwischen 0,015 % und 0,25 % bleibt nach der vereinfachten Kostenschätzung nur ein geringer laufender Renditebeitrag.",
      marker: 50,
    };
  }

  return {
    key: "positive",
    label: "Positive Rendite",
    title: "Die laufende Rendite ist positiv.",
    copy: "Über 0,25 % bleibt nach der vereinfachten Kostenschätzung ein positiver laufender Renditebeitrag.",
    marker: 94,
  };
}

function validateDataset(dataset) {
  if (!dataset || !Array.isArray(dataset.observations) || dataset.observations.length < 2) {
    throw new Error("Die Datendatei enthält nicht genügend Beobachtungen.");
  }

  if (formatDate(dataset.referenceDate) === "—") {
    throw new Error("Die Datendatei enthält kein gültiges Referenzdatum.");
  }

  if (formatDate(dataset.publicationDate) === "—") {
    throw new Error("Die Datendatei enthält kein gültiges Veröffentlichungsdatum.");
  }

  if (!isValidTimestamp(dataset.lastSuccessfulCheck)) {
    throw new Error("Die Datendatei enthält keinen gültigen technischen Prüfzeitpunkt.");
  }

  if (dataset.lastDataChange && !isValidTimestamp(dataset.lastDataChange)) {
    throw new Error("Die Datendatei enthält keinen gültigen Änderungszeitpunkt.");
  }

  let previousDate = "";
  for (const observation of dataset.observations) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(observation.date) || !Number.isFinite(observation.rate)) {
      throw new Error("Die Datendatei enthält eine ungültige Beobachtung.");
    }
    if (observation.date <= previousDate) {
      throw new Error("Die Beobachtungen sind nicht eindeutig chronologisch sortiert.");
    }
    previousDate = observation.date;
  }

  if (dataset.referenceDate !== dataset.observations.at(-1).date) {
    throw new Error("Referenzdatum und neueste Beobachtung widersprechen sich.");
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
    cacheDataset(state.dataset);
    renderDashboard();
    setLoading(false);
  } catch (error) {
    console.error("€STR-Daten konnten nicht geladen werden:", error);
    if (!state.dataset) state.dataset = readCachedDataset();
    if (state.dataset) renderDashboard();
    else elements.content.hidden = true;
    showLoadError(Boolean(state.dataset));
    setLoading(false, true);
    updateWorkflowDelayWarning();
  }
}

function cacheDataset(dataset) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(dataset));
  } catch {
    // The dashboard remains fully functional when browser storage is unavailable.
  }
}

function readCachedDataset() {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    return cached ? validateDataset(JSON.parse(cached)) : null;
  } catch {
    return null;
  }
}

function formatAvailableEcbState(dataset) {
  const referenceDate = formatDate(dataset?.referenceDate);
  const successfulCheck = formatTechnicalCheck(dataset?.lastSuccessfulCheck);
  if (referenceDate === "—" || successfulCheck === "—") return null;
  return `€STR-Stand: ${referenceDate} · zuletzt erfolgreich geprüft: ${successfulCheck}`;
}

function showLoadError(hasFallback) {
  const lastSuccess = hasFallback ? formatAvailableEcbState(state.dataset) : null;
  elements.errorTitle.textContent = "Die aktuellen Daten konnten derzeit nicht geladen werden.";
  elements.errorCopy.textContent = hasFallback
    ? "Es wird der letzte erfolgreich geladene Datenstand angezeigt."
    : "Bitte versuchen Sie es später erneut.";
  elements.errorLastSuccess.hidden = !lastSuccess;
  elements.errorLastSuccess.textContent = lastSuccess
    ? `Letzter gültiger Datenstand: ${lastSuccess}`
    : "";
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
  const { observations } = state.dataset;
  const latest = observations.at(-1);
  const previous = observations.at(-2);
  const change = Number((latest.rate - previous.rate).toFixed(3));
  const estimatedYield = Number(
    (latest.rate + ETF_SPREAD_PERCENTAGE_POINTS - ETF_COST_PERCENTAGE_POINTS).toFixed(3),
  );
  const classification = classifyRate(latest.rate);

  elements.currentRate.textContent = formatRate(latest.rate);
  if (!hasRevealedCurrentRate) {
    elements.rateRow.classList.add("rate-reveal");
    hasRevealedCurrentRate = true;
  }
  elements.referenceDate.textContent = formatDate(state.dataset.referenceDate);
  elements.lastSuccessfulCheck.textContent = formatTechnicalCheck(
    state.dataset.lastSuccessfulCheck,
  );
  elements.checkFreshnessWarning.hidden = !isTechnicalCheckStale(
    state.dataset.lastSuccessfulCheck,
  );
  updateWorkflowDelayWarning();
  elements.marketStatus.className = `status-pill ${
    classification.key === "negative"
      ? "status-negative"
      : classification.key === "low"
        ? "status-low"
        : "status-positive"
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
  elements.content.hidden = false;

  renderChart();
  renderTableOnDemand();
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
  const width = Math.max(Math.round(elements.chart.clientWidth), 320);
  const height = Math.max(Math.round(elements.chart.clientHeight), 320);
  renderedChartSize = `${width}x${height}`;
  const compact = width < 620;
  const margin = { top: 18, right: compact ? 12 : 18, bottom: 42, left: compact ? 52 : 58 };
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

  const hoverLine = createSvg("line", {
    y1: margin.top,
    y2: margin.top + plotHeight,
    class: "chart-hover-line",
    visibility: "hidden",
  });
  const hoverPoint = createSvg("circle", {
    r: 6,
    class: "chart-hover-point",
    visibility: "hidden",
  });

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

  svg.append(
    createSvg("rect", {
      x: margin.left,
      y: margin.top,
      width: plotWidth,
      height: plotHeight,
      class: "chart-hit-area",
    }),
    hoverLine,
    hoverPoint,
  );

  const tooltip = document.createElement("div");
  const tooltipDate = document.createElement("strong");
  const tooltipValue = document.createElement("span");
  const tooltipChange = document.createElement("span");
  tooltip.className = "chart-tooltip";
  tooltip.setAttribute("role", "status");
  tooltip.setAttribute("aria-live", "polite");
  tooltip.hidden = true;
  tooltip.append(tooltipDate, tooltipValue, tooltipChange);

  const fullObservations = state.dataset.observations;
  const firstObservationIndex = fullObservations.findIndex(
    (observation) => observation.date === observations[0].date,
  );

  const hideTooltip = () => {
    hoverLine.setAttribute("visibility", "hidden");
    hoverPoint.setAttribute("visibility", "hidden");
    tooltip.hidden = true;
  };

  const showTooltip = (event) => {
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !Number.isFinite(event.clientX)) return;

    const svgX = ((event.clientX - rect.left) / rect.width) * width;
    if (svgX < margin.left || svgX > width - margin.right) {
      hideTooltip();
      return;
    }

    const ratio = (svgX - margin.left) / plotWidth;
    const index = Math.max(
      0,
      Math.min(observations.length - 1, Math.round(ratio * (observations.length - 1))),
    );
    const observation = observations[index];
    const [px, py] = points[index];
    const previous = fullObservations[firstObservationIndex + index - 1];
    const change = previous ? Number((observation.rate - previous.rate).toFixed(3)) : null;

    hoverLine.setAttribute("x1", px);
    hoverLine.setAttribute("x2", px);
    hoverLine.setAttribute("visibility", "visible");
    hoverPoint.setAttribute("cx", px);
    hoverPoint.setAttribute("cy", py);
    hoverPoint.setAttribute("visibility", "visible");

    tooltipDate.textContent = formatDate(observation.date);
    tooltipValue.textContent = `€STR: ${formatRate(observation.rate)} %`;
    tooltipChange.textContent = Number.isFinite(change)
      ? `Zum vorherigen Wert: ${formatChange(change)}`
      : "Erster Wert im verfügbaren Verlauf";
    tooltip.hidden = false;

    const chartRect = elements.chart.getBoundingClientRect();
    const left = rect.left - chartRect.left + (px / width) * rect.width;
    const top = rect.top - chartRect.top + (py / height) * rect.height;
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    tooltip.classList.toggle("align-left", left < 120);
    tooltip.classList.toggle("align-right", left > chartRect.width - 120);
    tooltip.classList.toggle("below", top < 105);
  };

  svg.addEventListener("pointermove", showTooltip);
  svg.addEventListener("pointerdown", showTooltip);
  svg.addEventListener("pointerleave", hideTooltip);

  elements.chart.replaceChildren(svg, tooltip);
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

function renderTableOnDemand() {
  if (!elements.dataTableDetails.open || !state.dataset || renderedTableDataset === state.dataset) {
    return;
  }

  renderTable(state.dataset.observations);
  renderedTableDataset = state.dataset;
}

elements.dataTableDetails.addEventListener("toggle", renderTableOnDemand);

elements.rangeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.range = button.dataset.range;
    elements.rangeButtons.forEach((candidate) => {
      const active = candidate.dataset.range === state.range;
      candidate.classList.toggle("active", active);
      candidate.setAttribute("aria-pressed", String(active));
    });
    positionRangeIndicator(button);
    if (state.dataset) renderChart();
  });
});

function positionRangeIndicator(button, animate = true) {
  if (!button || !elements.rangeIndicator || !elements.rangeSelector) return;

  if (!animate) elements.rangeIndicator.style.transition = "none";
  elements.rangeIndicator.style.width = `${button.offsetWidth}px`;
  elements.rangeIndicator.style.transform = `translateX(${button.offsetLeft}px)`;
  elements.rangeSelector.dataset.indicatorReady = "true";

  if (!animate) {
    requestAnimationFrame(() => elements.rangeIndicator.style.removeProperty("transition"));
  }
}

function positionActiveRangeIndicator(animate = false) {
  positionRangeIndicator(elements.rangeButtons.find((button) => button.classList.contains("active")), animate);
}

requestAnimationFrame(() => positionActiveRangeIndicator(false));

if ("ResizeObserver" in window && elements.rangeSelector) {
  new ResizeObserver(() => positionActiveRangeIndicator(false)).observe(elements.rangeSelector);
} else {
  window.addEventListener("resize", () => positionActiveRangeIndicator(false));
}

if ("ResizeObserver" in window && elements.chart) {
  let chartResizeFrame;
  new ResizeObserver(([entry]) => {
    if (!state.dataset) return;
    const nextSize = `${Math.max(Math.round(entry.contentRect.width), 320)}x${Math.max(
      Math.round(entry.contentRect.height),
      320,
    )}`;
    if (nextSize === renderedChartSize) return;
    cancelAnimationFrame(chartResizeFrame);
    chartResizeFrame = requestAnimationFrame(() => renderChart());
  }).observe(elements.chart);
}

elements.retryButton.addEventListener("click", loadData);
loadData();
workflowStatusTimer = window.setInterval(
  pollWorkflowStatus,
  WORKFLOW_STATUS_POLL_INTERVAL_MS,
);
