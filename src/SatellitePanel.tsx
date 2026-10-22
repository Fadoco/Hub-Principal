import { useEffect, useMemo, useRef, useState } from 'react'
import { Maximize, Pause, Play, RefreshCw } from 'lucide-react'

type SatelliteDate = { sigla: string; nome: string }
type SatelliteHour = { sigla: string }
type SatelliteFrame = { hora: string; base64: string }
type CachedFrame = SatelliteFrame & { date: string }

const API_URL = 'https://apisat.inmet.gov.br'
const PARAMETER = 'TN'
const FRAME_CACHE_LIMIT = 12
const PREFETCH_COUNT = 3
const ANIMATION_INTERVAL = 500

async function getJson<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { signal, cache: 'no-store' })
  if (!response.ok) throw new Error(`O INMET respondeu com o status ${response.status}.`)
  return response.json() as Promise<T>
}

async function loadFrame(date: string, hour: string, signal: AbortSignal): Promise<CachedFrame> {
  const result = await getJson<SatelliteFrame>(
    `/GOES/BR/${PARAMETER}/${date}/${encodeURIComponent(hour)}`,
    signal,
  )
  if (typeof result.base64 !== 'string' || !result.base64.startsWith('data:image/')) {
    throw new Error(`O INMET retornou uma imagem inválida para ${hour}.`)
  }

  const decodedImage = new Image()
  decodedImage.src = result.base64
  await decodedImage.decode()
  return { ...result, date }
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
  const panelRef = useRef<HTMLElement | null>(null)
  const frameCache = useRef(new Map<string, CachedFrame>())
  const visibleHours = useMemo(() => [...hours].reverse(), [hours])

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
    const cachedFrame = frameCache.current.get(cacheKey)
    if (cachedFrame) {
      setFrame(cachedFrame)
      setIsLoading(false)
      setError('')
      return
    }

    const controller = new AbortController()
    let disposed = false
    setIsLoading(true)
    setError('')

    const loadSelectedFrame = async () => {
      try {
        const cachedResult = await loadFrame(selectedDate, selectedHour, controller.signal)

        if (!disposed) {
          frameCache.current.set(cacheKey, cachedResult)
          if (frameCache.current.size > FRAME_CACHE_LIMIT) {
            const oldestKey = frameCache.current.keys().next().value
            if (oldestKey) frameCache.current.delete(oldestKey)
          }
          setFrame(cachedResult)
        }
      } catch (loadError) {
        if (!disposed && !(loadError instanceof DOMException && loadError.name === 'AbortError')) {
          setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar a imagem do satélite.')
        }
      } finally {
        if (!disposed) setIsLoading(false)
      }
    }

    void loadSelectedFrame()
    return () => {
      disposed = true
      controller.abort()
    }
  }, [selectedDate, selectedHour])

  useEffect(() => {
    if (!selectedDate || !selectedHour || visibleHours.length < 2) return
    const controller = new AbortController()
    const currentIndex = visibleHours.indexOf(selectedHour)
    const upcomingHours = Array.from({ length: PREFETCH_COUNT }, (_, offset) => (
      visibleHours[(currentIndex + offset + 1) % visibleHours.length]
    ))

    const prefetch = async () => {
      await Promise.all(upcomingHours.map(async (hour) => {
        const cacheKey = `${selectedDate}/${hour}`
        if (frameCache.current.has(cacheKey)) return
        const upcomingFrame = await loadFrame(selectedDate, hour, controller.signal)
        frameCache.current.set(cacheKey, upcomingFrame)
        if (frameCache.current.size > FRAME_CACHE_LIMIT) {
          const oldestKey = frameCache.current.keys().next().value
          if (oldestKey) frameCache.current.delete(oldestKey)
        }
      }))
    }

    void prefetch().catch((prefetchError: unknown) => {
      if (!(prefetchError instanceof DOMException && prefetchError.name === 'AbortError')) {
        console.error('Falha ao pré-carregar imagens do satélite.', prefetchError)
      }
    })
    return () => controller.abort()
  }, [selectedDate, selectedHour, visibleHours])

  useEffect(() => {
    if (!isPlaying || isLoading || error || visibleHours.length < 2 || !selectedHour) return
    const animationTimer = window.setTimeout(() => {
      const activeIndex = visibleHours.indexOf(selectedHour)
      setSelectedHour(visibleHours[(activeIndex + 1) % visibleHours.length])
    }, ANIMATION_INTERVAL)
    return () => window.clearTimeout(animationTimer)
  }, [error, isLoading, isPlaying, selectedHour, visibleHours])

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
        <span>Imagens GOES · Fonte: INMET</span>
        <a href="https://satelite.inmet.gov.br/" target="_blank" rel="noopener noreferrer">Portal oficial do INMET</a>
      </div>
    </section>
  )
}
