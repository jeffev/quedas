// Cloudflare Worker — proxy com cache de borda para o Yahoo Finance.
// Substitui os proxies CORS públicos usados por quedas-do-topo.
//
// Rotas:
//   GET /chart/:ticker?range=1y        -> query1.finance.yahoo.com/v8/finance/chart/:ticker
//   GET /fundamentals/:ticker          -> query1.finance.yahoo.com/v10/finance/quoteSummary/:ticker

const YAHOO_CHART        = 'https://query1.finance.yahoo.com/v8/finance/chart/';
const YAHOO_QUOTESUMMARY = 'https://query1.finance.yahoo.com/v10/finance/quoteSummary/';
const FUNDAMENTALS_MODULES = 'summaryDetail,defaultKeyStatistics,financialData,assetProfile';

const CACHE_TTL_CHART = 60;      // segundos — cotações mudam rápido
const CACHE_TTL_FUND  = 21600;   // 6h — fundamentals mudam pouco

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

async function proxyWithCache(request, targetUrl, ttl, ctx) {
  const cache = caches.default;
  const cacheKey = new Request(targetUrl, request);

  const hit = await cache.match(cacheKey);
  if (hit) {
    const r = new Response(hit.body, hit);
    r.headers.set('X-Cache', 'HIT');
    Object.entries(corsHeaders()).forEach(([k, v]) => r.headers.set(k, v));
    return r;
  }

  const upstream = await fetch(targetUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; QuedasDoTopoBot/1.0)' },
  });

  if (!upstream.ok) {
    return new Response(
      JSON.stringify({ error: 'upstream_error', status: upstream.status }),
      { status: upstream.status, headers: { 'Content-Type': 'application/json', ...corsHeaders() } },
    );
  }

  const body = await upstream.text();
  const response = new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${ttl}`,
      'X-Cache': 'MISS',
      ...corsHeaders(),
    },
  });

  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

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
      const target = `${YAHOO_CHART}${encodeURIComponent(ticker)}?range=${encodeURIComponent(range)}&interval=1d`;
      return proxyWithCache(request, target, CACHE_TTL_CHART, ctx);
    }

    if (parts[0] === 'fundamentals' && parts[1]) {
      const ticker = decodeURIComponent(parts[1]);
      const target = `${YAHOO_QUOTESUMMARY}${encodeURIComponent(ticker)}?modules=${FUNDAMENTALS_MODULES}`;
      return proxyWithCache(request, target, CACHE_TTL_FUND, ctx);
    }

    return new Response('Not found', { status: 404, headers: corsHeaders() });
  },
};
