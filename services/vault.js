// services/vault.js
// Client-side key management and field encryption.
// - Generates a per-user 256-bit DEK
// - Caches locally (SecureStore preferred, fallback to AsyncStorage)
// - Uploads/Fetches DEK from backend for cross-device restore
// - Encrypts sensitive fields with AES-GCM

import AsyncStorage from '@react-native-async-storage/async-storage'
import { auth } from '../firebase'
import { getRemoteUserKey, putRemoteUserKey } from './userKeyService'

// Prefer SecureStore when available, fallback to AsyncStorage if not installed
let SecureStore
try {
  // eslint-disable-next-line global-require
  SecureStore = require('expo-secure-store')
} catch (_) {
  SecureStore = null
}

// Optional fallback: node-forge for AES-GCM if WebCrypto isn't available
let Forge
try {
  // eslint-disable-next-line global-require
  Forge = require('node-forge')
} catch (_) {
  Forge = null
}

const STORAGE_PREFIX = 'dek_v1_'
const ENC_ALG = 'AES-GCM'
const ENC_VERSION = 1

function uid() {
  return auth?.currentUser?.uid || null
}

function storageKey() {
  const u = uid()
  if (!u) throw new Error('Not authenticated')
  return `${STORAGE_PREFIX}${u}`
}

