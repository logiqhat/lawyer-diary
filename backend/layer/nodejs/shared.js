// Shared utilities for LawyerDiary Lambdas
const AWS = require('aws-sdk');
const crypto = require('crypto');
const ddb = new AWS.DynamoDB();
const doc = new AWS.DynamoDB.DocumentClient();
const kms = new AWS.KMS();
const KMS_KEY_ID = process.env.KMS_KEY_ID || '';
const USERS_TABLE = process.env.USERS_TABLE || '';
const DEK_CACHE_TTL_MS = Number.parseInt(process.env.DEK_CACHE_TTL_MS || '1800000', 10); // 30m
const DEK_CACHE_MAX_USES = Number.parseInt(process.env.DEK_CACHE_MAX_USES || '5000', 10);
const dekCache = new Map(); // userId -> { key: Buffer, expiresAt: number, usesLeft: number }

// ----- HTTP helpers -----
function corsHeaders() {
  return { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
}
function ok(payload) { return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify(payload) }; }
function notFound(payload) { return { statusCode: 404, headers: corsHeaders(), body: JSON.stringify({ error: 'Not Found', ...payload }) }; }
function badRequest(payload) { return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify(payload) }; }

// ----- Claims helpers -----
function parseBool(val) {
  if (val === true || val === 'true') return true;
  if (val === false || val === 'false') return false;
  return false;
}

// ----- Domain helpers -----
async function ensureCaseExists(userId, caseId) {
  const res = await doc.get({ TableName: process.env.CASES_TABLE, Key: { userId, id: caseId } }).promise();
  return !!res.Item;
}

function nowTimestamps(overrides = {}) {
  const n = Date.now();
  return {
    createdAt: overrides.createdAt || new Date(n).toISOString(),
    updatedAt: overrides.updatedAt || new Date(n).toISOString(),
    createdAtMs: overrides.createdAtMs ?? n,
    updatedAtMs: overrides.updatedAtMs ?? n,
  };
}

function sanitizeCase({ userId, id, clientName, oppositePartyName, title, details, createdAt, updatedAt, createdAtMs, updatedAtMs, deleted }) {
  if (!userId) throw new Error('missing userId');
  if (!id) throw new Error('missing id');
  const t = nowTimestamps({ createdAt, updatedAt, createdAtMs, updatedAtMs });
  return {
    userId,
    id,
    clientName: clientName || '',
    oppositePartyName: oppositePartyName || '',
    title: title || `${clientName || ''} vs ${oppositePartyName || ''}`,
    details: details || '',
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    createdAtMs: t.createdAtMs,
    updatedAtMs: t.updatedAtMs,
    deleted: deleted === true ? true : false,
  };
}

function buildCaseUpdate(body) {
  const allowed = ['clientName', 'oppositePartyName', 'title', 'details'];
  const fields = {};
  for (const k of allowed) if (body[k] !== undefined) fields[k] = body[k];
  // Always set server timestamps
  const n = Date.now();
  fields.updatedAt = new Date(n).toISOString();
  fields.updatedAtMs = n;
  const keys = Object.keys(fields);
  const UpdateExpression = 'SET ' + keys.map((k) => `#${k} = :${k}`).join(', ');
  const ExpressionAttributeNames = Object.fromEntries(keys.map((k) => [`#${k}`, k]));
  const ExpressionAttributeValues = Object.fromEntries(keys.map((k) => [`:${k}`, fields[k]]));
  return { UpdateExpression, ExpressionAttributeNames, ExpressionAttributeValues };
}

function sanitizeDate({ userId, id, caseId, eventDate, notes, photoUri, createdAt, updatedAt, createdAtMs, updatedAtMs, deleted }) {
  if (!userId) throw new Error('missing userId');
  if (!id) throw new Error('missing id');
  if (!caseId) throw new Error('missing caseId');
  if (!eventDate) throw new Error('missing eventDate');
  const t = nowTimestamps({ createdAt, updatedAt, createdAtMs, updatedAtMs });
  return {
    userId,
    id,
    caseId,
    eventDate,
    notes: notes || '',
    photoUri: photoUri || null,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    createdAtMs: t.createdAtMs,
    updatedAtMs: t.updatedAtMs,
    deleted: deleted === true ? true : false,
  };
}

