# Modo Lista — Tasks

**Design**: `.specs/features/modo-lista/design.md`
**Status**: Draft

---

## Execution Plan

```
Phase 1 — Fundação (sequencial)
  T1 → T2 → T3

Phase 2 — Core (paralelo após T3)
  T3 complete:
    ├── T4 [P]   fetchFundamentals + getFundamentals
    └── T5 [P]   fmtMarketCap + extração de campos

Phase 3 — Renderização (sequencial após T4 e T5)
  T4 + T5 complete → T6 → T7

Phase 4 — Interatividade e integração (paralelo após T7)
  T7 complete:
    ├── T8 [P]   ordenação por coluna
    └── T9 [P]   colunas de portfolio na tabela

Phase 5 — Finalização (sequencial)
  T8 + T9 complete → T10 → T11
```

---

## Task Breakdown

### T1: Adicionar estado `viewMode` e botões de toggle Cards/Lista

**What**: Adicionar variável `viewMode = 'cards'`, dois botões (`⊞ Cards` / `≡ Lista`) na barra de controles e a função `setViewMode(mode)` que mostra/oculta `#grid` e `#list-container`.
**Where**: `index.html` — seção HTML dos botões + bloco `<script>`
**Depends on**: nenhuma
**Reuses**: padrão de `#portfolioToggle` para estilo e comportamento
**Requirement**: ML-01

**Done when**:
- [ ] Botões `⊞ Cards` e `≡ Lista` aparecem na barra, com destaque no ativo
- [ ] Clicar `≡ Lista` oculta `#grid` e exibe `#list-container` (ainda vazio)
- [ ] Clicar `⊞ Cards` restaura `#grid` e oculta `#list-container`
- [ ] `viewMode` reflete o estado atual corretamente
- [ ] Estado de portfolio, período e tickers não são afetados pela troca

**Verify**: Abrir app → clicar "≡ Lista" → grid desaparece → clicar "⊞ Cards" → grid volta.

---

### T2: Adicionar `#list-container` no HTML e CSS base da tabela

**What**: Inserir `<div id="list-container">` com `overflow-x: auto` no HTML, e escrever os estilos CSS da tabela (`.list-table`, `.list-th`, `.list-td`, `sticky first col`, linhas alternadas, hover, estado loading, estado error).
**Where**: `index.html` — HTML após `#grid` + bloco `<style>`
**Depends on**: T1 (saber onde inserir e quais classes o JS vai usar)
**Reuses**: variáveis CSS existentes (--card, --border, --text, --muted, --accent)
**Requirement**: ML-01

**Done when**:
- [ ] `#list-container` existe no DOM, oculto por padrão (`display:none`)
- [ ] CSS define `.list-table` com `border-collapse: collapse`, largura mínima, font-size legível
- [ ] Primeira coluna tem `position: sticky; left: 0; background: var(--card)` para scroll mobile
- [ ] Cabeçalhos têm `cursor: pointer` e estilo distinto do body
- [ ] Linhas ímpares com fundo ligeiramente diferente para zebra
- [ ] Célula com classe `.loading-cell` exibe `…` com opacidade reduzida
- [ ] Em mobile (< 600px) a tabela rola horizontalmente sem quebrar o layout

**Verify**: Inspecionar CSS no DevTools → first column sticky visível ao scrollar horizontalmente.

---

### T3: Implementar `loadFundamentalsCache()` e estrutura do cache

**What**: Função que lê todas as chaves `quedas_fund_*` do localStorage e popula o objeto in-memory `fundamentalsCache = {}`. Chamada em `init()`.
**Where**: `index.html` — bloco `<script>`, junto a `loadPortfolioData()`
**Depends on**: nenhuma (independente de T1/T2)
**Reuses**: padrão de `loadPortfolioData()`
**Requirement**: ML-05

**Done when**:
- [ ] `fundamentalsCache` é um objeto global inicializado como `{}`
- [ ] `loadFundamentalsCache()` itera `localStorage` e carrega entradas `quedas_fund_*`
- [ ] Entradas corrompidas são ignoradas silenciosamente (try/catch por entrada)
- [ ] `init()` chama `loadFundamentalsCache()` antes de qualquer fetch
- [ ] `clearBtn` apaga chaves `quedas_fund_*` do localStorage e limpa `fundamentalsCache`

