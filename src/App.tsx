import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet'
import { Activity, AlertCircle, CalendarDays, Cloud, CloudDrizzle, CloudRain, CloudSun, Compass, Download, Droplets, Eye, ExternalLink, Gauge, LocateFixed, MapPin, Navigation, Newspaper, RefreshCw, Sun, Sunrise, Sunset, Umbrella, Wind } from 'lucide-react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './App.css'

type Coordinates = { latitude: number; longitude: number }
type LocationInfo = Coordinates & { city: string; state: string; country: string }
type CitySuggestion = {
  label: string
  city: string
  state: string
  country: string
  latitude: number
  longitude: number
  searchKey: string
}
type WeatherData = { current: Record<string, number | string>; hourly: { time: string[]; temperature_2m: number[]; precipitation_probability: number[]; weather_code: number[] }; daily: { time: string[]; weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[]; sunrise: string[]; sunset: string[] } }
const weatherUrl = import.meta.env.VITE_WEATHER_API_URL || 'https://api.open-meteo.com/v1/forecast'
const WEATHER_CACHE_TTL = 180000
const CURRENCY_CACHE_TTL = 60000
const radarPageUrl = 'https://www.ipmetradar.com.br/2mobileGis.php'
const radarSources = [
  { label: 'Satélite meteorológico', description: 'Animação de imagens de satélite', url: 'https://www.ipmetradar.com.br/2satelite.php' },
  { label: 'Radar animado PPI', description: 'Animaçao das ultimas imagens', url: 'https://www.ipmetradar.com.br/2animRadar.php' },
  { label: 'Imagem com cidades', description: 'Ultima imagem e municipios', url: 'https://www.ipmetradar.com.br/2imagemRadar.php' },
  { label: 'Radar GIS satélite', description: 'Mapas GIS e imagens de satélite', url: 'https://www.ipmetradar.com.br/2satGis.php' },
]
const usefulSites = [
  { label: 'Remover fundo', description: 'Remova fundos de imagens', url: 'https://www.photoroom.com/pt-br/tools/background-remover' },
  { label: 'Gerenciador de PDF', description: 'Editar e organizar PDFs', url: 'https://www.ilovepdf.com/' },
  { label: 'Melhorar qualidade', description: 'Aumente a qualidade da imagem', url: 'https://www.iloveimg.com/pt/ampliar-imagem' },
  { label: 'ChatGPT', description: 'Assistente de inteligência artificial', url: 'https://chatgpt.com/' },
  { label: 'SAAEB', description: 'Serviços de água e esgoto', url: 'https://saaeb.com.br/' },
  { label: 'CPFL', description: 'Acesso e serviços CPFL', url: 'https://cpflb2cprd.b2clogin.com/cpflb2cprd.onmicrosoft.com/b2c_1a_signup_signin_mfa_front/oauth2/v2.0/authorize?p=B2C_1A_SIGNUP_SIGNIN_MFA_FRONT&client_id=17d5831d-6741-4670-8085-d1d34e37aec1&nonce=defaultNonce&redirect_uri=https%3A%2F%2Fwww.cpfl.com.br%2Fb2c-auth%2Freceive-token&scope=17d5831d-6741-4670-8085-d1d34e37aec1%20offline_access&response_type=code&prompt=login&response_mode=query' },
]
const markerIcon = L.icon({ iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png', iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png', shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png', iconSize: [25, 41], iconAnchor: [12, 41] })
const weatherLabels: Record<number, string> = { 0: 'Céu limpo', 1: 'Predominantemente limpo', 2: 'Parcialmente nublado', 3: 'Nublado', 45: 'Neblina', 48: 'Neblina congelante', 51: 'Garoa leve', 53: 'Garoa moderada', 55: 'Garoa intensa', 61: 'Chuva leve', 63: 'Chuva moderada', 65: 'Chuva forte', 80: 'Pancadas leves', 81: 'Pancadas moderadas', 82: 'Pancadas fortes', 95: 'Trovoada' }
const WeatherIcon = ({ code, size = 24 }: { code: number; size?: number }) => code >= 95 ? <CloudRain size={size} /> : code >= 51 ? <CloudDrizzle size={size} /> : code === 0 ? <Sun size={size} /> : code <= 2 ? <CloudSun size={size} /> : <Cloud size={size} />
const formatTime = (value: string | number | undefined) => value ? new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '--'
const formatNumber = (value: string | number | undefined, suffix = '') => value === undefined || value === null ? '--' : `${Math.round(Number(value))}${suffix}`
const formatDay = (value: string) => new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(new Date(`${value}T12:00:00`)).replace('.', '')
const stateAbbreviations: Record<string, string> = {
  acre: 'AC', alagoas: 'AL', amapá: 'AP', amazonas: 'AM', bahia: 'BA', ceará: 'CE',
  'distrito federal': 'DF', 'espírito santo': 'ES', goiás: 'GO', maranhão: 'MA',
  'mato grosso': 'MT', 'mato grosso do sul': 'MS', 'minas gerais': 'MG', pará: 'PA',
  paraíba: 'PB', paraná: 'PR', pernambuco: 'PE', piauí: 'PI', 'rio de janeiro': 'RJ',
  'rio grande do norte': 'RN', 'rio grande do sul': 'RS', rondônia: 'RO', roraima: 'RR',
  'santa catarina': 'SC', 'são paulo': 'SP', sergipe: 'SE', tocantins: 'TO',
}
const getStateAbbreviation = (state: string) => stateAbbreviations[state.toLocaleLowerCase('pt-BR')] || state
const formatLocationLabel = (location: LocationInfo) => `${location.city}${location.state ? `, ${getStateAbbreviation(location.state)}` : ''}`
const normalizeCityKey = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9\s]/g, ' ')
  .toLowerCase()
  .replace(/\s+/g, ' ')
  .trim()

