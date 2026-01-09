import { useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { usingWatermelon } from '../config/featureFlags'
import { syncIfWatermelon } from '../services/syncService'
import { auth } from '../firebase'
import { onAuthStateChanged } from 'firebase/auth'

// Handles initial cloud sync and foreground syncs.
// Returns a boolean flag indicating whether the initial sync phase is done.
// On first auth, we:
// - attempt a Watermelon sync
// - wait up to 5 seconds for it
// - then allow the UI to proceed even if sync is still pending/fails (local data only)
export function useWatermelonSync() {
  const startedRef = useRef(false)
  const [isAuthed, setIsAuthed] = useState(!!auth?.currentUser)
  const [initialSyncDone, setInitialSyncDone] = useState(() => !usingWatermelon())

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setIsAuthed(!!u))
    return () => unsub()
  }, [])

  useEffect(() => {
    if (!usingWatermelon()) {
      if (!initialSyncDone) setInitialSyncDone(true)
      return
    }
    if (!isAuthed) {
      // When logged out, consider initial sync complete so UI isn't blocked
      if (!initialSyncDone) setInitialSyncDone(true)
      return
    }

    let cancelled = false

    // Initial sync gate with 5s timeout
    if (!startedRef.current) {
      startedRef.current = true
      let finished = false
      const timeoutId = setTimeout(() => {
        if (finished || cancelled) return
        console.log('[useWatermelonSync] Initial sync timeout; continuing with local data')
        setInitialSyncDone(true)
      }, 5000)

      ;(async () => {
        try {
          console.log('[useWatermelonSync] Starting initial Watermelon sync')
          await syncIfWatermelon()
        } finally {
          finished = true
          if (cancelled) return
          try { clearTimeout(timeoutId) } catch {}
          setInitialSyncDone(true)
          console.log('[useWatermelonSync] Initial Watermelon sync finished')
        }
      })()
    }

    // Foreground syncs (do not affect the initial gate)
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && isAuthed) {
        syncIfWatermelon()
      }
    })
    return () => {
      cancelled = true
      sub?.remove?.()
    }
  }, [isAuthed, initialSyncDone])

  return initialSyncDone
}
