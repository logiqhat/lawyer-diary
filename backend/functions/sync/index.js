const { ok, badRequest, notFound, doc, log, getUserId, sanitizeCase, sanitizeDate, buildCaseUpdate, buildDateUpdate, ensureCaseExists, encryptCaseFields, decryptCaseFields, encryptDateFields, decryptDateFields, encryptUpdateValues } = require('/opt/nodejs/shared');

const CASES_LIMIT = Number.parseInt(process.env.CASES_LIMIT || '0', 10);
const DATES_PER_CASE_LIMIT = Number.parseInt(process.env.DATES_PER_CASE_LIMIT || '0', 10);

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

      // Fetch only minimal fields first
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

      // Users: single record per user
      let users = { created: [], updated: [], deleted: [] };
      try {
        const u = await doc.get({ TableName: process.env.USERS_TABLE, Key: { userId } }).promise();
        if (u && u.Item) {
          const updatedAtMs = coerceMs(u.Item.updatedAtMs || u.Item.updatedAt);
          const createdAtMs = coerceMs(u.Item.createdAtMs || u.Item.updatedAt);
          if (updatedAtMs > sinceMs) {
            if (createdAtMs > sinceMs) users.created.push(u.Item);
            else users.updated.push(u.Item);
          }
        }
      } catch {}

      return ok({ changes: { users, cases, case_dates }, timestamp: now });
    }

    // ----------- PUSH -----------
    if (method === 'POST' && path === '/sync/push') {
      const { changes } = body || {};
      if (!changes || typeof changes !== 'object') return badRequest({ error: 'invalid_changes' });

      const n = Date.now();

      // ---- Helpers: validation & cascade ----
      const errors = [];
      function vStr(name, v, max) {
        if (v === undefined || v === null) return true;
        if (typeof v !== 'string') { errors.push(`${name}: not a string`); return false; }
        if (max && v.length > max) { errors.push(`${name}: too long`); return false; }
        return true;
      }
      function validateCaseIn(c) {
        let ok = true;
        ok = vStr('id', c.id, 128) && ok;
        ok = vStr('clientName', c.clientName, 50) && ok;
        ok = vStr('oppositePartyName', c.oppositePartyName, 50) && ok;
        ok = vStr('title', c.title, 200) && ok;
        ok = vStr('details', c.details, 200) && ok;
        return ok;
      }
      function validateDateIn(d) {
        let ok = true;
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

      // Users
      if (changes.users) {
        const up = async (item) => {
          const upd = { ...(item || {}), userId, updatedAt: new Date(n).toISOString(), updatedAtMs: n };
          await doc.put({ TableName: process.env.USERS_TABLE, Item: upd }).promise();
        };
        for (const u of (changes.users.created || [])) await up(u);
        for (const u of (changes.users.updated || [])) await up(u);
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
                ConditionExpression: '(attribute_not_exists(#updatedAtMs) OR #updatedAtMs <= :inc)',
                ExpressionAttributeNames: { ...up.ExpressionAttributeNames, '#updatedAtMs': 'updatedAtMs' },
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
            await doc.update({
              TableName: process.env.CASES_TABLE,
              Key: { userId, id: raw.id },
              UpdateExpression: 'SET #deleted = :true, #updatedAt = :u, #updatedAtMs = :um',
              ExpressionAttributeNames: { '#deleted': 'deleted', '#updatedAt': 'updatedAt', '#updatedAtMs': 'updatedAtMs' },
              ExpressionAttributeValues: { ':true': true, ':u': new Date(n).toISOString(), ':um': n },
            }).promise();
            await cascadeSoftDeleteCaseDates(raw.id);
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
              ConditionExpression: '(attribute_not_exists(#updatedAtMs) OR #updatedAtMs <= :inc)',
              ExpressionAttributeNames: { ...up.ExpressionAttributeNames, '#updatedAtMs': 'updatedAtMs' },
              ExpressionAttributeValues: { ...up.ExpressionAttributeValues, ':inc': incMs },
              ReturnValues: 'NONE',
            }).promise();
          } catch {}
        }
        // deleted
        for (const id of (changes.cases.deleted || [])) {
          await doc.update({
            TableName: process.env.CASES_TABLE,
            Key: { userId, id },
            UpdateExpression: 'SET #deleted = :true, #updatedAt = :u, #updatedAtMs = :um',
            ExpressionAttributeNames: { '#deleted': 'deleted', '#updatedAt': 'updatedAt', '#updatedAtMs': 'updatedAtMs' },
            ExpressionAttributeValues: { ':true': true, ':u': new Date(n).toISOString(), ':um': n },
          }).promise();
          await cascadeSoftDeleteCaseDates(id);
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
                ConditionExpression: '(attribute_not_exists(#updatedAtMs) OR #updatedAtMs <= :inc)',
                ExpressionAttributeNames: { ...up.ExpressionAttributeNames, '#updatedAtMs': 'updatedAtMs' },
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
            await doc.update({
              TableName: process.env.CASE_DATES_TABLE,
              Key: { userId, id: raw.id },
              UpdateExpression: 'SET #deleted = :true, #updatedAt = :u, #updatedAtMs = :um',
              ExpressionAttributeNames: { '#deleted': 'deleted', '#updatedAt': 'updatedAt', '#updatedAtMs': 'updatedAtMs' },
              ExpressionAttributeValues: { ':true': true, ':u': new Date(n).toISOString(), ':um': n },
            }).promise();
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
              ConditionExpression: '(attribute_not_exists(#updatedAtMs) OR #updatedAtMs <= :inc)',
              ExpressionAttributeNames: { ...up.ExpressionAttributeNames, '#updatedAtMs': 'updatedAtMs' },
              ExpressionAttributeValues: { ...up.ExpressionAttributeValues, ':inc': incMs },
              ReturnValues: 'NONE',
            }).promise();
          } catch {}
        }
        for (const id of (changes.case_dates.deleted || [])) {
          await doc.update({
            TableName: process.env.CASE_DATES_TABLE,
            Key: { userId, id },
            UpdateExpression: 'SET #deleted = :true, #updatedAt = :u, #updatedAtMs = :um',
            ExpressionAttributeNames: { '#deleted': 'deleted', '#updatedAt': 'updatedAt', '#updatedAtMs': 'updatedAtMs' },
            ExpressionAttributeValues: { ':true': true, ':u': new Date(n).toISOString(), ':um': n },
          }).promise();
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