function buildDateUpdate(body) {
  const allowed = ['caseId', 'eventDate', 'notes'];
  const fields = {};
  for (const k of allowed) if (body[k] !== undefined) fields[k] = body[k];
  // Always set server timestamps
  const n = Date.now();
  fields.updatedAt = new Date(n).toISOString();
  fields.updatedAtMs = n;
  const keys = Object.keys(fields);
  const UpdateExpression = 'SET ' + keys.map((k) => `#${k} = :${k}`).join(', ');
  const ExpressionAttributeNames = Object.fromEntries(keys.map((k) => [`#${k}`, k]));
  const ExpressionAttributeValues = Object.fromEntries(keys.map((k) => [`:${k}`, fields[k]]));
  return { UpdateExpression, ExpressionAttributeNames, ExpressionAttributeValues };
}

module.exports = {
  ddb,
  doc,
  kms,
  log,
  getUserId,
  ok,
  notFound,
  badRequest,
  corsHeaders,
  parseBool,
  ensureCaseExists,
  sanitizeCase,
  buildCaseUpdate,
  sanitizeDate,
  buildDateUpdate,
  nowTimestamps,
  encryptCaseFields,
  decryptCaseFields,
  encryptDateFields,
  decryptDateFields,
  encryptUpdateValues,
  ensureUserEncDek,
};

// ----- Structured logger -----
function log(event, fields = {}) {
  try {
    const req = event?.requestContext || {};
    const rid = req.requestId;
    const method = req.http?.method;
    const path = event?.rawPath;
    const routeKey = event?.routeKey || (method && path ? `${method} ${path}` : undefined);
    const base = { ts: new Date().toISOString(), requestId: rid, routeKey };
    console.log(JSON.stringify({ ...base, ...fields }));
  } catch (e) {
    // best-effort; never throw from logger
    console.log(JSON.stringify({ ts: new Date().toISOString(), level: 'warn', msg: 'log_failed', err: String(e) }));
  }
}

// Resolve userId from JWT (prod) or dev fallbacks
function getUserId(event) {
  const claims = event?.requestContext?.authorizer?.jwt?.claims || {};
  const fromJwt = claims.sub || claims.user_id;
  if (fromJwt) return fromJwt;
  // In prod, require JWT (routes should enforce auth); no fallback
  const stage = (process.env.STAGE || '').toLowerCase();
  if (stage === 'prod') {
    throw new Error('unauthorized');
  }
  // Dev/testing: allow header override or default env var
  const headers = normalizeHeaders(event?.headers || {});
  const fromHeader = headers['x-test-user'];
  return fromHeader || process.env.DEFAULT_TEST_USER_ID || 'test-user';
}

function normalizeHeaders(h) {
  const out = {};
  for (const k of Object.keys(h)) out[k.toLowerCase()] = h[k];
  return out;
}

// ---------------- Field Encryption Helpers (AWS KMS) ----------------
async function encryptStringIfConfigured(value, context) {
  if (!KMS_KEY_ID || !USERS_TABLE) return value;
  if (value === null || value === undefined) return value;
  const userId = String(context?.userId || '');
  if (!userId) return value;
  const dek = await getUserDek(userId);
  return encryptWithDek(dek, String(value));
}

async function decryptStringIfConfigured(value, context) {
  if (!KMS_KEY_ID || !USERS_TABLE) return value;
  if (value === null || value === undefined) return value;
  const userId = String(context?.userId || '');
  if (!userId) return value;
  const str = String(value);
  // Accept only envelope v1 format: v1:<ivB64>:<ctB64>:<tagB64>
  if (!str.startsWith('v1:')) return value;
  const parts = str.split(':');
  if (parts.length !== 4) return value;
  try {
    const dek = await getUserDek(userId);
    const iv = Buffer.from(parts[1], 'base64');
    const ct = Buffer.from(parts[2], 'base64');
    const tag = Buffer.from(parts[3], 'base64');
    return decryptWithDek(dek, iv, ct, tag);
  } catch {
    return value;
  }
}

