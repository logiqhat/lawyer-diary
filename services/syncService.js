// services/syncService.js
import AsyncStorage from '@react-native-async-storage/async-storage'
import { usingWatermelon } from '../config/featureFlags'
import { apiClient } from './apiClient'
import { auth } from '../firebase'
import { ensureKey, encryptCaseServer, encryptDateServer, decryptCaseServer, decryptDateServer } from './vault'
import { isEncryptionEnabled } from './remoteConfig'

let synchronize = null
let getWatermelonDatabase = null

function coerceMs(v) {
  if (typeof v === 'number') return v
  if (!v) return 0
  const n = Number(v)
  if (!Number.isNaN(n)) return n
  const p = Date.parse(v)
  return Number.isNaN(p) ? 0 : p
}

// Map server objects (camelCase) -> Watermelon raw (snake_case)
function toWmCase(s) {
  return {
    id: s.id,
    client_name: s.clientName || '',
    opposite_party_name: s.oppositePartyName || '',
    title: s.title || '',
    details: s.details || '',
    // Watermelon expects numbers
    created_at: s.createdAtMs ?? coerceMs(s.createdAt) ?? s.updatedAtMs ?? coerceMs(s.updatedAt) ?? Date.now(),
    updated_at: s.updatedAtMs ?? coerceMs(s.updatedAt) ?? s.createdAtMs ?? coerceMs(s.createdAt),
    deleted: !!s.deleted,
  }
}
function toWmDate(s) {
  return {
    id: s.id,
    case_id: s.caseId,
    event_date: s.eventDate,
    notes: s.notes || '',
    created_at: s.createdAtMs ?? coerceMs(s.createdAt) ?? s.updatedAtMs ?? coerceMs(s.updatedAt) ?? Date.now(),
    updated_at: s.updatedAtMs ?? coerceMs(s.updatedAt) ?? s.createdAtMs ?? coerceMs(s.createdAt),
    deleted: !!s.deleted,
  }
}

// Map Watermelon raw (snake_case) -> server objects (camelCase)
function toServerCase(r) {
  return {
    id: r.id,
    clientName: r.client_name,
    oppositePartyName: r.opposite_party_name,
    title: r.title,
    details: r.details || '',
    // send ms as canonical; include ISO for convenience
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : undefined,
    updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : undefined,
    createdAtMs: r.created_at,
    updatedAtMs: r.updated_at,
    deleted: !!r.deleted,
  }
}
function toServerDate(r) {
  return {
    id: r.id,
    caseId: r.case_id,
    eventDate: r.event_date,
    notes: r.notes || '',
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : undefined,
    updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : undefined,
    createdAtMs: r.created_at,
    updatedAtMs: r.updated_at,
    deleted: !!r.deleted,
  }
}

const LAST_KEY = 'sync:lastPulledAt'

async function getLastPulledAt() {
  try {
    const v = await AsyncStorage.getItem(LAST_KEY)
    return v ? Number(v) : 0
  } catch {
    return 0
  }
}
async function setLastPulledAt(ms) {
  try { await AsyncStorage.setItem(LAST_KEY, String(ms || 0)) } catch {}
}