**Verify**: Adicionar entrada manual no localStorage com `quedas_fund_TEST` → recarregar → `fundamentalsCache['TEST']` disponível no console.

---

### T4: Implementar `fetchFundamentals(ticker)` e `getFundamentals(ticker)` [P]

**What**: `fetchFundamentals` chama `fetchJSON()` com o endpoint `quoteSummary`, extrai os campos do `FundamentalsData`, salva no cache in-memory e no localStorage. `getFundamentals` verifica TTL de 24h e decide entre cache ou fetch.
**Where**: `index.html` — bloco `<script>`
**Depends on**: T3 (cache structure), `fetchJSON()` existente
**Reuses**: `fetchJSON()` com os 3 proxies existentes; padrão de extração de `fetchStock()`
**Requirement**: ML-02, ML-05

**Done when**:
- [ ] `fetchFundamentals('WEGE3.SA')` retorna objeto com `pe`, `pb`, `dy`, `roe`, `evEbitda`, `margin`, `marketCap`, `eps`, `sector`, `payout`
- [ ] Campos ausentes no JSON retornam `null` (sem exceção)
- [ ] DY, ROE, margin, payout são multiplicados por 100 antes de salvar
- [ ] Resultado é salvo em `localStorage` com chave `quedas_fund_{ticker}` e `fetchedAt: Date.now()`
- [ ] `getFundamentals('WEGE3.SA')` chamado 2x: segunda chamada usa cache sem nova requisição de rede
- [ ] Cache com mais de 24h dispara novo fetch e atualiza entry

**Verify**: `await getFundamentals('WEGE3.SA')` no console → retorna dados → verificar `localStorage.getItem('quedas_fund_WEGE3.SA')` → chamar novamente → sem nova requisição de rede (ver Network tab).

---

### T5: Implementar `fmtMarketCap(val, currency)` e helpers de formatação [P]

**What**: Função que formata Market Cap com sufixo T/B/M. Também definir `fundColor(col, val)` — retorna string de cor CSS baseada nas faixas de cada indicador (P3, mas implementar junto pois é trivial).
**Where**: `index.html` — bloco `<script>`, seção de utils
**Depends on**: T3 (pode ser feito em paralelo com T4)
**Reuses**: variáveis CSS --green, --yellow, --orange, --red
**Requirement**: ML-03, ML-10

**Done when**:
- [ ] `fmtMarketCap(230e9, 'BRL')` → `'R$ 230,0B'`
- [ ] `fmtMarketCap(2.8e12, 'USD')` → `'$ 2,8T'`
- [ ] `fmtMarketCap(null, 'BRL')` → `'—'`
- [ ] `fundColor('dy', 9.5)` → `'#22c55e'` (verde, DY ≥ 8%)
- [ ] `fundColor('pe', -2)` → `'#ef4444'` (vermelho, P/L negativo)
- [ ] `fundColor('pe', 15)` → cor neutra (sem destaque)
- [ ] `fundColor('roe', 20)` → `'#22c55e'` (ROE ≥ 15%)

**Verify**: Testar as funções no console com os casos acima.

---

### T6: Implementar `tableRowHTML(item, fund, isLoading)`

**What**: Função que retorna string HTML de um `<tr>` completo. Suporta 3 estados: `isLoading=true` (células fundamentais mostram `…`), `fund=null` (erro, mostram `—`), `fund=FundamentalsData` (valores reais). Inclui coloração via `fundColor()`.
**Where**: `index.html` — bloco `<script>`
**Depends on**: T4, T5
**Reuses**: `display()`, `fmt()`, `fmtPct()`, `fmtMarketCap()`, `fundColor()`, `dropStyle()`, `pnlColor()`
**Requirement**: ML-03, ML-04, ML-10

**Done when**:
- [ ] Row com `isLoading=true` exibe ticker e dados de preço normais; células de fundamentais têm classe `loading-cell` com `…`
- [ ] Row com `fund=null` exibe ticker, preço; fundamentais todos `—`
- [ ] Row com dados completos exibe todos os 13 campos corretamente formatados
- [ ] DY, ROE, Margem, Payout exibidos com `%` e cor correta via `fundColor()`
- [ ] P/L e P/VPA exibidos com 1 casa decimal e cor correta
- [ ] Market Cap formatado com `fmtMarketCap()`
- [ ] Setor truncado com `max-width` e `text-overflow: ellipsis` se longo

