import { registerPlugin } from '@capacitor/core'

type AndroidTvModePlugin = {
  setTvMode(options: { enabled: boolean }): Promise<void>
}

const androidTvModePlugin = registerPlugin<AndroidTvModePlugin>('AndroidTvMode')

export const setAndroidTvMode = (enabled: boolean) =>
  androidTvModePlugin.setTvMode({ enabled })
