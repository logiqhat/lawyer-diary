const { ok, parseBool, doc, log, getUserId } = require('/opt/nodejs/shared');

exports.handler = async (event) => {
  try {
    const method = event.requestContext?.http?.method || 'UNKNOWN';
    const jwt = event.requestContext?.authorizer?.jwt?.claims || {};
    const userId = getUserId(event);

    if (method !== 'POST') return { statusCode: 405, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Method Not Allowed' }) };

    const body = event.body ? JSON.parse(event.body) : {};
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const names = {
      '#email': 'email',
      '#emailVerified': 'emailVerified',
      '#displayName': 'displayName',
      '#updatedAt': 'updatedAt',
      '#lastSignInAt': 'lastSignInAt',
      '#lastSignInAtMs': 'lastSignInAtMs',
    };
    let updateExpr = 'SET #email = :em, #emailVerified = :ev, #displayName = :dn, #updatedAt = :ua, #lastSignInAt = :ls, #lastSignInAtMs = :lsm';
    if (body.timezone) { updateExpr += ', #timezone = :tz'; names['#timezone'] = 'timezone'; }
    if (body.notifyEnabled !== undefined) { updateExpr += ', #notifyEnabled = :ne'; names['#notifyEnabled'] = 'notifyEnabled'; }
    if (body.notifyHourLocal !== undefined) { updateExpr += ', #notifyHourLocal = :nh'; names['#notifyHourLocal'] = 'notifyHourLocal'; }

    const values = {
      ':em': jwt.email || '',
      ':ev': parseBool(jwt.email_verified),
      ':dn': body.displayName || jwt.name || '',
      ':ua': nowIso,
      ':ls': nowIso,
      ':lsm': now,
      ...(body.timezone ? { ':tz': String(body.timezone) } : {}),
      ...(body.notifyEnabled !== undefined ? { ':ne': !!body.notifyEnabled } : {}),
      ...(body.notifyHourLocal !== undefined ? { ':nh': Number(body.notifyHourLocal) } : {}),
    };

    const updates = {
      TableName: process.env.USERS_TABLE,
      Key: { userId },
      UpdateExpression: updateExpr,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: 'ALL_NEW',
    };

    // If client sent an FCM token, add to a string set
    if (body.fcmToken && typeof body.fcmToken === 'string') {
      updates.UpdateExpression += ' ADD #fcmTokens :ft';
      updates.ExpressionAttributeNames['#fcmTokens'] = 'fcmTokens';
      updates.ExpressionAttributeValues[':ft'] = doc.createSet([body.fcmToken]);
    }

    log(event, { level: 'info', userId, action: 'users.upsert.start' });
    const res = await doc.update(updates).promise();
    log(event, { level: 'info', userId, action: 'users.upsert.ok' });
    return ok(res.Attributes || { userId });
  } catch (err) {
    console.error(err);
    try { log(event, { level: 'error', action: 'users.upsert.err', error: String(err) }); } catch {}
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Internal Server Error' }) };
  }
};
