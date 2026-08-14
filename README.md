# market-dashboard

Painel de indicadores macroeconômicos do Brasil (Selic, CDI, IPCA, IGP-M,
INPC, IBC-Br, desemprego e câmbio), atualizado automaticamente todos os
dias, mais busca de tickers.

## Como funciona

- **`index.html` / `assets/`** — dashboard estático, sem build step.
- **`scripts/fetch-data.js`** — busca os indicadores na
  [API SGS do Banco Central](https://www3.bcb.gov.br/sgspub/localizarseries)
  e grava `data/latest.json`.
- **`.github/workflows/update-data.yml`** — roda `fetch-data.js` todos os
  dias às 07:00 (horário de Brasília) e commita `data/latest.json` se algum
  valor mudou. Também pode ser disparado manualmente na aba **Actions** do
  GitHub (botão "Run workflow").

## Ativar o site (GitHub Pages)

Passo único, manual (a API do GitHub não permite automatizar isso):

1. No repositório, vá em **Settings → Pages**.
2. Em **Source**, escolha **Deploy from a branch**.
3. Em **Branch**, escolha `main` e a pasta `/ (root)`.
4. Salve. O site fica disponível em
   `https://damarenantonio-collab.github.io/market-dashboard/` em alguns
   minutos.

## Busca de tickers

A busca usa a API pública [brapi.dev](https://brapi.dev). Ela pode exigir um
token gratuito para uso contínuo — crie uma conta em brapi.dev, gere um
token e cole no painel (seção "Configurações" no rodapé do site). O token
fica salvo só no seu navegador (`localStorage`), nunca é commitado.

## Rodar a atualização de dados localmente

```bash
node scripts/fetch-data.js
```

Requer Node 18+ (usa `fetch` nativo). Isso é o mesmo comando que o workflow
do GitHub Actions executa.

## Adicionar/ajustar indicadores

Edite a lista `INDICATORS` em `scripts/fetch-data.js` — cada item aponta
para um código de série do SGS. Códigos podem ser localizados em
https://www3.bcb.gov.br/sgspub/localizarseries.
