/*
  DynamoDB Stream processor for case_dates table.
  Maintains per-minute user notification counters in UPCOMING_NOTIF_TABLE.

  Policy: notify one day before at 17:00 local time (user timezone),
  rounded down to the nearest minute.
*/

const AWS = require('aws-sdk')
const doc = new AWS.DynamoDB.DocumentClient()

const CASE_DATES_TABLE = process.env.CASE_DATES_TABLE
const USERS_TABLE = process.env.USERS_TABLE
const UPCOMING_NOTIF_TABLE = process.env.UPCOMING_NOTIF_TABLE

function get(obj, path, def) {
  return path.split('.').reduce((acc, k) => (acc && acc[k] !== undefined ? acc[k] : undefined), obj) ?? def
}

function parseAttrImage(img) {
  // convert DynamoDB AttributeValue map to plain JS (DocumentClient-style)
  // Since stream provides AttributeValues, we leverage AWS.DynamoDB.Converter
  return AWS.DynamoDB.Converter.unmarshall(img)
}

function parseYMD(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ''))
  if (!m) return null
  return { y: +m[1], mo: +m[2], d: +m[3] }
}

// Compute approximate UTC ms for (eventDate - 1 day) at 17:00 local time for given tz
// Approach: take local midnight of eventDate in tz, then subtract 7 hours to get 17:00 previous day (same tz)
// This avoids needing heavy tz libs and is safe around DST because transitions typically occur at 02:00.
function tzOffsetForUtcTs(utcMs, tz) {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
    const parts = dtf.formatToParts(new Date(utcMs))
    const map = Object.fromEntries(parts.map(p => [p.type, p.value]))
    const asUTC = Date.UTC(+map.year, (+map.month) - 1, +map.day, +map.hour, +map.minute, +map.second)
    return asUTC - utcMs
  } catch (e) {
    return 0
  }
}

function computeNotifyTimeMs(eventDate, tz) {
  const p = parseYMD(eventDate)
  if (!p) return null
  const baseUtc = Date.UTC(p.y, p.mo - 1, p.d, 0, 0, 0)
  const off = tzOffsetForUtcTs(baseUtc, tz || 'UTC')
  const localMidnightUtc = baseUtc - off
  const notifUtc = localMidnightUtc - (7 * 60 * 60 * 1000) // 17:00 previous day local
  return Math.floor(notifUtc / 60000) * 60000
}

async function getUserTimeZone(userId) {
  try {
    const res = await doc.get({ TableName: USERS_TABLE, Key: { userId } }).promise()
    const tz = res?.Item?.timezone
    return tz || 'UTC'
  } catch (e) {
    return 'UTC'
  }
}

async function addCount(notifyTimeMs, userId, delta) {
  if (!notifyTimeMs || !userId || !delta) return
  try {
    // Use atomic ADD so concurrent updates are safely composed.
    // If the resulting count is <= 0, delete the row to avoid lingering zeros/negatives.
    const res = await doc.update({
      TableName: UPCOMING_NOTIF_TABLE,
      Key: { notifyTimeMs, userId },
      UpdateExpression: 'ADD #dateCount :d',
      ExpressionAttributeNames: { '#dateCount': 'dateCount' },
      ExpressionAttributeValues: { ':d': delta },
      ReturnValues: 'UPDATED_NEW',
    }).promise()
    const updated = Number(res?.Attributes?.dateCount ?? 0)
    if (!Number.isFinite(updated) || updated <= 0) {
      try {
        await doc.delete({ TableName: UPCOMING_NOTIF_TABLE, Key: { notifyTimeMs, userId } }).promise()
      } catch (delErr) {
        console.warn('cleanup zero-count row failed', { notifyTimeMs, userId, err: String(delErr) })
      }
    }
  } catch (e) {
    console.error('addCount failed', { notifyTimeMs, userId, delta, err: String(e) })
  }
}

exports.handler = async (event) => {
  try {
    // Process records in parallel batches per invocation
    const tasks = event.Records.map(async (r) => {
      const eventName = r.eventName
      const keys = parseAttrImage(r.dynamodb.Keys)
      const userId = keys.userId

      const oldImg = r.dynamodb.OldImage ? parseAttrImage(r.dynamodb.OldImage) : null
      const newImg = r.dynamodb.NewImage ? parseAttrImage(r.dynamodb.NewImage) : null

      // Resolve timezone once if needed
      let tz
      if (eventName === 'INSERT') {
        if (!newImg || newImg.deleted) return
        tz = await getUserTimeZone(userId)
        const t = computeNotifyTimeMs(newImg.eventDate, tz)
        if (t) await addCount(t, userId, +1)
      } else if (eventName === 'MODIFY') {
        // Treat deleted:true as remove
        const newDeleted = !!(newImg && newImg.deleted)
        const oldDeleted = !!(oldImg && oldImg.deleted)
        tz = await getUserTimeZone(userId)
        const oldT = (!oldDeleted && oldImg?.eventDate) ? computeNotifyTimeMs(oldImg.eventDate, tz) : null
        const newT = (!newDeleted && newImg?.eventDate) ? computeNotifyTimeMs(newImg.eventDate, tz) : null
        if (oldT && (!newT || newT !== oldT)) await addCount(oldT, userId, -1)
        if (newT && (!oldT || newT !== oldT)) await addCount(newT, userId, +1)
      } else if (eventName === 'REMOVE') {
        // In our system we soft-delete (deleted=true), but handle REMOVE defensively
        if (!oldImg) return
        tz = await getUserTimeZone(userId)
        const t = computeNotifyTimeMs(oldImg.eventDate, tz)
        if (t) await addCount(t, userId, -1)
      }
    })
    await Promise.all(tasks)
    return { statusCode: 200 }
  } catch (e) {
    console.error('notify_indexer unhandled error', e)
    return { statusCode: 500 }
  }
}
