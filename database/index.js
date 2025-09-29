// database/index.js
// Single import surface for data layer. Chooses provider at runtime
// based on config/featureFlags.

import { getDbProvider } from '../config/featureFlags';

// Import existing sqlite services
import { caseService as sqliteCaseService } from './caseService';
import { dateService as sqliteDateService } from './dateService';

// Lazy/optional Watermelon provider (stubs for now)
let wmCaseService = null;
let wmDateService = null;

function ensureWatermelonLoaded() {
  if (wmCaseService && wmDateService) return;
  // To keep install optional, require inside try/catch
  try {
    // eslint-disable-next-line global-require
    const wm = require('./wmProvider');
    wmCaseService = wm.wmCaseService;
    wmDateService = wm.wmDateService;
  } catch (e) {
    console.warn('[DB] Watermelon provider not available. Falling back to SQLite. Error:', e?.message || e);
  }
}

const provider = getDbProvider();
try {
  console.log(`[DB] Using provider: ${provider}`);
} catch {}

let caseService = sqliteCaseService;
let dateService = sqliteDateService;

if (provider === 'watermelon') {
  ensureWatermelonLoaded();
  if (wmCaseService && wmDateService) {
    caseService = wmCaseService;
    dateService = wmDateService;
  }
}

export { caseService, dateService };
