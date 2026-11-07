import { registerPlugin } from '@capacitor/core'

type WeatherNotificationsPlugin = {
  requestPermission(): Promise<{ granted: boolean }>
  configure(options: {
    enabled: boolean
    latitude?: number
    longitude?: number
    city?: string
    state?: string
  }): Promise<void>
  showTestNotification(options: { city: string; state: string }): Promise<void>
  openSettings(): Promise<void>
}

const weatherNotificationsPlugin = registerPlugin<WeatherNotificationsPlugin>('WeatherNotifications')

export const requestWeatherNotificationPermission = () =>
  weatherNotificationsPlugin.requestPermission()

export const configureWeatherNotifications = (options: {
  enabled: boolean
  location: { latitude: number; longitude: number; city: string; state: string } | null
}) =>
  weatherNotificationsPlugin.configure({
    enabled: options.enabled,
    ...(options.location && {
      latitude: options.location.latitude,
      longitude: options.location.longitude,
      city: options.location.city,
      state: options.location.state,
    }),
  })

export const showTestWeatherNotification = (location: { city: string; state: string }) =>
  weatherNotificationsPlugin.showTestNotification(location)

export const openWeatherNotificationSettings = () =>
  weatherNotificationsPlugin.openSettings()
