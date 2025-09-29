import React, { createContext, useContext, useEffect, useState } from 'react'

const Ctx = createContext({ showUsageSummary: false, ready: false })

export function FeatureFlagsProvider({ children }) {
  const [flags, setFlags] = useState({ showUsageSummary: false })
  const [ready, setReady] = useState(false)

  useEffect(() => {
    (async () => {
      try {
        // Dynamically require to avoid hard crash if module isn't installed yet
        const mod = require('@react-native-firebase/remote-config')
        const rc = mod?.default ? mod.default() : mod()
        // Default values (global)
        await rc.setDefaults({ show_usage_summary: false })
        // Fetch once on app launch; no caching in dev for easier testing
        await rc.setConfigSettings({ minimumFetchIntervalMillis: __DEV__ ? 0 : 60 * 60 * 1000 })
        const activated = await rc.fetchAndActivate()
        const show = rc.getValue('show_usage_summary').asBoolean()
        try { console.log('[RemoteConfig]', { activated, show_usage_summary: show }) } catch {}
        setFlags({ showUsageSummary: show })
      } catch (e) {
        // If Remote Config is unavailable, keep defaults
        setFlags({ showUsageSummary: false })
      } finally {
        setReady(true)
      }
    })()
  }, [])

  return <Ctx.Provider value={{ ...flags, ready }}>{children}</Ctx.Provider>
}

export function useFeatureFlags() {
  return useContext(Ctx)
}
