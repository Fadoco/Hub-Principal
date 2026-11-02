const DEFAULT_ALLOWED_ORIGINS = [
  'https://fadoco.github.io',
  'https://localhost',
  'capacitor://localhost',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]
const FEED_CACHE_TTL_SECONDS = 300
const STATION_WEATHER_CACHE_TTL_SECONDS = 900
const STATION_LIST_CACHE_TTL_SECONDS = 86400
const FORECAST_CACHE_TTL_SECONDS = 300
const MAX_STATION_DISTANCE_KM = 100
const MAX_OBSERVATION_AGE_MS = 2 * 60 * 60 * 1000
const OPEN_METEO_FORECAST_FIELDS = {
  current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,weather_code,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m,visibility,cloud_cover,uv_index',
  hourly: 'temperature_2m,precipitation,precipitation_probability,weather_code',
  daily: 'weather_code,precipitation_probability_max,temperature_2m_max,temperature_2m_min,sunrise,sunset',
}

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

function getDistanceKm(latitude1, longitude1, latitude2, longitude2) {
  const radians = (degrees) => degrees * Math.PI / 180
  const latitudeDifference = radians(latitude2 - latitude1)
  const longitudeDifference = radians(longitude2 - longitude1)
  const haversine = Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(radians(latitude1)) * Math.cos(radians(latitude2)) *
    Math.sin(longitudeDifference / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
}

function getUtcObservationHours(now) {
  const currentHour = new Date(now)
  currentHour.setUTCMinutes(0, 0, 0)
  return Array.from({ length: 3 }, (_, index) => {
    const date = new Date(currentHour.getTime() - index * 60 * 60 * 1000)
    return {
      date: date.toISOString().slice(0, 10),
      hour: `${String(date.getUTCHours()).padStart(2, '0')}00`,
      timestamp: date.getTime(),
    }
  })
}

function parseTemperature(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string' || value.trim() === '') return null
  const parsed = Number(value.replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
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
    if (requestUrl.pathname === '/forecast') {
      const latitudeValue = requestUrl.searchParams.get('latitude')
      const longitudeValue = requestUrl.searchParams.get('longitude')
      const latitude = Number(latitudeValue)
      const longitude = Number(longitudeValue)
      if (!latitudeValue || !longitudeValue ||
          !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
          !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
        return jsonResponse({ error: 'Valid latitude and longitude coordinates are required.' }, 400, headers)
      }

      const latitudeKey = latitude.toFixed(3)
      const longitudeKey = longitude.toFixed(3)
      const responseCacheKey = new Request(`${requestUrl.origin}/__forecast?latitude=${latitudeKey}&longitude=${longitudeKey}`)
      const cachedForecast = await caches.default.match(responseCacheKey)
      if (cachedForecast) return withCors(cachedForecast, headers)

      const clientIp = request.headers.get('CF-Connecting-IP')
      if (!clientIp) {
        console.error('Cloudflare did not provide a client IP for forecast rate limiting.')
        return jsonResponse({ error: 'Unable to verify request source.' }, 503, headers)
      }
      const { success } = await env.NEWS_RATE_LIMITER.limit({ key: clientIp })
      if (!success) {
        headers.set('Retry-After', '60')
        return jsonResponse({ error: 'Too many requests. Please retry in one minute.' }, 429, headers)
      }

      try {
        const upstreamUrl = new URL('https://api.open-meteo.com/v1/forecast')
        upstreamUrl.search = new URLSearchParams({
          latitude: latitude.toFixed(4),
          longitude: longitude.toFixed(4),
          timezone: 'auto',
          forecast_days: '6',
          ...OPEN_METEO_FORECAST_FIELDS,
        }).toString()
        const upstream = await fetch(upstreamUrl, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(10000),
        })
        if (!upstream.ok) {
          console.error('Open-Meteo forecast returned an unsuccessful status.', upstream.status)
          return jsonResponse({ error: 'Weather forecast is temporarily unavailable.' }, 502, headers)
        }

        const forecast = await upstream.json()
        if (!forecast || typeof forecast !== 'object' ||
            !forecast.current || !forecast.hourly || !forecast.daily) {
          console.error('Open-Meteo forecast returned an unexpected response.')
          return jsonResponse({ error: 'Weather forecast is temporarily unavailable.' }, 502, headers)
        }
        const forecastResponse = jsonResponse(forecast, 200, new Headers({
          'Cache-Control': `public, max-age=${FORECAST_CACHE_TTL_SECONDS}`,
        }))
        context.waitUntil(caches.default.put(responseCacheKey, forecastResponse.clone()))
        return withCors(forecastResponse, headers)
      } catch (error) {
        console.error('Unable to retrieve the Open-Meteo forecast through the fallback.', error)
        return jsonResponse({ error: 'Weather forecast is temporarily unavailable.' }, 502, headers)
      }
    }
    if (requestUrl.pathname === '/weather') {
      const latitudeValue = requestUrl.searchParams.get('latitude')
      const longitudeValue = requestUrl.searchParams.get('longitude')
      const latitude = Number(latitudeValue)
      const longitude = Number(longitudeValue)
      if (!latitudeValue || !longitudeValue ||
          !Number.isFinite(latitude) || latitude < -34 || latitude > 6 ||
          !Number.isFinite(longitude) || longitude < -75 || longitude > -32) {
        return jsonResponse({ error: 'Coordinates must identify a location in Brazil.' }, 400, headers)
      }
      if (!env.INMET_TOKEN) {
        return jsonResponse({ error: 'INMET station access is not configured.' }, 503, headers)
      }

      const latitudeKey = latitude.toFixed(2)
      const longitudeKey = longitude.toFixed(2)
      const responseCacheKey = new Request(`${requestUrl.origin}/__station-weather?latitude=${latitudeKey}&longitude=${longitudeKey}`)
      const cachedWeather = await caches.default.match(responseCacheKey)
      if (cachedWeather) return withCors(cachedWeather, headers)

      const clientIp = request.headers.get('CF-Connecting-IP')
      if (!clientIp) {
        console.error('Cloudflare did not provide a client IP for station weather rate limiting.')
        return jsonResponse({ error: 'Unable to verify request source.' }, 503, headers)
      }
      const { success } = await env.NEWS_RATE_LIMITER.limit({ key: clientIp })
      if (!success) {
        headers.set('Retry-After', '60')
        return jsonResponse({ error: 'Too many requests. Please retry in one minute.' }, 429, headers)
      }

      try {
        const stationListKey = new Request(`${requestUrl.origin}/__inmet-stations`)
        let stationResponse = await caches.default.match(stationListKey)
        if (!stationResponse) {
          const upstreamStations = await fetch('https://apitempo.inmet.gov.br/estacoes/T', {
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(10000),
          })
          if (!upstreamStations.ok) {
            console.error('INMET station catalog returned an unsuccessful status.', upstreamStations.status)
            return jsonResponse({ error: 'INMET station data is temporarily unavailable.' }, 502, headers)
          }
          stationResponse = new Response(await upstreamStations.text(), {
            headers: { 'Cache-Control': `public, max-age=${STATION_LIST_CACHE_TTL_SECONDS}` },
          })
          context.waitUntil(caches.default.put(stationListKey, stationResponse.clone()))
        }

        const stations = await stationResponse.json()
        if (!Array.isArray(stations)) {
          console.error('INMET station catalog returned an unexpected response.')
          return jsonResponse({ error: 'INMET station data is temporarily unavailable.' }, 502, headers)
        }

        const nearbyStations = stations
          .filter((station) => station.TP_ESTACAO === 'Automatica' &&
            station.CD_SITUACAO === 'Operante' &&
            typeof station.CD_ESTACAO === 'string' &&
            typeof station.DC_NOME === 'string')
          .map((station) => ({
            ...station,
            distanceKm: getDistanceKm(latitude, longitude, Number(station.VL_LATITUDE), Number(station.VL_LONGITUDE)),
          }))
          .filter((station) => Number.isFinite(station.distanceKm) && station.distanceKm <= MAX_STATION_DISTANCE_KM)
          .sort((left, right) => left.distanceKm - right.distanceKm)

        if (nearbyStations.length === 0) {
          return jsonResponse({ error: 'No active INMET automatic station was found nearby.' }, 404, headers)
        }

        let observation = null
        for (const observationHour of getUtcObservationHours(Date.now())) {
          const upstreamUrl = `https://apitempo.inmet.gov.br/token/estacao/dados/${observationHour.date}/${observationHour.hour}/${encodeURIComponent(env.INMET_TOKEN)}`
          const upstream = await fetch(upstreamUrl, {
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(10000),
          })
          if (!upstream.ok) {
            console.error('INMET observations returned an unsuccessful status.', upstream.status)
            return jsonResponse({ error: 'INMET station data is temporarily unavailable.' }, 502, headers)
          }

          const records = await upstream.json()
          if (!Array.isArray(records)) {
            console.error('INMET observations returned an unexpected response.')
            return jsonResponse({ error: 'INMET station data is temporarily unavailable.' }, 502, headers)
          }
          const recordsByStation = new Map(records.map((record) => [record.CD_ESTACAO, record]))
          const nearestReading = nearbyStations.find((station) => {
            const record = recordsByStation.get(station.CD_ESTACAO)
            return record && parseTemperature(record.TEM_INS) !== null
          })
          if (!nearestReading) continue

          const record = recordsByStation.get(nearestReading.CD_ESTACAO)
          const measurementDate = typeof record.DT_MEDICAO === 'string' ? record.DT_MEDICAO : observationHour.date
          const measurementHour = typeof record.HR_MEDICAO === 'string'
            ? record.HR_MEDICAO.slice(0, 2)
            : observationHour.hour.slice(0, 2)
          const measuredAt = Date.parse(`${measurementDate}T${measurementHour}:00:00Z`)
          const observationAge = Date.now() - measuredAt
          const temperature = parseTemperature(record.TEM_INS)
          if (!Number.isFinite(measuredAt) ||
              observationAge > MAX_OBSERVATION_AGE_MS ||
              observationAge < -5 * 60 * 1000 ||
              temperature === null || temperature < -50 || temperature > 60) continue

          observation = {
            stationName: nearestReading.DC_NOME,
            stationCode: nearestReading.CD_ESTACAO,
            state: nearestReading.SG_ESTADO || '',
            temperatureC: temperature,
            observedAt: new Date(measuredAt).toISOString(),
            distanceKm: Math.round(nearestReading.distanceKm * 10) / 10,
          }
          break
        }

        if (!observation) {
          return jsonResponse({ error: 'No recent temperature reading is available from nearby INMET stations.' }, 404, headers)
        }

        const weatherResponse = jsonResponse(observation, 200, new Headers({
          'Cache-Control': `public, max-age=${STATION_WEATHER_CACHE_TTL_SECONDS}`,
        }))
        context.waitUntil(caches.default.put(responseCacheKey, weatherResponse.clone()))
        return withCors(weatherResponse, headers)
      } catch (error) {
        console.error('Unable to retrieve recent INMET station observations.', error)
        return jsonResponse({ error: 'INMET station data is temporarily unavailable.' }, 502, headers)
      }
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
