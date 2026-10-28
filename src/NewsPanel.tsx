import { useEffect, useMemo, useRef, useState } from 'react'
import { ExternalLink, Newspaper, RefreshCw } from 'lucide-react'

type NewsItem = { title: string; link: string; pubDate: string; author?: string }
type NewsPanelProps = { locationCity: string | null; title: string; query: string | string[]; local?: boolean }
const NEWS_CACHE_TTL = 300000
const NEWS_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
const NEWS_FUTURE_TOLERANCE_MS = 60 * 60 * 1000
const NEWS_ITEMS_LIMIT = 7
const NEWS_API_URL = import.meta.env.VITE_NEWS_API_URL?.trim()

function normalizeNewsItems(items: NewsItem[]) {
  const latestAllowedTime = Date.now() - NEWS_MAX_AGE_MS
  const latestAllowedFutureTime = Date.now() + NEWS_FUTURE_TOLERANCE_MS
  const unique = new Map<string, NewsItem>()
  items.filter((item) => {
    const publishedTime = Date.parse(item.pubDate)
    return item.title
      && item.link
      && Number.isFinite(publishedTime)
      && publishedTime >= latestAllowedTime
      && publishedTime <= latestAllowedFutureTime
  }).forEach((item) => {
    const key = item.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    if (!unique.has(key)) unique.set(key, item)
  })
  return [...unique.values()]
    .sort((first, second) => new Date(second.pubDate).getTime() - new Date(first.pubDate).getTime())
    .slice(0, NEWS_ITEMS_LIMIT)
}

function parseNewsFeed(xml: string) {
  const feed = new DOMParser().parseFromString(xml, 'application/xml')
  if (feed.querySelector('parsererror')) throw new Error('O serviço retornou um feed de notícias inválido.')

  const items = Array.from(feed.querySelectorAll('item')).map((item) => ({
    title: item.querySelector('title')?.textContent?.trim() || '',
    link: item.querySelector('link')?.textContent?.trim() || '',
    pubDate: item.querySelector('pubDate')?.textContent?.trim() || '',
    author: item.getElementsByTagName('News:Source')[0]?.textContent?.trim()
      || item.getElementsByTagName('source')[0]?.textContent?.trim()
      || item.getElementsByTagName('dc:creator')[0]?.textContent?.trim(),
  }))

  return normalizeNewsItems(items)
}

