# Modo Lista — Design

**Spec**: `.specs/features/modo-lista/spec.md`
**Status**: Draft

---

## Architecture Overview

O app é uma SPA de arquivo único (`index.html`). Todo estado vive em variáveis JS globais; toda persistência usa `localStorage`; todo fetch usa `fetchJSON()` com fallback entre 3 proxies públicos.

O Modo Lista se encaixa como uma **camada de renderização alternativa** — o mesmo array `currentItems` que alimenta `renderGrid()` alimentará `renderTable()`. Os dados de fundamentais são buscados separadamente e mesclados no momento da renderização.

```
Usuário clica "≡ Lista"
        │
        ▼
setViewMode('list')
        │
        ├─ currentItems já carregados?
        │         │ sim → renderTable(currentItems)
        │         │ não → aguarda load()
        │
        ▼
renderTable(items)
        │
        ├─ para cada item.ok:
        │     getFundamentals(ticker)   ← cache hit ou fetch
        │         │
        │         ├─ cache válido (<24h) → resolve imediatamente
        │         └─ sem cache → fetchFundamentals(ticker) → salva cache
        │
        └─ monta <table> e injeta em #list-container
```

---

## Endpoint Yahoo Finance — quoteSummary

```
GET https://query1.finance.yahoo.com/v10/finance/quoteSummary/{ticker}
    ?modules=summaryDetail,defaultKeyStatistics,financialData,assetProfile
```

Passado pelo mesmo `fetchJSON()` existente (proxies allorigins → thingproxy → codetabs).

### Mapeamento de campos

| Indicador | Caminho no JSON | Tipo | Observação |
|---|---|---|---|
| P/L | `summaryDetail.trailingPE.raw` | float | negativo = prejuízo |
| P/VPA | `defaultKeyStatistics.priceToBook.raw` | float | — |
| DY | `summaryDetail.dividendYield.raw` | float | **×100** para % |
| ROE | `financialData.returnOnEquity.raw` | float | **×100** para % |
| EV/EBITDA | `defaultKeyStatistics.enterpriseToEbitda.raw` | float | — |
| Margem Líq. | `financialData.profitMargins.raw` | float | **×100** para % |
| Market Cap | `summaryDetail.marketCap.raw` | int | formatar com sufixo B/M |
| LPA (EPS) | `defaultKeyStatistics.trailingEps.raw` | float | — |
| Setor | `assetProfile.sector` | string | — |
| Payout | `summaryDetail.payoutRatio.raw` | float | **×100** para % |

> **Atenção:** DY, ROE, Margem e Payout chegam como decimais (0.045 = 4,5%). Multiplicar por 100 antes de exibir.

---

## Código Reuse Analysis

| Existente | Como reusar |
|---|---|
| `fetchJSON(url)` | Chamado diretamente para o endpoint quoteSummary |
| `display(ticker)` | Exibir ticker sem `.SA` nas células |
| `fmt(price, currency)` | Preço atual e preço médio nas colunas de portfolio |
| `fmtPct(pct)` | Var. dia, queda do topo, DY, ROE, Margem, Payout |
| `pnlColor(pct)` | Coloração de P&L nas colunas de portfolio |
| `dropStyle(pct)` | Coloração da coluna "Queda do topo" |
| `computeMetrics(item)` | Colunas de portfolio na tabela (P2) |
| `getPosition(ticker)` | Verificar se tem posição para exibir colunas portfolio |
| `currentItems` | Array fonte para renderTable() |
| `portfolioMode` | Flag para incluir/ocultar colunas de portfolio |
| `sleep(ms)` | Delay entre fetches de fundamentais |

---

## Componentes

### 1. Estado global — viewMode

- **O que**: variável `let viewMode = 'cards'` — `'cards'` | `'list'`
- **Onde**: inline no `<script>`, junto a `portfolioMode`
- **Reusa**: padrão existente de `portfolioMode` boolean

### 2. Estado global — fundamentalsCache (in-memory)

- **O que**: `let fundamentalsCache = {}` — espelho in-memory do localStorage para evitar parse repetido
- **Estrutura**: `{ [ticker]: { data: FundamentalsData, fetchedAt: number } }`
- **Onde**: inline no `<script>`

