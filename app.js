/* ==========================================================
   TRAFFIC/PATTERN.DASH — front-end logic
   No backend: fetches a precomputed data/data.json by default,
   and can parse a user-uploaded log file entirely in-browser.
   ========================================================== */

const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const WEEKDAY_SHORT = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

let hourlyChart = null;
let weekdayChart = null;

/* ---------- Chart.js shared look ---------- */
function chartDefaults() {
  Chart.defaults.font.family = "'IBM Plex Mono', monospace";
  Chart.defaults.font.size = 11;
  Chart.defaults.color = "#7C8B99";
}

/* ---------- Client-side log parser (mirrors scripts/parse_logs.py) ---------- */
const LOG_RE = /^(\S+) \S+ \S+ \[([^\]]+)\] "([^"]*)" (\d{3}|-) (\S+)/;
const MONTHS = { Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5, Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11 };

function parseApacheDate(raw) {
  // format: 01/Jul/1995:00:04:56 -0400
  const m = raw.match(/^(\d{2})\/(\w{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, day, mon, year, hh, mm, ss] = m;
  if (!(mon in MONTHS)) return null;
  return new Date(Date.UTC(+year, MONTHS[mon], +day, +hh, +mm, +ss));
}

function parseLogText(text, sourceLabel) {
  const hourly = new Array(24).fill(0);
  const weekday = new Array(7).fill(0);
  const heatmap = Array.from({ length: 7 }, () => new Array(24).fill(0));
  const statusCodes = {};
  const pathCounts = {};
  const dailyTotals = {};
  let total = 0, malformed = 0, minDt = null, maxDt = null;

  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    const m = line.match(LOG_RE);
    if (!m) { malformed++; continue; }
    const dt = parseApacheDate(m[2]);
    if (!dt) { malformed++; continue; }

    total++;
    const hour = dt.getUTCHours();
    // JS getUTCDay: 0=Sun..6=Sat -> convert to 0=Mon..6=Sun
    const jsDay = dt.getUTCDay();
    const wd = (jsDay + 6) % 7;

    hourly[hour]++;
    weekday[wd]++;
    heatmap[wd][hour]++;

    const status = m[4];
    statusCodes[status] = (statusCodes[status] || 0) + 1;

    const reqParts = m[3].split(" ");
    if (reqParts.length >= 2) {
      const p = reqParts[1];
      pathCounts[p] = (pathCounts[p] || 0) + 1;
    }

    const dateKey = dt.toISOString().slice(0, 10);
    dailyTotals[dateKey] = (dailyTotals[dateKey] || 0) + 1;

    if (!minDt || dt < minDt) minDt = dt;
    if (!maxDt || dt > maxDt) maxDt = dt;
  }

  return buildOutput({ hourly, weekday, heatmap, statusCodes, pathCounts, dailyTotals, total, malformed, minDt, maxDt }, sourceLabel);
}

function buildOutput(s, sourceLabel) {
  const peakHour = s.hourly.indexOf(Math.max(...s.hourly));
  const peakDayIdx = s.weekday.indexOf(Math.max(...s.weekday));
  const dailyEntries = Object.entries(s.dailyTotals);
  let busiestDate = null, busiestCount = 0;
  for (const [d, c] of dailyEntries) if (c > busiestCount) { busiestDate = d; busiestCount = c; }

  const topPaths = Object.entries(s.pathCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([path, count]) => ({ path, count }));

  const statusSorted = Object.fromEntries(Object.entries(s.statusCodes).sort((a, b) => b[1] - a[1]));

  return {
    meta: {
      source: sourceLabel,
      total_requests: s.total,
      malformed_lines_skipped: s.malformed,
      date_range: {
        start: s.minDt ? s.minDt.toISOString() : null,
        end: s.maxDt ? s.maxDt.toISOString() : null,
      },
      days_covered: dailyEntries.length,
      avg_requests_per_day: dailyEntries.length ? +(s.total / dailyEntries.length).toFixed(1) : 0,
    },
    hourly: s.hourly,
    weekday: s.weekday,
    weekday_labels: WEEKDAY_NAMES,
    heatmap: s.heatmap,
    peak: {
      hour: peakHour,
      hour_label: `${String(peakHour).padStart(2, "0")}:00-${String((peakHour + 1) % 24).padStart(2, "0")}:00`,
      day: WEEKDAY_NAMES[peakDayIdx],
      busiest_date: busiestDate,
      busiest_date_count: busiestCount,
    },
    status_codes: statusSorted,
    top_paths: topPaths,
  };
}

/* ---------- Rendering ---------- */
function fmtNum(n) {
  return n.toLocaleString("en-US");
}
function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "2-digit" });
}

