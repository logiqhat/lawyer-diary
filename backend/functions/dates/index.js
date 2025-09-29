const { ok, notFound, badRequest, doc, sanitizeDate, buildDateUpdate, ensureCaseExists, log, getUserId } = require('/opt/nodejs/shared');

const DATES_PER_CASE_LIMIT = Number.parseInt(process.env.DATES_PER_CASE_LIMIT || '100', 10);

exports.handler = async (event) => {
  try {
    const method = event.requestContext?.http?.method || 'UNKNOWN';
    const path = event.rawPath || '/';
    const params = event.pathParameters || {};
    const query = event.queryStringParameters || {};
    const jwt = event.requestContext?.authorizer?.jwt?.claims || {};
    const userId = getUserId(event);
    const body = event.body ? JSON.parse(event.body) : {};

    if (method === 'POST' && path === '/dates') {
      log(event, { level: 'info', userId, action: 'dates.create.start', id: body?.id, caseId: body?.caseId });
      if (!body.caseId) return badRequest({ error: 'missing caseId' });
      const exists = await ensureCaseExists(userId, body.caseId);
      if (!exists) { log(event, { level: 'info', userId, action: 'dates.create.case_miss', caseId: body.caseId }); return notFound({ error: 'case not found' }); }

      if (DATES_PER_CASE_LIMIT > 0) {
        const countRes = await doc.query({
          TableName: process.env.CASE_DATES_TABLE,
          KeyConditionExpression: 'userId = :u',
          ExpressionAttributeValues: { ':u': userId, ':c': body.caseId },
          FilterExpression: 'caseId = :c',
          Select: 'COUNT',
        }).promise();
        if ((countRes.Count || 0) >= DATES_PER_CASE_LIMIT) {
          log(event, { level: 'warn', userId, action: 'dates.create.limit_reached', caseId: body.caseId, limit: DATES_PER_CASE_LIMIT });
          return badRequest({
            error: 'date_limit_reached',
            message: `A case can include up to ${DATES_PER_CASE_LIMIT} dates. Remove an older date to add a new one.`,
          });
        }
      }

      const item = sanitizeDate({ ...body, userId });
      await doc.put({ TableName: process.env.CASE_DATES_TABLE, Item: item, ConditionExpression: 'attribute_not_exists(userId) AND attribute_not_exists(id)' }).promise();
      log(event, { level: 'info', userId, action: 'dates.create.ok', id: item.id, caseId: item.caseId });
      return ok(item);
    }
    if (method === 'GET' && path === '/dates') {
      const res = await doc.query({ TableName: process.env.CASE_DATES_TABLE, KeyConditionExpression: 'userId = :u', ExpressionAttributeValues: { ':u': userId } }).promise();
      let items = (res.Items || []).filter((i) => !i.deleted);
      if (query && query.caseId) items = items.filter((i) => i.caseId === query.caseId);
      log(event, { level: 'info', userId, action: 'dates.list', count: items.length, caseId: query?.caseId });
      return ok(items);
    }
    if (method === 'GET' && path.startsWith('/dates/')) {
      const id = params.id || path.split('/')[2];
      const res = await doc.get({ TableName: process.env.CASE_DATES_TABLE, Key: { userId, id } }).promise();
      if (!res.Item || res.Item.deleted) { log(event, { level: 'info', userId, action: 'dates.get.miss', id }); return notFound({ message: 'date not found' }); }
      log(event, { level: 'info', userId, action: 'dates.get.hit', id });
      return ok(res.Item);
    }
    if (method === 'PUT' && path.startsWith('/dates/')) {
      const id = params.id || path.split('/')[2];
      log(event, { level: 'info', userId, action: 'dates.update.start', id });
      if (body.caseId) {
        const exists = await ensureCaseExists(userId, body.caseId);
        if (!exists) { log(event, { level: 'info', userId, action: 'dates.update.case_miss', caseId: body.caseId }); return notFound({ error: 'case not found' }); }
      }
      const up = buildDateUpdate(body);
      const res = await doc.update({ TableName: process.env.CASE_DATES_TABLE, Key: { userId, id }, ...up, ConditionExpression: 'attribute_exists(userId) AND attribute_exists(id)', ReturnValues: 'ALL_NEW' }).promise();
      log(event, { level: 'info', userId, action: 'dates.update.ok', id });
      return ok(res.Attributes);
    }
    if (method === 'DELETE' && path.startsWith('/dates/')) {
      const id = params.id || path.split('/')[2];
      log(event, { level: 'info', userId, action: 'dates.delete.start', id });
      const n = Date.now();
      try {
        await doc.update({
          TableName: process.env.CASE_DATES_TABLE,
          Key: { userId, id },
          UpdateExpression: 'SET #deleted = :true, #updatedAt = :u, #updatedAtMs = :um',
          ExpressionAttributeNames: { '#deleted': 'deleted', '#updatedAt': 'updatedAt', '#updatedAtMs': 'updatedAtMs' },
          ExpressionAttributeValues: { ':true': true, ':u': new Date(n).toISOString(), ':um': n },
          ConditionExpression: 'attribute_exists(userId) AND attribute_exists(id)'
        }).promise();
      } catch (e) {
        if (e && e.code === 'ConditionalCheckFailedException') {
          log(event, { level: 'info', userId, action: 'dates.delete.miss', id });
          return notFound({ message: 'date not found' });
        }
        throw e;
      }
      log(event, { level: 'info', userId, action: 'dates.delete.ok', id });
      return ok({ deleted: true });
    }

    return notFound({});
  } catch (err) {
    console.error(err);
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Internal Server Error' }) };
  }
};
