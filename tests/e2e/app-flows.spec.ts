import { expect, test } from '@playwright/test'

const weatherResponse = {
  current: {
    temperature_2m: 21,
    relative_humidity_2m: 67,
    apparent_temperature: 22,
    is_day: 1,
    precipitation: 0,
    rain: 0,
    weather_code: 1,
    surface_pressure: 1013,
    wind_speed_10m: 8,
    wind_direction_10m: 120,
    wind_gusts_10m: 12,
    visibility: 10000,
    cloud_cover: 10,
    uv_index: 3,
    time: '2026-10-30T09:00',
  },
  hourly: {
    time: Array.from({ length: 48 }, (_, index) => {
      const time = new Date(Date.UTC(2026, 9, 30, index))
      return `${time.toISOString().slice(0, 10)}T${time.toISOString().slice(11, 16)}`
    }),
    temperature_2m: Array(48).fill(21),
    precipitation: Array(48).fill(0),
    precipitation_probability: Array(48).fill(10),
    weather_code: Array(48).fill(1),
  },
  daily: {
    time: ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04'],
    weather_code: Array(6).fill(1),
    precipitation_probability_max: Array(6).fill(10),
    temperature_2m_max: Array(6).fill(28),
    temperature_2m_min: Array(6).fill(17),
    sunrise: Array(6).fill('2026-10-30T06:00'),
    sunset: Array(6).fill('2026-10-30T18:00'),
  },
}

test.beforeEach(async ({ page }) => {
  await page.route('https://api.open-meteo.com/**', (route) => route.fulfill({ json: weatherResponse }))
  await page.route('https://nominatim.openstreetmap.org/search**', (route) => route.fulfill({
    json: [{
      place_id: 1,
      lat: '-23.1896',
      lon: '-46.8978',
      name: 'Jundiaí',
      address: { city: 'Jundiaí', state: 'São Paulo', country: 'Brasil' },
    }],
  }))
  await page.route('https://economia.awesomeapi.com.br/**', (route) => route.fulfill({
    json: {
      USDBRL: { code: 'USD', name: 'Dólar', bid: '5.00', ask: '5.01', pctChange: '0.20', create_date: new Date().toISOString() },
      EURBRL: { code: 'EUR', name: 'Euro', bid: '5.50', ask: '5.51', pctChange: '0.10', create_date: new Date().toISOString() },
    },
  }))
  await page.route('https://hub-principal-news-api.hub-principal-fadoco.workers.dev/**', (route) => route.fulfill({
    contentType: 'application/rss+xml',
    body: `<rss><channel>${Array.from({ length: 7 }, (_, index) => `
      <item><title>Manchete de teste ${index + 1}</title><link>https://news.example/${index + 1}</link>
      <pubDate>${new Date(Date.now() - index * 60_000).toUTCString()}</pubDate><source>Fonte de teste</source></item>
    `).join('')}</channel></rss>`,
  }))
  await page.goto('/?androidPreview=1')
})

test('starts with the weather panel and lazily loads the news tab', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Clima agora' })).toBeVisible()
  await expect(page.getByText('21°C')).toBeVisible()
  await expect(page.locator('.day-rain-time').first()).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Notícias', exact: true })).toHaveCount(0)

  await page.getByRole('button', { name: 'Notícias' }).click()
  await expect(page.getByRole('heading', { name: 'Notícias', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Portal de notícias de jogos' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => performance.getEntriesByType('resource')
    .some((resource) => resource.name.includes('/src/NewsPanel.tsx')))).toBe(true)
})

test('does not show the generic useful sites section on the public website', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Sites úteis' })).toHaveCount(0)
  await expect(page.getByText('Remover fundo')).toHaveCount(0)
})

test('keeps weather and satellite visible and hides news in website TV mode', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Modo TV' }).click()

  await expect(page.locator('.weather-panel')).toBeVisible()
  await expect(page.locator('.satellite-panel')).toBeVisible()
  await expect(page.locator('.news-portals')).toBeHidden()

  const weatherHeight = await page.locator('.weather-panel').evaluate((element) => element.getBoundingClientRect().height)
  const satelliteHeight = await page.locator('.satellite-panel').evaluate((element) => element.getBoundingClientRect().height)
  expect(weatherHeight).toBeGreaterThan(200)
  expect(satelliteHeight).toBeGreaterThan(200)
})

test('searches and selects a city from suggestions', async ({ page }) => {
  await page.getByRole('button', { name: 'Ver clima em outro local' }).click()
  const cityInput = page.getByRole('textbox', { name: 'Cidade' })
  await cityInput.fill('Jundiaí')
  await page.getByRole('option', { name: /Jundiaí/ }).waitFor({ state: 'visible' })
  await page.getByRole('option', { name: /Jundiaí/ }).click()
  await page.getByRole('button', { name: 'Buscar clima' }).click()

  await expect(page.getByRole('heading', { name: 'Clima agora' })).toBeVisible()
  await expect(page.getByText('Jundiaí, SP')).toBeVisible()
})

test('collapses the sticky header during scrolling and restores it at the top', async ({ page }) => {
  const app = page.locator('main.android-app')
  const header = page.locator('.mobile-fixed-header')
  await expect(header).toHaveCSS('position', 'sticky')

  await app.evaluate((element) => { element.scrollTop = 20 })
  await expect(header).not.toHaveClass(/is-compact/)
  await app.evaluate((element) => { element.scrollTop = 40 })
  await expect(header).toHaveClass(/is-compact/)
  await app.evaluate((element) => { element.scrollTop = 20 })
  await expect(header).toHaveClass(/is-compact/)

  await app.evaluate((element) => { element.scrollTop = 200 })
  await expect(header).toHaveClass(/is-compact/)
  await expect(page.locator('.mobile-date')).toBeHidden()
  await app.evaluate((element) => { element.scrollTop = 5 })
  await expect(header).not.toHaveClass(/is-compact/)
  await expect(page.locator('.mobile-date')).toBeVisible()
})

test('uses saved weather and news when the device is offline', async ({ page, context }) => {
  const cachedNews = Array.from({ length: 7 }, (_, index) => ({
    title: index === 0 ? 'Notícia salva para uso offline' : `Notícia salva ${index + 1}`,
    link: `https://news.example/offline-${index + 1}`,
    pubDate: new Date(Date.now() - (index + 1) * 60_000).toUTCString(),
    author: 'Fonte salva',
  }))
  await page.evaluate(({ weather, news }) => {
    localStorage.setItem('hub-weather-v4:-23.550:-46.630', JSON.stringify({
      timestamp: Date.now() - 10 * 60 * 1000,
      value: { weather },
    }))
    localStorage.setItem('hub-news:jogos games|games lançamentos|notícias jogos', JSON.stringify({
      timestamp: Date.now() - 60_000,
      value: { items: news },
    }))
  }, { weather: weatherResponse, news: cachedNews })
  await page.getByRole('button', { name: 'Notícias' }).click()
  await expect(page.getByText('Notícia salva para uso offline')).toBeVisible()
  await page.getByRole('button', { name: 'Início' }).click()

  await context.setOffline(true)
  await page.evaluate(() => window.dispatchEvent(new Event('hub:data-refresh')))
  await expect(page.getByText('21°C')).toBeVisible()
  await expect(page.getByText(/Dados salvos para uso offline/)).toBeVisible()

  await page.getByRole('button', { name: 'Notícias' }).click()
  await expect(page.getByText('Notícia salva para uso offline')).toBeVisible()
  await expect(page.locator('.news-cache-status').first()).toBeVisible()
})