function renderKPIs(data) {
  document.getElementById("kpiPeakHour").textContent = data.peak.hour_label;
  document.getElementById("kpiPeakDay").textContent = data.peak.day.toUpperCase();
  document.getElementById("kpiTotal").textContent = fmtNum(data.meta.total_requests);
  document.getElementById("kpiDays").textContent = data.meta.days_covered;
  document.getElementById("kpiDateRange").textContent =
    data.meta.date_range.start ? `${fmtDate(data.meta.date_range.start)} — ${fmtDate(data.meta.date_range.end)}` : "—";
  document.getElementById("kpiTotalHint").textContent =
    data.meta.malformed_lines_skipped ? `${fmtNum(data.meta.malformed_lines_skipped)} malformed lines skipped` : "parsed from log";
  document.getElementById("sourceLabel").textContent = `SOURCE: ${data.meta.source}`;
  document.getElementById("statusNote").textContent =
    `Busiest single day: ${data.peak.busiest_date || "—"} (${fmtNum(data.peak.busiest_date_count)} requests). ` +
    `Average ${data.meta.avg_requests_per_day.toLocaleString()} requests/day across ${data.meta.days_covered} day(s).`;
}

function renderHourlyChart(data) {
  const ctx = document.getElementById("hourlyChart");
  const labels = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}`);
  const peakIdx = data.peak.hour;
  const colors = data.hourly.map((_, i) => (i === peakIdx ? "#FFB000" : "rgba(94,234,212,0.55)"));

  if (hourlyChart) hourlyChart.destroy();
  hourlyChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        data: data.hourly,
        backgroundColor: colors,
        borderRadius: 2,
        maxBarThickness: 22,
      }],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#060a0e",
          borderColor: "#FFB000",
          borderWidth: 1,
          titleFont: { family: "'IBM Plex Mono', monospace" },
          bodyFont: { family: "'IBM Plex Mono', monospace" },
          callbacks: { title: (items) => `${items[0].label}:00 – ${(parseInt(items[0].label)+1)%24}:00` }
        },
      },
      scales: {
        x: { grid: { color: "#1E2A36" }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } },
        y: { grid: { color: "#1E2A36" }, beginAtZero: true },
      },
    },
  });
}

function renderWeekdayChart(data) {
  const ctx = document.getElementById("weekdayChart");
  const peakIdx = WEEKDAY_NAMES.indexOf(data.peak.day);
  const colors = data.weekday.map((_, i) => (i === peakIdx ? "#FFB000" : "rgba(94,234,212,0.55)"));

  if (weekdayChart) weekdayChart.destroy();
  weekdayChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: WEEKDAY_SHORT,
      datasets: [{
        data: data.weekday,
        backgroundColor: colors,
        borderRadius: 3,
        maxBarThickness: 46,
      }],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#060a0e",
          borderColor: "#FFB000",
          borderWidth: 1,
        },
      },
      scales: {
        x: { grid: { display: false } },
        y: { grid: { color: "#1E2A36" }, beginAtZero: true },
      },
    },
  });
}

function renderHeatmap(data) {
  const el = document.getElementById("heatmap");
  el.innerHTML = "";

  const flat = data.heatmap.flat();
  const max = Math.max(1, ...flat);

  // corner cell
  el.appendChild(makeDiv("heatmap-corner", ""));
  for (let h = 0; h < 24; h++) {
    const label = h % 3 === 0 ? String(h).padStart(2, "0") : "";
    el.appendChild(makeDiv("heatmap-collabel", label));
  }

  let tooltip = document.querySelector(".heatmap-tooltip");
  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.className = "heatmap-tooltip";
    document.body.appendChild(tooltip);
  }

  for (let d = 0; d < 7; d++) {
    el.appendChild(makeDiv("heatmap-rowlabel", WEEKDAY_SHORT[d]));
    for (let h = 0; h < 24; h++) {
      const val = data.heatmap[d][h];
      const ratio = val / max;
      const cell = document.createElement("div");
      cell.className = "heatmap-cell";
      cell.dataset.level = ratio === 0 ? "0" : "1";
      cell.style.background = ratio === 0 ? "" : heatColor(ratio);
      cell.addEventListener("mousemove", (e) => {
        tooltip.style.display = "block";
        tooltip.style.left = e.clientX + 14 + "px";
        tooltip.style.top = e.clientY + 14 + "px";
        tooltip.textContent = `${WEEKDAY_NAMES[d]} ${String(h).padStart(2, "0")}:00 — ${fmtNum(val)} req`;
      });
      cell.addEventListener("mouseleave", () => { tooltip.style.display = "none"; });
      el.appendChild(cell);
    }
  }
}

function makeDiv(cls, text) {
  const d = document.createElement("div");
  d.className = cls;
  d.textContent = text;
  return d;
}

// interpolate cyan(low) -> amber(high)
function heatColor(ratio) {
  const low = [20, 70, 90];    // dim teal
  const mid = [94, 234, 212];  // cyan
  const high = [255, 176, 0];  // amber
  let c;
  if (ratio < 0.5) {
    const t = ratio / 0.5;
    c = low.map((v, i) => Math.round(v + (mid[i] - v) * t));
  } else {
    const t = (ratio - 0.5) / 0.5;
    c = mid.map((v, i) => Math.round(v + (high[i] - v) * t));
  }
  const alpha = 0.25 + ratio * 0.75;
  return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha.toFixed(2)})`;
}

