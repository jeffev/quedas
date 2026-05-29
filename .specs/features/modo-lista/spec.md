# Modo Lista — Indicadores Fundamentalistas

## Problem Statement

O app hoje mostra apenas dados de preço (queda do topo, preço atual, pico). O investidor que quer comparar múltiplas ações simultaneamente com base em fundamentos (P/L, DY, ROE, etc.) precisa sair do app para consultar outra ferramenta. A proposta é adicionar um Modo Lista — uma tabela densa com indicadores fundamentalistas — que complementa o Modo Cards atual sem substituí-lo.

## Goals

- [ ] Exibir indicadores fundamentalistas das empresas na mesma lista de tickers já cadastrada
- [ ] Permitir ordenação por qualquer indicador (clicar no cabeçalho da coluna)
- [ ] Cachear os dados fundamentalistas por 24h no localStorage para evitar excesso de requisições
- [ ] Manter compatibilidade total com todas as features existentes (portfolio, share link, períodos)

## Out of Scope

| Feature | Razão |
|---|---|
| Séries históricas de indicadores | Complexidade de dados; Yahoo Finance não expõe séries de fundamentais facilmente |
| Gráficos por indicador | Fora do escopo da listagem tabular |
| Comparação setorial automatizada | Sem backend para calcular médias do setor |
| Dados de DRE / Balanço completo | Profundidade excessiva para uma SPA estática |
| Atualização automática em tempo real | Fundamentais mudam trimestralmente, 24h de cache é suficiente |

---

## User Stories

### P1: Alternar para Modo Lista ⭐ MVP

**User Story**: Como investidor, quero alternar entre a visão de cards e uma tabela com indicadores fundamentalistas, para comparar múltiplas ações em uma única tela sem rolar.

**Why P1**: É a entrega mínima — sem o toggle de modo, nada mais funciona.

**Acceptance Criteria**:

1. WHEN o usuário clica em "≡ Lista" THEN o sistema SHALL substituir o grid de cards por uma tabela HTML
2. WHEN o usuário clica novamente (ou em "⊞ Cards") THEN o sistema SHALL restaurar o grid de cards
3. WHEN o modo é trocado THEN o sistema SHALL manter os tickers, período e estado de portfolio intactos
4. WHEN não há dados carregados THEN o botão de Modo Lista SHALL estar visível mas a tabela SHALL estar vazia

**Independent Test**: Carregar tickers → clicar "≡ Lista" → tabela aparece com as mesmas ações → clicar "⊞ Cards" → grid volta.

---

### P1: Buscar e exibir indicadores fundamentalistas ⭐ MVP

**User Story**: Como investidor, quero ver P/L, P/VPA, DY, ROE, EV/EBITDA, Margem Líquida e Market Cap de cada ação na tabela.

**Why P1**: Sem dados fundamentalistas, o Modo Lista não tem propósito.

**Acceptance Criteria**:

1. WHEN o Modo Lista está ativo e tickers estão carregados THEN o sistema SHALL buscar dados via `quoteSummary` do Yahoo Finance usando os mesmos proxies existentes
2. WHEN os dados chegam THEN o sistema SHALL exibir na tabela: Ticker, Nome, Preço Atual, Var. Dia, Queda do Topo, Market Cap, P/L, P/VPA, DY, ROE, EV/EBITDA, Margem Líquida, Setor
3. WHEN um indicador não está disponível para o ticker THEN o sistema SHALL exibir "—" na célula correspondente
4. WHEN a busca de fundamentais falha THEN o sistema SHALL exibir "erro" na linha, com os dados de preço ainda visíveis (fetchStock já carregado)
5. WHEN os dados fundamentais de um ticker foram buscados há menos de 24h THEN o sistema SHALL usar o cache do localStorage sem nova requisição

**Independent Test**: Carregar WEGE3 → modo lista → linha exibe P/L, DY, ROE reais da WEG.

---

### P1: Cache de 24h dos fundamentais ⭐ MVP

**User Story**: Como usuário frequente, quero que os indicadores fundamentalistas não sejam rebuscados toda vez que eu atualizar os preços, pois fundamentais mudam lentamente.

**Why P1**: Sem cache, cada clique em "Atualizar" dispara N requisições adicionais ao proxy — que podem ser bloqueadas por rate limit.

**Acceptance Criteria**:

1. WHEN o sistema busca fundamentais com sucesso THEN SHALL armazenar em `localStorage` com chave `quedas_fund_{ticker}` e timestamp `fetchedAt`
2. WHEN o sistema precisa de fundamentais de um ticker THEN SHALL verificar o cache ANTES de fazer requisição
3. WHEN o cache existe e `fetchedAt` tem menos de 24h THEN SHALL usar cache sem requisição
4. WHEN o cache existe mas tem mais de 24h THEN SHALL buscar novamente e atualizar o cache
5. WHEN o usuário clica "✕ Limpar salvo" THEN SHALL apagar também o cache de fundamentais

