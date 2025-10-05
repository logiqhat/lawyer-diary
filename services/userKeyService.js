// services/userKeyService.js
// Lightweight client for storing/fetching the user DEK from your backend.
// Expects backend endpoints:
//  - GET  /users/key          -> { key_hex: string, version: number }
//  - POST /users/key          -> { ok: true }

import { apiClient } from './apiClient'
import { auth } from '../firebase'

function requireAuthUid() {
  const uid = auth?.currentUser?.uid
  if (!uid) throw new Error('Not authenticated')
  return uid
}

export async function getRemoteUserKey() {
  const uid = requireAuthUid()
  try {
    const { data } = await apiClient.get('/users/key', { query: { uid } })
    if (!data || !data.key_hex) return null
    return { keyHex: String(data.key_hex), version: Number(data.version || 1) }
  } catch (e) {
    // Treat 404 as no key set yet
    if (e?.status === 404) return null
    throw e
  }
}

export async function putRemoteUserKey(keyHex, version = 1) {
  const uid = requireAuthUid()
  await apiClient.post('/users/key', { body: { uid, key_hex: String(keyHex), version: Number(version) } })
  return true
}

