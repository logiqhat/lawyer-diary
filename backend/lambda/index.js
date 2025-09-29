// Minimal Lambda stub for API Gateway HTTP API (payload format v2.0)
// It expects Authorization JWT (Firebase) to be validated by API Gateway JWT authorizer.
// This stub just echoes inputs; replace with real DynamoDB writes.

exports.handler = async (event) => {
  try {
    const routeKey = event.routeKey || `${event.requestContext?.http?.method} ${event.rawPath}`;
    const method = event.requestContext?.http?.method || 'UNKNOWN';
    const path = event.rawPath || '/';
    const params = event.pathParameters || {};
    const query = event.queryStringParameters || {};
    const body = event.body ? JSON.parse(event.body) : {};

    // Firebase UID from JWT (when using HTTP API JWT authorizer with Firebase)
    const jwtClaims = event.requestContext?.authorizer?.jwt?.claims || {};
    const userId = jwtClaims.sub || jwtClaims.user_id || 'unknown';

    // -------- Cases CRUD --------
    if (routeKey === 'POST /cases' || (method === 'POST' && path === '/cases')) {
      const item = sanitizeCase({ ...body, userId });
      await doc.put({ TableName: process.env.CASES_TABLE, Item: item, ConditionExpression: 'attribute_not_exists(userId) AND attribute_not_exists(id)' }).promise();
      return ok(item);
    }
    if (routeKey === 'GET /cases' || (method === 'GET' && path === '/cases')) {
      const res = await doc.query({ TableName: process.env.CASES_TABLE, KeyConditionExpression: 'userId = :u', ExpressionAttributeValues: { ':u': userId } }).promise();
      return ok(res.Items || []);
    }
    if (routeKey === 'GET /cases/{id}' || (method === 'GET' && path.startsWith('/cases/'))) {
      const id = params.id || path.split('/')[2];
      const res = await doc.get({ TableName: process.env.CASES_TABLE, Key: { userId, id } }).promise();
      if (!res.Item) return notFound({ message: 'case not found' });
      return ok(res.Item);
    }
    if (routeKey === 'PUT /cases/{id}' || (method === 'PUT' && path.startsWith('/cases/'))) {
      const id = params.id || path.split('/')[2];
      const up = buildCaseUpdate(body);
      const res = await doc.update({ TableName: process.env.CASES_TABLE, Key: { userId, id }, ...up, ConditionExpression: 'attribute_exists(userId) AND attribute_exists(id)', ReturnValues: 'ALL_NEW' }).promise();
      return ok(res.Attributes);
    }
    if (routeKey === 'DELETE /cases/{id}' || (method === 'DELETE' && path.startsWith('/cases/'))) {
      const id = params.id || path.split('/')[2];
      // Delete case
      await doc.delete({ TableName: process.env.CASES_TABLE, Key: { userId, id } }).promise();
      // Best-effort: delete dates for this case
      const scan = await doc.query({ TableName: process.env.CASE_DATES_TABLE, KeyConditionExpression: 'userId = :u', FilterExpression: 'caseId = :c', ExpressionAttributeValues: { ':u': userId, ':c': id } }).promise();
      const toDelete = scan.Items || [];
      for (const d of toDelete) {
        await doc.delete({ TableName: process.env.CASE_DATES_TABLE, Key: { userId, id: d.id } }).promise();
      }
      return ok({ deleted: true });
    }

    // -------- Dates CRUD --------
    if (routeKey === 'POST /dates' || (method === 'POST' && path === '/dates')) {
      // Enforce referential integrity and access control: referenced case must exist for this user
      if (!body.caseId) return badRequest({ error: 'missing caseId' });
      const exists = await ensureCaseExists(userId, body.caseId);
      if (!exists) return notFound({ error: 'case not found' });
      const item = sanitizeDate({ ...body, userId });
      await doc.put({ TableName: process.env.CASE_DATES_TABLE, Item: item, ConditionExpression: 'attribute_not_exists(userId) AND attribute_not_exists(id)' }).promise();
      return ok(item);
    }
    if (routeKey === 'GET /dates' || (method === 'GET' && path === '/dates')) {
      const caseId = query.caseId;
      const res = await doc.query({ TableName: process.env.CASE_DATES_TABLE, KeyConditionExpression: 'userId = :u', ExpressionAttributeValues: { ':u': userId } }).promise();
      let items = res.Items || [];
      if (caseId) items = items.filter((i) => i.caseId === caseId);
      return ok(items);
    }
    if (routeKey === 'GET /dates/{id}' || (method === 'GET' && path.startsWith('/dates/'))) {
      const id = params.id || path.split('/')[2];
      const res = await doc.get({ TableName: process.env.CASE_DATES_TABLE, Key: { userId, id } }).promise();
      if (!res.Item) return notFound({ message: 'date not found' });
      return ok(res.Item);
    }
    if (routeKey === 'PUT /dates/{id}' || (method === 'PUT' && path.startsWith('/dates/'))) {
      const id = params.id || path.split('/')[2];
      // If changing caseId, ensure the target case exists
      if (body.caseId) {
        const exists = await ensureCaseExists(userId, body.caseId);
        if (!exists) return notFound({ error: 'case not found' });
      }
      const up = buildDateUpdate(body);
      const res = await doc.update({ TableName: process.env.CASE_DATES_TABLE, Key: { userId, id }, ...up, ConditionExpression: 'attribute_exists(userId) AND attribute_exists(id)', ReturnValues: 'ALL_NEW' }).promise();
      return ok(res.Attributes);
    }
    if (routeKey === 'DELETE /dates/{id}' || (method === 'DELETE' && path.startsWith('/dates/'))) {
      const id = params.id || path.split('/')[2];
      await doc.delete({ TableName: process.env.CASE_DATES_TABLE, Key: { userId, id } }).promise();
      return ok({ deleted: true });
    }

    if (method === 'POST' && path === '/users') {
      const saved = await upsertUser({
        userId,
        email: jwtClaims.email || '',
        emailVerified: parseBool(jwtClaims.email_verified),
        displayName: body.displayName || jwtClaims.name || '',
      });
      return ok({ message: 'user upserted', user: saved });
    }

    return notFound({ routeKey, method, path });
  } catch (err) {
    console.error('Error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal Server Error' }),
    };
  }
};

