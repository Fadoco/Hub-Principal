import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const DATA_REFRESH_INTERVAL_MS = 30 * 60 * 1000
const DATA_REFRESH_EVENT = 'hub:data-refresh'
let nextDataRefresh = Date.now() + DATA_REFRESH_INTERVAL_MS
const refreshDataIfDue = () => {
  if (Date.now() >= nextDataRefresh && document.visibilityState === 'visible') {
    nextDataRefresh = Date.now() + DATA_REFRESH_INTERVAL_MS
    window.dispatchEvent(new Event(DATA_REFRESH_EVENT))
  }
}

window.setInterval(refreshDataIfDue, 60000)
document.addEventListener('visibilitychange', refreshDataIfDue)
window.addEventListener('pageshow', refreshDataIfDue)

const currentUrl = new URL(window.location.href)
if (currentUrl.searchParams.has('_refresh')) {
  currentUrl.searchParams.delete('_refresh')
  window.history.replaceState(null, '', `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`)
}

if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(async (registrations) => {
    if (!registrations.length || sessionStorage.getItem('hub-dev-sw-cleaned') === '1') return
    sessionStorage.setItem('hub-dev-sw-cleaned', '1')
    await Promise.all(registrations.map((registration) => registration.unregister()))
    const cacheNames = await caches.keys()
    await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)))
    window.location.reload()
  })
}

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js?v=4`, { updateViaCache: 'none' })
      .then((registration) => registration.update())
      .catch((error: unknown) => console.error('Não foi possível verificar atualizações do site.', error))

  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
