import { getDatabase } from './database';

function coerceMs(v, fallbackNow = false) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v) {
    const p = Date.parse(v);
    if (!Number.isNaN(p)) return p;
  }
  return fallbackNow ? Date.now() : null;
}

const MAX_DATES_PER_CASE = 100;

function limitError(limit) {
  const err = new Error(`A case can include up to ${limit} dates. Remove an older date to add a new one.`);
  err.code = 'DATE_LIMIT_REACHED';
  return err;
}

function normalizeRows(rows = []) {
  return rows.map((row) => {
    const normalized = { ...row };
    normalized.notes = normalized.notes ?? '';
    return normalized;
  });
}

// Case date operations
export const dateService = {
  // Get all case dates
  getAllDates: async () => {
    try {
      const db = await getDatabase();
      const result = await db.getAllAsync(
        'SELECT id, caseId, eventDate, notes, photoUri, createdAt, updatedAt FROM case_dates ORDER BY eventDate ASC'
      );
      const normalized = normalizeRows(result);
      console.log('Database returned dates:', normalized);
      console.log('Result type:', typeof normalized, 'Is array:', Array.isArray(normalized));
      return normalized;
    } catch (error) {
      console.error('Error fetching dates:', error);
      throw error;
    }
  },

  // Get dates by case ID
  getDatesByCaseId: async (caseId) => {
    try {
      const db = await getDatabase();
      const result = await db.getAllAsync(
        'SELECT id, caseId, eventDate, notes, photoUri, createdAt, updatedAt FROM case_dates WHERE caseId = ? ORDER BY eventDate ASC',
        [caseId]
      );
      return normalizeRows(result);
    } catch (error) {
      console.error('Error fetching dates by case:', error);
      throw error;
    }
  },

  // Get date by ID
  getDateById: async (id) => {
    try {
      const db = await getDatabase();
      const result = await db.getFirstAsync(
        'SELECT id, caseId, eventDate, notes, photoUri, createdAt, updatedAt FROM case_dates WHERE id = ?',
        [id]
      );
      const [normalized] = normalizeRows(result ? [result] : []);
      return normalized || null;
    } catch (error) {
      console.error('Error fetching date:', error);
      throw error;
    }
  },

  // Add new date
  addDate: async (dateData) => {
    try {
      const db = await getDatabase();
      if (MAX_DATES_PER_CASE > 0) {
        const countRow = await db.getFirstAsync('SELECT COUNT(*) AS count FROM case_dates WHERE caseId = ?', [dateData.caseId]);
        const count = countRow?.count ?? 0;
        if (count >= MAX_DATES_PER_CASE) {
          throw limitError(MAX_DATES_PER_CASE);
        }
      }
      const createdAt = coerceMs(dateData.createdAt, true);
      const updatedAt = coerceMs(dateData.updatedAt) ?? createdAt;
      await db.runAsync(
        `INSERT INTO case_dates (id, caseId, eventDate, notes, photoUri, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          dateData.id,
          dateData.caseId,
          dateData.eventDate,
          dateData.notes || '',
          dateData.photoUri || null,
          createdAt,
          updatedAt
        ]
      );
      return { ...dateData, notes: dateData.notes || '', photoUri: dateData.photoUri || null, createdAt, updatedAt };
    } catch (error) {
      console.error('Error adding date:', error);
      throw error;
    }
  },

  // Update date
  updateDate: async (dateData) => {
    try {
      const db = await getDatabase();
      const updatedAt = coerceMs(dateData.updatedAt, true);
      await db.runAsync(
        `UPDATE case_dates 
         SET caseId = ?, eventDate = ?, notes = ?, photoUri = ?, updatedAt = ?
         WHERE id = ?`,
        [
          dateData.caseId,
          dateData.eventDate,
          dateData.notes || '',
          dateData.photoUri || null,
          updatedAt,
          dateData.id
        ]
      );
      return { ...dateData, notes: dateData.notes || '', photoUri: dateData.photoUri || null, updatedAt };
    } catch (error) {
      console.error('Error updating date:', error);
      throw error;
    }
  },

  // Delete date
  deleteDate: async (id) => {
    try {
      const db = await getDatabase();
      await db.runAsync('DELETE FROM case_dates WHERE id = ?', [id]);
      return id;
    } catch (error) {
      console.error('Error deleting date:', error);
      throw error;
    }
  },

  // Delete all dates for a case (when case is deleted)
  deleteDatesByCaseId: async (caseId) => {
    try {
      const db = await getDatabase();
      await db.runAsync('DELETE FROM case_dates WHERE caseId = ?', [caseId]);
      return caseId;
    } catch (error) {
      console.error('Error deleting dates by case:', error);
      throw error;
    }
  }
};