### 3. `loadFundamentalsCache()`

- **O que**: popula `fundamentalsCache` lendo todas as chaves `quedas_fund_*` do localStorage
- **Quando**: chamado em `init()`, igual a `loadPortfolioData()`

### 4. `fetchFundamentals(ticker)`

- **O que**: busca `quoteSummary` via `fetchJSON()`, extrai os campos mapeados, salva no cache in-memory e no localStorage
- **Retorna**: `FundamentalsData | null`
- **Delay**: nenhum interno — o chamador controla o sequenciamento

### 5. `getFundamentals(ticker)`

- **O que**: verifica cache in-memory → se válido retorna; se inválido ou ausente chama `fetchFundamentals()`
- **TTL**: 24h = `Date.now() - fetchedAt < 86_400_000`
- **Retorna**: `Promise<FundamentalsData | null>`

### 6. `renderTable(items)`

- **O que**: constrói e injeta `<table>` no `#list-container`; busca fundamentais para cada item ok com delay 300ms entre requests
- **Progressivo**: inicia a tabela com linhas em estado "carregando" para fundamentais, atualiza row por row à medida que chegam
- **Onde**: substitui o conteúdo de `#list-container` (div nova abaixo do `#grid`)

### 7. `tableRowHTML(item, fund)`

- **O que**: gera o `<tr>` de um item, mesclando dados de preço (`item`) e fundamentais (`fund`)
- **fund pode ser**: `null` (ainda carregando), `'error'` (falhou), ou `FundamentalsData`
- **Reusa**: `display()`, `fmt()`, `fmtPct()`, `dropStyle()`, `pnlColor()`, `computeMetrics()`

### 8. `setViewMode(mode)`

- **O que**: atualiza `viewMode`, mostra/oculta `#grid` e `#list-container`, atualiza botões de toggle
- **Quando**: chamado pelo botão de toggle e por `renderGrid()` / `renderTable()`

### 9. Botão de toggle Cards ↔ Lista

- **HTML**: dois botões na `.row` de controles: `<button id="viewCards">⊞ Cards</button>` e `<button id="viewList">≡ Lista</button>`
- **Estilo**: mesmo padrão dos `.period-btn` com classe `.active`

### 10. `#list-container`

- **O que**: `<div>` com `overflow-x: auto` que hospeda a `<table>`
- **Onde**: imediatamente após `#grid` no HTML, oculto por padrão (`display:none`)

### 11. Ordenação da tabela

- **Estado**: `let tableSort = { col: 'drop', dir: 'asc' }` — col = id da coluna, dir = 'asc' | 'desc'
- **Click no `<th>`**: atualiza `tableSort` e chama `renderTable(currentItems)` (rebusca do cache — sem nova rede)
- **Linhas com "—"**: sempre vão para o fim independente da direção

---

## Data Models

### FundamentalsData

```javascript
{
  pe:         number | null,   // P/L trailingPE
  pb:         number | null,   // P/VPA priceToBook
  dy:         number | null,   // DY (já em %, multiplicado por 100)
  roe:        number | null,   // ROE (já em %)
  evEbitda:   number | null,   // EV/EBITDA
  margin:     number | null,   // Margem Líquida (já em %)
  marketCap:  number | null,   // Market Cap raw
  eps:        number | null,   // LPA
  sector:     string | null,   // Setor
  payout:     number | null,   // Payout (já em %)
}
```

### Cache entry (localStorage)

```javascript
// chave: "quedas_fund_WEGE3.SA"
{
  data: FundamentalsData,
  fetchedAt: 1748476800000  // Date.now() no momento do fetch
}
```

---

## Layout da Tabela