**Independent Test**: Carregar tickers em modo lista → inspecionar localStorage → ver `quedas_fund_WEGE3.SA` com timestamp → recarregar → sem nova requisição para fundamentais.

---

### P2: Ordenação por coluna

**User Story**: Como investidor, quero clicar no cabeçalho de qualquer coluna para ordenar a tabela por aquele indicador.

**Why P2**: Aumenta muito a utilidade da tabela mas não é bloqueante para o MVP.

**Acceptance Criteria**:

1. WHEN o usuário clica em um cabeçalho de coluna THEN o sistema SHALL ordenar as linhas por aquele indicador (ascendente)
2. WHEN o usuário clica no mesmo cabeçalho de novo THEN o sistema SHALL inverter a ordenação (descendente)
3. WHEN a coluna ativa de ordenação é exibida THEN o sistema SHALL mostrar indicador visual (▲ ou ▼) no cabeçalho
4. WHEN linhas têm "—" no campo de ordenação THEN SHALL ir para o final independente da direção

**Independent Test**: Tabela com 5 ações → clicar "DY" → ordenadas por DY crescente → clicar de novo → ordenadas por DY decrescente.

---

### P2: Integração com Modo Portfolio na tabela

**User Story**: Como investidor no modo portfolio, quero que a tabela também mostre minhas colunas de P&L ao lado dos indicadores fundamentalistas.

**Why P2**: Importante para quem usa portfolio, mas o modo lista já tem valor independente.

**Acceptance Criteria**:

1. WHEN portfolio mode está ativo E modo lista está ativo THEN a tabela SHALL incluir colunas: Qtd, Preço Médio, Valor Investido, Valor Atual, P&L, P&L%
2. WHEN portfolio mode está inativo THEN essas colunas SHALL estar ausentes da tabela
3. WHEN uma linha não tem posição cadastrada THEN as colunas de portfolio SHALL exibir "—"

**Independent Test**: Ativar portfolio → adicionar posição em WEGE3 → ativar modo lista → tabela exibe P&L de WEGE3 mas "—" para BBAS3 sem posição.

---

### P3: Destaque visual por qualidade do indicador

**User Story**: Como investidor, quero que indicadores com valores notáveis (ex: DY acima de 8%, P/L muito alto) tenham coloração visual para chamar atenção.

**Why P3**: Nice-to-have; tabela já é útil sem isso.

**Acceptance Criteria**:

1. WHEN DY ≥ 8% THEN a célula SHALL ter texto verde
2. WHEN P/L ≤ 0 ou P/L ≥ 40 THEN a célula SHALL ter texto laranja/vermelho
3. WHEN ROE ≥ 15% THEN a célula SHALL ter texto verde
4. WHEN Margem Líquida < 0 THEN a célula SHALL ter texto vermelho

---

## Edge Cases

- WHEN o ticker é americano (sem .SA) THEN os valores de P/VPA e DY chegam como decimais (0.045 = 4.5%) e SHALL ser multiplicados por 100 para exibição
- WHEN o proxy retorna dados corrompidos THEN o sistema SHALL tratar o erro graciosamente e marcar a linha como "erro nos fundamentos"
- WHEN há mais de 15 tickers THEN o sistema SHALL buscar fundamentais sequencialmente com delay de 300ms entre requests (mesmo padrão dos preços)
- WHEN o usuário muda de período THEN os preços São rebuscados mas os fundamentais SHALL permanecer no cache (não dependem do período)
- WHEN a tabela é muito larga em mobile THEN SHALL ter scroll horizontal

---

## Requirement Traceability

| Req ID | Story | Status |
|---|---|---|
| ML-01 | P1: Toggle modo lista | Pending |
| ML-02 | P1: Buscar quoteSummary | Pending |
| ML-03 | P1: Exibir 13 colunas de indicadores | Pending |
| ML-04 | P1: Tratar indicador ausente com "—" | Pending |
| ML-05 | P1: Cache 24h no localStorage | Pending |
| ML-06 | P1: Limpar cache junto com "Limpar salvo" | Pending |
| ML-07 | P2: Ordenação por coluna com toggle asc/desc | Pending |
| ML-08 | P2: Indicador visual de coluna ativa | Pending |
| ML-09 | P2: Colunas de portfolio na tabela | Pending |
| ML-10 | P3: Coloração condicional por faixas | Pending |

## Success Criteria

- [ ] Investidor consegue comparar P/L e DY de 10 ações simultaneamente em uma tela sem scroll vertical
- [ ] Cache evita rebuscar fundamentais em atualizações de preço do mesmo dia
- [ ] Nenhum erro de proxy quebra o modo lista inteiro — falha é isolada por linha
