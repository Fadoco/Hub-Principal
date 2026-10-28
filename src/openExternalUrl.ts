import { Browser } from '@capacitor/browser'
import { Capacitor } from '@capacitor/core'

export function handleExternalLink(event: { preventDefault: () => void }, url: string) {
  if (!Capacitor.isNativePlatform()) return

  event.preventDefault()
  void Browser.open({ url }).catch((error: unknown) => {
    console.error('Não foi possível abrir o link no navegador do dispositivo.', error)
    window.location.assign(url)
  })
}
