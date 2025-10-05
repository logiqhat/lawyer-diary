import React, { createContext, useContext, useEffect, useState } from 'react'
import { loadRemoteFlags } from '../services/remoteConfig'

const Ctx = createContext({ showUsageSummary: false, encryptionEnabled: false, ready: false })

export function FeatureFlagsProvider({ children }) {
  const [flags, setFlags] = useState({ showUsageSummary: false, encryptionEnabled: false })
  const [ready, setReady] = useState(false)

  useEffect(() => {
    (async () => {
      try {
        const { showUsageSummary, encryptionEnabled } = await loadRemoteFlags()
        setFlags({ showUsageSummary, encryptionEnabled })
      } catch {
        setFlags({ showUsageSummary: false, encryptionEnabled: false })
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