const buildCitySuggestion = (result: any): CitySuggestion | null => {
  const countryName = result.address?.country || result.country || ''
  if (countryName && !/brasil|brazil/i.test(countryName) && result.address?.country_code && result.address.country_code !== 'br') {
    return null
  }

  const city = result.address?.city || result.address?.town || result.address?.village || result.address?.municipality || result.name || ''
  const state = result.address?.state || result.address?.state_district || ''
  const country = result.address?.country || 'Brasil'

  if (!city) return null

  const label = `${city}${state ? `, ${getStateAbbreviation(state)}` : ''}`

  return {
    label,
    city,
    state,
    country,
    latitude: Number(result.lat || result.latitude),
    longitude: Number(result.lon || result.longitude),
    searchKey: normalizeCityKey(label),
  }
}

const fetchCitySuggestions = async (query: string): Promise<CitySuggestion[]> => {
  const trimmed = query.trim()
  if (!trimmed || trimmed.length < 2) return []

  const googleKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

  if (googleKey) {
    try {
      const googleResponse = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(trimmed)}&components=country:BR&language=pt-BR&key=${encodeURIComponent(googleKey)}`)
      if (googleResponse.ok) {
        const googleData = await googleResponse.json()
        if (googleData.status === 'OK' && Array.isArray(googleData.results)) {
          const mappedSuggestions = googleData.results
            .map((result: any) => {
              const address = result.address_components || []
              const city = address.find((part: any) => ['locality', 'administrative_area_level_2', 'administrative_area_level_3'].includes(part.types[0]))?.long_name || result.formatted_address?.split(',')[0] || ''
              const state = address.find((part: any) => part.types.includes('administrative_area_level_1'))?.long_name || ''
              const country = address.find((part: any) => part.types.includes('country'))?.long_name || 'Brasil'
              if (!city) return null
              return {
                label: `${city}${state ? `, ${getStateAbbreviation(state)}` : ''}`,
                city,
                state,
                country,
                latitude: result.geometry?.location?.lat ?? 0,
                longitude: result.geometry?.location?.lng ?? 0,
                searchKey: normalizeCityKey(`${city} ${state}`),
              }
            })
            .filter(Boolean) as CitySuggestion[]

          if (mappedSuggestions.length > 0) return mappedSuggestions.slice(0, 8)
        }
      }
    } catch {
      // fallback para o Nominatim quando a API do Google falhar ou não estiver disponível
    }
  }

  const nominatimResponse = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8&q=${encodeURIComponent(trimmed)}&accept-language=pt-BR&countrycodes=br&addressdetails=1`)
  if (!nominatimResponse.ok) return []

  const nominatimData = await nominatimResponse.json()
  if (!Array.isArray(nominatimData)) return []

  return nominatimData
    .map(buildCitySuggestion)
    .filter((item): item is CitySuggestion => Boolean(item))
    .filter((item) => item.searchKey.includes(normalizeCityKey(trimmed)) || normalizeCityKey(trimmed).includes(item.searchKey) || item.searchKey === normalizeCityKey(trimmed))
    .slice(0, 8)
}

