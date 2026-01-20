const { ok, badRequest, notFound, doc, log, getUserId, sanitizeCase, sanitizeDate, buildCaseUpdate, buildDateUpdate, ensureCaseExists, encryptCaseFields, decryptCaseFields, encryptDateFields, decryptDateFields, encryptUpdateValues } = require('/opt/nodejs/shared');

const CASES_LIMIT = Number.parseInt(process.env.CASES_LIMIT || '0', 10);
const DATES_PER_CASE_LIMIT = Number.parseInt(process.env.DATES_PER_CASE_LIMIT || '0', 10);
const MAX_CASE_CHANGES = Number.parseInt(process.env.SYNC_CASES_MAX || '100', 10);
const MAX_DATE_CHANGES = Number.parseInt(process.env.SYNC_DATES_MAX || '1000', 10);
const MAX_DATE_ARRAY = Number.parseInt(process.env.SYNC_DATES_MAX_ARRAY || '500', 10);

// Helpers
function coerceMs(v) {
  if (typeof v === 'number') return v;
  if (!v) return 0;
  const n = Number(v);
  if (!Number.isNaN(n)) return n;
  const p = Date.parse(v);
  return Number.isNaN(p) ? 0 : p;
}

function partitionChanges(items, sinceMs, type) {
  const created = [];
  const updated = [];
  const deleted = [];
  for (const it of items) {
    const createdAtMs = coerceMs(it.createdAtMs || it.createdAt);
    const updatedAtMs = coerceMs(it.updatedAtMs || it.updatedAt);
    if (updatedAtMs <= sinceMs) continue;
    if (it.deleted) {
      deleted.push(it.id);
      continue;
    }
    if (createdAtMs > sinceMs) created.push(it);
    else updated.push(it);
  }
  return { created, updated, deleted };
}

function toCaseSync(item) {
  if (!item) return null;
  const createdAtMs = coerceMs(item.createdAtMs || item.createdAt);
  const updatedAtMs = coerceMs(item.updatedAtMs || item.updatedAt) || createdAtMs;
  return {
    id: item.id,
    clientName: item.clientName || '',
    oppositePartyName: item.oppositePartyName || '',
    title: item.title || '',
    details: item.details || '',
    createdAtMs,
    updatedAtMs,
    deleted: item.deleted === true,
  };
}

function toDateSync(item) {
  if (!item) return null;
  const createdAtMs = coerceMs(item.createdAtMs || item.createdAt);
  const updatedAtMs = coerceMs(item.updatedAtMs || item.updatedAt) || createdAtMs;
  return {
    id: item.id,
    caseId: item.caseId,
    eventDate: item.eventDate,
    notes: item.notes || '',
    createdAtMs,
    updatedAtMs,
    deleted: item.deleted === true,
  };
}

