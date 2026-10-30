const DEFAULT_ALLOWED_ORIGINS = [
  'https://fadoco.github.io',
  'https://localhost',
  'capacitor://localhost',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]
const FEED_CACHE_TTL_SECONDS = 300

function getAllowedOrigins(env) {
  return (env.ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS.join(','))
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
}

function corsHeaders(origin, allowedOrigins) {
  const headers = new Headers({
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
    'X-Content-Type-Options': 'nosniff',
  })
  if (origin && allowedOrigins.includes(origin)) headers.set('Access-Control-Allow-Origin', origin)
  return headers
}

function jsonResponse(data, status, headers) {
  const responseHeaders = new Headers(headers)
  responseHeaders.set('Content-Type', 'application/json; charset=utf-8')
  return new Response(JSON.stringify(data), { status, headers: responseHeaders })
}

function withCors(response, headers) {
  const responseHeaders = new Headers(response.headers)
  headers.forEach((value, key) => responseHeaders.set(key, value))
  return new Response(response.body, { status: response.status, headers: responseHeaders })
}

export default {
  async fetch(request, env, context) {
    const requestUrl = new URL(request.url)
    const origin = request.headers.get('Origin')
    const allowedOrigins = getAllowedOrigins(env)
    const headers = corsHeaders(origin, allowedOrigins)

    if (origin && !allowedOrigins.includes(origin)) {
      return jsonResponse({ error: 'Origin is not allowed.' }, 403, new Headers({ 'Vary': 'Origin' }))
    }

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (request.method !== 'GET') {
      return jsonResponse({ error: 'Method not allowed.' }, 405, headers)
    }
    if (requestUrl.pathname === '/health') {
      return jsonResponse({ status: 'ok' }, 200, headers)
    }
    if (requestUrl.pathname !== '/news') {
      return jsonResponse({ error: 'Not found.' }, 404, headers)
    }

    const query = requestUrl.searchParams.get('q')?.trim()
    const containsControlCharacter = query && [...query].some((character) => {
      const code = character.charCodeAt(0)
      return code <= 0x1f || code === 0x7f
    })
    if (!query || query.length > 160 || containsControlCharacter) {
      return jsonResponse({ error: 'A news query between 1 and 160 characters is required.' }, 400, headers)
    }

    const clientIp = request.headers.get('CF-Connecting-IP')
    if (!clientIp) {
      console.error('Cloudflare did not provide a client IP for news rate limiting.')
      return jsonResponse({ error: 'Unable to verify request source.' }, 503, headers)
    }

    const { success } = await env.NEWS_RATE_LIMITER.limit({ key: clientIp })
    if (!success) {
      headers.set('Retry-After', '60')
      return jsonResponse({ error: 'Too many requests. Please retry in one minute.' }, 429, headers)
    }

    const requestedMarket = requestUrl.searchParams.get('mkt') || 'pt-BR'
    if (!['pt-BR', 'en-US'].includes(requestedMarket)) {
      return jsonResponse({ error: 'Unsupported news market.' }, 400, headers)
    }
    const market = requestedMarket
    const feedUrl = new URL('https://www.bing.com/news/search')
    feedUrl.searchParams.set('q', query)
    feedUrl.searchParams.set('format', 'rss')
    feedUrl.searchParams.set('mkt', market)

    const cacheKey = new Request(`${requestUrl.origin}/__feed-cache?${feedUrl.searchParams.toString()}`)
    const bypassCache = requestUrl.searchParams.get('refresh') === '1'

    try {
      const cached = bypassCache ? null : await caches.default.match(cacheKey)
      if (cached) return withCors(cached, headers)

      const upstream = await fetch(feedUrl, {
        headers: {
          Accept: 'application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5',
          'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
          'User-Agent': 'Mozilla/5.0 (compatible; HubPrincipalNews/1.0)',
        },
        signal: AbortSignal.timeout(10000),
      })
      if (!upstream.ok) {
        console.error('News RSS provider returned an unsuccessful status.', upstream.status, (await upstream.text()).slice(0, 200))
        return jsonResponse({ error: 'The news provider is temporarily unavailable.' }, 502, headers)
      }

      const feed = await upstream.text()
      if (!feed.includes('<rss') && !feed.includes('<feed')) {
        console.error('News RSS provider returned an unexpected feed response.')
        return jsonResponse({ error: 'The news provider returned an invalid feed.' }, 502, headers)
      }

      const feedResponse = new Response(feed, {
        headers: {
          'Cache-Control': `public, max-age=${FEED_CACHE_TTL_SECONDS}`,
          'Content-Type': 'application/rss+xml; charset=utf-8',
          'X-Content-Type-Options': 'nosniff',
        },
      })
      context.waitUntil(caches.default.put(cacheKey, feedResponse.clone()))
      return withCors(feedResponse, headers)
    } catch (error) {
      console.error('Unable to retrieve news RSS.', error)
      return jsonResponse({ error: 'The news provider could not be reached.' }, 502, headers)
    }
  },
}
