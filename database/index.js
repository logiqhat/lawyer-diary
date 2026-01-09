// database/index.js
// Single import surface for data layer. WatermelonDB is the only provider.
import { wmCaseService, wmDateService } from './wmProvider';

try {
  console.log('[DB] Using provider: watermelon');
} catch {}

export const caseService = wmCaseService;
export const dateService = wmDateService;