function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}
function hexToBytes(hex) {
  if (!hex || typeof hex !== 'string') return new Uint8Array()
  const len = hex.length
  const out = new Uint8Array(len / 2)
  for (let i = 0; i < len; i += 2) out[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  return out
}

async function getRandomBytes(n) {
  // Prefer Web Crypto if available (Expo + Hermes may polyfill)
  const g = globalThis
  if (g?.crypto?.getRandomValues) {
    const arr = new Uint8Array(n)
    g.crypto.getRandomValues(arr)
    return arr
  }
  // Last resort: try expo-random if available
  try {
    // eslint-disable-next-line global-require
    const Random = require('expo-random')
    const v = await Random.getRandomBytesAsync(n)
    return new Uint8Array(v)
  } catch (e) {
    throw new Error('No secure random available. Install react-native-get-random-values or expo-random.')
  }
}

async function loadLocalKeyHex() {
  const k = storageKey()
  try {
    if (SecureStore?.getItemAsync) {
      return (await SecureStore.getItemAsync(k)) || null
    }
  } catch {}
  try {
    return (await AsyncStorage.getItem(k)) || null
  } catch {}
  return null
}

async function saveLocalKeyHex(hex) {
  const k = storageKey()
  try {
    if (SecureStore?.setItemAsync) {
      await SecureStore.setItemAsync(k, hex)
      return true
    }
  } catch {}
  await AsyncStorage.setItem(k, hex)
  return true
}

async function importAesKey(keyBytes) {
  const g = globalThis
  const subtle = g?.crypto?.subtle || g?.msCrypto?.subtle
  if (!subtle) throw new Error('WebCrypto not available. Install a crypto lib or polyfill.')
  return subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

export async function ensureKey() {
  // 1) Try local
  let keyHex = await loadLocalKeyHex()
  if (keyHex) return { keyHex, version: ENC_VERSION }

  // 2) Try server
  try {
    const remote = await getRemoteUserKey()
    if (remote?.keyHex || remote?.key_hex) {
      keyHex = remote.keyHex || remote.key_hex
      await saveLocalKeyHex(keyHex)
      return { keyHex, version: Number(remote.version || ENC_VERSION) }
    }
  } catch (e) {
    // Non-fatal; fall through to generate
    console.warn('Fetching user key failed:', e?.message || e)
  }

  // 3) Generate new
  const raw = await getRandomBytes(32) // 256-bit
  keyHex = bytesToHex(raw)
  await saveLocalKeyHex(keyHex)
  try {
    await putRemoteUserKey(keyHex, ENC_VERSION)
  } catch (e) {
    console.warn('Uploading user key failed (will retry later):', e?.message || e)
  }
  return { keyHex, version: ENC_VERSION }
}

async function getKeyBytes() {
  const { keyHex } = await ensureKey()
  return hexToBytes(keyHex)
}

export async function encryptString(plaintext) {
  if (plaintext == null) return null
  const text = String(plaintext)
  const keyBytes = await getKeyBytes()
  const iv = await getRandomBytes(12)
  const g = globalThis
  const subtle = g?.crypto?.subtle || g?.msCrypto?.subtle
  const enc = new TextEncoder().encode(text)
  if (subtle) {
    const key = await importAesKey(keyBytes)
    const ctBuf = await subtle.encrypt({ name: 'AES-GCM', iv }, key, enc)
    const ct = new Uint8Array(ctBuf)
    return { v: ENC_VERSION, alg: ENC_ALG, iv: bytesToHex(iv), ct: bytesToHex(ct) }
  }
  // Fallback to node-forge AES-GCM if available
  if (Forge?.cipher?.createCipher) {
    // Convert Uint8Array -> forge raw bytes
    const u8ToStr = (u8) => {
      let s = ''
      for (let i = 0; i < u8.length; i += 1) s += String.fromCharCode(u8[i])
      return s
    }
    const keyRaw = u8ToStr(keyBytes)
    const ivRaw = u8ToStr(iv)
    const ptRaw = u8ToStr(enc)
    const cipher = Forge.cipher.createCipher('AES-GCM', keyRaw)
    cipher.start({ iv: ivRaw, tagLength: 128 })
    cipher.update(Forge.util.createBuffer(ptRaw))
    const ok = cipher.finish()
    if (!ok) throw new Error('Encryption failed')
    const ctRaw = cipher.output.getBytes()
    const tagRaw = cipher.mode.tag.getBytes()
    const combinedRaw = ctRaw + tagRaw
    // Convert back to Uint8Array
    const strToU8 = (str) => {
      const out = new Uint8Array(str.length)
      for (let i = 0; i < str.length; i += 1) out[i] = str.charCodeAt(i) & 0xff
      return out
    }
    const ct = strToU8(combinedRaw)
    return { v: ENC_VERSION, alg: ENC_ALG, iv: bytesToHex(iv), ct: bytesToHex(ct) }
  }
  throw new Error('No AES-GCM available. Install WebCrypto polyfill or node-forge.')
}

export async function decryptString(envelope) {
  if (!envelope) return ''
  const { iv, ct } = envelope || {}
  const keyBytes = await getKeyBytes()
  const g = globalThis
  const subtle = g?.crypto?.subtle || g?.msCrypto?.subtle
  const ivBytes = hexToBytes(String(iv || ''))
  const ctBytes = hexToBytes(String(ct || ''))
  if (subtle) {
    const key = await importAesKey(keyBytes)
    const ptBuf = await subtle.decrypt({ name: 'AES-GCM', iv: ivBytes }, key, ctBytes)
    return new TextDecoder().decode(ptBuf)
  }
  // Fallback to node-forge
  if (Forge?.cipher?.createDecipher) {
    const u8ToStr = (u8) => {
      let s = ''
      for (let i = 0; i < u8.length; i += 1) s += String.fromCharCode(u8[i])
      return s
    }
    const strToU8 = (str) => {
      const out = new Uint8Array(str.length)
      for (let i = 0; i < str.length; i += 1) out[i] = str.charCodeAt(i) & 0xff
      return out
    }
    const keyRaw = u8ToStr(keyBytes)
    const ivRaw = u8ToStr(ivBytes)
    // Split ct into ciphertext and tag (last 16 bytes)
    if (ctBytes.length < 16) throw new Error('Invalid ciphertext')
    const tagLen = 16
    const ctOnly = ctBytes.subarray(0, ctBytes.length - tagLen)
    const tagOnly = ctBytes.subarray(ctBytes.length - tagLen)
    const ctRaw = u8ToStr(ctOnly)
    const tagRaw = u8ToStr(tagOnly)
    const decipher = Forge.cipher.createDecipher('AES-GCM', keyRaw)
    decipher.start({ iv: ivRaw, tagLength: 128, tag: Forge.util.createBuffer(tagRaw).getBytes() })
    decipher.update(Forge.util.createBuffer(ctRaw))
    const ok = decipher.finish()
    if (!ok) throw new Error('Decryption failed: auth tag mismatch')
    const ptRaw = decipher.output.getBytes()
    const pt = strToU8(ptRaw)
    return new TextDecoder().decode(pt)
  }
  throw new Error('No AES-GCM available for decryption. Install WebCrypto polyfill or node-forge.')
}

// ——— Object helpers for server payloads ———
// Keep eventDate and photoUri in plaintext per requirements.

export async function encryptCaseServer(obj) {
  if (!obj) return obj
  const out = { ...obj }
  // Encrypt sensitive strings; remove plaintext
  out.clientNameEnc = await encryptString(obj.clientName || '')
  out.oppositePartyNameEnc = await encryptString(obj.oppositePartyName || '')
  out.titleEnc = await encryptString(obj.title || '')
  out.detailsEnc = await encryptString(obj.details || '')
  delete out.clientName
  delete out.oppositePartyName
  delete out.title
  delete out.details
  return out
}

export async function decryptCaseServer(obj) {
  if (!obj) return obj
  const out = { ...obj }
  if (obj.clientNameEnc) out.clientName = await decryptString(obj.clientNameEnc)
  if (obj.oppositePartyNameEnc) out.oppositePartyName = await decryptString(obj.oppositePartyNameEnc)
  if (obj.titleEnc) out.title = await decryptString(obj.titleEnc)
  if (obj.detailsEnc) out.details = await decryptString(obj.detailsEnc)
  return out
}

export async function encryptDateServer(obj) {
  if (!obj) return obj
  const out = { ...obj }
  // eventDate stays plaintext
  out.notesEnc = await encryptString(obj.notes || '')
  delete out.notes
  // photoUri stays plaintext
  return out
}

export async function decryptDateServer(obj) {
  if (!obj) return obj
  const out = { ...obj }
  if (obj.notesEnc) out.notes = await decryptString(obj.notesEnc)
  return out
}
