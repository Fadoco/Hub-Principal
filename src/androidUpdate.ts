import { Capacitor, registerPlugin } from '@capacitor/core'

type AndroidUpdatePlugin = {
  getAppVersion(): Promise<{ versionName: string }>
  downloadUpdate(options: { url: string; sha256: string }): Promise<void>
  installDownloadedUpdate(): Promise<{ status: 'installer_opened' | 'permission_required' }>
}

export type AndroidUpdate = {
  version: string
  url: string
  sha256: string
  notes: string
}

const androidUpdatePlugin = registerPlugin<AndroidUpdatePlugin>('AppUpdate')
const updateManifestUrl = 'https://fadoco.github.io/Hub-Principal/updates/version.json'

type UpdateManifest = {
  version?: unknown
  versionCode?: unknown
  url?: unknown
  sha256?: unknown
  notes?: unknown
}

const parseVersion = (value: string) => {
  const match = value.replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)$/)
  return match ? match.slice(1).map(Number) : null
}

const isNewerVersion = (candidate: string, current: string) => {
  const next = parseVersion(candidate)
  const installed = parseVersion(current)
  if (!next || !installed) throw new Error('A versão publicada ou instalada não segue o formato X.Y.Z.')

  for (let index = 0; index < next.length; index += 1) {
    if (next[index] !== installed[index]) return next[index] > installed[index]
  }
  return false
}

export const isAndroidApp = () => Capacitor.getPlatform() === 'android'

export const checkForAndroidUpdate = async (): Promise<AndroidUpdate | null> => {
  const { versionName } = await androidUpdatePlugin.getAppVersion()
  let response: Response
  try {
    response = await fetch(`${updateManifestUrl}?t=${Date.now()}`, { cache: 'no-store' })
  } catch (error) {
    throw new Error('Não foi possível consultar a pasta de atualizações. Verifique a conexão com a internet.', { cause: error })
  }

  if (response.status === 404) return null
  if (!response.ok) throw new Error(`O servidor de atualizações respondeu com erro ${response.status}.`)

  const manifest: UpdateManifest = await response.json() as UpdateManifest
  if (typeof manifest.version !== 'string' || typeof manifest.versionCode !== 'number' ||
      !Number.isSafeInteger(manifest.versionCode) || manifest.versionCode < 1 ||
      typeof manifest.url !== 'string' || typeof manifest.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/i.test(manifest.sha256)) {
    throw new Error('O manifesto de atualização não contém informações válidas.')
  }

  if (!isNewerVersion(manifest.version, versionName)) return null

  const apkUrl = new URL(manifest.url)
  if (apkUrl.origin !== 'https://fadoco.github.io' ||
      apkUrl.pathname !== '/Hub-Principal/updates/Hub-Principal.apk' ||
      apkUrl.searchParams.get('v') !== String(manifest.versionCode)) {
    throw new Error('O link do APK no manifesto não é válido.')
  }

  return {
    version: manifest.version,
    url: apkUrl.toString(),
    sha256: manifest.sha256,
    notes: typeof manifest.notes === 'string' ? manifest.notes : '',
  }
}

export const downloadAndroidUpdate = (update: AndroidUpdate) =>
  androidUpdatePlugin.downloadUpdate({ url: update.url, sha256: update.sha256 })

export const installDownloadedAndroidUpdate = () =>
  androidUpdatePlugin.installDownloadedUpdate()
