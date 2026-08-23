// Cloudflare Worker — proxy com cache de borda para dados de ações.
// Substitui os proxies CORS públicos usados por quedas-do-topo.
//
// Rotas:
//   GET /chart/:ticker?range=1y   -> query1.finance.yahoo.com/v8/finance/chart/:ticker (preço/histórico)
//   GET /fundamentals/:ticker     -> Fundamentus (tickers .SA) ou Alpha Vantage OVERVIEW (demais)
//
// Requer a secret ALPHA_VANTAGE_KEY configurada em Settings > Variables and Secrets
// (Cloudflare dashboard). Sem ela, /fundamentals falha silenciosamente para tickers
// não-.SA — o app já trata fundamentals ausentes com um fallback nulo.

const YAHOO_CHART      = 'https://query1.finance.yahoo.com/v8/finance/chart/';
const FUNDAMENTUS_BASE = 'https://www.fundamentus.com.br/detalhes.php?papel=';
const ALPHA_VANTAGE    = 'https://www.alphavantage.co/query';

const CACHE_TTL_CHART = 60;      // segundos — cotações mudam rápido
const CACHE_TTL_FUND  = 21600;   // 6h — fundamentals mudam pouco (e mantém uso da API grátis baixo)

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function jsonResponse(body, status, ttl, cacheStatus) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${ttl}`,
      'X-Cache': cacheStatus,
      ...corsHeaders(),
    },
  });
}

// ── /chart — passthrough simples com cache ──────────────────────────────────

async function proxyChart(request, ticker, range, ctx) {
  const target = `${YAHOO_CHART}${encodeURIComponent(ticker)}?range=${encodeURIComponent(range)}&interval=1d`;
  const cache = caches.default;
  const cacheKey = new Request(target, request);

  const hit = await cache.match(cacheKey);
  if (hit) {
    const r = new Response(hit.body, hit);
    r.headers.set('X-Cache', 'HIT');
    Object.entries(corsHeaders()).forEach(([k, v]) => r.headers.set(k, v));
    return r;
  }

  const upstream = await fetch(target, { headers: { 'User-Agent': BROWSER_UA } });
  if (!upstream.ok) {
    return jsonResponse({ error: 'upstream_error', status: upstream.status }, upstream.status, 0, 'MISS');
  }

  const body = await upstream.text();
  const response = new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${CACHE_TTL_CHART}`,
      'X-Cache': 'MISS',
      ...corsHeaders(),
    },
  });
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

// ── fundamentals: normaliza pra um shape único ──────────────────────────────
// { pe, pb, dy, roe, evEbitda, margin, marketCap, eps, sector, payout }
// dy / roe / margin já em forma percentual (ex: 5.2 = 5.2%).

function toNumberBR(raw) {
  if (!raw) return null;
  const n = parseFloat(raw.replace(/\./g, '').replace(',', '.').replace('%', '').trim());
  return Number.isFinite(n) ? n : null;
}

function grabFundamentusValue(html, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `class="txt">\\s*${escaped}\\s*</span></td>\\s*<td class="data[^"]*"><span class="txt">\\s*([^<]*?)\\s*</span>`,
  );
  const m = html.match(re);
  return m ? m[1].trim() : null;
}

async function fetchFundamentus(tickerNoSuffix) {
  const upstream = await fetch(FUNDAMENTUS_BASE + encodeURIComponent(tickerNoSuffix), {
    headers: { 'User-Agent': BROWSER_UA },
  });
  if (!upstream.ok) return null;

  const buf  = await upstream.arrayBuffer();
  const html = new TextDecoder('iso-8859-1').decode(buf);

  if (!html.includes('class="txt">P/L</span>')) return null; // ticker não encontrado

  const sectorMatch = html.match(
    /class="txt">Setor<\/span><\/td>\s*<td class="data"><span class="txt"><a[^>]*>([^<]*)<\/a>/,
  );

  return {
    pe:        toNumberBR(grabFundamentusValue(html, 'P/L')),
    pb:        toNumberBR(grabFundamentusValue(html, 'P/VP')),
    dy:        toNumberBR(grabFundamentusValue(html, 'Div. Yield')),
    roe:       toNumberBR(grabFundamentusValue(html, 'ROE')),
    evEbitda:  toNumberBR(grabFundamentusValue(html, 'EV / EBITDA')),
    margin:    toNumberBR(grabFundamentusValue(html, 'Marg. Líquida')),
    marketCap: toNumberBR(grabFundamentusValue(html, 'Valor de mercado')),
    eps:       toNumberBR(grabFundamentusValue(html, 'LPA')),
    sector:    sectorMatch ? sectorMatch[1].trim() : null,
    payout:    null,
  };
}

function avNum(raw) {
  if (raw == null || raw === 'None' || raw === '-' || raw === '') return null;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

async function fetchAlphaVantage(ticker, apiKey) {
  if (!apiKey) return null;
  const url = `${ALPHA_VANTAGE}?function=OVERVIEW&symbol=${encodeURIComponent(ticker)}&apikey=${apiKey}`;
  const upstream = await fetch(url);
  if (!upstream.ok) return null;

  const data = await upstream.json();
  if (!data || !data.Symbol) return null; // Alpha Vantage devolve {} ou {Note:...} em erro/limite

  const pct = (v) => { const n = avNum(v); return n != null ? n * 100 : null; };

  return {
    pe:        avNum(data.PERatio),
    pb:        avNum(data.PriceToBookRatio),
    dy:        pct(data.DividendYield),
    roe:       pct(data.ReturnOnEquityTTM),
    evEbitda:  avNum(data.EVToEBITDA),
    margin:    pct(data.ProfitMargin),
    marketCap: avNum(data.MarketCapitalization),
    eps:       avNum(data.EPS),
    sector:    data.Sector || null,
    payout:    avNum(data.PayoutRatio) != null ? avNum(data.PayoutRatio) * 100 : null,
  };
}

async function handleFundamentals(request, ticker, env, ctx) {
  const cache = caches.default;
  const cacheKey = new Request(request.url, request);

  const hit = await cache.match(cacheKey);
  if (hit) {
    const r = new Response(hit.body, hit);
    r.headers.set('X-Cache', 'HIT');
    Object.entries(corsHeaders()).forEach(([k, v]) => r.headers.set(k, v));
    return r;
  }

  const isBR  = ticker.endsWith('.SA');
  const fund  = isBR
    ? await fetchFundamentus(ticker.replace(/\.SA$/, ''))
    : await fetchAlphaVantage(ticker, env.ALPHA_VANTAGE_KEY);

  if (!fund) {
    return jsonResponse({ ok: false }, 200, 0, 'MISS'); // não cacheia falha — tenta de novo na próxima
  }

  const response = jsonResponse({ ok: true, fund }, 200, CACHE_TTL_FUND, 'MISS');
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

// ── router ───────────────────────────────────────────────────────────────

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    const parts = url.pathname.split('/').filter(Boolean);

    if (parts[0] === 'chart' && parts[1]) {
      const ticker = decodeURIComponent(parts[1]);
      const range  = url.searchParams.get('range') || '1y';
      return proxyChart(request, ticker, range, ctx);
    }

    if (parts[0] === 'fundamentals' && parts[1]) {
      const ticker = decodeURIComponent(parts[1]);
      return handleFundamentals(request, ticker, env, ctx);
    }

    return new Response('Not found', { status: 404, headers: corsHeaders() });
  },
};