function RecenterMap({ coordinates }: { coordinates: Coordinates }) {
  const map = useMap();
  useEffect(() => { map.setView([coordinates.latitude, coordinates.longitude]) }, [coordinates, map]);
  return null
}

type ExchangeQuote = { code: string; name: string; bid: string; ask: string; pctChange: string; create_date: string }
type ExchangeData = { USDBRL: ExchangeQuote; EURBRL: ExchangeQuote }

function CurrencyPanel() {
  const [quotes, setQuotes] = useState<ExchangeData | null>(null)
  const [error, setError] = useState(false)

  const loadQuotes = async () => {
    const cached = sessionStorage.getItem('hub-currency')
    if (cached) {
      try {
        const saved = JSON.parse(cached) as { timestamp: number; quotes: ExchangeData }
        if (Date.now() - saved.timestamp < CURRENCY_CACHE_TTL) {
          setQuotes(saved.quotes)
          setError(false)
          return
        }
      } catch {
        sessionStorage.removeItem('hub-currency')
      }
    }

    try {
      const response = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL')
      if (!response.ok) throw new Error('exchange')
      const nextQuotes = await response.json() as ExchangeData
      sessionStorage.setItem('hub-currency', JSON.stringify({ timestamp: Date.now(), quotes: nextQuotes }))
      setQuotes(nextQuotes)
      setError(false)
    } catch {
      setError(true)
    }
  }

  useEffect(() => {
    loadQuotes()
    const timer = window.setInterval(loadQuotes, 60000)
    return () => window.clearInterval(timer)
  }, [])

  const money = (value: string) => Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const quoteRows = quotes ? [{ code: 'BRL', label: 'Real brasileiro', value: 'R$ 1,00', change: '0,00%', time: '' }, { code: 'USD', label: 'Dólar americano', value: money(quotes.USDBRL.bid), change: `${Number(quotes.USDBRL.pctChange).toFixed(2).replace('.', ',')}%`, time: quotes.USDBRL.create_date }, { code: 'EUR', label: 'Euro', value: money(quotes.EURBRL.bid), change: `${Number(quotes.EURBRL.pctChange).toFixed(2).replace('.', ',')}%`, time: quotes.EURBRL.create_date }] : []

  return <section className="currency-panel"><div className="currency-heading"><div><span className="section-kicker">MERCADO EM TEMPO REAL</span><h3>Cotações</h3></div><span className="currency-live"><span className="live-dot" /> Atualiza a cada 1 min</span></div>{error && !quotes ? <div className="currency-error">Cotações temporariamente indisponíveis. Tentaremos novamente.</div> : <div className="currency-table"><div className="currency-table-head"><span>Ativo</span><span>Valor em BRL</span><span>Variação</span></div>{quoteRows.map((row) => <div className="currency-row" key={row.code}><span className="currency-name"><b>{row.code}</b><small>{row.label}</small></span><strong>{row.value}</strong><span className={row.change.startsWith('-') ? 'negative' : 'positive'}>{row.change}</span></div>)}</div>}{quotes && <small className="currency-updated">Compra de referência · última coleta: {new Date(quotes.USDBRL.create_date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</small>}</section>
}

type NewsItem = { title: string; link: string; pubDate: string; author?: string }
type NewsPanelProps = { location: LocationInfo | null; title: string; query: string; local?: boolean }
const NEWS_CACHE_TTL = 300000

function normalizeNewsItems(items: NewsItem[]) {
  const unique = new Map<string, NewsItem>()
  items.filter((item) => item.title && item.link).forEach((item) => {
    const key = item.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    if (!unique.has(key)) unique.set(key, item)
  })
  return [...unique.values()].sort((first, second) => new Date(second.pubDate).getTime() - new Date(first.pubDate).getTime()).slice(0, 8)
}

function NewsPanel({ location, title, query, local = false }: NewsPanelProps) {
  const [items, setItems] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  const smartQuery = query === 'noticias jogos games' ? 'noticias jogos games lancamentos Nintendo PlayStation Xbox PC' : query === 'noticias filmes cinema' ? 'noticias filmes cinema streaming Netflix trailers series' : query === 'noticias animes' ? 'noticias animes mangas lancamentos temporada Crunchyroll' : query === 'noticias mundo internacional global' ? 'noticias' : query === 'noticias' ? 'noticias prefeitura eventos transito cultura seguranca' : query

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    const locationQuery = local && location ? location.city : ''
    if (local && !location) return

    const searchQuery = local ? `${locationQuery} noticias` : `${smartQuery} when:7d`
    const cacheKey = `hub-news:${searchQuery}`

    const loadNews = async () => {
      const cached = sessionStorage.getItem(cacheKey)
      if (cached) {
        try {
          const saved = JSON.parse(cached) as { timestamp: number; items: NewsItem[] }
          if (Date.now() - saved.timestamp < NEWS_CACHE_TTL) {
            setItems(saved.items)
            setError(false)
            return
          }
        } catch {
          sessionStorage.removeItem(cacheKey)
        }
      }

      setLoading(true)
      try {
        const rss = encodeURIComponent(`https://news.google.com/rss/search?q=${encodeURIComponent(searchQuery)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`)
        const response = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${rss}`, { signal: controller.signal })
        if (!response.ok) throw new Error('news')
        const data = await response.json()
        const nextItems = normalizeNewsItems(data.items || [])
        if (!cancelled) {
          setItems(nextItems)
          setError(false)
          sessionStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), items: nextItems }))
        }
      } catch (error) {
        if (!cancelled && (error as Error).name !== 'AbortError') setError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    const schedule = window.setTimeout(loadNews, 700)
    const timer = window.setInterval(loadNews, NEWS_CACHE_TTL)
    return () => { cancelled = true; controller.abort(); window.clearTimeout(schedule); window.clearInterval(timer) }
  }, [location, smartQuery, local])

  const searchUrl = `https://news.google.com/search?q=${encodeURIComponent(local && location ? location.city : `${smartQuery} when:7d`)}&hl=pt-BR&gl=BR&ceid=BR%3Apt-419`

  return <section className="news-panel"><div className="news-heading"><div><span className="section-kicker">PORTAL DE NOTÍCIAS</span><h3>{title}</h3></div><a className="news-search" href={searchUrl} target="_blank" rel="noreferrer" onClick={(event) => { event.preventDefault(); openSecondaryWindow(searchUrl) }}><Newspaper size={15} /> Ver todas</a></div>{loading && !items.length ? <div className="news-empty">Buscando notícias...</div> : error && !items.length ? <div className="news-empty">Não foi possível atualizar as notícias agora.</div> : <div className="news-list">{items.map((item) => <a className="news-item" href={item.link} target="_blank" rel="noreferrer" onClick={(event) => { event.preventDefault(); openSecondaryWindow(item.link) }} key={item.link}><span><strong>{item.title}</strong><small>{item.author || 'Google News'} · {new Date(item.pubDate).toLocaleDateString('pt-BR')}</small></span><ExternalLink size={14} /></a>)}</div>}</section>
}

function Metric({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail?: string }) {
  return <><div className="metric"><span className="metric-icon">{icon}</span><span><small>{label}</small><strong>{value}</strong>{detail && <em>{detail}</em>}</span></div>{label === 'Nuvens' && <CurrencyPanel />}</>
}

function openRadarWindow(url: string) { window.open(url, '_blank', 'noopener,noreferrer,width=1280,height=900') }
function openSecondaryWindow(url: string) { const popup = window.open(url, '_blank', 'noopener,noreferrer,width=1280,height=900'); if (!popup) window.location.href = url }

function UsefulSites() {
  return <section className="useful-sites"><div className="useful-heading"><div><span className="section-kicker">ATALHOS RÁPIDOS</span><h2>Sites úteis</h2></div><span className="useful-count">{usefulSites.length} serviços</span></div><div className="useful-grid">{usefulSites.map((site) => <a className="useful-card" href={site.url} target="_blank" rel="noreferrer" onClick={(event) => { event.preventDefault(); openSecondaryWindow(site.url) }} key={site.url}><span><strong>{site.label}</strong><small>{site.description}</small></span><ExternalLink size={16} /></a>)}</div></section>
}

function normalizeVisibleEscapes(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  let node = walker.nextNode()
  while (node) { nodes.push(node as Text); node = walker.nextNode() }
  nodes.forEach((text) => {
    text.nodeValue = text.nodeValue?.replace(/\\u([0-9a-fA-F]{4})/g, (_, code: string) => String.fromCharCode(Number.parseInt(code, 16))) || ''
  })
}

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

function InstallApp() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null)

  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault()
      setPrompt(event as InstallPrompt)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  if (!prompt) return null

  return <button className="install-button" type="button" onClick={async () => { await prompt.prompt(); setPrompt(null) }}><Download size={15} /> Instalar app</button>
}

function LiveClock() {
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const timer = window.setInterval(() => setTime(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  return <div className="clock">{time.toLocaleTimeString('pt-BR')}</div>
}

async function resetSiteCache() {
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(registrations.map((registration) => registration.unregister()))
  }

  if ('caches' in window) {
    const cacheNames = await caches.keys()
    await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)))
  }

  localStorage.clear()
  sessionStorage.clear()
  window.location.reload()
}

