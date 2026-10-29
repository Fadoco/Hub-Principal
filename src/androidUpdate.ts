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
const releaseUrl = 'https://api.github.com/repos/Fadoco/Hub-Principal/releases/latest'

type GitHubRelease = {
  tag_name?: unknown
  body?: unknown
  assets?: unknown
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
  const response = await fetch(releaseUrl, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })

  if (response.status === 404) return null
  if (!response.ok) throw new Error(`O GitHub respondeu com erro ${response.status} ao consultar atualizações.`)

  const release: GitHubRelease = await response.json() as GitHubRelease
  if (typeof release.tag_name !== 'string' || !Array.isArray(release.assets)) {
    throw new Error('A publicação mais recente no GitHub não contém informações válidas.')
  }

  if (!isNewerVersion(release.tag_name, versionName)) return null

  const apk = release.assets.find((asset): asset is { name: string; browser_download_url: string; digest: string } => {
    if (!asset || typeof asset !== 'object') return false
    const candidate = asset as Record<string, unknown>
    return candidate.name === 'Hub-Principal.apk' &&
      typeof candidate.browser_download_url === 'string' &&
      typeof candidate.digest === 'string' &&
      /^sha256:[a-f0-9]{64}$/i.test(candidate.digest)
  })

  if (!apk || !/^https:\/\/github\.com\/Fadoco\/Hub-Principal\/releases\/download\//i.test(apk.browser_download_url)) {
    throw new Error('A publicação mais recente não possui um APK válido com verificação SHA-256.')
  }

  return {
    version: release.tag_name.replace(/^v/i, ''),
    url: apk.browser_download_url,
    sha256: apk.digest.slice('sha256:'.length),
    notes: typeof release.body === 'string' ? release.body : '',
  }
}

export const downloadAndroidUpdate = (update: AndroidUpdate) =>
  androidUpdatePlugin.downloadUpdate({ url: update.url, sha256: update.sha256 })

export const installDownloadedAndroidUpdate = () =>
  androidUpdatePlugin.installDownloadedUpdate()