function renderTopPaths(data) {
  const list = document.getElementById("pathList");
  list.innerHTML = "";
  const max = data.top_paths.length ? data.top_paths[0].count : 1;
  data.top_paths.forEach((p, i) => {
    const li = document.createElement("li");
    const pct = Math.max(4, Math.round((p.count / max) * 100));
    li.innerHTML = `
      <span class="idx">${i + 1}</span>
      <span class="path" title="${escapeHtml(p.path)}">${escapeHtml(p.path)}</span>
      <span class="count">${fmtNum(p.count)}</span>
      <span class="bar"><span style="width:${pct}%"></span></span>
    `;
    list.appendChild(li);
  });
  if (!data.top_paths.length) {
    list.innerHTML = `<li><span class="path">No request paths parsed.</span></li>`;
  }
}

function renderStatusCodes(data) {
  const wrap = document.getElementById("statusBars");
  wrap.innerHTML = "";
  const entries = Object.entries(data.status_codes);
  const total = entries.reduce((a, [, c]) => a + c, 0) || 1;
  document.getElementById("statusTotalTag").textContent = `${fmtNum(total)} responses`;

  const colorFor = (code) => {
    const cls = code[0];
    if (cls === "2") return "#5EEAD4";
    if (cls === "3") return "#FFB000";
    return "#FF6B6B";
  };

  entries.forEach(([code, count]) => {
    const pct = ((count / total) * 100).toFixed(1);
    const row = document.createElement("div");
    row.className = "statusrow";
    row.innerHTML = `
      <span class="code" data-class="${code[0]}">${code}</span>
      <span class="track"><span class="fill" style="width:${pct}%; background:${colorFor(code)}"></span></span>
      <span class="pct">${pct}%</span>
    `;
    wrap.appendChild(row);
  });
}

function renderAll(data) {
  renderKPIs(data);
  renderHourlyChart(data);
  renderWeekdayChart(data);
  renderHeatmap(data);
  renderTopPaths(data);
  renderStatusCodes(data);
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ---------- Bootstrapping ---------- */
async function loadDefaultDataset() {
  try {
    const res = await fetch("data/data.json", { cache: "no-store" });
    if (!res.ok) throw new Error("fetch failed");
    const data = await res.json();
    renderAll(data);
  } catch (err) {
    console.error(err);
    document.getElementById("sourceLabel").textContent = "SOURCE: (data/data.json not found)";
  }
}

function wireUpload() {
  const input = document.getElementById("fileInput");
  input.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    document.getElementById("sourceLabel").textContent = `SOURCE: parsing ${file.name}…`;
    const text = await file.text();
    const data = parseLogText(text, `${file.name} (parsed in-browser)`);
    if (data.meta.total_requests === 0) {
      alert("No valid log lines were recognized. Expected NCSA Common/Combined Log Format, e.g.:\nhost - - [01/Jul/1995:00:00:01 -0400] \"GET /path HTTP/1.0\" 200 1234");
      loadDefaultDataset();
      return;
    }
    renderAll(data);
  });

  document.getElementById("resetBtn").addEventListener("click", () => {
    document.getElementById("fileInput").value = "";
    loadDefaultDataset();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  chartDefaults();
  wireUpload();
  loadDefaultDataset();
});