export default function NewsPanel({ locationCity, title, query, local = false }: NewsPanelProps) {
  const panelRef = useRef<HTMLElement | null>(null)
  const [items, setItems] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [isNearViewport, setIsNearViewport] = useState(false)
  const [retryToken, setRetryToken] = useState(0)
  const forceRefreshRef = useRef(false)

  const searchQueries = useMemo(() => {
    if (local && locationCity) {
      return [
        `Notícias ${locationCity}`,
        `${locationCity} notícias`,
        `notícias da região de ${locationCity}`,
        `${locationCity} cidade notícias`,
        locationCity,
      ]
    }
    return Array.isArray(query) ? [...query] : [query]
  }, [local, locationCity, query])
  const searchQuery = searchQueries[0]
  const searchUrl = `https://news.google.com/search?q=${encodeURIComponent(searchQuery)}&hl=pt-BR&gl=BR&ceid=BR%3Apt-419`

  useEffect(() => {
    const panel = panelRef.current
    if (!panel || !('IntersectionObserver' in window)) {
      setIsNearViewport(true)
      return
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setIsNearViewport(true)
        observer.disconnect()
      }
    }, { rootMargin: '320px' })

    observer.observe(panel)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!NEWS_API_URL || !isNearViewport || (local && !locationCity)) return

    let cancelled = false
    const forceRefresh = forceRefreshRef.current
    forceRefreshRef.current = false
    let activeController: AbortController | null = null
    const cacheKey = `hub-news:${searchQueries.join('|')}`

    const loadNews = async () => {
      if (activeController) return
      if (!forceRefresh) {
        try {
          const cached = sessionStorage.getItem(cacheKey)
          if (cached) {
            const saved = JSON.parse(cached) as { timestamp: number; items: NewsItem[] }
            const cachedItems = normalizeNewsItems(saved.items)
            if (Date.now() - saved.timestamp < NEWS_CACHE_TTL && cachedItems.length === NEWS_ITEMS_LIMIT) {
              setItems(cachedItems)
              setError(false)
              return
            }
          }
        } catch (storageError) {
          console.warn('Não foi possível ler o cache de notícias desta sessão.', storageError)
        }
      }

      const controller = new AbortController()
      activeController = controller
      let timedOut = false
      const timeout = window.setTimeout(() => {
        timedOut = true
        controller.abort()
      }, 30000)
      setLoading(true)
      try {
        const collectedItems: NewsItem[] = []
        let successfulQueries = 0
        for (const newsQuery of searchQueries) {
          try {
            const endpoint = new URL(NEWS_API_URL)
            endpoint.searchParams.set('q', newsQuery)
            if (forceRefresh) endpoint.searchParams.set('refresh', '1')
            const response = await fetch(endpoint, {
              signal: controller.signal,
              cache: forceRefresh ? 'no-store' : 'default',
            })
            if (!response.ok) throw new Error(`Falha ao carregar notícias (HTTP ${response.status}).`)
            const queryItems = parseNewsFeed(await response.text())
            successfulQueries += 1
            collectedItems.push(...queryItems)
            if (normalizeNewsItems(collectedItems).length === NEWS_ITEMS_LIMIT) break
          } catch (queryError) {
            if ((queryError as Error).name === 'AbortError') throw queryError
            console.error(`Não foi possível carregar notícias para a busca "${newsQuery}".`, queryError)
          }
        }

        const nextItems = normalizeNewsItems(collectedItems)
        if (!cancelled) {
          setItems(nextItems)
          setError(successfulQueries === 0)
          if (successfulQueries > 0) {
            try {
              sessionStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), items: nextItems }))
            } catch (storageError) {
              console.warn('Não foi possível salvar o cache de notícias desta sessão.', storageError)
            }
          }
        }
      } catch (loadError) {
        if (!cancelled && (timedOut || (loadError as Error).name !== 'AbortError')) {
          console.error('Não foi possível atualizar as notícias.', loadError)
          setError(true)
        }
      } finally {
        window.clearTimeout(timeout)
        if (activeController === controller) activeController = null
        if (!cancelled) setLoading(false)
      }
    }

    const schedule = window.setTimeout(() => void loadNews(), 700)
    const timer = window.setInterval(() => void loadNews(), NEWS_CACHE_TTL)
    return () => {
      cancelled = true
      activeController?.abort()
      window.clearTimeout(schedule)
      window.clearInterval(timer)
    }
  }, [isNearViewport, locationCity, searchQueries, local, retryToken])

  const refreshNews = () => {
    forceRefreshRef.current = true
    setIsNearViewport(true)
    setRetryToken((token) => token + 1)
  }

  useEffect(() => {
    const refreshVisibleNews = () => {
      if (isNearViewport && (!local || locationCity)) refreshNews()
    }
    window.addEventListener('hub:data-refresh', refreshVisibleNews)
    return () => window.removeEventListener('hub:data-refresh', refreshVisibleNews)
  }, [isNearViewport, local, locationCity])

  return (
    <section className="news-panel" ref={panelRef}>
      <div className="news-heading">
        <div><span className="section-kicker">{local ? 'PORTAL DE NOTÍCIAS LOCAL' : 'PORTAL DE NOTÍCIAS'}</span><h3>{title}</h3></div>
        <div className="news-actions">
          {NEWS_API_URL && (
            <button className="news-retry" type="button" onClick={refreshNews} disabled={loading || (local && !locationCity)}>
              <RefreshCw size={13} className={loading ? 'spin' : ''} /> Atualizar
            </button>
          )}
          {local && !locationCity ? (
            <span className="news-search is-disabled" aria-disabled="true">
              <Newspaper size={15} /> Aguardando localização
            </span>
          ) : (
            <a className="news-search" href={searchUrl} target="_blank" rel="noreferrer" aria-label={`Pesquisar "${searchQuery}" no Google Notícias`}>
              <Newspaper size={15} /> Ver todas
            </a>
          )}
        </div>
      </div>
      {!NEWS_API_URL && (
        <div className="news-info">As manchetes ainda não estão disponíveis neste painel. Use “Ver todas” para abrir as notícias atualizadas.</div>
      )}
      {error && <div className="news-error" role="status">Não foi possível atualizar as notícias. Tente novamente ou use “Ver todas”.</div>}
      {loading && !items.length ? (
        <div className="news-empty">Buscando notícias...</div>
      ) : error && !items.length ? (
        <div className="news-empty">Nenhuma notícia disponível no momento.</div>
      ) : local && !locationCity ? (
        <div className="news-empty">Permita o acesso à localização ou escolha uma cidade no painel de clima para buscar notícias locais.</div>
      ) : !NEWS_API_URL ? null : !isNearViewport ? (
        <div className="news-empty">As notícias serão carregadas ao chegar nesta seção.</div>
      ) : (
        <div className="news-list">
          {items.map((item) => (
            <a className="news-item" href={item.link} target="_blank" rel="noreferrer" key={item.link}>
              <span><strong>{item.title}</strong><small>{item.author || 'Google News'} · {new Date(item.pubDate).toLocaleDateString('pt-BR')}</small></span>
              <ExternalLink size={14} />
            </a>
          ))}
          {!items.length && !loading && !error && <div className="news-empty">Nenhuma notícia encontrada nos últimos 30 dias.</div>}
          {items.length > 0 && items.length < NEWS_ITEMS_LIMIT && !loading && (
            <div className="news-empty">Encontramos {items.length} de {NEWS_ITEMS_LIMIT} notícias recentes para esta categoria.</div>
          )}
        </div>
      )}
    </section>
  )
}
