// services/remoteConfig.js
// Centralized Firebase Remote Config access and caching.

let cached = { showUsageSummary: false, encryptionEnabled: false, loaded: false }

function getRc() {
  // Dynamically require to avoid crashes if module not linked in some builds
  // eslint-disable-next-line global-require
  const mod = require('@react-native-firebase/remote-config')
  return mod?.default ? mod.default() : mod()
}

async function ensureDefaults(rc) {
  try {
    await rc.setDefaults({ show_usage_summary: false, enable_client_encryption: false })
  } catch {}
}

async function ensureSettings(rc) {
  try {
    await rc.setConfigSettings({ minimumFetchIntervalMillis: __DEV__ ? 0 : 60 * 60 * 1000 })
  } catch {}
}

export async function loadRemoteFlags() {
  try {
    const rc = getRc()
    await ensureDefaults(rc)
    await ensureSettings(rc)
    const activated = await rc.fetchAndActivate()
    const show = rc.getValue('show_usage_summary').asBoolean()
    const enc = rc.getValue('enable_client_encryption').asBoolean()
    cached = { showUsageSummary: !!show, encryptionEnabled: !!enc, loaded: true }
    try { console.log('[RemoteConfig]', { activated, ...cached }) } catch {}
    return { showUsageSummary: !!show, encryptionEnabled: !!enc }
  } catch (e) {
    // Keep defaults on failure
    cached.loaded = true
    return { showUsageSummary: false, encryptionEnabled: false }
  }
}

export function getRemoteFlags() {
  if (cached.loaded) return { showUsageSummary: cached.showUsageSummary, encryptionEnabled: cached.encryptionEnabled }
  try {
    const rc = getRc()
    const showVal = rc.getValue('show_usage_summary')
    const encVal = rc.getValue('enable_client_encryption')
    const show = typeof showVal?.asBoolean === 'function' ? showVal.asBoolean() : !!showVal
    const enc = typeof encVal?.asBoolean === 'function' ? encVal.asBoolean() : !!encVal
    return { showUsageSummary: !!show, encryptionEnabled: !!enc }
  } catch {
    return { showUsageSummary: false, encryptionEnabled: false }
  }
}

export async function isEncryptionEnabled() {
  if (cached.loaded) return cached.encryptionEnabled
  try {
    const rc = getRc()
    await ensureDefaults(rc)
    const v = rc.getValue('enable_client_encryption')
    return typeof v?.asBoolean === 'function' ? v.asBoolean() : !!v
  } catch {
    return false
  }
}

// For tests
export function __resetRemoteConfigCacheForTests() { cached = { showUsageSummary: false, encryptionEnabled: false, loaded: false } }

