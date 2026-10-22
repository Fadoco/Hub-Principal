import { useEffect, useMemo, useRef, useState } from 'react'
import { Maximize, Pause, Play, RefreshCw } from 'lucide-react'

type SatelliteDate = { sigla: string; nome: string }
type SatelliteHour = { sigla: string }
type SatelliteFrame = { hora: string; base64: string }
type CachedFrame = SatelliteFrame & { date: string }

const API_URL = 'https://apisat.inmet.gov.br'
const PARAMETER = 'TN'
const FRAME_CACHE_LIMIT = 12
const ANIMATION_INTERVAL = 900

async function getJson<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { signal, cache: 'no-store' })
  if (!response.ok) throw new Error(`O INMET respondeu com o status ${response.status}.`)
  const body = await response.text()
  try {
    return JSON.parse(body) as T
  } catch {
    throw new Error('O serviço do INMET retornou uma resposta inválida. Tente atualizar em instantes.')
  }
}

async function fetchFrame(date: string, hour: string): Promise<CachedFrame> {
  const result = await getJson<SatelliteFrame>(
    `/GOES/BR/${PARAMETER}/${date}/${encodeURIComponent(hour)}`,
    new AbortController().signal,
  )
  if (typeof result.base64 !== 'string' || !result.base64.startsWith('data:image/')) {
    throw new Error(`O INMET retornou uma imagem inválida para ${hour}.`)
  }

  const decodedImage = new Image()
  decodedImage.src = result.base64
  await decodedImage.decode()
  return { ...result, date }
}

function getFrame(
  date: string,
  hour: string,
  cache: Map<string, CachedFrame>,
  inFlight: Map<string, Promise<CachedFrame>>,
  requestQueue: { current: Promise<void> },
): Promise<CachedFrame> {
  const key = `${date}/${hour}`
  const cachedFrame = cache.get(key)
  if (cachedFrame) return Promise.resolve(cachedFrame)
  const pendingRequest = inFlight.get(key)
  if (pendingRequest) return pendingRequest

  const request = requestQueue.current.then(async () => {
    const queuedCacheHit = cache.get(key)
    if (queuedCacheHit) return queuedCacheHit

    let result: CachedFrame | null = null
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        result = await fetchFrame(date, hour)
        break
      } catch (requestError) {
        if (attempt === 2) {
          throw requestError instanceof Error
            ? requestError
            : new Error('Não foi possível carregar a imagem do satélite.')
        }
        await new Promise((resolve) => window.setTimeout(resolve, 700 * (attempt + 1)))
      }
    }

    if (!result) throw new Error('Não foi possível carregar a imagem do satélite.')
    cache.set(key, result)
    while (cache.size > FRAME_CACHE_LIMIT) {
      const oldestKey = cache.keys().next().value
      if (!oldestKey) break
      cache.delete(oldestKey)
    }
    return result
  })
  requestQueue.current = request.then(() => undefined, () => undefined)
  inFlight.set(key, request)
  void request.then(
    () => inFlight.delete(key),
    () => inFlight.delete(key),
  )
  return request
}