**Verify**: Chamar `tableRowHTML(itemWEGE3, fundWEGE3Mock, false)` → inspecionar HTML gerado no console.

---

### T7: Implementar `renderTable(items)` com busca progressiva de fundamentais

**What**: Função que (1) monta a tabela com cabeçalhos, (2) renderiza todas as linhas em estado "loading", (3) busca fundamentais para cada item ok sequencialmente com delay de 300ms, (4) atualiza cada linha no DOM à medida que os dados chegam.
**Where**: `index.html` — bloco `<script>`
**Depends on**: T6, T1 (`#list-container`), T2 (CSS da tabela)
**Reuses**: `sleep(350)`, `currentItems`, `portfolioMode`, `sortItems()` para ordenação inicial
**Requirement**: ML-02, ML-03

**Done when**:
- [ ] Ativar modo lista com tickers carregados → tabela aparece imediatamente com linhas de preço e `…` nos fundamentais
- [ ] Fundamentais chegam linha por linha (não tudo de uma vez)
- [ ] Linhas com `item.error` (preço não carregado) são renderizadas com badge de erro, sem tentar buscar fundamentais
- [ ] Linhas com `item.loading` não aparecem na tabela (só aparecem após preço carregado)
- [ ] `renderTable()` é chamada por `setViewMode('list')` e também por `renderGrid()` quando `viewMode === 'list'`
- [ ] Cache hit (fundamentais < 24h) renderiza sem delay perceptível

**Verify**: Abrir modo lista → ver `…` → ver dados chegando progressivamente por linha.

---

### T8: Implementar ordenação por coluna com toggle asc/desc [P]

**What**: Adicionar estado `tableSort = { col: 'drop', dir: 'asc' }`, lógica de click nos `<th>`, função `sortTableItems(items, col, dir)` e indicadores visuais ▲/▼ no cabeçalho ativo.
**Where**: `index.html` — bloco `<script>` e `tableRowHTML` / `renderTable`
**Depends on**: T7
**Reuses**: `renderTable(currentItems)` para re-renderizar após sort change
**Requirement**: ML-07, ML-08

**Done when**:
- [ ] Clicar em cabeçalho "DY" ordena linhas por DY crescente; clicar de novo inverte para decrescente
- [ ] Cabeçalho ativo exibe ▲ (asc) ou ▼ (desc)
- [ ] Linhas com `—` no campo de sort sempre ficam por último
- [ ] Sort de preço (Topo, Dia, Preço Atual) funciona mesmo sem fundamentais carregados
- [ ] Re-sort usa dados em cache (sem novo fetch de rede)

**Verify**: Tabela com 5 ações → clicar "P/L" → verificar ordem numérica → clicar de novo → ordem invertida.

---

### T9: Adicionar colunas de portfolio na tabela quando `portfolioMode` ativo [P]

**What**: Quando `portfolioMode === true`, inserir colunas extras após "Setor": Qtd, Preço Médio, Investido, Atual, P&L, P&L%. Linhas sem posição exibem `—` nessas colunas.
**Where**: `index.html` — `tableRowHTML()` e `renderTable()` (cabeçalhos)
**Depends on**: T7, `computeMetrics()` e `getPosition()` existentes
**Reuses**: `computeMetrics()`, `fmt()`, `fmtPct()`, `pnlColor()`
**Requirement**: ML-09

**Done when**:
- [ ] Com `portfolioMode = false`: tabela NÃO exibe colunas de portfolio
- [ ] Com `portfolioMode = true`: tabela exibe 6 colunas extras após "Setor"
- [ ] Linha WEGE3 com posição cadastrada: exibe P&L calculado corretamente
- [ ] Linha BBAS3 sem posição: todas as 6 colunas exibem `—`
- [ ] Trocar `portfolioMode` enquanto tabela está aberta → `renderTable()` é chamada e colunas somem/aparecem

**Verify**: Modo lista + portfolio ativo + posição em WEGE3 → ver P&L na linha de WEGE3, "—" nas demais.

---

### T10: Integrar `renderTable` no ciclo de vida do `load()` e do `clearBtn`