export async function syncNow() {
  if (!usingWatermelon()) return false
  if (!auth?.currentUser) return false
  const encrypting = await isEncryptionEnabled()
  // Ensure encryption key exists if feature is enabled. Non-fatal on failure.
  if (encrypting) {
    try { await ensureKey() } catch (e) { console.warn('Encryption key not available; proceeding without decryption:', e?.message || e) }
  }

  // Lazy import to avoid bundling when not used
  if (!synchronize) {
    try {
      // eslint-disable-next-line global-require
      const mod = require('@nozbe/watermelondb/sync')
      // Support both ESM/CJS shapes: { synchronize } or default export
      synchronize = mod?.synchronize || mod?.default || mod
    } catch (e) {
      console.warn('Watermelon sync unavailable:', e?.message || e)
      return false
    }
  }
  if (!getWatermelonDatabase) {
    try {
      // eslint-disable-next-line global-require
      getWatermelonDatabase = require('../database/wmProvider').getWatermelonDatabase
    } catch (e) {
      console.warn('Watermelon DB unavailable:', e?.message || e)
      return false
    }
  }

  const database = await getWatermelonDatabase()
  const lastSaved = await getLastPulledAt()

  await synchronize({
    database,
    pullChanges: async ({ lastPulledAt }) => {
      const since = typeof lastPulledAt === 'number' ? lastPulledAt : (lastSaved || 0)
      const { data } = await apiClient.post('/sync/pull', { body: { last_pulled_at: since } })
      const { changes, timestamp } = data || {}
      let wmChanges
      if (encrypting) {
        // Decrypt if encrypted fields present; otherwise accept plaintext for compat
        const decCases = []
        for (const s of (changes?.cases?.created || [])) {
          if (s && (s.clientNameEnc || s.oppositePartyNameEnc || s.titleEnc || s.detailsEnc)) {
            // eslint-disable-next-line no-await-in-loop
            decCases.push(await decryptCaseServer(s))
          } else {
            decCases.push(s)
          }
        }
        const updCases = []
        for (const s of (changes?.cases?.updated || [])) {
          if (s && (s.clientNameEnc || s.oppositePartyNameEnc || s.titleEnc || s.detailsEnc)) {
            // eslint-disable-next-line no-await-in-loop
            updCases.push(await decryptCaseServer(s))
          } else {
            updCases.push(s)
          }
        }
        const decDates = []
        for (const s of (changes?.case_dates?.created || [])) {
          if (s && s.notesEnc) {
            // eslint-disable-next-line no-await-in-loop
            decDates.push(await decryptDateServer(s))
          } else {
            decDates.push(s)
          }
        }
        const updDates = []
        for (const s of (changes?.case_dates?.updated || [])) {
          if (s && s.notesEnc) {
            // eslint-disable-next-line no-await-in-loop
            updDates.push(await decryptDateServer(s))
          } else {
            updDates.push(s)
          }
        }
        wmChanges = {
          cases: {
            created: decCases.map(toWmCase),
            updated: updCases.map(toWmCase),
            deleted: changes?.cases?.deleted || [],
          },
          case_dates: {
            created: decDates.map(toWmDate),
            updated: updDates.map(toWmDate),
            deleted: changes?.case_dates?.deleted || [],
          },
        }
      } else {
        wmChanges = {
          cases: {
            created: (changes?.cases?.created || []),
            updated: (changes?.cases?.updated || []),
            deleted: changes?.cases?.deleted || [],
          },
          case_dates: {
            created: (changes?.case_dates?.created || []),
            updated: (changes?.case_dates?.updated || []),
            deleted: changes?.case_dates?.deleted || [],
          },
        }
      }
      // Map to WM rows
      wmChanges = {
        cases: {
          created: (wmChanges.cases.created || []).map(toWmCase),
          updated: (wmChanges.cases.updated || []).map(toWmCase),
          deleted: wmChanges.cases.deleted || [],
        },
        case_dates: {
          created: (wmChanges.case_dates.created || []).map(toWmDate),
          updated: (wmChanges.case_dates.updated || []).map(toWmDate),
          deleted: wmChanges.case_dates.deleted || [],
        },
      }
      // Persist timestamp immediately to survive app restarts
      if (typeof timestamp === 'number') await setLastPulledAt(timestamp)
      return { changes: wmChanges, timestamp }
    },
    pushChanges: async ({ changes, lastPulledAt }) => {
      const payload = {
        last_pulled_at: lastPulledAt || (await getLastPulledAt()) || 0,
        changes: {
          users: { created: [], updated: [], deleted: [] },
          cases: { created: [], updated: [], deleted: changes?.cases?.deleted || [] },
          case_dates: { created: [], updated: [], deleted: changes?.case_dates?.deleted || [] },
        },
      }

      // Map Watermelon -> server and encrypt sensitive fields (eventDate, photoUri remain plaintext)
      // use outer encrypting
      if (encrypting) {
        for (const r of (changes?.cases?.created || [])) {
          const plain = toServerCase(r)
          // eslint-disable-next-line no-await-in-loop
          payload.changes.cases.created.push(await encryptCaseServer(plain))
        }
        for (const r of (changes?.cases?.updated || [])) {
          const plain = toServerCase(r)
          // eslint-disable-next-line no-await-in-loop
          payload.changes.cases.updated.push(await encryptCaseServer(plain))
        }
        for (const r of (changes?.case_dates?.created || [])) {
          const plain = toServerDate(r)
          // eslint-disable-next-line no-await-in-loop
          payload.changes.case_dates.created.push(await encryptDateServer(plain))
        }
        for (const r of (changes?.case_dates?.updated || [])) {
          const plain = toServerDate(r)
          // eslint-disable-next-line no-await-in-loop
          payload.changes.case_dates.updated.push(await encryptDateServer(plain))
        }
      } else {
        // Backward-compatible plaintext payloads
        payload.changes.cases.created = (changes?.cases?.created || []).map(toServerCase)
        payload.changes.cases.updated = (changes?.cases?.updated || []).map(toServerCase)
        payload.changes.case_dates.created = (changes?.case_dates?.created || []).map(toServerDate)
        payload.changes.case_dates.updated = (changes?.case_dates?.updated || []).map(toServerDate)
      }

      await apiClient.post('/sync/push', { body: payload })
    },
  })

  // After a successful sync, refresh Redux slices from the current DB
  try {
    // Lazy-require to avoid circular imports during store initialization
    // eslint-disable-next-line global-require
    const { store } = require('../store/store')
    // eslint-disable-next-line global-require
    const { fetchCases } = require('../store/casesSlice')
    // eslint-disable-next-line global-require
    const { fetchDates } = require('../store/caseDatesSlice')
    setTimeout(() => {
      try { store.dispatch(fetchCases()) } catch {}
      try { store.dispatch(fetchDates()) } catch {}
    }, 0)
  } catch (e) {
    console.warn('Post-sync refresh failed:', e?.message || e)
  }

  return true
}

export async function syncIfWatermelon() {
  if (!usingWatermelon()) return false
  try {
    return await syncNow()
  } catch (e) {
    console.warn('Sync failed:', e?.message || e)
    return false
  }
}
