const { ok, parseBool, doc, log, getUserId } = require('/opt/nodejs/shared');

exports.handler = async (event) => {
  try {
    const method = event.requestContext?.http?.method || 'UNKNOWN';
    const path = event.rawPath || '/users';
    const jwt = event.requestContext?.authorizer?.jwt?.claims || {};
    const userId = getUserId(event);

    // -------------------- /users/key --------------------
    if (path === '/users/key') {
      if (method === 'GET') {
        // fetch DEK for current user
        const res = await doc.get({ TableName: process.env.USERS_TABLE, Key: { userId } }).promise();
        const item = res?.Item || null;
        if (!item || !item.dekHex) {
          return { statusCode: 404, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Not Found' }) };
        }
        return ok({ key_hex: String(item.dekHex), version: Number(item.dekVersion || 1) });
      }
      if (method === 'POST') {
        const body = event.body ? JSON.parse(event.body) : {};
        const keyHex = String(body.key_hex || '').trim();
        const version = Number(body.version || 1);
        if (!keyHex || !/^[0-9a-fA-F]{64}$/.test(keyHex)) {
          return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'invalid_key' }) };
        }
        const now = Date.now();
        const update = {
          TableName: process.env.USERS_TABLE,
          Key: { userId },
          UpdateExpression: 'SET #dekHex = :k, #dekVersion = :v, #dekUpdatedAt = :dua, #dekUpdatedAtMs = :dums, #updatedAt = :ua, #updatedAtMs = :ums',
          ExpressionAttributeNames: {
            '#dekHex': 'dekHex',
            '#dekVersion': 'dekVersion',
            '#dekUpdatedAt': 'dekUpdatedAt',
            '#dekUpdatedAtMs': 'dekUpdatedAtMs',
            '#updatedAt': 'updatedAt',
            '#updatedAtMs': 'updatedAtMs',
          },
          ExpressionAttributeValues: {
            ':k': keyHex,
            ':v': version,
            ':dua': new Date(now).toISOString(),
            ':dums': now,
            ':ua': new Date(now).toISOString(),
            ':ums': now,
          },
          ReturnValues: 'ALL_NEW',
        };
        await doc.update(update).promise();
        return ok({ ok: true });
      }
      return { statusCode: 405, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    // -------------------- /users (profile upsert) --------------------
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