**What**: Garantir que `load()` chame `renderTable(items)` quando `viewMode === 'list'`, que `clearBtn` limpe as chaves `quedas_fund_*` do localStorage e `fundamentalsCache`, e que trocar de período rebusque preços mas mantenha fundamentais em cache.
**Where**: `index.html` — funções `load()`, `renderGrid()`, `clearBtn` listener
**Depends on**: T7, T3
**Reuses**: `renderGrid()` existente como referência de padrão
**Requirement**: ML-01, ML-06

**Done when**:
- [ ] Modo lista ativo → clicar "Atualizar" → preços são rebuscados → tabela re-renderiza com novos preços + fundamentais do cache
- [ ] Clicar "✕ Limpar salvo" → localStorage perde `quedas_fund_*` → `fundamentalsCache = {}` é zerado
- [ ] Trocar período → `load()` dispara, fundamentais permanecem em cache (sem novo fetch)
- [ ] Trocar de cards para lista enquanto `load()` está em progresso → tabela abre com dados parciais (mesmo comportamento do grid)

**Verify**: Abrir modo lista → inspecionar Network → clicar "Atualizar" → sem novas requisições para `quoteSummary`.

---

### T11: Testes de regressão e ajustes finais de UI

**What**: Verificar manualmente que todas as features existentes continuam funcionando com o Modo Lista adicionado. Ajustar quaisquer problemas de layout, z-index ou estado.
**Where**: `index.html` — revisão geral
**Depends on**: T8, T9, T10
**Requirement**: todos

**Done when**:
- [ ] Share link com `?t=` abre e carrega tickers normalmente em ambos os modos
- [ ] Share link com `?p=` (portfolio) restaura posições e abre em modo portfolio
- [ ] Modo portfolio + modo lista simultâneos funcionam (colunas extras visíveis)
- [ ] Em mobile (< 600px) a tabela tem scroll horizontal e primeira coluna fica visível
- [ ] Animação de loading (pulse) NÃO aparece na tabela (somente nos cards)
- [ ] Export CSV exporta dados da lista atual incluindo fundamentais se disponíveis

**Verify**: Testar os 5 cenários acima manualmente no browser.

---

## Parallel Execution Map

```
Phase 1 (Sequential):
  T1 ──→ T2 ──→ T3

Phase 2 (Parallel — após T3):
  T3 complete:
    ├── T4 [P]  (fetchFundamentals + getFundamentals)
    └── T5 [P]  (fmtMarketCap + fundColor)

Phase 3 (Sequential — após T4 e T5):
  T4 + T5 ──→ T6 ──→ T7

Phase 4 (Parallel — após T7):
  T7 complete:
    ├── T8 [P]  (ordenação)
    └── T9 [P]  (colunas portfolio)

Phase 5 (Sequential — finalização):
  T8 + T9 ──→ T10 ──→ T11
```

---

## Granularity Check

| Task | Escopo | Status |
|---|---|---|
| T1: estado viewMode + botões toggle | 1 variável + 2 botões + 1 função | ✅ |
| T2: HTML container + CSS tabela | 1 div + bloco CSS | ✅ |
| T3: loadFundamentalsCache + cache struct | 1 função + estrutura de dados | ✅ |
| T4: fetchFundamentals + getFundamentals | 2 funções coesas (mesma responsabilidade) | ✅ |
| T5: fmtMarketCap + fundColor | 2 helpers triviais (1 arquivo, 1 contexto) | ✅ |
| T6: tableRowHTML | 1 função de renderização | ✅ |
| T7: renderTable progressivo | 1 função orquestradora | ✅ |
| T8: ordenação colunas | 1 estado + 1 função sort + click handler | ✅ |
| T9: colunas portfolio na tabela | modificação em tableRowHTML + cabeçalhos | ✅ |
| T10: integração load() + clearBtn | ajustes em funções existentes | ✅ |
| T11: testes de regressão | verificação manual | ✅ |

---

## Requirement Coverage

| Req ID | Task(s) | Status |
|---|---|---|
| ML-01 | T1, T2, T10 | Pending |
| ML-02 | T4, T7 | Pending |
| ML-03 | T5, T6, T7 | Pending |
| ML-04 | T6 | Pending |
| ML-05 | T3, T4 | Pending |
| ML-06 | T3, T10 | Pending |
| ML-07 | T8 | Pending |
| ML-08 | T8 | Pending |
| ML-09 | T9 | Pending |
| ML-10 | T5, T6 | Pending |

**Coverage**: 10/10 requisitos mapeados ✅
