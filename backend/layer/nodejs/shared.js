// Shared utilities for LawyerDiary Lambdas
const AWS = require('aws-sdk');
const ddb = new AWS.DynamoDB();
const doc = new AWS.DynamoDB.DocumentClient();

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