function ok(payload) {
  return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify(payload) };
}
function notFound(payload) {
  return { statusCode: 404, headers: corsHeaders(), body: JSON.stringify({ error: 'Not Found', ...payload }) };
}
function badRequest(payload) {
  return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify(payload) };
}
function corsHeaders() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };
}

// ---- Dynamo helpers (uses AWS SDK v2 available in Lambda runtime) ----
const AWS = require('aws-sdk');
const ddb = new AWS.DynamoDB();
const doc = new AWS.DynamoDB.DocumentClient();

async function upsertUser({ userId, email, emailVerified, displayName }) {
  if (!process.env.USERS_TABLE) throw new Error('USERS_TABLE env not set');
  const now = new Date().toISOString();
  const Item = {
    userId:       { S: userId },
    email:        { S: email || '' },
    emailVerified:{ BOOL: !!emailVerified },
    displayName:  { S: displayName || '' },
    updatedAt:    { S: now },
  };
  // Create if absent, otherwise overwrite (idempotent upsert)
  await ddb.putItem({ TableName: process.env.USERS_TABLE, Item }).promise();
  return { userId, email, emailVerified: !!emailVerified, displayName, updatedAt: now };
}

function parseBool(val) {
  if (val === true) return true;
  if (val === false) return false;
  if (val === 'true') return true;
  if (val === 'false') return false;
  return false;
}

async function ensureCaseExists(userId, caseId) {
  const res = await doc.get({ TableName: process.env.CASES_TABLE, Key: { userId, id: caseId } }).promise();
  return !!res.Item;
}

// ----- Sanitizers and Update builders -----
function sanitizeCase({ userId, id, clientName, oppositePartyName, title, details, createdAt, updatedAt }) {
  if (!userId) throw new Error('missing userId');
  if (!id) throw new Error('missing id');
  return {
    userId,
    id,
    clientName: clientName || '',
    oppositePartyName: oppositePartyName || '',
    title: title || `${clientName || ''} vs ${oppositePartyName || ''}`,
    details: details || '',
    createdAt: createdAt || new Date().toISOString(),
    updatedAt: updatedAt || new Date().toISOString(),
  };
}

function buildCaseUpdate(body) {
  const allowed = ['clientName', 'oppositePartyName', 'title', 'details', 'updatedAt'];
  const fields = {};
  for (const k of allowed) if (body[k] !== undefined) fields[k] = body[k];
  if (fields.updatedAt === undefined) fields.updatedAt = new Date().toISOString();
  const keys = Object.keys(fields);
  const UpdateExpression = 'SET ' + keys.map((k) => `#${k} = :${k}`).join(', ');
  const ExpressionAttributeNames = Object.fromEntries(keys.map((k) => [`#${k}`, k]));
  const ExpressionAttributeValues = Object.fromEntries(keys.map((k) => [`:${k}`, fields[k]]));
  return { UpdateExpression, ExpressionAttributeNames, ExpressionAttributeValues };
}

function sanitizeDate({ userId, id, caseId, eventDate, notes, createdAt, updatedAt }) {
  if (!userId) throw new Error('missing userId');
  if (!id) throw new Error('missing id');
  if (!caseId) throw new Error('missing caseId');
  if (!eventDate) throw new Error('missing eventDate');
  return {
    userId,
    id,
    caseId,
    eventDate,
    notes: notes || '',
    createdAt: createdAt || new Date().toISOString(),
    updatedAt: updatedAt || new Date().toISOString(),
  };
}

function buildDateUpdate(body) {
  const allowed = ['caseId', 'eventDate', 'notes', 'updatedAt'];
  const fields = {};
  for (const k of allowed) if (body[k] !== undefined) fields[k] = body[k];
  if (fields.updatedAt === undefined) fields.updatedAt = new Date().toISOString();
  const keys = Object.keys(fields);
  const UpdateExpression = 'SET ' + keys.map((k) => `#${k} = :${k}`).join(', ');
  const ExpressionAttributeNames = Object.fromEntries(keys.map((k) => [`#${k}`, k]));
  const ExpressionAttributeValues = Object.fromEntries(keys.map((k) => [`:${k}`, fields[k]]));
  return { UpdateExpression, ExpressionAttributeNames, ExpressionAttributeValues };
}
