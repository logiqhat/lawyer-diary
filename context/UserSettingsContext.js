import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

const TZ_KEY = 'settings:timezone'

const Ctx = createContext({ timeZone: undefined, setTimeZone: () => {} })

export function UserSettingsProvider({ children }) {
  const [timeZone, setTimeZoneState] = useState(undefined)

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(TZ_KEY)
        if (saved) setTimeZoneState(saved)
        else {
          const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
          setTimeZoneState(tz)
        }
      } catch {
        try { setTimeZoneState(Intl.DateTimeFormat().resolvedOptions().timeZone) } catch {}
      }
    })()
  }, [])

  const setTimeZone = async (tz) => {
    try { if (tz) await AsyncStorage.setItem(TZ_KEY, tz) } catch {}
    setTimeZoneState(tz)
  }

  const value = useMemo(() => ({ timeZone, setTimeZone }), [timeZone])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useUserSettings() {
  return useContext(Ctx)
}

