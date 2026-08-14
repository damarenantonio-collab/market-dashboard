// Busca indicadores macroeconômicos do Brasil na API SGS do Banco Central
// e grava data/latest.json, consumido pelo dashboard estático.
//
// Séries SGS usadas (https://www3.bcb.gov.br/sgspub/localizarseries):
//   432   Meta Selic definida pelo Copom (% a.a.)
//   12    Taxa de juros - CDI, diária (% a.d.) — anualizada aqui (base 252) para comparar com a Selic
//   13522 IPCA - acumulado em 12 meses (%)
//   189   IGP-M - variação mensal (%)
//   188   INPC - variação mensal (%)
//   24363 IBC-Br - índice (não dessazonalizado)
//   24369 Taxa de desocupação - PNAD Contínua (%)
//   1     Dólar americano (venda) - PTAX (R$)

const fs = require("fs");
const path = require("path");

const DATA_PATH = path.join(__dirname, "..", "data", "latest.json");

// `history` é em dias corridos (janela para dataInicial); o endpoint
// /dados/ultimos/N é limitado a N=20 pela API, por isso usamos o endpoint
// de intervalo de datas (dataInicial/dataFinal) abaixo.
const INDICATORS = [
  { key: "selic", name: "Selic", code: 432, unit: "% a.a.", history: 1095 },
  { key: "cdi", name: "CDI Anual", code: 12, unit: "% a.a.", history: 1095, annualizeFromDaily: true },
  { key: "ipca12", name: "IPCA 12M", code: 13522, unit: "%", history: 1825 },
  { key: "igpm", name: "IGP-M", code: 189, unit: "%", history: 1825 },
  { key: "inpc", name: "INPC", code: 188, unit: "%", history: 1825 },
  { key: "ibcbr", name: "IBC-Br", code: 24363, unit: "índice", history: 1825 },
  { key: "desemprego", name: "Desemprego", code: 24369, unit: "%", history: 1825 },
  { key: "dolar", name: "Cotação do dólar", code: 1, unit: "R$", history: 1095 },
];

function toBrDate(date) {
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

function sgsUrl(code, historyDays) {
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - historyDays);
  const dataInicial = toBrDate(start);
  const dataFinal = toBrDate(today);
  return `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados?dataInicial=${dataInicial}&dataFinal=${dataFinal}&formato=json`;
}

// Datas do SGS vêm como "dd/mm/aaaa"; convertemos para "aaaa-mm-dd" (ordenável e ISO-friendly).
function toIsoDate(brDate) {
  const [d, m, y] = brDate.split("/");
  return `${y}-${m}-${d}`;
}

async function fetchIndicator(indicator) {
  const res = await fetch(sgsUrl(indicator.code, indicator.history), {
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 (compatible; market-dashboard/1.0; +https://github.com/damarenantonio-collab/market-dashboard)",
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} para série ${indicator.code}${body ? ` — ${body.slice(0, 200)}` : ""}`);
  }
  const raw = await res.json();
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(`Série ${indicator.code} veio vazia`);
  }

  // Converte a taxa diária do CDI (% a.d.) para anualizada base 252,
  // no mesmo formato da Selic, para os dois ficarem comparáveis no gráfico.
  const toValue = indicator.annualizeFromDaily
    ? (v) => Number(((Math.pow(1 + v / 100, 252) - 1) * 100).toFixed(2))
    : (v) => v;

  const series = raw.map((point) => ({
    date: toIsoDate(point.data),
    value: toValue(Number(point.valor)),
  }));

  const last = series[series.length - 1];
  const prev = series.length > 1 ? series[series.length - 2] : null;
  const change = prev ? Number((last.value - prev.value).toFixed(4)) : 0;

  return {
    key: indicator.key,
    name: indicator.name,
    unit: indicator.unit,
    value: last.value,
    date: last.date,
    change,
    series,
  };
}

function loadPrevious() {
  try {
    return JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  } catch {
    return null;
  }
}

async function main() {
  const previous = loadPrevious();
  const indicators = {};
  const failures = [];

  for (const indicator of INDICATORS) {
    try {
      indicators[indicator.key] = await fetchIndicator(indicator);
    } catch (err) {
      failures.push(`${indicator.name} (série ${indicator.code}): ${err.message}`);
      // Mantém o último valor bom conhecido em vez de derrubar o dashboard inteiro.
      if (previous?.indicators?.[indicator.key]) {
        indicators[indicator.key] = previous.indicators[indicator.key];
      }
    }
  }

  const output = {
    updatedAt: new Date().toISOString(),
    indicators,
  };

  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify(output, null, 2) + "\n");

  if (failures.length > 0) {
    console.warn("Falha ao buscar alguns indicadores:\n" + failures.join("\n"));
  }
  console.log(`data/latest.json atualizado com ${Object.keys(indicators).length}/${INDICATORS.length} indicadores.`);
}

main().catch((err) => {
  console.error("Falha ao atualizar indicadores:", err);
  process.exit(1);
});