function App() {
  const [now] = useState(new Date())
  const [currentLocation, setCurrentLocation] = useState<LocationInfo | null>(null)
  const [location, setLocation] = useState<LocationInfo | null>(null)
  const [locationError, setLocationError] = useState('')
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [weatherError, setWeatherError] = useState('')
  const [loadingWeather, setLoadingWeather] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [isCityModalOpen, setIsCityModalOpen] = useState(false)
  const [cityQuery, setCityQuery] = useState('')
  const [cityLookupError, setCityLookupError] = useState('')
  const [citySuggestions, setCitySuggestions] = useState<CitySuggestion[]>([])
  const [selectedCitySuggestion, setSelectedCitySuggestion] = useState<CitySuggestion | null>(null)

  useEffect(() => {
    const trimmed = cityQuery.trim()
    if (!trimmed || trimmed.length < 2) {
      setCitySuggestions([])
      return
    }

    const timeout = window.setTimeout(async () => {
      const suggestions = await fetchCitySuggestions(trimmed)
      setCitySuggestions(suggestions)
      if (!selectedCitySuggestion || selectedCitySuggestion.label.toLowerCase() !== trimmed.toLowerCase()) {
        setSelectedCitySuggestion(null)
      }
    }, 300)

    return () => window.clearTimeout(timeout)
  }, [cityQuery, selectedCitySuggestion])

  const loadCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('Seu navegador não oferece geolocalização.')
      return
    }

    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${coords.latitude}&lon=${coords.longitude}&accept-language=pt-BR`)
        const address = await response.json()
        const nextLocation = {
          latitude: coords.latitude,
          longitude: coords.longitude,
          city: address.address?.city || address.address?.town || address.address?.municipality || 'Localização atual',
          state: address.address?.state || '',
          country: address.address?.country || 'Brasil',
        }
        setCurrentLocation(nextLocation)
        setLocation(nextLocation)
        setLocationError('')
      } catch {
        const fallbackLocation = { latitude: coords.latitude, longitude: coords.longitude, city: 'Localização atual', state: '', country: '' }
        setCurrentLocation(fallbackLocation)
        setLocation(fallbackLocation)
      }
    }, () => {
      setLocationError('Não foi possível obter sua localização. Verifique as permissões do navegador.')
    })
  }

  const openLocationModal = () => {
    setCityQuery('')
    setCityLookupError('')
    setCitySuggestions([])
    setSelectedCitySuggestion(null)
    setIsCityModalOpen(true)
  }

  const chooseCitySuggestion = (suggestion: CitySuggestion) => {
    setSelectedCitySuggestion(suggestion)
    setCityQuery(suggestion.label)
    setCitySuggestions([])
    setCityLookupError('')
  }

  const searchCityWeather = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const query = cityQuery.trim()
    if (!query) {
      setCityLookupError('Digite o nome de uma cidade.')
      return
    }

    setCityLookupError('')

    const normalizedTarget = normalizeCityKey(query)

    if (selectedCitySuggestion) {
      const normalizedSelection = normalizeCityKey(selectedCitySuggestion.label)
      if (normalizedTarget !== normalizedSelection && !normalizedSelection.includes(normalizedTarget) && !normalizedTarget.includes(normalizedSelection)) {
        setCityLookupError('Cidade não encontrada no Brasil. Verifique o nome e tente novamente.')
        return
      }

      const nextLocation = {
        latitude: selectedCitySuggestion.latitude,
        longitude: selectedCitySuggestion.longitude,
        city: selectedCitySuggestion.city,
        state: selectedCitySuggestion.state,
        country: selectedCitySuggestion.country,
      }

      setLocation(nextLocation)
      setCityQuery('')
      setCitySuggestions([])
      setSelectedCitySuggestion(null)
      setIsCityModalOpen(false)
      return
    }

    try {
      const results = await fetchCitySuggestions(query)
      const match = results.find((suggestion) => {
        const normalizedSuggestion = normalizeCityKey(suggestion.label)
        const normalizedCity = normalizeCityKey(suggestion.city)
        return normalizedSuggestion === normalizedTarget || normalizedCity === normalizedTarget || normalizedSuggestion.includes(normalizedTarget) || normalizedTarget.includes(normalizedSuggestion)
      }) || results[0]

      if (!match) throw new Error('city-not-found')

      const nextLocation = {
        latitude: match.latitude,
        longitude: match.longitude,
        city: match.city,
        state: match.state,
        country: match.country,
      }

      setLocation(nextLocation)
      setCityQuery('')
      setCitySuggestions([])
      setSelectedCitySuggestion(null)
      setIsCityModalOpen(false)
    } catch {
      setCityLookupError('Cidade não encontrada no Brasil. Verifique o nome e tente novamente.')
    }
  }

  const backToCurrentLocation = () => {
    if (currentLocation) {
      setLocation(currentLocation)
      setCityLookupError('')
      return
    }
    loadCurrentLocation()
  }

  useEffect(() => { const root = document.querySelector<HTMLElement>('.app-shell'); if (root) normalizeVisibleEscapes(root) }, [])
  useEffect(() => { loadCurrentLocation() }, [])

  const loadWeather = async (coordinates: Coordinates) => {
    setLoadingWeather(true)
    setWeatherError('')
    try {
      const params = new URLSearchParams({
        latitude: String(coordinates.latitude),
        longitude: String(coordinates.longitude),
        timezone: 'auto',
        forecast_days: '6',
        current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,weather_code,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m,visibility,cloud_cover,uv_index',
        hourly: 'temperature_2m,precipitation_probability,weather_code',
        daily: 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset',
      })
      const cacheKey = `hub-weather:${coordinates.latitude.toFixed(3)}:${coordinates.longitude.toFixed(3)}`
      const cached = sessionStorage.getItem(cacheKey)
      if (cached) {
        const saved = JSON.parse(cached) as { timestamp: number; weather: WeatherData }
        if (Date.now() - saved.timestamp < WEATHER_CACHE_TTL) {
          setWeather(saved.weather)
          setLastUpdated(new Date(saved.timestamp))
          setLoadingWeather(false)
          return
        }
      }

      const response = await fetch(`${weatherUrl}?${params}`)
      if (!response.ok) throw new Error('weather')
      const nextWeather = await response.json() as WeatherData
      sessionStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), weather: nextWeather }))
      setWeather(nextWeather)
      setLastUpdated(new Date())
    } catch {
      setWeatherError('Não foi possível atualizar os dados meteorológicos. Tentaremos novamente automaticamente.')
    } finally {
      setLoadingWeather(false)
    }
  }

  useEffect(() => { if (location) loadWeather(location) }, [location])
  useEffect(() => {
    if (!location) return
    const timer = window.setInterval(() => loadWeather(location), Number(import.meta.env.VITE_WEATHER_UPDATE_INTERVAL || 300000))
    return () => window.clearInterval(timer)
  }, [location])

  const current = weather?.current
  const currentCode = Number(current?.weather_code || 0)
  const hourlyIndexes = useMemo(() => weather?.hourly.time.map((time, index) => ({ time, index })).filter(({ time }) => new Date(time) >= now).slice(0, 6) || [], [weather, now])
  const daily = weather?.daily.time.slice(0, 5) || []
  const dateText = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(now)
  const isUsingCustomLocation = currentLocation && location ? (Math.abs(location.latitude - currentLocation.latitude) > 0.01 || Math.abs(location.longitude - currentLocation.longitude) > 0.01) : false

  return (
    <main className="app-shell notranslate" translate="no">
      <header className="hero-header">
        <button className="cache-reset-button" type="button" title="Limpar cache e atualizar site" aria-label="Limpar cache e atualizar site" onClick={resetSiteCache}>
          <RefreshCw size={17} />
        </button>
        <div className="eyebrow"><span className="live-dot" /> PAINEL PESSOAL DE INFORMAÇÕES</div>
        <h1>Hub Principal</h1>
        <div className="date-line"><CalendarDays size={16} /> {dateText}</div>
        <LiveClock />
        <p className="timezone">Horário local do seu dispositivo</p>
        <InstallApp />
      </header>

      <section className="content-grid">
        <section className="panel weather-panel">
          <div className="section-heading">
            <div>
              <span className="section-kicker">CONDIÇÕES ATUAIS</span>
              <h2>Clima agora</h2>
            </div>
            <div className="weather-header-actions">
              <button className="location-button" type="button" onClick={openLocationModal}>ver clima em outro local</button>
              <button className="icon-button" title="Atualizar clima" onClick={() => location && loadWeather(location)} disabled={loadingWeather}>
                <RefreshCw size={17} className={loadingWeather ? 'spin' : ''} />
              </button>
            </div>
          </div>

          {location ? (
            <div className="location-line">
              <MapPin size={16} />
              <span>{formatLocationLabel(location)}</span>
              <span className="location-status"><LocateFixed size={13} /> {currentLocation && location && Math.abs(location.latitude - currentLocation.latitude) < 0.01 && Math.abs(location.longitude - currentLocation.longitude) < 0.01 ? 'GPS' : 'Local customizado'}</span>
            </div>
          ) : (
            <div className="notice"><LocateFixed size={16} /> {locationError || 'Solicitando sua localização...'}</div>
          )}

          {isUsingCustomLocation && (
            <button className="location-override-button" type="button" onClick={backToCurrentLocation}>volta para localização atual</button>
          )}

          {weatherError && <div className="notice error"><AlertCircle size={16} /> {weatherError}</div>}
          {loadingWeather && !weather && <div className="skeleton-block"><span /><span /><span /></div>}

          {weather && (
            <>
              <div className="current-weather">
                <div className="weather-symbol"><WeatherIcon code={currentCode} size={46} /></div>
                <div>
                  <div className="temperature">{formatNumber(current?.temperature_2m, '°')}<span>C</span></div>
                  <div className="condition">{weatherLabels[currentCode] || 'Condição atual'}</div>
                </div>
                <div className="feels">Sensação<br /><strong>{formatNumber(current?.apparent_temperature, '°')}C</strong></div>
              </div>

              <div className="metric-grid">
                <Metric icon={<Droplets />} label="Umidade" value={formatNumber(current?.relative_humidity_2m, '%')} />
                <Metric icon={<Wind />} label="Vento" value={formatNumber(current?.wind_speed_10m, ' km/h')} detail={`${formatNumber(current?.wind_direction_10m, '°')} direção`} />
                <Metric icon={<Gauge />} label="Pressão" value={formatNumber(current?.surface_pressure, ' hPa')} />
                <Metric icon={<Umbrella />} label="Chuva agora" value={formatNumber(current?.precipitation, ' mm')} />
                <Metric icon={<Eye />} label="Visibilidade" value={formatNumber(current?.visibility, ' m')} />
                <Metric icon={<Sunrise />} label="Nascer do sol" value={formatTime(weather?.daily.sunrise[0])} />
                <Metric icon={<Sunset />} label="Pôr do sol" value={formatTime(weather?.daily.sunset[0])} />
                <Metric icon={<Activity />} label="Nuvens" value={formatNumber(current?.cloud_cover, '%')} />
              </div>
            </>
          )}

          {!weather && !loadingWeather && !location && (
            <div className="notice"><AlertCircle size={16} /> Carregando condições climáticas...</div>
          )}
        </section>

        <section className="panel forecast-panel">
          <div className="section-heading">
            <div><span className="section-kicker">PRÓXIMAS HORAS</span><h2>Previsão resumida</h2></div>
            <Navigation size={18} className="muted-icon" />
          </div>

          <div className="hourly-list">
            {hourlyIndexes.map(({ time, index }) => (
              <div className="hour-item" key={time}>
                <span>{formatTime(time)}</span>
                <WeatherIcon code={weather?.hourly.weather_code[index] || 0} size={21} />
                <strong>{formatNumber(weather?.hourly.temperature_2m[index], '°')}</strong>
                <small>{weather?.hourly.precipitation_probability[index]}% chuva</small>
              </div>
            ))}
          </div>

          <div className="daily-list">
            {daily.map((day, index) => (
              <div className="day-item" key={day}>
                <span>{index === 0 ? 'Hoje' : index === 1 ? 'Amanhã' : formatDay(day)}</span>
                <WeatherIcon code={weather?.daily.weather_code[index] || 0} size={21} />
                <strong>{formatNumber(weather?.daily.temperature_2m_max[index], '°')} / {formatNumber(weather?.daily.temperature_2m_min[index], '°')}</strong>
              </div>
            ))}
          </div>
        </section>
      </section>

      <section className="panel radar-panel">
        <div className="section-heading">
          <div><span className="section-kicker">MONITORAMENTO AO VIVO</span><h2>Radar meteorológico</h2></div>
          <div className="source-badge"><span className="live-dot" /> IPMet / Unesp</div>
        </div>

        <p className="panel-intro">Acompanhe a animação oficial da chuva sobre o estado de São Paulo.</p>

        <div className="radar-layout">
          <div className="radar-frame">
            <div className="radar-unavailable">
              <div className="radar-status-icon"><AlertCircle size={27} /></div>
              <strong>Radar disponível no site oficial</strong>
              <span>O IPMet bloqueia incorporações dentro de outros sites.</span>
              <a href={radarPageUrl} target="_blank" rel="noreferrer">Abrir radar IPMet <span aria-hidden="true">&rarr;</span></a>
            </div>
            <div className="radar-overlay"><span><span className="live-dot" /> AO VIVO</span><a href={radarPageUrl} target="_blank" rel="noreferrer">Abrir no IPMet &rarr;</a></div>
          </div>

          <div className="map-frame">
            {location ? (
              <MapContainer center={[location.latitude, location.longitude]} zoom={7} scrollWheelZoom={true} className="map">
                <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <Marker position={[location.latitude, location.longitude]} icon={markerIcon} />
                <RecenterMap coordinates={location} />
              </MapContainer>
            ) : (
              <div className="map-placeholder"><Compass size={28} /><span>O mapa será centralizado<br />quando sua localização estiver disponível.</span></div>
            )}
            <div className="map-label"><MapPin size={13} /> Sua localização</div>
          </div>
        </div>

        <div className="radar-sources">
          {radarSources.map((source) => (
            <button className="radar-source-card" key={source.url} type="button" onClick={() => openRadarWindow(source.url)}>
              <span><strong>{source.label}</strong><small>{source.description}</small></span>
              <ExternalLink size={16} />
            </button>
          ))}
        </div>

        <div className="radar-footer"><span><RefreshCw size={14} /> Atualização automática a cada 5 min</span><span>Infos oficiais · IPMet / Unesp</span></div>
      </section>

      <div className="news-portals">
        <NewsPanel location={location} local title={location ? `Portal de noticias - ${location.city}` : 'Portal de noticias locais'} query="noticias" />
        <NewsPanel location={location} title="Portal de noticias Jogos" query="noticias jogos games" />
        <NewsPanel location={location} title="Portal de noticias Filmes" query="noticias filmes cinema" />
        <NewsPanel location={location} title="Portal de noticias Animes" query="noticias animes" />
        <NewsPanel location={location} title="Portal de noticias Globais" query="noticias mundo internacional global" />
      </div>

      <UsefulSites />

      <footer>
        <strong>Hub Principal</strong>
        <span>Dados meteorológicos fornecidos por serviços externos &middot; IPMet / Unesp</span>
        <span>Fuso: {Intl.DateTimeFormat().resolvedOptions().timeZone}{lastUpdated ? ` &middot; Clima atualizado às ${lastUpdated.toLocaleTimeString('pt-BR')}` : ''}</span>
      </footer>

      {isCityModalOpen && (
        <div className="location-modal-backdrop" onClick={() => setIsCityModalOpen(false)}>
          <div className="location-modal" onClick={(event) => event.stopPropagation()}>
            <div className="location-modal-header">
              <h3>Ver clima em outro local</h3>
              <button type="button" className="modal-close-button" onClick={() => setIsCityModalOpen(false)}>×</button>
            </div>
            <form onSubmit={searchCityWeather}>
              <label className="location-modal-label" htmlFor="city-search">Cidade</label>
              <input
                id="city-search"
                className="location-modal-input"
                type="text"
                value={cityQuery}
                onChange={(event) => {
                  setCityQuery(event.target.value)
                  setSelectedCitySuggestion(null)
                }}
                placeholder="Ex.: Santos, São Paulo, Rio de Janeiro"
                autoFocus
                list="city-suggestions"
              />
              {citySuggestions.length > 0 && (
                <div className="city-suggestions" role="listbox">
                  {citySuggestions.map((suggestion) => (
                    <button
                      key={`${suggestion.label}-${suggestion.latitude}-${suggestion.longitude}`}
                      type="button"
                      className="city-suggestion-item"
                      onClick={() => chooseCitySuggestion(suggestion)}
                    >
                      <MapPin size={14} />
                      <span>{suggestion.label}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="location-modal-actions">
                <button type="button" className="location-modal-secondary" onClick={() => setIsCityModalOpen(false)}>Cancelar</button>
                <button type="submit" className="location-modal-primary">Buscar clima</button>
              </div>
              {cityLookupError && <p className="location-modal-error">{cityLookupError}</p>}
            </form>
          </div>
        </div>
      )}
    </main>
  )
}

export default App
