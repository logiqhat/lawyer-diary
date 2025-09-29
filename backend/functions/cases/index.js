const { ok, notFound, badRequest, doc, sanitizeCase, buildCaseUpdate, log, getUserId } = require('/opt/nodejs/shared');

const CASES_LIMIT = Number.parseInt(process.env.CASES_LIMIT || '100', 10);

exports.handler = async (event) => {
  try {
    const method = event.requestContext?.http?.method || 'UNKNOWN';
    const path = event.rawPath || '/';
    const params = event.pathParameters || {};
    const query = event.queryStringParameters || {};
    const jwt = event.requestContext?.authorizer?.jwt?.claims || {};
    const userId = getUserId(event);
    const body = event.body ? JSON.parse(event.body) : {};

    if (method === 'POST' && path === '/cases') {
      log(event, { level: 'info', userId, action: 'cases.create.start', id: body?.id });

      if (CASES_LIMIT > 0) {
        const countRes = await doc.query({
          TableName: process.env.CASES_TABLE,
          KeyConditionExpression: 'userId = :u',
          ExpressionAttributeValues: { ':u': userId },
          Select: 'COUNT',
        }).promise();
        if ((countRes.Count || 0) >= CASES_LIMIT) {
          log(event, { level: 'warn', userId, action: 'cases.create.limit_reached', limit: CASES_LIMIT });
          return badRequest({
            error: 'case_limit_reached',
            message: `You can create up to ${CASES_LIMIT} cases. Delete an existing case to add a new one.`,
          });
        }
      }

      const item = sanitizeCase({ ...body, userId });
      await doc.put({ TableName: process.env.CASES_TABLE, Item: item, ConditionExpression: 'attribute_not_exists(userId) AND attribute_not_exists(id)' }).promise();
      log(event, { level: 'info', userId, action: 'cases.create.ok', id: item.id });
      return ok(item);
    }
    if (method === 'GET' && path === '/cases') {
      const res = await doc.query({ TableName: process.env.CASES_TABLE, KeyConditionExpression: 'userId = :u', ExpressionAttributeValues: { ':u': userId } }).promise();
      const items = (res.Items || []).filter((i) => !i.deleted);
      log(event, { level: 'info', userId, action: 'cases.list', count: items.length });
      return ok(items);
    }
    if (method === 'GET' && path.startsWith('/cases/')) {
      const id = params.id || path.split('/')[2];
      const res = await doc.get({ TableName: process.env.CASES_TABLE, Key: { userId, id } }).promise();
      if (!res.Item || res.Item.deleted) { log(event, { level: 'info', userId, action: 'cases.get.miss', id }); return notFound({ message: 'case not found' }); }
      log(event, { level: 'info', userId, action: 'cases.get.hit', id });
      return ok(res.Item);
    }
    if (method === 'PUT' && path.startsWith('/cases/')) {
      const id = params.id || path.split('/')[2];
      log(event, { level: 'info', userId, action: 'cases.update.start', id });
      const up = buildCaseUpdate(body);
      const res = await doc.update({ TableName: process.env.CASES_TABLE, Key: { userId, id }, ...up, ConditionExpression: 'attribute_exists(userId) AND attribute_exists(id)', ReturnValues: 'ALL_NEW' }).promise();
      log(event, { level: 'info', userId, action: 'cases.update.ok', id });
      return ok(res.Attributes);
    }
    if (method === 'DELETE' && path.startsWith('/cases/')) {
      const id = params.id || path.split('/')[2];
      log(event, { level: 'info', userId, action: 'cases.delete.start', id });

      // Soft-delete related dates for this case
      try {
        let lastKey;
        let total = 0;
        do {
          const res = await doc.query({
            TableName: process.env.CASE_DATES_TABLE,
            KeyConditionExpression: 'userId = :u',
            ExpressionAttributeValues: { ':u': userId },
            ExclusiveStartKey: lastKey,
            ProjectionExpression: 'id, caseId'
          }).promise();
          const items = (res.Items || []).filter((i) => i.caseId === id);
          for (const d of items) {
            const n = Date.now();
            await doc.update({
              TableName: process.env.CASE_DATES_TABLE,
              Key: { userId, id: d.id },
              UpdateExpression: 'SET #deleted = :true, #updatedAt = :u, #updatedAtMs = :um',
              ExpressionAttributeNames: { '#deleted': 'deleted', '#updatedAt': 'updatedAt', '#updatedAtMs': 'updatedAtMs' },
              ExpressionAttributeValues: { ':true': true, ':u': new Date(n).toISOString(), ':um': n }
            }).promise();
            total += 1;
          }
          lastKey = res.LastEvaluatedKey;
        } while (lastKey);
        log(event, { level: 'info', userId, action: 'dates.soft_deleted.total', caseId: id, total });
      } catch (e) {
        log(event, { level: 'error', userId, action: 'dates.soft_deleted.err', caseId: id, error: String(e) });
      }

      // Soft-delete the case
      const n = Date.now();
      await doc.update({
        TableName: process.env.CASES_TABLE,
        Key: { userId, id },
        UpdateExpression: 'SET #deleted = :true, #updatedAt = :u, #updatedAtMs = :um',
        ExpressionAttributeNames: { '#deleted': 'deleted', '#updatedAt': 'updatedAt', '#updatedAtMs': 'updatedAtMs' },
        ExpressionAttributeValues: { ':true': true, ':u': new Date(n).toISOString(), ':um': n }
      }).promise();
      log(event, { level: 'info', userId, action: 'cases.delete.ok', id });
      return ok({ deleted: true });
    }

    return notFound({});
  } catch (err) {
    console.error(err);
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Internal Server Error' }) };
  }
};
