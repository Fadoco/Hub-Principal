const CACHE_NAME = 'hub-principal-shell-v5'
const APP_SHELL_URL = new URL('./index.html', self.registration.scope).href
const APP_SHELL = [
  APP_SHELL_URL,
  new URL('./manifest.webmanifest', self.registration.scope).href,
  new URL('./favicon-96.png', self.registration.scope).href,
  new URL('./apple-touch-icon.png', self.registration.scope).href,
  new URL('./icon-192.png', self.registration.scope).href,
  new URL('./icon-512.png', self.registration.scope).href,
]
const STATIC_ASSET_PATTERN = /\.(?:css|js|svg|png|jpe?g|webp|ico|woff2?)$/i

async function cacheResponse(cacheKey, response) {
  if (!response.ok) return response
  try {
    const cache = await caches.open(CACHE_NAME)
    await cache.put(cacheKey, response.clone())
  } catch (error) {
    console.warn('Não foi possível atualizar o cache do site.', error)
  }
  return response
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith('hub-principal-shell-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const requestUrl = new URL(request.url)
  if (requestUrl.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then((response) => cacheResponse(APP_SHELL_URL, response))
        .catch(async () => (await caches.match(request)) || caches.match(APP_SHELL_URL)),
    )
    return
  }

  if (!STATIC_ASSET_PATTERN.test(requestUrl.pathname)) return

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request)
      .then((response) => cacheResponse(request, response))
      .catch((error) => {
        console.warn('Não foi possível carregar um recurso do site.', error)
        throw error
      })),
  )
})
