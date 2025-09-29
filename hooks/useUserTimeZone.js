import { useUserSettings } from '../context/UserSettingsContext'

export function useUserTimeZone() {
  const { timeZone } = useUserSettings()
  return timeZone
}

