// Scheduled notifier: runs every minute.
// Reads UPCOMING_NOTIF_TABLE for the current minute and sends one FCM push per user.

const AWS = require('aws-sdk')
const doc = new AWS.DynamoDB.DocumentClient()

const UPCOMING_TABLE = process.env.UPCOMING_NOTIF_TABLE
const USERS_TABLE = process.env.USERS_TABLE
const SSM_PARAM = process.env.FIREBASE_SERVICE_ACCOUNT_PARAM

// Top-level initialization so it runs once per container (cold start)
const ssm = new AWS.SSM()
const adminInit = (async () => {
  if (!SSM_PARAM) throw new Error('FIREBASE_SERVICE_ACCOUNT_PARAM not set')
  const res = await ssm.getParameter({ Name: SSM_PARAM, WithDecryption: true }).promise()
  const sa = JSON.parse(res.Parameter?.Value || '{}')
  // eslint-disable-next-line global-require
  const firebase = require('firebase-admin')
  if (!firebase.apps.length) firebase.initializeApp({ credential: firebase.credential.cert(sa) })
  return firebase
})()

function nowMinute() {
  return Math.floor(Date.now() / 60000) * 60000
}

function getSetValues(val) {
  if (!val) return []
  if (Array.isArray(val)) return val
  if (val.values) return val.values
  return []
}

exports.handler = async () => {
  const fb = await adminInit
  const t = nowMinute()

  // Query all users for this minute
  const res = await doc.query({
    TableName: UPCOMING_TABLE,
    KeyConditionExpression: 'notifyTimeMs = :t',
    ExpressionAttributeValues: { ':t': t },
  }).promise()
  const items = res.Items || []

  let totalUsers = 0
  let totalSent = 0
  for (const it of items) {
    const { userId, dateCount } = it
    if (!userId || !dateCount || dateCount <= 0) continue
    totalUsers += 1
    // Load tokens
    const userRes = await doc.get({ TableName: USERS_TABLE, Key: { userId } }).promise()
    const user = userRes?.Item || {}

    // Respect user preference: skip if notifications are disabled
    if (user.notifyEnabled === false) {
      try {
        await doc.delete({ TableName: UPCOMING_TABLE, Key: { notifyTimeMs: t, userId } }).promise()
      } catch (e) {
        console.warn('Failed to delete disabled notification row', e)
      }
      continue
    }

    const tokens = getSetValues(user.fcmTokens).filter(Boolean)
    if (!tokens.length) {
      // No tokens — delete the row and continue
      await doc.delete({ TableName: UPCOMING_TABLE, Key: { notifyTimeMs: t, userId } }).promise()
      continue
    }

    // Build message
    const title = 'LawyerDiary'
    const body = dateCount === 1 ? 'You have 1 upcoming date tomorrow.' : `You have ${dateCount} upcoming dates tomorrow.`

    // Send in chunks up to 500
    let sent = 0
    let invalid = []
    for (let i = 0; i < tokens.length; i += 500) {
      const chunk = tokens.slice(i, i + 500)
      try {
        const resp = await fb.messaging().sendEachForMulticast({
          tokens: chunk,
          notification: { title, body },
          android: { priority: 'high' },
          apns: { headers: { 'apns-priority': '10' } },
        })
        sent += Number(resp.successCount || 0)
        resp.responses.forEach((r, idx) => {
          if (!r.success) {
            const code = r.error && r.error.code
            if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
              invalid.push(chunk[idx])
            }
          }
        })
      } catch (e) {
        console.error('sendEachForMulticast failed', e)
      }
    }
    totalSent += sent

    // Clean up invalid tokens
    if (invalid.length) {
      try {
        await doc.update({
          TableName: USERS_TABLE,
          Key: { userId },
          UpdateExpression: 'DELETE #fcmTokens :bad',
          ExpressionAttributeNames: { '#fcmTokens': 'fcmTokens' },
          ExpressionAttributeValues: { ':bad': doc.createSet(invalid) },
        }).promise()
      } catch (e) {
        console.warn('Failed to remove invalid tokens', e)
      }
    }

    // Remove the notification row to avoid duplicates
    try {
      await doc.delete({ TableName: UPCOMING_TABLE, Key: { notifyTimeMs: t, userId } }).promise()
    } catch (e) {
      console.warn('Failed to delete sent notification row', e)
    }
  }

  return { statusCode: 200, body: JSON.stringify({ minute: t, users: totalUsers, sent: totalSent }) }
}
