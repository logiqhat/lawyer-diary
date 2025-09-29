import { useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { usingWatermelon } from '../config/featureFlags'
import { syncIfWatermelon } from '../services/syncService'
import { auth } from '../firebase'
import { onAuthStateChanged } from 'firebase/auth'

export function useWatermelonSync() {
  const startedRef = useRef(false)
  const [isAuthed, setIsAuthed] = useState(!!auth?.currentUser)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setIsAuthed(!!u))
    return () => unsub()
  }, [])

  useEffect(() => {
    if (!usingWatermelon()) return
    if (!isAuthed) return
    if (!startedRef.current) {
      startedRef.current = true
      syncIfWatermelon()
    }
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && isAuthed) {
        syncIfWatermelon()
      }
    })
    return () => sub?.remove?.()
  }, [isAuthed])
}
