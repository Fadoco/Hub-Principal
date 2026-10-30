import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent, type ReactNode } from 'react'
import { Activity, AlertCircle, CalendarDays, ChevronLeft, Cloud, CloudDrizzle, CloudRain, CloudSun, Download, Droplets, Eye, ExternalLink, Gauge, GripVertical, Home, LocateFixed, MapPin, Monitor, MoreHorizontal, Navigation, Newspaper, Plus, Radio, RefreshCw, RotateCcw, Settings2, Star, Sun, Sunrise, Sunset, Trash2, Umbrella, Wind, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import './App.css'
import { handleExternalLink } from './openExternalUrl'
import { setAndroidTvMode } from './androidTvMode'
import { readPersistentCache, writePersistentCache } from './persistentCache'
import {
  checkForAndroidUpdate,
  downloadAndroidUpdate,
  getInstalledAndroidAppVersion,
  installDownloadedAndroidUpdate,
  isAndroidApp,
  type AndroidUpdate,
} from './androidUpdate'

type Coordinates = { latitude: number; longitude: number }
type LocationInfo = Coordinates & { city: string; state: string; country: string }
type FavoriteLocationsState = { items: LocationInfo[]; error: string }
type CitySuggestion = {
  label: string
  city: string
  state: string
  country: string
  latitude: number
  longitude: number
  searchKey: string
}
type WeatherData = { current: Record<string, number | string>; hourly: { time: string[]; temperature_2m: number[]; precipitation: number[]; precipitation_probability: number[]; weather_code: number[] }; daily: { time: string[]; weather_code: number[]; precipitation_probability_max: number[]; temperature_2m_max: number[]; temperature_2m_min: number[]; sunrise: string[]; sunset: string[] } }
type WeatherCache = { weather: WeatherData }
type PersonalSite = { name: string; url: string }
type WeatherMetricId = 'humidity' | 'wind' | 'pressure' | 'precipitation' | 'visibility' | 'sunrise' | 'sunset' | 'uv' | 'clouds'
type NewsCategoryId = 'local' | 'games' | 'films' | 'anime' | 'geek' | 'global'
type MobileTheme = 'original' | 'dark' | 'light'
type MobilePreferences = {
  rainAlerts: boolean
  visibleMetrics: WeatherMetricId[]
  metricOrder: WeatherMetricId[]
  newsCategories: NewsCategoryId[]
  textSize: 'normal' | 'large'
  theme: MobileTheme
}
const weatherUrl = import.meta.env.VITE_WEATHER_API_URL || 'https://api.open-meteo.com/v1/forecast'
const WEATHER_CACHE_TTL = 180000
const WEATHER_OFFLINE_CACHE_TTL = 24 * 60 * 60 * 1000
const CurrencyPanel = lazy(() => import('./CurrencyPanel'))
const NewsPanel = lazy(() => import('./NewsPanel'))
const SatellitePanel = lazy(() => import('./SatellitePanel'))
const FAVORITE_LOCATIONS_KEY = 'hub-favorite-locations'
const PERSONAL_SITES_KEY = 'hub-personal-sites'
const MOBILE_PREFERENCES_KEY = 'hub-mobile-preferences'
const weatherMetricOptions: Array<{ id: WeatherMetricId; label: string }> = [
  { id: 'humidity', label: 'Umidade' },
  { id: 'wind', label: 'Vento' },
  { id: 'pressure', label: 'Pressão' },
  { id: 'precipitation', label: 'Chuva agora' },
  { id: 'visibility', label: 'Visibilidade' },
  { id: 'sunrise', label: 'Nascer do sol' },
  { id: 'sunset', label: 'Pôr do sol' },
  { id: 'uv', label: 'Índice UV' },
  { id: 'clouds', label: 'Nuvens' },
]
const defaultMetricOrder = weatherMetricOptions.map(({ id }) => id)
const newsCategoryOptions: Array<{ id: NewsCategoryId; label: string }> = [
  { id: 'local', label: 'Notícias locais' },
  { id: 'games', label: 'Jogos' },
  { id: 'films', label: 'Filmes e cinema' },
  { id: 'anime', label: 'Animes' },
  { id: 'geek', label: 'Cultura geek' },
  { id: 'global', label: 'Notícias globais' },
]
const defaultMobilePreferences: MobilePreferences = {
  rainAlerts: true,
  visibleMetrics: defaultMetricOrder.slice(0, 4),
  metricOrder: defaultMetricOrder,
  newsCategories: newsCategoryOptions.map(({ id }) => id),
  textSize: 'normal',
  theme: 'original',
}
const radarSources = [
  { label: 'Satélite meteorológico', description: 'Imagens e animação de satélite', url: 'https://www.ipmetradar.com.br/2satelite.php' },
  { label: 'Radar animado PPI', description: 'Animação das últimas imagens do radar', url: 'https://www.ipmetradar.com.br/2animRadar.php' },
  { label: 'Radar GIS Local', description: 'Radar GIS e cidades', url: 'https://www.ipmetradar.com.br/2mobileGis.php' },
  { label: 'Radar GIS satélite', description: 'Mapa GIS com imagens de satélite', url: 'https://www.ipmetradar.com.br/2satGis.php' },
]
const newsSearchQueries = {
  games: ['jogos games', 'games lançamentos', 'notícias jogos'],
  films: ['filmes cinema', 'notícias de cinema', 'filmes lançamento'],
  anime: ['anime', 'animes notícias', 'anime lançamentos'],
  geek: ['notícias geek', 'cultura pop geek', 'notícias nerd', 'cultura nerd'],
  global: ['notícias mundo', 'notícias internacionais', 'notícias globais', 'notícias mundiais', 'mundo notícias', 'notícias exterior'],
}
const mobileTabs = [
  { id: 'home', label: 'Início', icon: Home },
  { id: 'satellite', label: 'Satélite', icon: Radio },
  { id: 'news', label: 'Notícias', icon: Newspaper },
  { id: 'more', label: 'Mais', icon: MoreHorizontal },
] as const
const weatherLabels: Record<number, string> = { 0: 'Céu limpo', 1: 'Predominantemente limpo', 2: 'Parcialmente nublado', 3: 'Nublado', 45: 'Neblina', 48: 'Neblina congelante', 51: 'Garoa leve', 53: 'Garoa moderada', 55: 'Garoa intensa', 61: 'Chuva leve', 63: 'Chuva moderada', 65: 'Chuva forte', 80: 'Pancadas leves', 81: 'Pancadas moderadas', 82: 'Pancadas fortes', 95: 'Trovoada' }
const WeatherIcon = ({ code, size = 24 }: { code: number; size?: number }) => code >= 95 ? <CloudRain size={size} /> : code >= 51 ? <CloudDrizzle size={size} /> : code === 0 ? <Sun size={size} /> : code <= 2 ? <CloudSun size={size} /> : <Cloud size={size} />
const formatTime = (value: string | number | undefined) => value ? new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '--'
const formatNumber = (value: string | number | undefined, suffix = '') => value === undefined || value === null ? '--' : `${Math.round(Number(value))}${suffix}`
const formatDay = (value: string) => new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(new Date(`${value}T12:00:00`)).replace('.', '')
const getLocationKey = (value: Coordinates) => `${value.latitude.toFixed(3)}:${value.longitude.toFixed(3)}`
const isLocationInfo = (value: unknown): value is LocationInfo => {
  if (!value || typeof value !== 'object') return false
  const location = value as Partial<LocationInfo>
  return typeof location.latitude === 'number' && typeof location.longitude === 'number' &&
    typeof location.city === 'string' && typeof location.state === 'string' && typeof location.country === 'string'
}
const isWeatherData = (value: unknown): value is WeatherData => {
  if (!value || typeof value !== 'object') return false
  const weather = value as Partial<WeatherData>
  return Boolean(weather.current && typeof weather.current === 'object'
    && weather.hourly && Array.isArray(weather.hourly.time)
    && weather.daily && Array.isArray(weather.daily.time))
}
const readFavoriteLocations = (): FavoriteLocationsState => {
  try {
    const saved = localStorage.getItem(FAVORITE_LOCATIONS_KEY)
    if (!saved) return { items: [], error: '' }
    const parsed: unknown = JSON.parse(saved)
    if (!Array.isArray(parsed) || !parsed.every(isLocationInfo)) throw new Error('invalid-favorites')
    return { items: parsed, error: '' }
  } catch {
    return { items: [], error: 'Não foi possível carregar as cidades favoritas salvas neste navegador.' }
  }
}
const readMobilePreferences = () => {
  try {
    const saved = localStorage.getItem(MOBILE_PREFERENCES_KEY)
    if (!saved) return { value: defaultMobilePreferences, error: '' }
    const parsed: unknown = JSON.parse(saved)
    if (!parsed || typeof parsed !== 'object') throw new Error('invalid-mobile-preferences')
    const value = parsed as Partial<MobilePreferences> & { highContrast?: boolean }
    const validMetrics = (items: unknown): items is WeatherMetricId[] =>
      Array.isArray(items) && items.every((id) => defaultMetricOrder.includes(id))
    const validCategories = (items: unknown): items is NewsCategoryId[] =>
      Array.isArray(items) && items.every((id) => newsCategoryOptions.some((category) => category.id === id))
    const metricOrder = validMetrics(value.metricOrder)
      ? [...new Set(value.metricOrder), ...defaultMetricOrder.filter((id) => !value.metricOrder?.includes(id))]
      : defaultMetricOrder
    const visibleMetrics = validMetrics(value.visibleMetrics)
      ? [...new Set(value.visibleMetrics)]
      : defaultMobilePreferences.visibleMetrics
    const newsCategories = validCategories(value.newsCategories)
      ? [...new Set(value.newsCategories)]
      : defaultMobilePreferences.newsCategories
    return {
      value: {
        rainAlerts: typeof value.rainAlerts === 'boolean' ? value.rainAlerts : defaultMobilePreferences.rainAlerts,
        visibleMetrics,
        metricOrder,
        newsCategories,
        textSize: value.textSize === 'large' ? 'large' : 'normal',
        theme: value.theme === 'dark' || value.theme === 'light'
          ? value.theme
          : value.highContrast === true ? 'dark' : 'original',
      },
      error: '',
    }
  } catch {
    return { value: defaultMobilePreferences, error: 'Não foi possível carregar as preferências salvas.' }
  }
}
const getUvGuidance = (uvIndex: number | undefined) => {
  if (uvIndex === undefined || !Number.isFinite(uvIndex)) return null
  if (uvIndex <= 2) return { level: 'Baixo', advice: 'Proteção geralmente não necessária', tone: 'low' }
  if (uvIndex <= 5) return { level: 'Moderado', advice: 'Use proteção se ficar ao sol', tone: 'moderate' }
  if (uvIndex <= 7) return { level: 'Alto', advice: 'Protetor, chapéu e sombra', tone: 'high' }
  if (uvIndex <= 10) return { level: 'Muito alto', advice: 'Evite o sol entre 10h e 16h', tone: 'very-high' }
  return { level: 'Extremo', advice: 'Evite exposição direta ao sol', tone: 'extreme' }
}
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
const uniqueCitySuggestions = (suggestions: CitySuggestion[]) => {
  const unique = new Map<string, CitySuggestion>()
  suggestions.forEach((suggestion) => {
    const key = `${suggestion.searchKey}:${suggestion.latitude}:${suggestion.longitude}`
    if (!unique.has(key)) unique.set(key, suggestion)
  })
  return [...unique.values()]
}

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

const fetchCitySuggestions = async (query: string, signal?: AbortSignal): Promise<CitySuggestion[]> => {
  const trimmed = query.trim()
  if (!trimmed || trimmed.length < 2) return []

  const googleKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

  if (googleKey) {
    try {
      const googleResponse = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(trimmed)}&components=country:BR&language=pt-BR&key=${encodeURIComponent(googleKey)}`, { signal })
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

          const uniqueSuggestions = uniqueCitySuggestions(mappedSuggestions)
          if (uniqueSuggestions.length > 0) return uniqueSuggestions.slice(0, 8)
        }
      }
    } catch {
      if (signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError')
      // fallback para o Nominatim quando a API do Google falhar ou não estiver disponível
    }
  }

  const nominatimResponse = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8&q=${encodeURIComponent(trimmed)}&accept-language=pt-BR&countrycodes=br&addressdetails=1`, { signal })
  if (!nominatimResponse.ok) return []

  const nominatimData = await nominatimResponse.json()
  if (!Array.isArray(nominatimData)) return []

  const suggestions = nominatimData
    .map(buildCitySuggestion)
    .filter((item): item is CitySuggestion => Boolean(item))
    .filter((item) => item.searchKey.includes(normalizeCityKey(trimmed)) || normalizeCityKey(trimmed).includes(item.searchKey) || item.searchKey === normalizeCityKey(trimmed))
  return uniqueCitySuggestions(suggestions)
    .slice(0, 8)
}

function Metric({ icon, label, value, detail, tone }: { icon: ReactNode; label: string; value: string; detail?: string; tone?: string }) {
  return <div className={`metric${tone ? ` metric-${tone}` : ''}`}><span className="metric-icon">{icon}</span><span><small>{label}</small><strong>{value}</strong>{detail && <em>{detail}</em>}</span></div>
}

function readPersonalSites() {
  try {
    const saved = localStorage.getItem(PERSONAL_SITES_KEY)
    if (!saved) return { items: [] as PersonalSite[], error: '' }
    const parsed: unknown = JSON.parse(saved)
    if (!Array.isArray(parsed) || !parsed.every(isPersonalSite)) {
      throw new Error('invalid-personal-sites')
    }
    return { items: parsed, error: '' }
  } catch {
    return { items: [] as PersonalSite[], error: 'Não foi possível carregar seus sites salvos neste aplicativo.' }
  }
}

function isPersonalSite(value: unknown): value is PersonalSite {
  if (!value || typeof value !== 'object') return false
  const site = value as Partial<PersonalSite>
  if (typeof site.name !== 'string' || typeof site.url !== 'string') return false
  try {
    const url = new URL(site.url)
    return site.name.trim().length > 0 &&
      ['http:', 'https:'].includes(url.protocol) &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password
  } catch {
    return false
  }
}

function PersonalSites() {
  const [saved, setSaved] = useState(readPersonalSites)
  const [isAddingSite, setIsAddingSite] = useState(false)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [formError, setFormError] = useState('')

  const saveSites = (items: PersonalSite[]) => {
    try {
      localStorage.setItem(PERSONAL_SITES_KEY, JSON.stringify(items))
      setSaved({ items, error: '' })
      return true
    } catch {
      setSaved((current) => ({ ...current, error: 'Não foi possível salvar. Verifique o espaço disponível no aplicativo.' }))
      return false
    }
  }

  const addSite = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const siteName = name.trim()
    const inputAddress = address.trim()
    if (!siteName || !inputAddress) {
      setFormError('Preencha o nome e o endereço do site.')
      return
    }
    if (siteName.length > 50) {
      setFormError('O nome deve ter até 50 caracteres.')
      return
    }

    let url: URL
    try {
      url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(inputAddress) ? inputAddress : `https://${inputAddress}`)
    } catch {
      setFormError('Digite um endereço válido, como exemplo.com.')
      return
    }
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) {
      setFormError('Use um endereço de site válido começando com http:// ou https://.')
      return
    }
    if (saved.items.some((site) => site.url === url.toString())) {
      setFormError('Esse site já está na sua lista.')
      return
    }

    const items = [...saved.items, { name: siteName, url: url.toString() }]
    if (!saveSites(items)) return
    setName('')
    setAddress('')
    setFormError('')
    setIsAddingSite(false)
  }

  const removeSite = (siteToRemove: PersonalSite) => {
    saveSites(saved.items.filter((site) => site !== siteToRemove))
  }

  return (
    <section className="useful-sites personal-sites">
      <div className="useful-heading">
        <div><span className="section-kicker">ATALHOS RÁPIDOS</span><h2>Meus sites</h2></div>
        <span className="useful-count">{saved.items.length} {saved.items.length === 1 ? 'site' : 'sites'}</span>
      </div>
      {saved.error && <p className="personal-sites-error" role="alert">{saved.error}</p>}
      {saved.items.length === 0 && !isAddingSite && (
        <div className="personal-sites-empty">
          <ExternalLink size={22} />
          <p>Adicione aqui os sites que você mais usa.</p>
        </div>
      )}
      {saved.items.length > 0 && (
        <div className="useful-grid">
          {saved.items.map((site) => (
            <div className="personal-site-row" key={`${site.name}:${site.url}`}>
              <a className="useful-card" href={site.url} target="_blank" rel="noopener noreferrer" onClick={(event) => handleExternalLink(event, site.url)}>
                <span><strong>{site.name}</strong><small>{site.url.replace(/^https?:\/\//, '')}</small></span>
                <ExternalLink size={16} />
              </a>
              <button
                className="personal-site-remove"
                type="button"
                onClick={() => removeSite(site)}
                aria-label={`Remover ${site.name}`}
                title={`Remover ${site.name}`}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
      {isAddingSite && (
        <form className="personal-site-form" onSubmit={addSite}>
          <label className="location-modal-label" htmlFor="personal-site-name">Nome</label>
          <input
            id="personal-site-name"
            className="location-modal-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ex.: Meu banco"
            maxLength={50}
            required
          />
          <label className="location-modal-label" htmlFor="personal-site-url">Link do site</label>
          <input
            id="personal-site-url"
            className="location-modal-input"
            type="text"
            inputMode="url"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="https://exemplo.com"
            maxLength={2048}
            required
          />
          {formError && <p className="personal-sites-error" role="alert">{formError}</p>}
          <div className="personal-site-form-actions">
            <button type="button" className="location-modal-secondary" onClick={() => { setIsAddingSite(false); setFormError('') }}>Cancelar</button>
            <button type="submit" className="location-modal-primary">Salvar site</button>
          </div>
        </form>
      )}
      {!isAddingSite && (
        <button className="personal-site-add" type="button" onClick={() => setIsAddingSite(true)}>
          <Plus size={18} />
          Adicionar site
        </button>
      )}
    </section>
  )
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

function App() {
  const isAndroidPreview = import.meta.env.DEV && new URLSearchParams(window.location.search).get('androidPreview') === '1'
  const previewLocation: LocationInfo | null = isAndroidPreview
    ? { latitude: -23.55, longitude: -46.63, city: 'São Paulo', state: 'São Paulo', country: 'Brasil' }
    : null
  const previewTab = isAndroidPreview
    ? mobileTabs.find(({ id }) => id === new URLSearchParams(window.location.search).get('androidPreviewTab'))?.id
    : undefined
  const [now, setNow] = useState(new Date())
  const [activeMobileTab, setActiveMobileTab] = useState<(typeof mobileTabs)[number]['id']>(previewTab || 'home')
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)
  const [isPullRefreshing, setIsPullRefreshing] = useState(false)
  const pullStartY = useRef<number | null>(null)
  const [currentLocation, setCurrentLocation] = useState<LocationInfo | null>(previewLocation)
  const [location, setLocation] = useState<LocationInfo | null>(previewLocation)
  const [locationError, setLocationError] = useState('')
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [weatherError, setWeatherError] = useState('')
  const [isWeatherOfflineCache, setIsWeatherOfflineCache] = useState(false)
  const [loadingWeather, setLoadingWeather] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [isResettingSite, setIsResettingSite] = useState(false)
  const [siteResetError, setSiteResetError] = useState('')
  const [favoriteLocations, setFavoriteLocations] = useState<FavoriteLocationsState>(readFavoriteLocations)
  const [mobilePreferenceState, setMobilePreferenceState] = useState(readMobilePreferences)
  const [draggedMetric, setDraggedMetric] = useState<WeatherMetricId | null>(null)
  const mobilePreferencesRef = useRef(mobilePreferenceState.value)
  const [isCityModalOpen, setIsCityModalOpen] = useState(false)
  const [isPersonalizationOpen, setIsPersonalizationOpen] = useState(false)
  const [isTvMode, setIsTvMode] = useState(false)
  const [tvModeError, setTvModeError] = useState('')
  const [cityQuery, setCityQuery] = useState('')
  const [cityLookupError, setCityLookupError] = useState('')
  const [citySuggestions, setCitySuggestions] = useState<CitySuggestion[]>([])
  const [selectedCitySuggestion, setSelectedCitySuggestion] = useState<CitySuggestion | null>(null)
  const [androidUpdate, setAndroidUpdate] = useState<AndroidUpdate | null>(null)
  const [installedAndroidAppVersion, setInstalledAndroidAppVersion] = useState(isAndroidPreview ? 'Prévia local' : '')
  const [androidUpdateError, setAndroidUpdateError] = useState('')
  const [androidUpdateStatus, setAndroidUpdateStatus] = useState('')
  const [isCheckingAndroidUpdate, setIsCheckingAndroidUpdate] = useState(isAndroidApp())
  const [isDownloadingAndroidUpdate, setIsDownloadingAndroidUpdate] = useState(false)
  const [hasDownloadedAndroidUpdate, setHasDownloadedAndroidUpdate] = useState(false)
  const [isUpdatePromptOpen, setIsUpdatePromptOpen] = useState(false)
  const dismissedUpdateVersion = useRef<string | null>(null)
  const isAndroidApplication = isAndroidApp() || isAndroidPreview
  const mobilePreferences = mobilePreferenceState.value
  const syncMobileHeaderCompact = useCallback((header: HTMLElement | null) => {
    if (!header) return
    const scrollContainer = header.closest('.android-app')
    if (scrollContainer) header.classList.toggle('is-compact', scrollContainer.scrollTop > 32)
  }, [])
  const localNewsCity = location?.city === 'Localização atual' ? null : location?.city || null
  const isCurrentLocationFavorite = Boolean(location && favoriteLocations.items.some((favorite) => getLocationKey(favorite) === getLocationKey(location)))
  const isNewsCategoryVisible = (category: NewsCategoryId) =>
    !isAndroidApplication || mobilePreferences.newsCategories.includes(category)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const updateOnlineStatus = () => setIsOnline(navigator.onLine)
    window.addEventListener('online', updateOnlineStatus)
    window.addEventListener('offline', updateOnlineStatus)
    return () => {
      window.removeEventListener('online', updateOnlineStatus)
      window.removeEventListener('offline', updateOnlineStatus)
    }
  }, [])

  useEffect(() => {
    document.body.classList.toggle('tv-mode-active', isTvMode)
    return () => document.body.classList.remove('tv-mode-active')
  }, [isTvMode])

  useEffect(() => {
    document.documentElement.classList.toggle('android-app-active', isAndroidApplication)
    return () => document.documentElement.classList.remove('android-app-active')
  }, [isAndroidApplication])

  const resetSiteData = async () => {
    if (!window.confirm('Isso apagará os dados salvos, incluindo cidades favoritas, e atualizará o site. Deseja continuar?')) return

    setIsResettingSite(true)
    setSiteResetError('')
    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations()
        const unregistered = await Promise.all(registrations.map((registration) => registration.unregister()))
        if (unregistered.some((success) => !success)) throw new Error('service-worker-unregister')
      }

      if ('caches' in window) {
        const cacheNames = await caches.keys()
        await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)))
      }

      localStorage.clear()
      sessionStorage.clear()

      const refreshUrl = new URL(window.location.href)
      refreshUrl.searchParams.set('_refresh', String(Date.now()))
      window.location.replace(refreshUrl.toString())
    } catch {
      setIsResettingSite(false)
      setSiteResetError('Não foi possível limpar os dados e atualizar o site. Verifique as permissões do navegador e tente novamente.')
    }
  }

  const updateFavoriteLocations = (items: LocationInfo[]) => {
    try {
      localStorage.setItem(FAVORITE_LOCATIONS_KEY, JSON.stringify(items))
      setFavoriteLocations({ items, error: '' })
    } catch {
      setFavoriteLocations({ items, error: 'Não foi possível salvar as favoritas no navegador. Elas ficarão disponíveis somente até fechar esta página.' })
    }
  }

  const updateMobilePreferences = useCallback((update: Partial<MobilePreferences>) => {
    const next = { ...mobilePreferencesRef.current, ...update }
    try {
      localStorage.setItem(MOBILE_PREFERENCES_KEY, JSON.stringify(next))
      mobilePreferencesRef.current = next
      setMobilePreferenceState({ value: next, error: '' })
    } catch {
      setMobilePreferenceState((current) => ({ ...current, error: 'Não foi possível salvar as preferências neste aplicativo.' }))
    }
  }, [])

  useEffect(() => {
    if (!draggedMetric) return

    const appShell = document.querySelector<HTMLElement>('.android-app')
    let pointerY: number | null = null
    const reorderAt = (clientY: number) => {
      const currentOrder = mobilePreferencesRef.current.metricOrder
      const draggedIndex = currentOrder.indexOf(draggedMetric)
      if (draggedIndex < 0) return

      const previousMetric = currentOrder[draggedIndex - 1]
      if (previousMetric) {
        const previousRow = document.querySelector<HTMLElement>(`.preference-order-row[data-metric-id="${previousMetric}"]`)
        const previousBounds = previousRow?.getBoundingClientRect()
        if (previousBounds && clientY < previousBounds.top + previousBounds.height / 2 - 8) {
          const nextOrder = [...currentOrder]
          ;[nextOrder[draggedIndex - 1], nextOrder[draggedIndex]] = [nextOrder[draggedIndex], nextOrder[draggedIndex - 1]]
          updateMobilePreferences({ metricOrder: nextOrder })
          return
        }
      }

      const nextMetric = currentOrder[draggedIndex + 1]
      if (nextMetric) {
        const nextRow = document.querySelector<HTMLElement>(`.preference-order-row[data-metric-id="${nextMetric}"]`)
        const nextBounds = nextRow?.getBoundingClientRect()
        if (nextBounds && clientY > nextBounds.top + nextBounds.height / 2 + 8) {
          const nextOrder = [...currentOrder]
          ;[nextOrder[draggedIndex], nextOrder[draggedIndex + 1]] = [nextOrder[draggedIndex + 1], nextOrder[draggedIndex]]
          updateMobilePreferences({ metricOrder: nextOrder })
        }
      }
    }

    const finishDragging = () => setDraggedMetric(null)
    const onPointerMove = (event: globalThis.PointerEvent) => {
      pointerY = event.clientY
      reorderAt(pointerY)
    }
    const autoScrollTimer = window.setInterval(() => {
      if (!appShell || pointerY === null || appShell.scrollHeight <= appShell.clientHeight) return
      const bounds = appShell.getBoundingClientRect()
      if (pointerY < bounds.top + 160) appShell.scrollTop -= 14
      else if (pointerY > bounds.bottom - 90) appShell.scrollTop += 14
      else return
      reorderAt(pointerY)
    }, 50)

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', finishDragging)
    window.addEventListener('pointercancel', finishDragging)
    return () => {
      window.clearInterval(autoScrollTimer)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', finishDragging)
      window.removeEventListener('pointercancel', finishDragging)
    }
  }, [draggedMetric, updateMobilePreferences])
  const resetMobilePreferences = () => {
    const defaults: MobilePreferences = {
      ...defaultMobilePreferences,
      visibleMetrics: [...defaultMobilePreferences.visibleMetrics],
      metricOrder: [...defaultMobilePreferences.metricOrder],
      newsCategories: [...defaultMobilePreferences.newsCategories],
    }
    try {
      localStorage.setItem(MOBILE_PREFERENCES_KEY, JSON.stringify(defaults))
      mobilePreferencesRef.current = defaults
      setMobilePreferenceState({ value: defaults, error: '' })
    } catch {
      setMobilePreferenceState((current) => ({ ...current, error: 'Não foi possível restaurar as personalizações neste aplicativo.' }))
    }
  }

  const toggleWeatherMetric = (metric: WeatherMetricId) => {
    const visibleMetrics = mobilePreferences.visibleMetrics.includes(metric)
      ? mobilePreferences.visibleMetrics.filter((item) => item !== metric)
      : [...mobilePreferences.visibleMetrics, metric]
    updateMobilePreferences({ visibleMetrics })
  }

  const startDraggingWeatherMetric = (metric: WeatherMetricId, event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || !event.isPrimary) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    setDraggedMetric(metric)
  }

  const toggleNewsCategory = (category: NewsCategoryId) => {
    const newsCategories = mobilePreferences.newsCategories.includes(category)
      ? mobilePreferences.newsCategories.filter((item) => item !== category)
      : [...mobilePreferences.newsCategories, category]
    updateMobilePreferences({ newsCategories })
  }

  const toggleCurrentLocationFavorite = () => {
    if (!location) return
    const locationKey = getLocationKey(location)
    const nextFavorites = isCurrentLocationFavorite
      ? favoriteLocations.items.filter((favorite) => getLocationKey(favorite) !== locationKey)
      : [...favoriteLocations.items, location]
    updateFavoriteLocations(nextFavorites)
  }

  const selectFavoriteLocation = (favorite: LocationInfo) => {
    setLocation(favorite)
    setIsCityModalOpen(false)
    setCityLookupError('')
  }

  const removeFavoriteLocation = (favorite: LocationInfo) => {
    const locationKey = getLocationKey(favorite)
    updateFavoriteLocations(favoriteLocations.items.filter((item) => getLocationKey(item) !== locationKey))
  }

  useEffect(() => {
    const trimmed = cityQuery.trim()
    if (selectedCitySuggestion && normalizeCityKey(selectedCitySuggestion.label) === normalizeCityKey(trimmed)) {
      setCitySuggestions([])
      return
    }
    if (!trimmed || trimmed.length < 2) {
      setCitySuggestions([])
      return
    }

    const controller = new AbortController()
    const timeout = window.setTimeout(async () => {
      try {
        const suggestions = await fetchCitySuggestions(trimmed, controller.signal)
        if (controller.signal.aborted) return
        setCitySuggestions(suggestions)
        setSelectedCitySuggestion(null)
        setCityLookupError('')
      } catch (error) {
        if (controller.signal.aborted) return
        console.error('Não foi possível buscar sugestões de cidades.', error)
        setCitySuggestions([])
        setCityLookupError('Não foi possível buscar cidades agora. Verifique a conexão e tente novamente.')
      }
    }, 300)

    return () => {
      window.clearTimeout(timeout)
      controller.abort()
    }
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
  useEffect(() => {
    if (!(import.meta.env.DEV && new URLSearchParams(window.location.search).get('androidPreview') === '1')) {
      void loadCurrentLocation()
    }
  }, [])
  useEffect(() => {
    if (!isAndroidApp()) return

    let disposed = false
    void getInstalledAndroidAppVersion()
      .then((version) => {
        if (!disposed) setInstalledAndroidAppVersion(version)
      })
      .catch(() => {
        if (!disposed) setInstalledAndroidAppVersion('indisponível')
      })

    return () => {
      disposed = true
    }
  }, [])

  useEffect(() => {
    if (!isAndroidApp()) return

    let lastCheck = 0
    let disposed = false
    const checkForUpdate = async (force = false) => {
      if (!force && Date.now() - lastCheck < 6 * 60 * 60 * 1000) return
      lastCheck = Date.now()

      try {
        const update = await checkForAndroidUpdate()
        if (disposed) return
        setAndroidUpdateError('')
        setAndroidUpdate(update)
        setHasDownloadedAndroidUpdate(false)
        setAndroidUpdateStatus('')
        setIsUpdatePromptOpen(Boolean(update && dismissedUpdateVersion.current !== update.version))
      } catch (error) {
        if (disposed) return
        setAndroidUpdateError(error instanceof Error ? error.message : 'Não foi possível verificar atualizações.')
      } finally {
        if (!disposed) {
          setIsCheckingAndroidUpdate(false)
          setIsDownloadingAndroidUpdate(false)
        }
      }
    }

    void checkForUpdate(true)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void checkForUpdate()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      disposed = true
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  const checkAndroidUpdateManually = () => {
    setAndroidUpdateStatus('')
    setAndroidUpdateError('')
    setIsCheckingAndroidUpdate(true)
    void checkForAndroidUpdate()
      .then((update) => {
        setAndroidUpdate(update)
        setHasDownloadedAndroidUpdate(false)
        setAndroidUpdateStatus('')
        setIsUpdatePromptOpen(Boolean(update))
        return undefined
      })
      .catch((error: unknown) => {
        setAndroidUpdateError(error instanceof Error ? error.message : 'Não foi possível verificar atualizações.')
      })
      .finally(() => {
        setIsCheckingAndroidUpdate(false)
        setIsDownloadingAndroidUpdate(false)
      })
  }

  const installAndroidUpdate = async () => {
    setAndroidUpdateError('')
    setAndroidUpdateStatus('')
    try {
      if (!hasDownloadedAndroidUpdate) {
        if (!androidUpdate) return
        setIsDownloadingAndroidUpdate(true)
        await downloadAndroidUpdate(androidUpdate)
        setHasDownloadedAndroidUpdate(true)
      }

      const result = await installDownloadedAndroidUpdate()
      if (result.status === 'permission_required') {
        setAndroidUpdateStatus('Permita que o Hub Principal instale apps nesta tela de configurações. Depois, volte e toque em “Instalar atualização”.')
      } else {
        setAndroidUpdateStatus('Confirme a atualização na tela do Android.')
        setIsUpdatePromptOpen(false)
      }
    } catch (error) {
      setAndroidUpdateError(error instanceof Error ? error.message : 'Não foi possível baixar ou iniciar a atualização.')
    } finally {
      setIsDownloadingAndroidUpdate(false)
    }
  }

  const loadWeather = async (coordinates: Coordinates, forceRefresh = false) => {
    setLoadingWeather(true)
    setWeatherError('')
    const cacheKey = `hub-weather-v4:${coordinates.latitude.toFixed(3)}:${coordinates.longitude.toFixed(3)}`
    const cached = readPersistentCache<WeatherCache>(cacheKey)
    const cachedWeather = cached && isWeatherData(cached.value.weather)
      ? { weather: cached.value.weather, timestamp: cached.timestamp }
      : null
    if (!navigator.onLine && cachedWeather && Date.now() - cachedWeather.timestamp < WEATHER_OFFLINE_CACHE_TTL) {
      setWeather(cachedWeather.weather)
      setLastUpdated(new Date(cachedWeather.timestamp))
      setIsWeatherOfflineCache(true)
      setLoadingWeather(false)
      return
    }
    try {
      const params = new URLSearchParams({
        latitude: String(coordinates.latitude),
        longitude: String(coordinates.longitude),
        timezone: 'auto',
        forecast_days: '6',
        current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,weather_code,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m,visibility,cloud_cover,uv_index',
        hourly: 'temperature_2m,precipitation,precipitation_probability,weather_code',
        daily: 'weather_code,precipitation_probability_max,temperature_2m_max,temperature_2m_min,sunrise,sunset',
      })
      if (!forceRefresh && cachedWeather && Date.now() - cachedWeather.timestamp < WEATHER_CACHE_TTL) {
          setWeather(cachedWeather.weather)
          setLastUpdated(new Date(cachedWeather.timestamp))
          setIsWeatherOfflineCache(false)
          setLoadingWeather(false)
          return
      }

      const controller = new AbortController()
      const timeout = window.setTimeout(() => controller.abort(), 12000)
      let response: Response
      try {
        response = await fetch(`${weatherUrl}?${params}`, { signal: controller.signal })
      } finally {
        window.clearTimeout(timeout)
      }
      if (!response.ok) throw new Error('weather')
      const nextWeather = await response.json() as WeatherData
      const timestamp = Date.now()
      writePersistentCache(cacheKey, { weather: nextWeather }, timestamp)
      setWeather(nextWeather)
      setLastUpdated(new Date(timestamp))
      setIsWeatherOfflineCache(false)
    } catch {
      if (cachedWeather && Date.now() - cachedWeather.timestamp < WEATHER_OFFLINE_CACHE_TTL) {
        setWeather(cachedWeather.weather)
        setLastUpdated(new Date(cachedWeather.timestamp))
        setIsWeatherOfflineCache(true)
        setWeatherError('')
      } else {
        setWeatherError('Não foi possível atualizar os dados meteorológicos. Tentaremos novamente automaticamente.')
      }
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
  useEffect(() => {
    const refreshWeather = () => {
      if (location) void loadWeather(location, true)
    }
    window.addEventListener('hub:data-refresh', refreshWeather)
    return () => window.removeEventListener('hub:data-refresh', refreshWeather)
  }, [location])

  const current = weather?.current
  const currentCode = Number(current?.weather_code || 0)
  const uvIndex = typeof current?.uv_index === 'number' ? current.uv_index : undefined
  const uvGuidance = getUvGuidance(uvIndex)
  const hourlyIndexes = useMemo(() => weather?.hourly.time.map((time, index) => ({ time, index })).filter(({ time }) => new Date(time) >= now).slice(0, 6) || [], [weather, now])
  const forecastNow = typeof current?.time === 'string' ? current.time : now.toISOString().slice(0, 16)
  const futureHourlyIndexes = weather?.hourly.time
    .map((time, index) => ({ time, index }))
    .filter(({ time }) => time >= forecastNow) || []
  const todayHourlyIndexes = futureHourlyIndexes.filter(({ time }) => time.slice(0, 10) === forecastNow.slice(0, 10))
  const highestRainChanceToday = todayHourlyIndexes.reduce<{ time: string; probability: number } | null>((highest, { time, index }) => {
    const probability = weather?.hourly.precipitation_probability[index]
    if (typeof probability !== 'number' || (highest && highest.probability >= probability)) return highest
    return { time, probability }
  }, null)
  const heavyRainForecast = futureHourlyIndexes.slice(0, 24).find(({ index }) => {
    const probability = weather?.hourly.precipitation_probability[index]
    const precipitation = weather?.hourly.precipitation[index]
    const code = weather?.hourly.weather_code[index] || 0
    return typeof probability === 'number' && probability >= 70 && (
      (typeof precipitation === 'number' && precipitation >= 10) ||
      code === 65 || code === 82 || code >= 95
    )
  })
  const metricData: Record<WeatherMetricId, { icon: ReactNode; value: string; detail?: string; tone?: string }> = {
    humidity: { icon: <Droplets />, value: formatNumber(current?.relative_humidity_2m, '%') },
    wind: { icon: <Wind />, value: formatNumber(current?.wind_speed_10m, ' km/h'), detail: `${formatNumber(current?.wind_direction_10m, '°')} direção` },
    pressure: { icon: <Gauge />, value: formatNumber(current?.surface_pressure, ' hPa') },
    precipitation: { icon: <Umbrella />, value: formatNumber(current?.precipitation, ' mm') },
    visibility: { icon: <Eye />, value: formatNumber(current?.visibility, ' m') },
    sunrise: { icon: <Sunrise />, value: formatTime(weather?.daily.sunrise[0]) },
    sunset: { icon: <Sunset />, value: formatTime(weather?.daily.sunset[0]) },
    uv: { icon: <Sun />, value: formatNumber(uvIndex), detail: uvGuidance ? `${uvGuidance.level} · ${uvGuidance.advice}` : 'Sem dados de UV', tone: uvGuidance?.tone },
    clouds: { icon: <Activity />, value: formatNumber(current?.cloud_cover, '%') },
  }
  const visibleWeatherMetrics = isAndroidApplication
    ? mobilePreferences.metricOrder.filter((id) => mobilePreferences.visibleMetrics.includes(id))
    : defaultMetricOrder
  const daily = weather?.daily.time.slice(0, 5) || []
  const dateText = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(now)
  const isUsingCustomLocation = currentLocation && location ? (Math.abs(location.latitude - currentLocation.latitude) > 0.01 || Math.abs(location.longitude - currentLocation.longitude) > 0.01) : false

  const toggleAndroidTvMode = async (enabled: boolean) => {
    setTvModeError('')
    try {
      if (isAndroidApp()) await setAndroidTvMode(enabled)
      setIsTvMode(enabled)
      if (enabled) {
        setActiveMobileTab('home')
        const appShell = document.querySelector<HTMLElement>('.android-app')
        if (appShell) appShell.scrollTop = 0
        else window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    } catch (error) {
      console.error('Não foi possível alterar a orientação do modo TV.', error)
      setTvModeError('Não foi possível alterar a orientação. Tente novamente.')
    }
  }

  const androidHeaderContent = (
    <>
      <div className="mobile-app-header">
        {isTvMode && (
          <button
            className="mobile-tv-exit"
            type="button"
            onClick={() => void toggleAndroidTvMode(false)}
            aria-label="Sair do modo TV"
          >
            <X size={16} />
            <span>Sair do modo TV</span>
          </button>
        )}
        <div className="mobile-header-center">
          <div className="mobile-date"><CalendarDays size={14} /> {dateText}</div>
          <LiveClock />
          <span className={`mobile-connectivity${isOnline ? '' : ' is-offline'}`}>
            <span className="live-dot" />
            {isOnline ? 'Online' : 'Offline'}
          </span>
        </div>
      </div>
      <div className={`mobile-pull-status${tvModeError ? ' is-error' : ''}`} aria-live="polite">
        {tvModeError ? <span role="alert">{tvModeError}</span> : isPullRefreshing ? 'Atualizando clima...' : 'Puxe para baixo para atualizar'}
      </div>
    </>
  )

  return (
    <main
      className={`app-shell notranslate${isTvMode ? ' tv-mode' : ''}${isAndroidApplication ? ` android-app theme-${mobilePreferences.theme}` : ''}${isAndroidApplication && mobilePreferences.textSize === 'large' ? ' text-size-large' : ''}`}
      translate="no"
      onScroll={isAndroidApplication ? (event) => {
        const scrollTop = event.currentTarget.scrollTop
        const header = event.currentTarget.querySelector<HTMLElement>('.mobile-fixed-header')
        if (!header) return
        const isCompact = header.classList.contains('is-compact')
        header.classList.toggle('is-compact', scrollTop > (isCompact ? 8 : 32))
      } : undefined}
      onTouchStart={isAndroidApplication ? (event) => {
        pullStartY.current = event.currentTarget.scrollTop <= 2 ? event.touches[0]?.clientY ?? null : null
      } : undefined}
      onTouchEnd={isAndroidApplication ? (event) => {
        const startY = pullStartY.current
        const endY = event.changedTouches[0]?.clientY
        pullStartY.current = null
        if (startY === null || endY === undefined || endY - startY < 76 || !location || loadingWeather) return
        setIsPullRefreshing(true)
        void loadWeather(location, true).finally(() => setIsPullRefreshing(false))
      } : undefined}
      onTouchCancel={() => { pullStartY.current = null }}
    >
      {isAndroidApplication && !isTvMode && (
        <header ref={syncMobileHeaderCompact} className={`hero-header mobile-fixed-header theme-${mobilePreferences.theme}`}>
          {androidHeaderContent}
        </header>
      )}
      {(!isAndroidApplication || isTvMode) && (
        <header className="hero-header">
          {isAndroidApplication ? androidHeaderContent : (
            <>
        {!isAndroidApplication && (
          <button className="cache-reset-button" type="button" onClick={resetSiteData} disabled={isResettingSite}>
            <RefreshCw size={16} className={isResettingSite ? 'spin' : ''} />
            <span>{isResettingSite ? 'Limpando dados...' : 'Limpar dados e atualizar'}</span>
          </button>
        )}
        <button
          className="tv-mode-button"
          type="button"
          onClick={() => setIsTvMode((enabled) => !enabled)}
          aria-pressed={isTvMode}
        >
          {isTvMode ? <X size={16} /> : <Monitor size={16} />}
          {isTvMode ? 'Sair do modo TV' : 'Modo TV'}
        </button>
        <div className="date-line"><CalendarDays size={16} /> {dateText}</div>
        <LiveClock />
        <p className="timezone">Horário local do seu dispositivo</p>
        <p className="auto-refresh-note">Atualização automática a cada 30 minutos</p>
        <InstallApp />
        {!isAndroidApplication && siteResetError && <p className="site-reset-error" role="alert">{siteResetError}</p>}
            </>
          )}
        </header>
      )}

      {(!isAndroidApplication || activeMobileTab === 'home' || isTvMode) && <section className="content-grid">
        <section className="panel weather-panel">
          <div className="section-heading">
            <div>
              <span className="section-kicker">CONDIÇÕES ATUAIS</span>
              <h2>Clima agora</h2>
            </div>
            <div className="weather-header-actions">
              <button className="location-button" type="button" onClick={openLocationModal}>Ver clima em outro local</button>
              <button className="icon-button" title="Atualizar clima" onClick={() => location && loadWeather(location)} disabled={loadingWeather}>
                <RefreshCw size={17} className={loadingWeather ? 'spin' : ''} />
              </button>
            </div>
          </div>

          {weather && lastUpdated && (
            <p className="weather-updated" aria-live="polite">
            {isWeatherOfflineCache ? 'Dados salvos para uso offline · ' : 'Clima atualizado às '}
            {lastUpdated.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}

          {location ? (
            <div className="location-line">
              <MapPin size={16} />
              <span>{formatLocationLabel(location)}</span>
              <span className="location-status"><LocateFixed size={13} /> {currentLocation && location && Math.abs(location.latitude - currentLocation.latitude) < 0.01 && Math.abs(location.longitude - currentLocation.longitude) < 0.01 ? 'GPS' : 'Local customizado'}</span>
              <button
                className={`favorite-toggle${isCurrentLocationFavorite ? ' is-favorite' : ''}`}
                type="button"
                onClick={toggleCurrentLocationFavorite}
                title={isCurrentLocationFavorite ? 'Remover dos favoritos' : 'Salvar cidade favorita'}
                aria-label={isCurrentLocationFavorite ? 'Remover cidade dos favoritos' : 'Salvar cidade nos favoritos'}
                aria-pressed={isCurrentLocationFavorite}
              >
                <Star size={16} fill={isCurrentLocationFavorite ? 'currentColor' : 'none'} />
              </button>
            </div>
          ) : (
            <div className="notice"><LocateFixed size={16} /> {locationError || 'Solicitando sua localização...'}</div>
          )}

          {isAndroidApplication && favoriteLocations.items.length > 0 && (
            <div className="favorite-city-shortcuts" aria-label="Cidades favoritas">
              {favoriteLocations.items.map((favorite) => {
                const isSelected = Boolean(location && getLocationKey(favorite) === getLocationKey(location))
                return (
                  <button
                    className={`favorite-city-chip${isSelected ? ' is-selected' : ''}`}
                    key={getLocationKey(favorite)}
                    type="button"
                    onClick={() => selectFavoriteLocation(favorite)}
                    aria-pressed={isSelected}
                  >
                    <Star size={13} fill="currentColor" />
                    {formatLocationLabel(favorite)}
                  </button>
                )
              })}
            </div>
          )}

          {isUsingCustomLocation && (
            <button className="location-override-button" type="button" onClick={backToCurrentLocation}>Voltar à localização atual</button>
          )}

          {favoriteLocations.error && <div className="notice error"><AlertCircle size={16} /> {favoriteLocations.error}</div>}
          {weatherError && <div className="notice error"><AlertCircle size={16} /> {weatherError}</div>}
          {loadingWeather && !weather && <div className="skeleton-block"><span /><span /><span /></div>}

          {weather && (
            <>
              {isAndroidApplication && mobilePreferences.rainAlerts && heavyRainForecast && (
                <div className="heavy-rain-alert mobile-rain-alert" role="status" aria-live="polite">
                  <AlertCircle size={17} />
                  <p>
                    <strong>Alerta de chuva forte</strong>
                    Possível às {formatTime(weather.hourly.time[heavyRainForecast.index])}, com {formatNumber(weather.hourly.precipitation_probability[heavyRainForecast.index], '%')} de chance.
                  </p>
                </div>
              )}
              <div className="current-weather">
                <div className="weather-symbol"><WeatherIcon code={currentCode} size={46} /></div>
                <div>
                  <div className="temperature">{formatNumber(current?.temperature_2m, '°')}<span>C</span></div>
                  <div className="condition">{weatherLabels[currentCode] || 'Condição atual'}</div>
                </div>
                <div className="feels">Sensação<br /><strong>{formatNumber(current?.apparent_temperature, '°')}C</strong></div>
              </div>

              <div className="tv-weather-rain">
                <CloudRain size={21} />
                <span>
                  Maior chance de chuva hoje{highestRainChanceToday ? ` · às ${formatTime(highestRainChanceToday.time)}` : ''}
                </span>
                <strong>{formatNumber(highestRainChanceToday?.probability, '%')}</strong>
              </div>
              <div className="metric-grid">
                {visibleWeatherMetrics.map((id) => (
                  <Metric key={id} label={weatherMetricOptions.find((metric) => metric.id === id)?.label || id} {...metricData[id]} />
                ))}
              </div>
              <Suspense fallback={<div className="panel-loading" role="status">Carregando cotações...</div>}>
                <CurrencyPanel />
              </Suspense>
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

          {highestRainChanceToday && (
            <div className="rain-summary">
              <CloudRain size={17} />
              <p>
                <strong>Resumo de hoje</strong>
                {highestRainChanceToday.probability > 0
                  ? `Maior chance de chuva: ${formatNumber(highestRainChanceToday.probability, '%')} às ${formatTime(highestRainChanceToday.time)}.`
                  : 'Sem chuva prevista para hoje.'}
              </p>
            </div>
          )}

          {heavyRainForecast && (!isAndroidApplication || mobilePreferences.rainAlerts) && (
            <div className="heavy-rain-alert" role="status" aria-live="polite">
              <AlertCircle size={17} />
              <p>
                <strong>Alerta de chuva forte</strong>
                Possível às {formatTime(weather?.hourly.time[heavyRainForecast.index] || '')}, com {formatNumber(weather?.hourly.precipitation_probability[heavyRainForecast.index], '%')} de chance.
              </p>
            </div>
          )}

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
            {daily.map((day, index) => {
              const rainProbability = weather?.daily.precipitation_probability_max[index]
              const peakRainHour = weather?.hourly.time.reduce<{ time: string; probability: number } | null>((highest, time, hourIndex) => {
                if (time.slice(0, 10) !== day || (day === forecastNow.slice(0, 10) && time < forecastNow)) return highest
                const probability = weather.hourly.precipitation_probability[hourIndex]
                if (typeof probability !== 'number' || (highest && highest.probability >= probability)) return highest
                return { time, probability }
              }, null)
              const peakRainTime = peakRainHour && typeof rainProbability === 'number' &&
                peakRainHour.probability === rainProbability && rainProbability > 0
                ? peakRainHour.time
                : null
              return (
                <div className="day-item" key={day}>
                  <span>{index === 0 ? 'Hoje' : index === 1 ? 'Amanhã' : formatDay(day)}</span>
                  <div
                    className={typeof rainProbability === 'number' && rainProbability >= 50 ? 'day-weather high-rain' : 'day-weather'}
                    title={peakRainTime ? `Probabilidade máxima de chuva às ${formatTime(peakRainTime)}` : 'Probabilidade máxima de chuva'}
                    aria-label={`Chance de chuva: ${formatNumber(rainProbability, '%')}${peakRainTime ? `, com pico às ${formatTime(peakRainTime)}` : ''}`}
                  >
                    <WeatherIcon code={weather?.daily.weather_code[index] || 0} size={21} />
                    <div className="day-rain-chance">
                      <small className="rain-probability">{formatNumber(rainProbability, '%')} chuva</small>
                      {peakRainTime && <small className="day-rain-time">às {formatTime(peakRainTime)}</small>}
                    </div>
                  </div>
                  <strong>{formatNumber(weather?.daily.temperature_2m_max[index], '°')} / {formatNumber(weather?.daily.temperature_2m_min[index], '°')}</strong>
                </div>
              )
            })}
          </div>
        </section>
      </section>}

      {(!isAndroidApplication || activeMobileTab === 'satellite' || isTvMode) && (
        <>
      <Suspense fallback={<div className="panel panel-loading" role="status">Carregando imagens de satélite...</div>}>
        <SatellitePanel />
      </Suspense>

      <section className="radar-links-panel">
        <div className="useful-heading">
          <div><span className="section-kicker">FONTES OFICIAIS · IPMET / UNESP</span><h2>Radares e satélites</h2></div>
        </div>
        <div className="radar-links-grid">
          {radarSources.map((source) => (
            <a className="radar-link-card" href={source.url} target="_blank" rel="noopener noreferrer" onClick={(event) => handleExternalLink(event, source.url)} key={source.url}>
              <span><strong>{source.label}</strong><small>{source.description}</small></span>
              <ExternalLink size={16} />
            </a>
          ))}
        </div>
      </section>
        </>
      )}

      {(!isAndroidApplication || activeMobileTab === 'news') && <div className={`news-section${isAndroidApplication ? ' mobile-tab-content' : ''}`}>
      {isAndroidApplication && <div className="mobile-view-heading"><span className="section-kicker">ATUALIDADES</span><h2>Notícias</h2><p>Manchetes para acompanhar o que acontece.</p></div>}
      <Suspense fallback={<div className="news-portals panel-loading" role="status">Carregando notícias...</div>}>
      <div className="news-portals">
        {isNewsCategoryVisible('local') && <NewsPanel locationCity={localNewsCity} locationState={location?.state ? getStateAbbreviation(location.state) : null} local title={localNewsCity && location ? `Notícias de ${formatLocationLabel(location)}` : 'Notícias da sua região'} query="notícias locais" />}
        {isNewsCategoryVisible('games') && <NewsPanel locationCity={location?.city || null} title="Portal de notícias de jogos" query={newsSearchQueries.games} />}
        {isNewsCategoryVisible('films') && <NewsPanel locationCity={location?.city || null} title="Portal de notícias de filmes e cinema" query={newsSearchQueries.films} />}
        {isNewsCategoryVisible('anime') && <NewsPanel locationCity={location?.city || null} title="Portal de notícias de animes" query={newsSearchQueries.anime} />}
        {isNewsCategoryVisible('geek') && <NewsPanel locationCity={location?.city || null} title="Portal de notícias do mundo geek" query={newsSearchQueries.geek} />}
        {isNewsCategoryVisible('global') && <NewsPanel locationCity={location?.city || null} title="Portal de notícias globais" query={newsSearchQueries.global} />}
        {isAndroidApplication && mobilePreferences.newsCategories.length === 0 && <p className="preferences-empty-state">Nenhum assunto selecionado. Escolha os temas em Mais → Personalização.</p>}
      </div>
      </Suspense>
      </div>}

      {isAndroidApplication && activeMobileTab === 'more' && (
        <section className="mobile-tab-content mobile-more-screen">
          <div className="mobile-view-heading">
            <span className="section-kicker">{isPersonalizationOpen ? 'PREFERÊNCIAS' : 'APLICATIVO'}</span>
            <h2>{isPersonalizationOpen ? 'Personalização' : 'Mais'}</h2>
            <p>{isPersonalizationOpen ? 'Ajuste o clima, as notícias e a leitura do seu jeito.' : 'Atalhos, informações e atualizações do aplicativo.'}</p>
          </div>
          {!isPersonalizationOpen && <button
            className="mobile-tv-toggle"
            type="button"
            onClick={() => void toggleAndroidTvMode(!isTvMode)}
            aria-pressed={isTvMode}
          >
            {isTvMode ? <X size={19} /> : <Monitor size={19} />}
            <span>
              <strong>{isTvMode ? 'Sair do modo TV' : 'Ativar modo TV'}</strong>
              <small>{isTvMode ? 'Voltar à visualização normal' : 'Clima e satélite em tela ampliada'}</small>
            </span>
          </button>}
          {!isPersonalizationOpen && (
            <button className="mobile-personalize-button" type="button" onClick={() => setIsPersonalizationOpen(true)}>
              <Settings2 size={20} />
              <span><strong>Personalização</strong><small>Alertas, cartões, notícias e acessibilidade</small></span>
              <ChevronLeft size={18} />
            </button>
          )}
          {isPersonalizationOpen && (
            <button className="mobile-personalization-back" type="button" onClick={() => setIsPersonalizationOpen(false)}>
              <ChevronLeft size={18} />
              Voltar
            </button>
          )}
          {isPersonalizationOpen && <section className="mobile-preferences-card">
            <div className="preferences-card-heading">
              <span className="section-kicker">CLIMA E ALERTAS</span>
              <h3>Alertas de chuva forte</h3>
              <p>Mostra um aviso no app quando houver previsão de chuva intensa. O alerta aparece enquanto o app estiver aberto.</p>
            </div>
            <label className="preference-toggle-row">
              <span>Exibir alertas de chuva forte</span>
              <input
                type="checkbox"
                checked={mobilePreferences.rainAlerts}
                onChange={(event) => updateMobilePreferences({ rainAlerts: event.target.checked })}
              />
            </label>
          </section>}
          {isPersonalizationOpen && <section className="mobile-preferences-card">
            <div className="preferences-card-heading">
              <span className="section-kicker">TELA INICIAL E MODO TV</span>
              <h3>Cartões do clima</h3>
              <p>Marque os dados que quer exibir e segure a alça para arrastá-los na ordem desejada. A seleção também vale para o modo TV.</p>
            </div>
            <div className="preference-list">
              {mobilePreferences.metricOrder.map((metric) => {
                const label = weatherMetricOptions.find((option) => option.id === metric)?.label || metric
                return (
                  <div className={`preference-order-row${draggedMetric === metric ? ' is-dragging' : ''}`} data-metric-id={metric} key={metric}>
                    <button
                      className="preference-drag-handle"
                      type="button"
                      aria-label={`Segure e arraste ${label} para reorganizar`}
                      onPointerDown={(event) => startDraggingWeatherMetric(metric, event)}
                    >
                      <GripVertical size={17} />
                    </button>
                    <label className="preference-toggle-row">
                      <span>{label}</span>
                      <input
                        type="checkbox"
                        checked={mobilePreferences.visibleMetrics.includes(metric)}
                        onChange={() => toggleWeatherMetric(metric)}
                      />
                    </label>
                  </div>
                )
              })}
            </div>
          </section>}
          {isPersonalizationOpen && <section className="mobile-preferences-card">
            <div className="preferences-card-heading">
              <span className="section-kicker">NOTÍCIAS</span>
              <h3>Seus assuntos</h3>
              <p>Mostramos somente as categorias selecionadas na aba Notícias.</p>
            </div>
            <div className="preference-list">
              {newsCategoryOptions.map(({ id, label }) => (
                <label className="preference-toggle-row" key={id}>
                  <span>{label}</span>
                  <input
                    type="checkbox"
                    checked={mobilePreferences.newsCategories.includes(id)}
                    onChange={() => toggleNewsCategory(id)}
                  />
                </label>
              ))}
            </div>
          </section>}
          {isPersonalizationOpen && <section className="mobile-preferences-card">
            <div className="preferences-card-heading">
              <span className="section-kicker">APARÊNCIA</span>
              <h3>Tema do aplicativo</h3>
              <p>Escolha o visual usado em todas as telas.</p>
            </div>
            <fieldset className="preference-size-options">
              <legend>Tamanho do texto</legend>
              <label><input type="radio" name="mobile-text-size" checked={mobilePreferences.textSize === 'normal'} onChange={() => updateMobilePreferences({ textSize: 'normal' })} /> Padrão</label>
              <label><input type="radio" name="mobile-text-size" checked={mobilePreferences.textSize === 'large'} onChange={() => updateMobilePreferences({ textSize: 'large' })} /> Maior</label>
            </fieldset>
            <fieldset className="preference-theme-options">
              <legend>Modo de cor</legend>
              <label><input type="radio" name="mobile-theme" checked={mobilePreferences.theme === 'original'} onChange={() => updateMobilePreferences({ theme: 'original' })} /> Original do app</label>
              <label><input type="radio" name="mobile-theme" checked={mobilePreferences.theme === 'dark'} onChange={() => updateMobilePreferences({ theme: 'dark' })} /> Escuro</label>
              <label><input type="radio" name="mobile-theme" checked={mobilePreferences.theme === 'light'} onChange={() => updateMobilePreferences({ theme: 'light' })} /> Claro</label>
            </fieldset>
            <p className="preference-reset-description">Restaura o tema original, o tamanho do texto e as opções padrão de cartões, notícias e alertas. Seus sites e cidades favoritas serão mantidos.</p>
            <button className="preference-reset-button" type="button" onClick={resetMobilePreferences}>
              <RotateCcw size={16} />
              Restaurar personalizações
            </button>
          </section>}
          {isPersonalizationOpen && mobilePreferenceState.error && <p className="preference-storage-error" role="alert">{mobilePreferenceState.error}</p>}
          {!isPersonalizationOpen && <PersonalSites />}
          {!isPersonalizationOpen && <section className="mobile-about-card">
            <span className="section-kicker">SOBRE O APLICATIVO</span>
            <h3>Hub Principal</h3>
            <p>Versão {installedAndroidAppVersion || 'verificando...'}</p>
            <p className="mobile-data-status">{isOnline ? 'Conectado à internet' : 'Sem conexão com a internet'}</p>
          </section>}
          {!isPersonalizationOpen && <div className="app-update-panel" aria-live="polite">
            <div className="mobile-update-heading">
              <div><span className="section-kicker">ATUALIZAÇÕES</span><h3>Atualização do app</h3></div>
              <span className="mobile-auto-update">Automática</span>
            </div>
            {androidUpdate && (
              <>
                <p className="app-update-message"><strong>Versão {androidUpdate.version} disponível.</strong> Toque para baixar e iniciar a instalação.</p>
                {androidUpdate.notes && <details className="app-update-notes"><summary>O que mudou</summary><p>{androidUpdate.notes}</p></details>}
                <button className="app-update-button" type="button" onClick={() => void installAndroidUpdate()} disabled={isDownloadingAndroidUpdate}>
                  <Download size={15} />
                  {isDownloadingAndroidUpdate ? 'Baixando atualização...' : hasDownloadedAndroidUpdate ? 'Instalar atualização' : 'Atualizar agora'}
                </button>
              </>
            )}
            {androidUpdateStatus && <p className="app-update-message" role="status">{androidUpdateStatus}</p>}
            {androidUpdateError && <p className="app-update-error" role="alert">{androidUpdateError}</p>}
            {!androidUpdate && (
              <>
                <p className="app-update-message">O aplicativo verifica atualizações ao abrir e ao voltar para primeiro plano.</p>
                <button className="app-update-check" type="button" onClick={checkAndroidUpdateManually} disabled={isCheckingAndroidUpdate || !isAndroidApp()}>
                  <RefreshCw size={14} className={isCheckingAndroidUpdate ? 'spin' : ''} />
                  {isCheckingAndroidUpdate ? 'Verificando atualização...' : isAndroidPreview ? 'Verificação no app instalado' : 'Verificar agora'}
                </button>
              </>
            )}
          </div>}
        </section>
      )}

      {!isAndroidApplication && <footer>
        <strong>Hub Principal</strong>
        <span>Dados meteorológicos fornecidos por serviços externos</span>
        <span>Fuso: {Intl.DateTimeFormat().resolvedOptions().timeZone}</span>
      </footer>}

      {isAndroidApplication && (
        <nav className="mobile-bottom-nav" aria-label="Navegação principal">
          {mobileTabs.map(({ id, label, icon: Icon }) => (
            <button
              className={`mobile-nav-item${activeMobileTab === id ? ' is-active' : ''}`}
              key={id}
              type="button"
              onClick={() => {
                setActiveMobileTab(id)
                setIsPersonalizationOpen(false)
                window.scrollTo({ top: 0, behavior: 'smooth' })
              }}
              aria-current={activeMobileTab === id ? 'page' : undefined}
            >
              <Icon size={20} strokeWidth={activeMobileTab === id ? 2.4 : 1.8} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      )}

      {isAndroidApplication && androidUpdate && isUpdatePromptOpen && createPortal(
        <div className={`update-prompt-backdrop theme-${mobilePreferences.theme}`} role="presentation">
          <section className="update-prompt" role="dialog" aria-modal="true" aria-labelledby="update-prompt-title" aria-describedby="update-prompt-description">
            <div className="update-prompt-icon"><Download size={30} /></div>
            <span className="section-kicker">ATUALIZAÇÃO DISPONÍVEL</span>
            <h2 id="update-prompt-title">Nova versão do Hub Principal</h2>
            <p id="update-prompt-description">A versão <strong>{androidUpdate.version}</strong> está disponível para baixar e instalar.</p>
            {androidUpdate.notes && <details className="update-prompt-notes"><summary>O que mudou nesta versão</summary><p>{androidUpdate.notes}</p></details>}
            {androidUpdateStatus && <p className="update-prompt-status" role="status">{androidUpdateStatus}</p>}
            {androidUpdateError && <p className="update-prompt-error" role="alert">{androidUpdateError}</p>}
            <button className="update-prompt-install" type="button" onClick={() => void installAndroidUpdate()} disabled={isDownloadingAndroidUpdate}>
              <Download size={18} />
              {isDownloadingAndroidUpdate ? 'Baixando atualização...' : hasDownloadedAndroidUpdate ? 'Instalar atualização' : 'Atualizar agora'}
            </button>
            <button className="update-prompt-later" type="button" onClick={() => {
              dismissedUpdateVersion.current = androidUpdate.version
              setIsUpdatePromptOpen(false)
            }} disabled={isDownloadingAndroidUpdate}>
              Decidir depois
            </button>
          </section>
        </div>,
        document.body,
      )}

      {isCityModalOpen && (
        <div className="location-modal-backdrop" onClick={() => setIsCityModalOpen(false)}>
          <div
            className="location-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="city-dialog-title"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setIsCityModalOpen(false)
            }}
          >
            <div className="location-modal-header">
              <h3 id="city-dialog-title">Ver clima em outro local</h3>
              <button type="button" className="modal-close-button" onClick={() => setIsCityModalOpen(false)} aria-label="Fechar busca de cidade">×</button>
            </div>
            {favoriteLocations.items.length > 0 && (
              <section className="favorite-locations" aria-label="Cidades favoritas">
                <h4>Cidades favoritas</h4>
                {favoriteLocations.items.map((favorite) => (
                  <div className="favorite-location-row" key={getLocationKey(favorite)}>
                    <button type="button" className="favorite-location-select" onClick={() => selectFavoriteLocation(favorite)}>
                      <Star size={14} fill="currentColor" />
                      <span>{formatLocationLabel(favorite)}</span>
                      {location && getLocationKey(location) === getLocationKey(favorite) && <small>atual</small>}
                    </button>
                    <button
                      type="button"
                      className="favorite-location-remove"
                      onClick={() => removeFavoriteLocation(favorite)}
                      title={`Remover ${formatLocationLabel(favorite)} dos favoritos`}
                      aria-label={`Remover ${formatLocationLabel(favorite)} dos favoritos`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </section>
            )}
            <form onSubmit={searchCityWeather}>
              <label className="location-modal-label" htmlFor="city-search">Cidade</label>
              <input
                id="city-search"
                className="location-modal-input"
                type="text"
                value={cityQuery}
                aria-autocomplete="list"
                aria-controls="city-suggestions"
                aria-expanded={citySuggestions.length > 0}
                onChange={(event) => {
                  setCityQuery(event.target.value)
                  setSelectedCitySuggestion(null)
                }}
                placeholder="Ex.: Santos, São Paulo, Rio de Janeiro"
                autoFocus
              />
              {citySuggestions.length > 0 && (
                <div className="city-suggestions" id="city-suggestions" role="listbox" aria-label="Sugestões de cidades">
                  {citySuggestions.map((suggestion) => (
                    <button
                      key={`${suggestion.label}-${suggestion.latitude}-${suggestion.longitude}`}
                      type="button"
                      className="city-suggestion-item"
                      role="option"
                      aria-selected={selectedCitySuggestion?.label === suggestion.label}
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