async function queryAllByUser(TableName, userId, projection) {
  const out = [];
  let lastKey;
  do {
    const res = await doc.query({
      TableName,
      KeyConditionExpression: 'userId = :u',
      ExpressionAttributeValues: { ':u': userId },
      ExclusiveStartKey: lastKey,
      ProjectionExpression: projection,
    }).promise();
    out.push(...(res.Items || []));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return out;
}

exports.handler = async (event) => {
  try {
    const method = event.requestContext?.http?.method || 'UNKNOWN';
    const path = event.rawPath || '/';
    const userId = getUserId(event);
    const body = event.body ? JSON.parse(event.body) : {};

    // ----------- PULL -----------
    if (method === 'POST' && path === '/sync/pull') {
      const sinceMs = coerceMs(body.last_pulled_at || 0);
      const now = Date.now();

      // Fetch only fields needed for sync output
      const caseKeys = await queryAllByUser(process.env.CASES_TABLE, userId, 'id, createdAt, createdAtMs, updatedAt, updatedAtMs, deleted, clientName, oppositePartyName, title, details');
      const dateKeys = await queryAllByUser(process.env.CASE_DATES_TABLE, userId, 'id, caseId, eventDate, notes, createdAt, createdAtMs, updatedAt, updatedAtMs, deleted');

      const cases = partitionChanges(caseKeys, sinceMs, 'cases');
      const case_dates = partitionChanges(dateKeys, sinceMs, 'case_dates');

      // Decrypt sensitive fields for outbound sync
      try {
        if (cases.created && cases.created.length) {
          cases.created = await Promise.all(cases.created.map((c) => decryptCaseFields(c, userId)));
        }
        if (cases.updated && cases.updated.length) {
          cases.updated = await Promise.all(cases.updated.map((c) => decryptCaseFields(c, userId)));
        }
        if (case_dates.created && case_dates.created.length) {
          case_dates.created = await Promise.all(case_dates.created.map((d) => decryptDateFields(d, userId)));
        }
        if (case_dates.updated && case_dates.updated.length) {
          case_dates.updated = await Promise.all(case_dates.updated.map((d) => decryptDateFields(d, userId)));
        }
      } catch (e) {
        log(event, { level: 'warn', userId, action: 'sync.pull.decrypt_warn', error: String(e) });
      }

      // Trim payload to fields required by the app
      if (cases.created && cases.created.length) cases.created = cases.created.map(toCaseSync).filter(Boolean);
      if (cases.updated && cases.updated.length) cases.updated = cases.updated.map(toCaseSync).filter(Boolean);
      if (case_dates.created && case_dates.created.length) case_dates.created = case_dates.created.map(toDateSync).filter(Boolean);
      if (case_dates.updated && case_dates.updated.length) case_dates.updated = case_dates.updated.map(toDateSync).filter(Boolean);

      return ok({ changes: { cases, case_dates }, timestamp: now });
    }

    // ----------- PUSH -----------
    if (method === 'POST' && path === '/sync/push') {
      const { changes } = body || {};
      if (!changes || typeof changes !== 'object') return badRequest({ error: 'invalid_changes' });

      const n = Date.now();
      const casesCreated = changes?.cases?.created || [];
      const casesUpdated = changes?.cases?.updated || [];
      const casesDeleted = changes?.cases?.deleted || [];
      const datesCreated = changes?.case_dates?.created || [];
      const datesUpdated = changes?.case_dates?.updated || [];
      const datesDeleted = changes?.case_dates?.deleted || [];
      const casesTotal = casesCreated.length + casesUpdated.length + casesDeleted.length;
      const datesTotal = datesCreated.length + datesUpdated.length + datesDeleted.length;
      if (casesTotal > MAX_CASE_CHANGES) {
        return badRequest({ error: 'sync_cases_too_large', max: MAX_CASE_CHANGES, total: casesTotal });
      }
      if (datesTotal > MAX_DATE_CHANGES) {
        return badRequest({ error: 'sync_dates_too_large', max: MAX_DATE_CHANGES, total: datesTotal });
      }
      if (datesCreated.length > MAX_DATE_ARRAY || datesUpdated.length > MAX_DATE_ARRAY || datesDeleted.length > MAX_DATE_ARRAY) {
        return badRequest({
          error: 'sync_dates_array_too_large',
          max: MAX_DATE_ARRAY,
          created: datesCreated.length,
          updated: datesUpdated.length,
          deleted: datesDeleted.length,
        });
      }

      // ---- Helpers: validation & cascade ----
      const errors = [];
      function vStr(name, v, max) {
        if (v === undefined || v === null) return true;
        if (typeof v !== 'string') { errors.push(`${name}: not a string`); return false; }
        if (max && v.length > max) { errors.push(`${name}: too long`); return false; }
        return true;
      }
      function isValidId(v) {
        return typeof v === 'string' && v.length > 0 && v.length <= 128;
      }
      function validateCaseIn(c) {
        let ok = true;
        if (!c.id) { errors.push('id: required'); ok = false; }
        ok = vStr('id', c.id, 128) && ok;
        ok = vStr('clientName', c.clientName, 50) && ok;
        ok = vStr('oppositePartyName', c.oppositePartyName, 50) && ok;
        ok = vStr('title', c.title, 200) && ok;
        ok = vStr('details', c.details, 200) && ok;
        return ok;
      }
      function validateDateIn(d) {
        let ok = true;
        if (!d.id) { errors.push('id: required'); ok = false; }
        if (!d.caseId) { errors.push('caseId: required'); ok = false; }
        ok = vStr('id', d.id, 128) && ok;
        ok = vStr('caseId', d.caseId, 128) && ok;
        ok = vStr('eventDate', d.eventDate, 32) && ok;
        if (d.eventDate && !/^\d{4}-\d{2}-\d{2}$/.test(d.eventDate)) { errors.push('eventDate: invalid'); ok = false; }
        ok = vStr('notes', d.notes, 200) && ok;
        ok = vStr('photoUri', d.photoUri, 2048) && ok;
        return ok;
      }
      async function cascadeSoftDeleteCaseDates(caseId) {
        try {
          let lastKey;
          let total = 0;
          do {
            const res = await doc.query({
              TableName: process.env.CASE_DATES_TABLE,
              KeyConditionExpression: 'userId = :u',
              ExpressionAttributeValues: { ':u': userId },
              ExclusiveStartKey: lastKey,
              ProjectionExpression: 'id, caseId',
            }).promise();
            const items = (res.Items || []).filter((i) => i.caseId === caseId);
            for (const d of items) {
              await doc.update({
                TableName: process.env.CASE_DATES_TABLE,
                Key: { userId, id: d.id },
                UpdateExpression: 'SET #deleted = :true, #updatedAt = :u, #updatedAtMs = :um',
                ExpressionAttributeNames: { '#deleted': 'deleted', '#updatedAt': 'updatedAt', '#updatedAtMs': 'updatedAtMs' },
                ExpressionAttributeValues: { ':true': true, ':u': new Date(n).toISOString(), ':um': n },
              }).promise();
              total += 1;
            }
            lastKey = res.LastEvaluatedKey;
          } while (lastKey);
          log(event, { level: 'info', userId, action: 'sync.cases.cascade_deleted', caseId, total });
        } catch (e) {
          log(event, { level: 'error', userId, action: 'sync.cases.cascade_err', caseId, error: String(e) });
        }
      }

      // Cases
      if (changes.cases) {
        // Enforce CASES_LIMIT (if configured)
        let remainingCases = Infinity;
        if (CASES_LIMIT > 0) {
          try {
            const countRes = await doc.query({
              TableName: process.env.CASES_TABLE,
              KeyConditionExpression: 'userId = :u',
              ExpressionAttributeValues: { ':u': userId },
              Select: 'COUNT',
            }).promise();
            remainingCases = Math.max(0, CASES_LIMIT - (countRes.Count || 0));
          } catch {}
        }
        // created
        for (const raw of (changes.cases.created || [])) {
          const c = { ...raw };
          delete c.deleted; // clients cannot set deletion state directly
          if (!validateCaseIn(c)) { log(event, { level: 'warn', userId, action: 'sync.cases.created.invalid', id: c?.id, errors }); continue; }
          if (CASES_LIMIT > 0 && remainingCases <= 0) {
            log(event, { level: 'warn', userId, action: 'sync.cases.created.limit_reached', limit: CASES_LIMIT, id: c.id });
            continue;
          }
          let item = sanitizeCase({ ...c, userId });
          item = await encryptCaseFields(item, userId);
          try {
            await doc.put({ TableName: process.env.CASES_TABLE, Item: item, ConditionExpression: 'attribute_not_exists(userId) AND attribute_not_exists(id)' }).promise();
            if (remainingCases !== Infinity) remainingCases -= 1;
          } catch (e) {
            // If exists, treat as update
            let up = buildCaseUpdate(c);
            up = await encryptUpdateValues(up, ['clientName','oppositePartyName','title','details'], userId);
            const incMs = coerceMs(c.updatedAtMs || c.updatedAt);
            try {
            await doc.update({
              TableName: process.env.CASES_TABLE,
              Key: { userId, id: c.id },
              ...up,
              ConditionExpression: 'attribute_exists(#id) AND (attribute_not_exists(#updatedAtMs) OR #updatedAtMs <= :inc)',
              ExpressionAttributeNames: { ...up.ExpressionAttributeNames, '#updatedAtMs': 'updatedAtMs', '#id': 'id' },
              ExpressionAttributeValues: { ...up.ExpressionAttributeValues, ':inc': incMs },
              ReturnValues: 'NONE',
            }).promise();
            } catch (err) {
              // ignore conditional failures
            }
          }
        }
        // updated
        for (const raw of (changes.cases.updated || [])) {
          const c = { ...raw };
          // Fallback: treat updated item with deleted=true as a deletion
          if (raw && raw.deleted === true) {
            try {
              await doc.update({
                TableName: process.env.CASES_TABLE,
                Key: { userId, id: raw.id },
                UpdateExpression: 'SET #deleted = :true, #updatedAt = :u, #updatedAtMs = :um',
                ConditionExpression: 'attribute_exists(#id)',
                ExpressionAttributeNames: { '#deleted': 'deleted', '#updatedAt': 'updatedAt', '#updatedAtMs': 'updatedAtMs', '#id': 'id' },
                ExpressionAttributeValues: { ':true': true, ':u': new Date(n).toISOString(), ':um': n },
              }).promise();
              await cascadeSoftDeleteCaseDates(raw.id);
            } catch (e) {
              if (e && e.code !== 'ConditionalCheckFailedException') throw e;
            }
            continue;
          }
          delete c.deleted;
          if (!validateCaseIn(c)) { log(event, { level: 'warn', userId, action: 'sync.cases.updated.invalid', id: c?.id, errors }); continue; }
          try {
            const incMs = coerceMs(c.updatedAtMs || c.updatedAt);
            let up = buildCaseUpdate(c);
            up = await encryptUpdateValues(up, ['clientName','oppositePartyName','title','details'], userId);
            await doc.update({
              TableName: process.env.CASES_TABLE,
              Key: { userId, id: c.id },
              ...up,
              ConditionExpression: 'attribute_exists(#id) AND (attribute_not_exists(#updatedAtMs) OR #updatedAtMs <= :inc)',
              ExpressionAttributeNames: { ...up.ExpressionAttributeNames, '#updatedAtMs': 'updatedAtMs', '#id': 'id' },
              ExpressionAttributeValues: { ...up.ExpressionAttributeValues, ':inc': incMs },
              ReturnValues: 'NONE',
            }).promise();
          } catch {}
        }
        // deleted
        for (const id of (changes.cases.deleted || [])) {
          if (!isValidId(id)) {
            log(event, { level: 'warn', userId, action: 'sync.cases.deleted.invalid', id });
            continue;
          }
          try {
            await doc.update({
              TableName: process.env.CASES_TABLE,
              Key: { userId, id },
              UpdateExpression: 'SET #deleted = :true, #updatedAt = :u, #updatedAtMs = :um',
              ConditionExpression: 'attribute_exists(#id)',
              ExpressionAttributeNames: { '#deleted': 'deleted', '#updatedAt': 'updatedAt', '#updatedAtMs': 'updatedAtMs', '#id': 'id' },
              ExpressionAttributeValues: { ':true': true, ':u': new Date(n).toISOString(), ':um': n },
            }).promise();
            await cascadeSoftDeleteCaseDates(id);
          } catch (e) {
            if (e && e.code !== 'ConditionalCheckFailedException') throw e;
          }
        }
      }

      // Dates
      if (changes.case_dates) {
        // Prepare per-case counts cache for limits
        const countsByCase = {};
        async function ensureCaseCount(caseId) {
          if (countsByCase[caseId] !== undefined) return countsByCase[caseId];
          let count = 0;
          if (DATES_PER_CASE_LIMIT > 0) {
            try {
              const countRes = await doc.query({
                TableName: process.env.CASE_DATES_TABLE,
                KeyConditionExpression: 'userId = :u',
                ExpressionAttributeValues: { ':u': userId, ':c': caseId },
                FilterExpression: 'caseId = :c',
                Select: 'COUNT',
              }).promise();
              count = countRes.Count || 0;
            } catch {}
          }
          countsByCase[caseId] = count;
          return count;
        }
        for (const raw of (changes.case_dates.created || [])) {
          const d = { ...raw };
          delete d.deleted;
          delete d.photoUri; // local-only on device; do not sync
          if (!validateDateIn(d)) { log(event, { level: 'warn', userId, action: 'sync.dates.created.invalid', id: d?.id, errors }); continue; }
          // Ensure parent case exists
          try {
            const exists = await ensureCaseExists(userId, d.caseId);
            if (!exists) { log(event, { level: 'warn', userId, action: 'sync.dates.created.case_missing', caseId: d.caseId, id: d.id }); continue; }
          } catch {}
          // Enforce per-case limit
          if (DATES_PER_CASE_LIMIT > 0) {
            const current = await ensureCaseCount(d.caseId);
            if (current >= DATES_PER_CASE_LIMIT) {
              log(event, { level: 'warn', userId, action: 'sync.dates.created.limit_reached', caseId: d.caseId, limit: DATES_PER_CASE_LIMIT, id: d.id });
              continue;
            }
          }
          let item = sanitizeDate({ ...d, userId });
          item = await encryptDateFields(item, userId);
          try {
            await doc.put({ TableName: process.env.CASE_DATES_TABLE, Item: item, ConditionExpression: 'attribute_not_exists(userId) AND attribute_not_exists(id)' }).promise();
            if (countsByCase[d.caseId] !== undefined) countsByCase[d.caseId] += 1;
          } catch (e) {
            let up = buildDateUpdate(d);
            up = await encryptUpdateValues(up, ['notes'], userId);
            const incMs = coerceMs(d.updatedAtMs || d.updatedAt);
            try {
            await doc.update({
              TableName: process.env.CASE_DATES_TABLE,
              Key: { userId, id: d.id },
              ...up,
              ConditionExpression: 'attribute_exists(#id) AND (attribute_not_exists(#updatedAtMs) OR #updatedAtMs <= :inc)',
              ExpressionAttributeNames: { ...up.ExpressionAttributeNames, '#updatedAtMs': 'updatedAtMs', '#id': 'id' },
              ExpressionAttributeValues: { ...up.ExpressionAttributeValues, ':inc': incMs },
              ReturnValues: 'NONE',
            }).promise();
            } catch (err) {
              // ignore conditional failures
            }
          }
        }
        for (const raw of (changes.case_dates.updated || [])) {
          const d = { ...raw };
          if (raw && raw.deleted === true) {
            try {
              await doc.update({
                TableName: process.env.CASE_DATES_TABLE,
                Key: { userId, id: raw.id },
                UpdateExpression: 'SET #deleted = :true, #updatedAt = :u, #updatedAtMs = :um',
                ConditionExpression: 'attribute_exists(#id)',
                ExpressionAttributeNames: { '#deleted': 'deleted', '#updatedAt': 'updatedAt', '#updatedAtMs': 'updatedAtMs', '#id': 'id' },
                ExpressionAttributeValues: { ':true': true, ':u': new Date(n).toISOString(), ':um': n },
              }).promise();
            } catch (e) {
              if (e && e.code !== 'ConditionalCheckFailedException') throw e;
            }
            continue;
          }
          delete d.deleted;
          delete d.photoUri; // local-only on device; do not sync
          if (!validateDateIn(d)) { log(event, { level: 'warn', userId, action: 'sync.dates.updated.invalid', id: d?.id, errors }); continue; }
          try {
            if (d.caseId) {
              const exists = await ensureCaseExists(userId, d.caseId);
              if (!exists) { log(event, { level: 'warn', userId, action: 'sync.dates.updated.case_missing', caseId: d.caseId, id: d.id }); continue; }
            }
            const incMs = coerceMs(d.updatedAtMs || d.updatedAt);
            let up = buildDateUpdate(d);
            up = await encryptUpdateValues(up, ['notes'], userId);
            await doc.update({
              TableName: process.env.CASE_DATES_TABLE,
              Key: { userId, id: d.id },
              ...up,
              ConditionExpression: 'attribute_exists(#id) AND (attribute_not_exists(#updatedAtMs) OR #updatedAtMs <= :inc)',
              ExpressionAttributeNames: { ...up.ExpressionAttributeNames, '#updatedAtMs': 'updatedAtMs', '#id': 'id' },
              ExpressionAttributeValues: { ...up.ExpressionAttributeValues, ':inc': incMs },
              ReturnValues: 'NONE',
            }).promise();
          } catch {}
        }
        for (const id of (changes.case_dates.deleted || [])) {
          if (!isValidId(id)) {
            log(event, { level: 'warn', userId, action: 'sync.dates.deleted.invalid', id });
            continue;
          }
          try {
            await doc.update({
              TableName: process.env.CASE_DATES_TABLE,
              Key: { userId, id },
              UpdateExpression: 'SET #deleted = :true, #updatedAt = :u, #updatedAtMs = :um',
              ConditionExpression: 'attribute_exists(#id)',
              ExpressionAttributeNames: { '#deleted': 'deleted', '#updatedAt': 'updatedAt', '#updatedAtMs': 'updatedAtMs', '#id': 'id' },
              ExpressionAttributeValues: { ':true': true, ':u': new Date(n).toISOString(), ':um': n },
            }).promise();
          } catch (e) {
            if (e && e.code !== 'ConditionalCheckFailedException') throw e;
          }
        }
      }

      return ok({ ok: true });
    }

    return notFound({});
  } catch (err) {
    console.error(err);
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Internal Server Error' }) };
  }
};
