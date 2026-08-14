const SERIES_COLORS = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
];

const numberFmt = (v, unit) => {
  const n = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
  return unit === "R$" ? `R$ ${n}` : `${n}${unit === "índice" ? "" : unit.startsWith("%") ? "%" : ""}`;
};

const dateFmt = (iso) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

function deltaArrow(change) {
  if (change > 0) return { symbol: "▲", label: "alta" };
  if (change < 0) return { symbol: "▼", label: "queda" };
  return { symbol: "—", label: "estável" };
}

function renderTile(indicator) {
  if (!indicator) return "";
  const { symbol, label } = deltaArrow(indicator.change);
  return `
    <div class="tile">
      <div class="label">${indicator.name}</div>
      <div class="date">${dateFmt(indicator.date)}</div>
      <div class="value">${numberFmt(indicator.value, indicator.unit)}</div>
      <div class="delta">${symbol} ${label} (${indicator.change >= 0 ? "+" : ""}${indicator.change.toFixed(2)})</div>
    </div>`;
}

// Gráfico de linhas simples em SVG puro (sem dependências externas).
// series: [{ name, color, points: [{date, value}, ...] }]
function drawLineChart(container, series, { height = 260 } = {}) {
  const width = container.clientWidth || 600;
  const padding = { top: 12, right: 12, bottom: 24, left: 44 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const allDates = [...new Set(series.flatMap((s) => s.points.map((p) => p.date)))].sort();
  if (allDates.length === 0) {
    container.innerHTML = `<div class="error-note">Sem dados no período selecionado.</div>`;
    return;
  }
  const allValues = series.flatMap((s) => s.points.map((p) => p.value));
  const minV = Math.min(...allValues);
  const maxV = Math.max(...allValues);
  const pad = (maxV - minV) * 0.1 || 1;
  const yMin = minV - pad;
  const yMax = maxV + pad;

  const xScale = (date) => {
    const idx = allDates.indexOf(date);
    return padding.left + (idx / Math.max(allDates.length - 1, 1)) * innerW;
  };
  const yScale = (v) => padding.top + innerH - ((v - yMin) / (yMax - yMin || 1)) * innerH;

  const gridLines = 4;
  let gridSvg = "";
  for (let i = 0; i <= gridLines; i++) {
    const y = padding.top + (innerH / gridLines) * i;
    const val = yMax - ((yMax - yMin) / gridLines) * i;
    gridSvg += `<line x1="${padding.left}" x2="${width - padding.right}" y1="${y}" y2="${y}" stroke="var(--grid)" stroke-width="1" />`;
    gridSvg += `<text x="${padding.left - 8}" y="${y + 3}" text-anchor="end" font-size="10" fill="var(--text-muted)">${val.toFixed(1)}</text>`;
  }

  const step = Math.ceil(allDates.length / 6);
  let xLabels = "";
  allDates.forEach((d, i) => {
    if (i % step === 0 || i === allDates.length - 1) {
      xLabels += `<text x="${xScale(d)}" y="${height - 6}" text-anchor="middle" font-size="10" fill="var(--text-muted)">${dateFmt(d)}</text>`;
    }
  });

  let linesSvg = "";
  series.forEach((s) => {
    const pts = s.points.filter((p) => allDates.includes(p.date));
    const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${xScale(p.date)},${yScale(p.value)}`).join(" ");
    linesSvg += `<path d="${path}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" data-series="${s.name}" />`;
  });

  const svg = `
    <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" class="line-chart">
      ${gridSvg}
      <line x1="${padding.left}" x2="${width - padding.right}" y1="${padding.top + innerH}" y2="${padding.top + innerH}" stroke="var(--baseline)" stroke-width="1" />
      ${linesSvg}
      ${xLabels}
      <g class="hover-guide" style="display:none">
        <line x1="0" x2="0" y1="${padding.top}" y2="${padding.top + innerH}" stroke="var(--baseline)" stroke-width="1" stroke-dasharray="3,3" />
      </g>
    </svg>`;

  container.innerHTML = svg;

  const svgEl = container.querySelector("svg");
  const guide = container.querySelector(".hover-guide");
  let tooltip = container.parentElement.querySelector(".chart-tooltip");
  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.className = "chart-tooltip";
    container.parentElement.appendChild(tooltip);
  }

  svgEl.addEventListener("mousemove", (evt) => {
    const rect = svgEl.getBoundingClientRect();
    const scaleX = width / rect.width;
    const mouseX = (evt.clientX - rect.left) * scaleX;
    let closestIdx = 0;
    let closestDist = Infinity;
    allDates.forEach((d, i) => {
      const dist = Math.abs(xScale(d) - mouseX);
      if (dist < closestDist) {
        closestDist = dist;
        closestIdx = i;
      }
    });
    const date = allDates[closestIdx];
    const x = xScale(date);
    guide.style.display = "block";
    guide.setAttribute("transform", `translate(${x},0)`);

    const lines = series
      .map((s) => {
        const pt = s.points.find((p) => p.date === date);
        if (!pt) return "";
        return `<div><span style="color:${s.color}">●</span> ${s.name}: <strong>${pt.value.toFixed(2)}</strong></div>`;
      })
      .join("");
    tooltip.innerHTML = `<div style="margin-bottom:4px;color:var(--text-muted)">${dateFmt(date)}</div>${lines}`;
    tooltip.classList.add("show");
    tooltip.style.left = `${evt.clientX - rect.left + 12}px`;
    tooltip.style.top = `${evt.clientY - rect.top - 10}px`;
  });

  svgEl.addEventListener("mouseleave", () => {
    guide.style.display = "none";
    tooltip.classList.remove("show");
  });
}

function renderLegend(container, series) {
  container.innerHTML = series
    .map((s) => `<div class="item"><span class="dot" style="background:${s.color}"></span>${s.name}</div>`)
    .join("");
}

// Janela de tempo aplicada aos gráficos (não afeta os cards, que sempre mostram o valor mais recente).
// { type: "all" } | { type: "preset", months: N } | { type: "custom", start: "aaaa-mm-dd", end: "aaaa-mm-dd" }
let selectedRange = { type: "all" };
let cachedData = null;
let cachedNtnb = null;

function filterPoints(points, range) {
  if (!range || range.type === "all") return points;
  if (range.type === "preset") {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - range.months);
    const cutoffIso = cutoff.toISOString().slice(0, 10);
    return points.filter((p) => p.date >= cutoffIso);
  }
  if (range.type === "custom") {
    const { start, end } = range;
    return points.filter((p) => (!start || p.date >= start) && (!end || p.date <= end));
  }
  return points;
}

async function loadDashboard() {
  if (!cachedData) {
    const res = await fetch("data/latest.json", { cache: "no-store" });
    if (!res.ok) throw new Error("Não foi possível carregar data/latest.json");
    cachedData = await res.json();
  }
  if (!cachedNtnb) {
    try {
      const res = await fetch("data/ntnb.json", { cache: "no-store" });
      cachedNtnb = res.ok ? await res.json() : { bonds: {}, notes: [] };
    } catch {
      cachedNtnb = { bonds: {}, notes: [] };
    }
  }
  const data = cachedData;
  const ind = data.indicators;

  document.getElementById("updated-at").textContent = `Atualizado em ${new Date(data.updatedAt).toLocaleString("pt-BR")}`;

  const tileOrder = ["selic", "cdi", "ipca12", "igpm", "ibcbr", "desemprego", "dolar"];
  document.getElementById("tiles").innerHTML = tileOrder.map((k) => renderTile(ind[k])).join("");

  renderCharts();
}

function renderCharts() {
  if (!cachedData) return;
  const ind = cachedData.indicators;

  const inflSeries = [
    { key: "ipca12", name: "IPCA 12M" },
    { key: "igpm", name: "IGP-M" },
    { key: "selic", name: "Selic" },
  ]
    .filter((s) => ind[s.key])
    .map((s, i) => ({ name: s.name, color: SERIES_COLORS[i], points: filterPoints(ind[s.key].series, selectedRange) }));

  renderLegend(document.getElementById("infl-legend"), inflSeries);
  drawLineChart(document.getElementById("infl-chart"), inflSeries, { height: 280 });

  if (ind.ibcbr) {
    drawLineChart(
      document.getElementById("ibc-chart"),
      [{ name: "IBC-Br", color: SERIES_COLORS[0], points: filterPoints(ind.ibcbr.series, selectedRange) }],
      { height: 200 }
    );
  }
  if (ind.desemprego) {
    drawLineChart(
      document.getElementById("desemprego-chart"),
      [{ name: "Desemprego", color: SERIES_COLORS[1], points: filterPoints(ind.desemprego.series, selectedRange) }],
      { height: 200 }
    );
  }

  renderNtnbChart();
}

function renderNtnbChart() {
  const chartEl = document.getElementById("ntnb-chart");
  const noteEl = document.getElementById("ntnb-note");
  if (!chartEl || !cachedNtnb) return;

  const bonds = cachedNtnb.bonds || {};
  const ntnbSeries = Object.values(bonds)
    .map((b, i) => ({
      name: `${b.name} (venc. ${dateFmt(b.maturity)})`,
      color: SERIES_COLORS[i],
      points: filterPoints(
        b.series.map((p) => ({ date: p.date, value: p.taxaVenda })),
        selectedRange
      ),
    }))
    .filter((s) => s.points.length > 0);

  renderLegend(document.getElementById("ntnb-legend"), ntnbSeries);

  if (ntnbSeries.length === 0) {
    chartEl.innerHTML = `<div class="error-note">Sem dados de NTN-B disponíveis ainda.</div>`;
  } else {
    drawLineChart(chartEl, ntnbSeries, { height: 260 });
  }

  noteEl.textContent = (cachedNtnb.notes || []).join(" ");
}

// Busca de ticker via brapi.dev (API pública de cotações B3).
// Um token gratuito pode ser necessário para uso continuado — obtenha em https://brapi.dev
// e cole no campo de configurações; é salvo apenas no seu navegador (localStorage).
async function searchTicker(ticker) {
  const box = document.getElementById("ticker-result");
  box.classList.add("show");
  box.textContent = "Buscando...";

  const token = localStorage.getItem("brapiToken") || "";
  const url = `https://brapi.dev/api/quote/${encodeURIComponent(ticker)}${token ? `?token=${encodeURIComponent(token)}` : ""}`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    const result = data?.results?.[0];
    if (!result) {
      box.textContent = data?.message || "Ticker não encontrado.";
      return;
    }
    const change = result.regularMarketChangePercent ?? 0;
    const arrow = change > 0 ? "▲" : change < 0 ? "▼" : "—";
    box.innerHTML = `<strong>${result.symbol}</strong> — ${result.longName || ""}<br>
      R$ ${Number(result.regularMarketPrice).toFixed(2)} ${arrow} ${change.toFixed(2)}%`;
  } catch (err) {
    box.textContent = "Não foi possível buscar esse ticker agora (verifique o token da brapi.dev nas configurações).";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadDashboard().catch((err) => {
    document.getElementById("tiles").innerHTML = `<div class="error-note">${err.message}</div>`;
  });

  document.getElementById("ticker-form").addEventListener("submit", (evt) => {
    evt.preventDefault();
    const value = document.getElementById("ticker-input").value.trim().toUpperCase();
    if (value) searchTicker(value);
  });

  document.querySelectorAll(".range-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const months = btn.dataset.months;
      selectedRange = months === "all" ? { type: "all" } : { type: "preset", months: Number(months) };
      document.getElementById("range-start").value = "";
      document.getElementById("range-end").value = "";
      document.querySelectorAll(".range-btn").forEach((b) => b.classList.toggle("active", b === btn));
      renderCharts();
    });
  });

  document.getElementById("range-form").addEventListener("submit", (evt) => {
    evt.preventDefault();
    const start = document.getElementById("range-start").value;
    const end = document.getElementById("range-end").value;
    if (!start && !end) return;
    selectedRange = { type: "custom", start, end };
    document.querySelectorAll(".range-btn").forEach((b) => b.classList.remove("active"));
    renderCharts();
  });

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => renderCharts(), 150);
  });
});