export default function SatellitePanel() {
  const [selectedDate, setSelectedDate] = useState('')
  const [hours, setHours] = useState<string[]>([])
  const [selectedHour, setSelectedHour] = useState('')
  const [isPlaying, setIsPlaying] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [frame, setFrame] = useState<CachedFrame | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [prefetchedKey, setPrefetchedKey] = useState('')
  const [prefetchRetry, setPrefetchRetry] = useState(0)
  const [isPanelVisible, setIsPanelVisible] = useState(false)
  const [isDocumentVisible, setIsDocumentVisible] = useState(() => document.visibilityState === 'visible')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const panelRef = useRef<HTMLElement | null>(null)
  const frameCache = useRef(new Map<string, CachedFrame>())
  const inFlightFrames = useRef(new Map<string, Promise<CachedFrame>>())
  const frameRequestQueue = useRef(Promise.resolve())
  const visibleHours = useMemo(() => [...hours].reverse(), [hours])
  const isActive = isPanelVisible && isDocumentVisible

  useEffect(() => {
    const panel = panelRef.current
    if (!panel || !('IntersectionObserver' in window)) {
      setIsPanelVisible(true)
      return
    }
    const observer = new IntersectionObserver(([entry]) => setIsPanelVisible(entry.isIntersecting), { rootMargin: '80px' })
    observer.observe(panel)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const updateVisibility = () => setIsDocumentVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', updateVisibility)
    return () => document.removeEventListener('visibilitychange', updateVisibility)
  }, [])

  useEffect(() => {
    const refreshSatellite = () => setRefreshKey((key) => key + 1)
    window.addEventListener('hub:data-refresh', refreshSatellite)
    return () => window.removeEventListener('hub:data-refresh', refreshSatellite)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    let disposed = false

    const loadDates = async () => {
      setError('')
      try {
        const availableDates = await getJson<SatelliteDate[]>(`/datas/GOES/BR/${PARAMETER}`, controller.signal)
        if (!disposed) {
          setSelectedDate(availableDates[0]?.sigla.slice(0, 10) || '')
          if (availableDates.length === 0) setError('O INMET não informou datas disponíveis para as imagens.')
        }
      } catch (loadError) {
        if (!disposed && !(loadError instanceof DOMException && loadError.name === 'AbortError')) {
          setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar as datas do satélite.')
        }
      }
    }

    void loadDates()
    return () => {
      disposed = true
      controller.abort()
    }
  }, [refreshKey])

  useEffect(() => {
    if (!selectedDate) return
    const controller = new AbortController()
    let disposed = false

    const loadHours = async () => {
      setHours([])
      setSelectedHour('')
      setError('')
      try {
        const availableHours = await getJson<SatelliteHour[]>(`/horas/GOES/BR/${PARAMETER}/${selectedDate}`, controller.signal)
        if (!disposed) {
          const hourValues = availableHours.map(({ sigla }) => sigla)
          setHours(hourValues)
          setSelectedHour(hourValues[0] || '')
          if (hourValues.length === 0) setError('Não há imagens disponíveis para essa data.')
        }
      } catch (loadError) {
        if (!disposed && !(loadError instanceof DOMException && loadError.name === 'AbortError')) {
          setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar os horários do satélite.')
        }
      }
    }

    void loadHours()
    return () => {
      disposed = true
      controller.abort()
    }
  }, [refreshKey, selectedDate])

  useEffect(() => {
    if (visibleHours.length === 0) return
    if (!visibleHours.includes(selectedHour)) setSelectedHour(visibleHours[visibleHours.length - 1])
  }, [selectedHour, visibleHours])

  useEffect(() => {
    if (!selectedDate || !selectedHour) return
    const cacheKey = `${selectedDate}/${selectedHour}`
    let disposed = false
    setIsLoading(!frameCache.current.has(cacheKey))
    setError('')
    void getFrame(selectedDate, selectedHour, frameCache.current, inFlightFrames.current, frameRequestQueue)
      .then((loadedFrame) => {
        if (!disposed) {
          setFrame(loadedFrame)
          setLastUpdated(new Date())
          setIsLoading(false)
        }
      })
      .catch((loadError: unknown) => {
        if (!disposed) {
          setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar a imagem do satélite.')
          setIsLoading(false)
        }
      })
    return () => {
      disposed = true
    }
  }, [selectedDate, selectedHour])

  useEffect(() => {
    if (!isActive || !selectedDate || !selectedHour || visibleHours.length < 2) return
    const currentIndex = visibleHours.indexOf(selectedHour)
    const nextHour = visibleHours[(currentIndex + 1) % visibleHours.length]
    const nextKey = `${selectedDate}/${nextHour}`
    let disposed = false
    let retryTimer = 0
    if (frameCache.current.has(nextKey)) {
      setPrefetchedKey(nextKey)
      return
    }

    void getFrame(selectedDate, nextHour, frameCache.current, inFlightFrames.current, frameRequestQueue)
      .then(() => {
        if (!disposed) setPrefetchedKey(nextKey)
      })
      .catch((prefetchError: unknown) => {
        if (!disposed) {
          console.warn('Não foi possível pré-carregar a próxima imagem de satélite.', prefetchError)
          retryTimer = window.setTimeout(() => setPrefetchRetry((attempt) => attempt + 1), 5000)
        }
      })
    return () => {
      disposed = true
      window.clearTimeout(retryTimer)
    }
  }, [isActive, prefetchRetry, selectedDate, selectedHour, visibleHours])

  useEffect(() => {
    if (!isActive || !isPlaying || error || visibleHours.length < 2 || !selectedHour) return
    const currentIndex = visibleHours.indexOf(selectedHour)
    const nextHour = visibleHours[(currentIndex + 1) % visibleHours.length]
    const nextKey = `${selectedDate}/${nextHour}`
    if (prefetchedKey !== nextKey || !frameCache.current.has(nextKey)) return
    const animationTimer = window.setTimeout(() => {
      setSelectedHour(nextHour)
    }, ANIMATION_INTERVAL)
    return () => window.clearTimeout(animationTimer)
  }, [error, isActive, isPlaying, prefetchedKey, selectedDate, selectedHour, visibleHours])

  const toggleFullscreen = async () => {
    const panel = panelRef.current
    if (!panel) return
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await panel.requestFullscreen()
    } catch {
      setError('Não foi possível abrir a imagem em tela cheia neste navegador.')
    }
  }

  return (
    <section className="panel satellite-panel" ref={panelRef}>
      <div className="section-heading">
        <div><h2>Imagens de Satélite</h2></div>
      </div>

      <div className="satellite-viewer" aria-busy={isLoading}>
        {frame && (
          <img
            className="satellite-image"
            src={frame.base64}
            alt={`Imagem de topo das nuvens sobre o Brasil, registrada às ${frame.hora}.`}
          />
        )}
        {error && <span className="satellite-error-indicator" role="alert">{error}</span>}
      </div>

      <div className="satellite-controls">
        <div className="satellite-buttons">
          <button
            className="satellite-control-button"
            type="button"
            onClick={() => setIsPlaying((playing) => !playing)}
            disabled={visibleHours.length < 2}
            aria-label={isPlaying ? 'Pausar animação do satélite' : 'Reproduzir animação do satélite'}
          >
            {isPlaying ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button
            className="satellite-control-button"
            type="button"
            onClick={() => setRefreshKey((key) => key + 1)}
            aria-label="Atualizar imagens do satélite"
          >
            <RefreshCw size={15} />
          </button>
          <button className="satellite-control-button" type="button" onClick={() => void toggleFullscreen()} aria-label="Abrir satélite em tela cheia">
            <Maximize size={15} />
          </button>
        </div>
      </div>

      {visibleHours.length > 1 && (
        <input
          className="satellite-timeline"
          type="range"
          min="0"
          max={visibleHours.length - 1}
          value={Math.max(0, visibleHours.indexOf(selectedHour))}
          onChange={(event) => {
            setSelectedHour(visibleHours[Number(event.target.value)])
            setIsPlaying(false)
          }}
          aria-label="Escolher horário da imagem de satélite"
        />
      )}

      <div className="satellite-attribution">
        <span>INMET · {lastUpdated ? `Atualizado às ${lastUpdated.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : 'Imagens GOES'}</span>
        <a href="https://satelite.inmet.gov.br/" target="_blank" rel="noopener noreferrer">Portal oficial do INMET</a>
      </div>
    </section>
  )
}
