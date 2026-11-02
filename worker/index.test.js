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