async function encryptCaseFields(item, userId) {
  if (!item) return item;
  const ctx = { userId: String(userId || item.userId || '') };
  const out = { ...item };
  out.clientName = await encryptStringIfConfigured(out.clientName, ctx);
  out.oppositePartyName = await encryptStringIfConfigured(out.oppositePartyName, ctx);
  out.title = await encryptStringIfConfigured(out.title, ctx);
  out.details = await encryptStringIfConfigured(out.details, ctx);
  return out;
}

async function decryptCaseFields(item, userId) {
  if (!item) return item;
  const ctx = { userId: String(userId || item.userId || '') };
  const out = { ...item };
  out.clientName = await decryptStringIfConfigured(out.clientName, ctx);
  out.oppositePartyName = await decryptStringIfConfigured(out.oppositePartyName, ctx);
  out.title = await decryptStringIfConfigured(out.title, ctx);
  out.details = await decryptStringIfConfigured(out.details, ctx);
  return out;
}

async function encryptDateFields(item, userId) {
  if (!item) return item;
  const ctx = { userId: String(userId || item.userId || '') };
  const out = { ...item };
  out.notes = await encryptStringIfConfigured(out.notes, ctx);
  return out;
}

async function decryptDateFields(item, userId) {
  if (!item) return item;
  const ctx = { userId: String(userId || item.userId || '') };
  const out = { ...item };
  out.notes = await decryptStringIfConfigured(out.notes, ctx);
  return out;
}

async function encryptUpdateValues(updateObj, allowedFields, userId) {
  if (!updateObj || !updateObj.ExpressionAttributeValues) return updateObj;
  const ctx = { userId: String(userId || '') };
  const newVals = { ...updateObj.ExpressionAttributeValues };
  for (const k of Object.keys(newVals)) {
    const fieldName = k.startsWith(':') ? k.slice(1) : k;
    if (allowedFields.includes(fieldName)) {
      if (newVals[k] !== undefined && newVals[k] !== null) {
        newVals[k] = await encryptStringIfConfigured(newVals[k], ctx);
      }
    }
  }
  return { ...updateObj, ExpressionAttributeValues: newVals };
}

// ---- Envelope encryption internals ----
async function getUserDek(userId) {
  const now = Date.now();
  const cached = dekCache.get(userId);
  if (cached && cached.expiresAt > now && cached.usesLeft > 0) {
    cached.usesLeft -= 1;
    return cached.key;
  }
  // Load user's encrypted DEK; generate if absent
  let encDek = null;
  try {
    const res = await doc.get({ TableName: USERS_TABLE, Key: { userId }, ProjectionExpression: 'encDek' }).promise();
    encDek = res?.Item?.encDek || null;
  } catch {}
  if (!encDek) {
    encDek = await ensureUserEncDek(userId);
  }
  // Decrypt DEK
  const edkBuf = Buffer.from(String(encDek), 'base64');
  const dec = await kms.decrypt({ CiphertextBlob: edkBuf, EncryptionContext: { userId } }).promise();
  const key = Buffer.from(dec.Plaintext);
  // Cache
  dekCache.set(userId, { key, expiresAt: now + DEK_CACHE_TTL_MS, usesLeft: DEK_CACHE_MAX_USES });
  return key;
}

async function ensureUserEncDek(userId) {
  if (!KMS_KEY_ID || !USERS_TABLE) throw new Error('KMS_KEY_ID/USERS_TABLE not configured');
  const res = await kms.generateDataKey({ KeyId: KMS_KEY_ID, KeySpec: 'AES_256', EncryptionContext: { userId } }).promise();
  const enc = Buffer.from(res.CiphertextBlob).toString('base64');
  // Upsert encDek to users table
  try {
    await doc.update({
      TableName: USERS_TABLE,
      Key: { userId },
      UpdateExpression: 'SET #encDek = :edk',
      ExpressionAttributeNames: { '#encDek': 'encDek' },
      ExpressionAttributeValues: { ':edk': enc },
    }).promise();
  } catch {}
  return enc;
}

function encryptWithDek(key, plaintext) {
  if (!key || !plaintext) return plaintext;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${ct.toString('base64')}:${tag.toString('base64')}`;
}

function decryptWithDek(key, iv, ct, tag) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}
