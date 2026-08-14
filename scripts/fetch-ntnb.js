// Busca o histórico diário de taxa das NTN-B (Tesouro IPCA+) no Tesouro
// Transparente e grava data/ntnb.json. Fonte oficial e pública, com o
// histórico completo desde a primeira negociação de cada título.
//
// https://www.tesourotransparente.gov.br/ckan/dataset/taxas-dos-titulos-ofertados-pelo-tesouro-direto

const fs = require("fs");
const path = require("path");

const CSV_URL =
  "https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/796d2059-14e9-44e3-80c9-2d9e30b405c1/download/PrecoTaxaTesouroDireto.csv";

const DATA_PATH = path.join(__dirname, "..", "data", "ntnb.json");

// Anos de vencimento que queremos acompanhar.
const TARGET_YEARS = [2037, 2050];

function normHeader(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z ]/g, "") // remove acentos/símbolos residuais de encoding
    .trim();
}

function findCol(headers, prefix) {
  const idx = headers.findIndex((h) => normHeader(h).startsWith(prefix));
  if (idx === -1) throw new Error(`Coluna não encontrada (prefixo "${prefix}"). Cabeçalho: ${headers.join(" | ")}`);
  return idx;
}

function parseBrNumber(str) {
  return Number(String(str).trim().replace(/\./g, "").replace(",", "."));
}

function toIsoDate(brDate) {
  const [d, m, y] = brDate.split("/");
  return `${y}-${m}-${d}`;
}

async function main() {
  const res = await fetch(CSV_URL, {
    headers: {
      Accept: "text/csv,*/*",
      "User-Agent": "Mozilla/5.0 (compatible; market-dashboard/1.0; +https://github.com/damarenantonio-collab/market-dashboard)",
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ao baixar CSV do Tesouro Transparente`);
  }
  const text = await res.text();
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) throw new Error("CSV do Tesouro Transparente veio vazio");

  const headers = lines[0].split(";");
  const tipoIdx = findCol(headers, "tipo titulo");
  const vencIdx = findCol(headers, "data vencimento");
  const baseIdx = findCol(headers, "data base");
  const taxaCompraIdx = findCol(headers, "taxa compra");
  const taxaVendaIdx = findCol(headers, "taxa venda");

  // Descobre dinamicamente quais vencimentos completos (dd/mm/aaaa) existem
  // para cada ano-alvo, dentre títulos "Tesouro IPCA+" (nome atual da NTN-B).
  const maturitiesByYear = new Map(); // year -> Map<vencimento, count>
  for (const year of TARGET_YEARS) maturitiesByYear.set(year, new Map());

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(";");
    if (cols.length <= Math.max(tipoIdx, vencIdx, baseIdx, taxaCompraIdx, taxaVendaIdx)) continue;
    const tipo = cols[tipoIdx].trim();
    if (!tipo.toLowerCase().startsWith("tesouro ipca+") && !tipo.toLowerCase().startsWith("ntn-b")) continue;
    const venc = cols[vencIdx].trim();
    const year = Number(venc.split("/")[2]);
    if (!TARGET_YEARS.includes(year)) continue;

    rows.push({ tipo, venc, base: cols[baseIdx].trim(), taxaCompra: cols[taxaCompraIdx], taxaVenda: cols[taxaVendaIdx] });
    const m = maturitiesByYear.get(year);
    m.set(venc, (m.get(venc) || 0) + 1);
  }

  const bonds = {};
  const notes = [];

  for (const year of TARGET_YEARS) {
    const candidates = [...maturitiesByYear.get(year).entries()].sort((a, b) => b[1] - a[1]);
    if (candidates.length === 0) {
      notes.push(`Nenhum título "Tesouro IPCA+"/NTN-B com vencimento em ${year} encontrado no CSV.`);
      continue;
    }
    const [chosenVenc] = candidates[0];
    if (candidates.length > 1) {
      notes.push(
        `Ano ${year}: mais de um vencimento encontrado (${candidates.map(([v, c]) => `${v} [${c} pontos]`).join(", ")}); usando o com mais dados: ${chosenVenc}.`
      );
    }

    const series = rows
      .filter((r) => r.venc === chosenVenc)
      .map((r) => ({
        date: toIsoDate(r.base),
        taxaCompra: parseBrNumber(r.taxaCompra),
        taxaVenda: parseBrNumber(r.taxaVenda),
      }))
      .sort((a, b) => (a.date < b.date ? -1 : 1));

    bonds[`ntnb${year}`] = {
      key: `ntnb${year}`,
      name: `NTN-B ${year}`,
      maturity: toIsoDate(chosenVenc),
      series,
    };
  }

  const output = {
    updatedAt: new Date().toISOString(),
    bonds,
    notes,
  };

  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify(output, null, 2) + "\n");

  console.log(`data/ntnb.json atualizado. Títulos encontrados: ${Object.keys(bonds).join(", ") || "nenhum"}.`);
  if (notes.length) console.log(notes.join("\n"));
}

main().catch((err) => {
  console.error("Falha ao atualizar histórico de NTN-B:", err);
  process.exit(1);
});