```
┌──────────┬──────────────────┬───────────┬────────┬──────────┬────────┬──────┬───────┬──────┬──────────┬──────────┬─────────┬────────┐
│ Ticker   │ Nome             │ Preço     │ Dia    │ Topo     │ Mkt Cap│  P/L │ P/VPA │   DY │      ROE │ EV/EBITDA│ M.Líq. │ Setor  │
├──────────┼──────────────────┼───────────┼────────┼──────────┼────────┼──────┼───────┼──────┼──────────┼──────────┼─────────┼────────┤
│ WEGE3    │ WEG S.A.        │ R$35,20   │ +1,2%  │ -7,2%   │ R$230B │ 28,4 │  9,1  │ 2,1% │    27,3% │     18,2 │  14,2%  │ Indust.│
│ BBAS3    │ Banco do Brasil │ R$24,10   │ -0,4%  │ -18,5%  │ R$138B │  4,9 │  0,8  │ 9,1% │    21,8% │      —   │  32,1%  │ Financ.│
│ AAPL     │ Apple Inc.      │ $ 182,50  │ +0,8%  │ -12,3%  │ $2,8T  │ 29,1 │ 45,2  │ 0,6% │   160,1% │     22,4 │  25,3%  │ Tech   │
└──────────┴──────────────────┴───────────┴────────┴──────────┴────────┴──────┴───────┴──────┴──────────┴──────────┴─────────┴────────┘
```

- Primeira coluna (Ticker) com `position: sticky; left: 0` para scroll horizontal em mobile
- Cabeçalhos clicáveis com cursor pointer e indicador ▲/▼ na coluna ativa
- Linhas alternadas com fundo ligeiramente diferente para facilitar leitura
- Linha em estado "carregando fundamentos": células de fundamentais exibem `…`
- Linha com erro nos fundamentos: célula "Nome" exibe badge vermelho, fundamentais exibem `—`

---

## Coluna Market Cap — Formatação

```javascript
function fmtMarketCap(val, currency) {
  if (val == null) return '—';
  const prefix = currency === 'BRL' ? 'R$' : '$';
  if (val >= 1e12) return prefix + (val / 1e12).toFixed(1) + 'T';
  if (val >= 1e9)  return prefix + (val / 1e9).toFixed(1) + 'B';
  if (val >= 1e6)  return prefix + (val / 1e6).toFixed(0) + 'M';
  return prefix + val.toFixed(0);
}
```

---

## Coloração Condicional (P3)

| Coluna | Condição | Cor |
|---|---|---|
| DY | ≥ 8% | verde |
| DY | 4–8% | amarelo |
| P/L | ≤ 0 | vermelho |
| P/L | ≥ 40 | laranja |
| ROE | ≥ 15% | verde |
| ROE | ≤ 0 | vermelho |
| Margem Líq. | < 0 | vermelho |
| Var. Dia | qualquer | `pnlColor()` existente |
| Queda topo | qualquer | `dropStyle()` existente |
| P&L% | qualquer | `pnlColor()` existente |

---

## Error Handling Strategy

| Cenário | Handling | O que o usuário vê |
|---|---|---|
| quoteSummary retorna 404 / ticker inválido | `fundamentals = null`, linha marcada com flag `fundError: true` | Ticker e preços normais; fundamentais exibem "—" |
| Todos os 3 proxies falham para fundamentals | Idem acima | Idem |
| Campo individual ausente no JSON | `val ?? null` na extração | Célula exibe "—" |
| localStorage cheio (quota exceeded) | try/catch silencioso | Cache não salvo; próxima visita refaz fetch |
| Tabela aberta, usuário clica "Atualizar" | `load()` rebusca preços; fundamentais permanecem no cache | Status mostra carregando preços; fundamentais não piscam |

---

## Tech Decisions

| Decisão | Escolha | Rationale |
|---|---|---|
| Renderização da tabela | innerHTML string (igual aos cards) | Consistência com padrão existente; sem dependências |
| Progressividade | Row-by-row à medida que fundamentais chegam | UX melhor; usuário vê dados chegando em vez de tela em branco |
| Separação de fetch preços vs fundamentais | Independentes, caches separados | Preços atualizam a cada click; fundamentais ficam 24h |
| Ordenação | Client-side (sort no array antes de renderizar) | Sem backend; simples; eficiente para N < 100 |
| Scroll horizontal mobile | `overflow-x: auto` no container + sticky first col | Padrão CSS nativo, sem JS |
| Delay entre fetches de fundamentais | 300ms (igual ao de preços) | Evita rate-limit nos proxies públicos |
