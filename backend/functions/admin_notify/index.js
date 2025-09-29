const https = require('https')
const { ok, badRequest, notFound, log } = require('/opt/nodejs/shared')

function normHeaders(h) {
  const out = {}
  for (const k of Object.keys(h || {})) out[k.toLowerCase().trim()] = String(h[k])
  return out
}

function postJson(url, payload, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(payload))
    const u = new URL(url)
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + (u.search || ''),
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Content-Length': data.length, ...extraHeaders },
    }, (res) => {
      let body = ''
      res.on('data', (chunk) => (body += chunk))
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: body ? JSON.parse(body) : null }) }
        catch { resolve({ status: res.statusCode, data: body }) }
      })
    })
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

exports.handler = async (event) => {
  try {
    const method = event.requestContext?.http?.method || 'UNKNOWN'
    const path = event.rawPath || '/'
    if (!(method === 'POST' && path === '/admin/notify')) return { statusCode: 404, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Not Found' }) }

    const headers = normHeaders(event.headers)
    const provided = headers['x-admin-secret'] || ''
    const AWS = require('aws-sdk')
    const ssm = new AWS.SSM()
    const adminSecretParam = process.env.ADMIN_SHARED_SECRET_PARAM
    if (!adminSecretParam) {
      log(event, { level: 'error', action: 'admin.notify.missing_env', var: 'ADMIN_SHARED_SECRET_PARAM' })
      return { statusCode: 501, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'not_configured', message: 'ADMIN_SHARED_SECRET_PARAM env not set' }) }
    }
    let adminSecret = ''
    try {
      const sec = await ssm.getParameter({ Name: adminSecretParam, WithDecryption: true }).promise()
      adminSecret = String(sec?.Parameter?.Value || '')
      log(event, { level: 'info', action: 'admin.notify.admin_secret_loaded', param: adminSecretParam, present: !!adminSecret })
    } catch (e) {
      console.error('SSM getParameter admin secret failed:', e)
      log(event, { level: 'error', action: 'admin.notify.admin_secret_error', param: adminSecretParam, error: String(e) })
      return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'ssm_error', message: String(e) }) }
    }
    if (!adminSecret || provided !== adminSecret) {
      log(event, { level: 'warn', action: 'admin.notify.unauthorized', provided: provided ? true : false })
      return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Unauthorized' }) }
    }

    // Target user and message
    const targetUserId = headers['x-user-id'] || headers['x-user-id '] || headers['x-user -id'] || ''
    if (!targetUserId) return badRequest({ error: 'missing_target_user', message: 'Provide X-User-Id header' })
    const body = event.body ? JSON.parse(event.body) : {}
    const message = (body && body.message && String(body.message)) || ''
    const title = (body && body.title && String(body.title)) || 'LawyerDiary'
    const data = (body && body.data && typeof body.data === 'object') ? body.data : undefined
    if (!message) return badRequest({ error: 'missing_message' })

    // Example: fetch Firebase Admin service account from SSM (no caching)
    const paramName = process.env.FIREBASE_SERVICE_ACCOUNT_PARAM
    if (!paramName) {
      log(event, { level: 'error', action: 'admin.notify.missing_env', var: 'FIREBASE_SERVICE_ACCOUNT_PARAM' })
      return { statusCode: 501, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'not_configured', message: 'FIREBASE_SERVICE_ACCOUNT_PARAM env not set' }) }
    }
    let saJson
    try {
      const res = await ssm.getParameter({ Name: paramName, WithDecryption: true }).promise()
      saJson = JSON.parse(res.Parameter?.Value || '{}')
      log(event, { level: 'info', action: 'admin.notify.sa_loaded', param: paramName, keys: Object.keys(saJson || {}).length })
    } catch (e) {
      console.error('SSM getParameter service account failed:', e)
      log(event, { level: 'error', action: 'admin.notify.sa_error', param: paramName, error: String(e) })
      return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'ssm_error', message: String(e) }) }
    }

    // Initialize Firebase Admin (from layer)
    let admin
    try {
      admin = require('firebase-admin')
      if (!admin.apps.length) {
        admin.initializeApp({ credential: admin.credential.cert(saJson) })
      }
      log(event, { level: 'info', action: 'admin.notify.admin_initialized' })
    } catch (e) {
      // firebase-admin not bundled yet
      console.error('firebase-admin require/init failed:', e)
      log(event, { level: 'info', action: 'admin.notify.no_admin_sdk', note: 'bundle firebase-admin or add a layer' })
      return { statusCode: 501, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'admin_sdk_missing', message: 'Bundle firebase-admin to enable sending.' }) }
    }

    // Load user FCM tokens
    const AWS2 = require('aws-sdk')
    const doc = new AWS2.DynamoDB.DocumentClient()
    const usersTable = process.env.USERS_TABLE
    const userRes = await doc.get({ TableName: usersTable, Key: { userId: targetUserId } }).promise()
    const userItem = userRes?.Item
    const getSet = (v) => Array.isArray(v) ? v : (v?.values || [])
    let tokens = getSet(userItem?.fcmTokens)
    tokens = Array.from(new Set(tokens.filter(Boolean)))
    if (!tokens || tokens.length === 0) {
      log(event, { level: 'warn', action: 'admin.notify.no_tokens', targetUserId })
      return notFound({ message: 'No FCM tokens for target user' })
    }
    log(event, { level: 'info', action: 'admin.notify.tokens_loaded', count: tokens.length })

    // Send in chunks of up to 500 tokens per call
    let sent = 0
    let invalidRemoved = 0
    let batches = 0
    const invalidToRemove = new Set()
    for (let i = 0; i < tokens.length; i += 500) {
      const chunk = tokens.slice(i, i + 500)
      batches += 1
      let resp
      try {
        resp = await admin.messaging().sendEachForMulticast({
          tokens: chunk,
          notification: { title, body: message },
          ...(data ? { data: Object.fromEntries(Object.entries(data).map(([k, v]) => [String(k), String(v)])) } : {}),
          android: { priority: 'high' },
          apns: { headers: { 'apns-priority': '10' } },
        })
      } catch (e) {
        console.error('sendEachForMulticast failed:', e)
        log(event, { level: 'error', action: 'admin.notify.send_failed', batch: batches, error: String(e) })
        continue
      }
      sent += Number(resp.successCount || 0)
      log(event, { level: 'info', action: 'admin.notify.batch_result', batch: batches, success: resp.successCount, failure: resp.failureCount })
      // collect invalid tokens
      resp.responses.forEach((r, idx) => {
        if (!r.success) {
          const code = r.error && r.error.code
          if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
            invalidToRemove.add(chunk[idx])
          }
        }
      })
    }

    // Remove invalid tokens from the user record
    if (invalidToRemove.size > 0) {
      invalidRemoved = invalidToRemove.size
      try {
        await doc.update({
          TableName: usersTable,
          Key: { userId: targetUserId },
          UpdateExpression: 'DELETE #fcmTokens :bad',
          ExpressionAttributeNames: { '#fcmTokens': 'fcmTokens' },
          ExpressionAttributeValues: { ':bad': doc.createSet(Array.from(invalidToRemove)) },
        }).promise()
      } catch (e) {
        log(event, { level: 'error', action: 'admin.notify.cleanup_failed', error: String(e) })
      }
    }

    log(event, { level: 'info', action: 'admin.notify.sent', targetUserId, sent, batches, invalidRemoved })
    return ok({ sent, batches, invalidRemoved })
  } catch (err) {
    console.error('admin_notify unhandled error:', err)
    try { log(event, { level: 'error', action: 'admin.notify.unhandled', error: String(err) }) } catch {}
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Internal Server Error' }) }
  }
}
