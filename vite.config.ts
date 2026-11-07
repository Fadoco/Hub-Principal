import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

const getApiOrigins = (env: Record<string, string>) => {
  const origins = new Set([
    'https://api.open-meteo.com',
    'https://nominatim.openstreetmap.org',
    'https://maps.googleapis.com',
    'https://economia.awesomeapi.com.br',
    'https://apisat.inmet.gov.br',
    'https://fadoco.github.io',
    'https://hub-principal-news-api.hub-principal-fadoco.workers.dev',
  ])

  for (const variable of ['VITE_WEATHER_API_URL', 'VITE_NEWS_API_URL']) {
    const value = env[variable]?.trim()
    if (!value) continue

    let url: URL
    try {
      url = new URL(value)
    } catch (error) {
      throw new Error(`${variable} must be a valid HTTPS URL.`, { cause: error })
    }

    if (url.protocol !== 'https:' || url.username || url.password) {
      throw new Error(`${variable} must be an HTTPS URL without embedded credentials.`)
    }
    origins.add(url.origin)
  }

  return [...origins].sort().join(' ')
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const connectSources = getApiOrigins(env)
  const contentSecurityPolicy = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://unpkg.com https://*.tile.openstreetmap.org",
    `connect-src 'self' ${connectSources}`,
    "font-src 'self' data:",
    "worker-src 'self' blob:",
    "frame-src 'none'",
    "form-action 'self'",
    'upgrade-insecure-requests',
  ].join('; ')

  return {
    plugins: [
      react(),
      {
        name: 'production-content-security-policy',
        apply: 'build',
        transformIndexHtml(html) {
          const placeholder = '<!-- CSP_PLACEHOLDER -->'
          if (!html.includes(placeholder)) {
            throw new Error('The CSP placeholder is missing from index.html.')
          }
          return html.replace(
            placeholder,
            `<meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy}" />`,
          )
        },
      },
    ],
    base: process.env.VITE_BASE_PATH || '/',
  }
})
