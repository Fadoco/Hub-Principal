import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import worker from './index.js'

describe('GET /weather', () => {
  it('rejects coordinates outside Brazil before checking the INMET secret', async () => {
    const response = await worker.fetch(
      new Request('https://worker.example/weather?latitude=40&longitude=-70'),
      {},
      {},
    )

    assert.equal(response.status, 400)
    assert.match((await response.json()).error, /Brazil/)
  })

  it('rejects missing coordinates instead of treating them as zero', async () => {
    const response = await worker.fetch(
      new Request('https://worker.example/weather?longitude=-46'),
      {},
      {},
    )

    assert.equal(response.status, 400)
  })

  it('reports the missing server-side INMET secret as unavailable', async () => {
    const response = await worker.fetch(
      new Request('https://worker.example/weather?latitude=-20&longitude=-48'),
      {},
      {},
    )

    assert.equal(response.status, 503)
    assert.match((await response.json()).error, /not configured/)
  })
})

describe('GET /forecast', () => {
  it('rejects invalid coordinates', async () => {
    const response = await worker.fetch(
      new Request('https://worker.example/forecast?latitude=95&longitude=-70'),
      {},
      {},
    )

    assert.equal(response.status, 400)
    assert.match((await response.json()).error, /coordinates/)
  })

  it('retrieves a validated forecast from Open-Meteo with CORS headers', async () => {
    const originalFetch = globalThis.fetch
    const originalCaches = Object.getOwnPropertyDescriptor(globalThis, 'caches')
    const forecast = { current: {}, hourly: {}, daily: {} }
    let requestedUrl
    Object.defineProperty(globalThis, 'caches', {
      configurable: true,
      value: {
        default: {
          match: async () => undefined,
          put: async () => undefined,
        },
      },
    })
    globalThis.fetch = async (input) => {
      requestedUrl = new URL(input)
      return new Response(JSON.stringify(forecast), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    try {
      const response = await worker.fetch(
        new Request('https://worker.example/forecast?latitude=-20.5592&longitude=-48.5450', {
          headers: {
            Origin: 'https://fadoco.github.io',
            'CF-Connecting-IP': '192.0.2.1',
          },
        }),
        { NEWS_RATE_LIMITER: { limit: async () => ({ success: true }) } },
        { waitUntil: (promise) => promise },
      )

      assert.equal(response.status, 200)
      assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://fadoco.github.io')
      assert.deepEqual(await response.json(), forecast)
      assert.equal(requestedUrl.hostname, 'api.open-meteo.com')
      assert.equal(requestedUrl.searchParams.get('forecast_days'), '6')
    } finally {
      globalThis.fetch = originalFetch
      if (originalCaches) Object.defineProperty(globalThis, 'caches', originalCaches)
      else delete globalThis.caches
    }
  })
})
