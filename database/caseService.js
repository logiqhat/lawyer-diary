import { getDatabase } from './database';
import { dateService } from './dateService';

function coerceMs(v, fallbackNow = false) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v) {
    const p = Date.parse(v);
    if (!Number.isNaN(p)) return p;
  }
  return fallbackNow ? Date.now() : null;
}

const MAX_CASES = 100;

function limitError(limit) {
  const err = new Error(`You can create up to ${limit} cases. Delete an existing case to add a new one.`);
  err.code = 'CASE_LIMIT_REACHED';
  return err;
}

// Case operations
export const caseService = {
  // Get all cases
  getAllCases: async () => {
    try {
      const db = await getDatabase();
      // Read from SQLite and return a JS array of rows
      // Use numeric ordering (createdAt stored as ms epoch)
      const result = await db.getAllAsync('SELECT * FROM cases ORDER BY (createdAt + 0) DESC');
      console.log('Database returned cases:', result);
      console.log('Result type:', typeof result, 'Is array:', Array.isArray(result));
      return result || [];
    } catch (error) {
      console.error('Error fetching cases:', error);
      throw error;
    }
  },

  // Get case by ID
  getCaseById: async (id) => {
    try {
      const db = await getDatabase();
      const result = await db.getFirstAsync('SELECT * FROM cases WHERE id = ?', [id]);
      return result || null;
    } catch (error) {
      console.error('Error fetching case:', error);
      throw error;
    }
  },

  // Add new case
  addCase: async (caseData) => {
    try {
      const db = await getDatabase();
      if (MAX_CASES > 0) {
        const countRow = await db.getFirstAsync('SELECT COUNT(*) AS count FROM cases');
        const count = countRow?.count ?? 0;
        if (count >= MAX_CASES) {
          throw limitError(MAX_CASES);
        }
      }
      // Persist the new case
      const createdAt = coerceMs(caseData.createdAt, true);
      const updatedAt = coerceMs(caseData.updatedAt) ?? createdAt;
      await db.runAsync(
        `INSERT INTO cases (id, clientName, oppositePartyName, title, details, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          caseData.id,
          caseData.clientName,
          caseData.oppositePartyName,
          caseData.title,
          caseData.details || '',
          createdAt,
          updatedAt
        ]
      );
      // Return normalized object (timestamps as ms)
      return { ...caseData, details: caseData.details || '', createdAt, updatedAt };
    } catch (error) {
      console.error('Error adding case:', error);
      throw error;
    }
  },

  // Update case
  updateCase: async (caseData) => {
    try {
      const db = await getDatabase();
      // Persist the update
      const updatedAt = coerceMs(caseData.updatedAt, true);
      await db.runAsync(
        `UPDATE cases 
         SET clientName = ?, oppositePartyName = ?, title = ?, details = ?, updatedAt = ?
         WHERE id = ?`,
        [
          caseData.clientName,
          caseData.oppositePartyName,
          caseData.title,
          caseData.details || '',
          updatedAt,
          caseData.id
        ]
      );
      // Return the updated object for Redux (timestamps as ms)
      return { ...caseData, details: caseData.details || '', updatedAt };
    } catch (error) {
      console.error('Error updating case:', error);
      throw error;
    }
  },

  // Delete case
  deleteCase: async (id) => {
    try {
      // Ensure child rows are removed at the DB level as well
      // (in case PRAGMA foreign_keys isn't supported/enabled)
      try {
        await dateService.deleteDatesByCaseId(id);
      } catch (e) {
        console.warn('Fell back from explicit date deletion:', e);
      }
      const db = await getDatabase();
      // Remove the case row
      await db.runAsync('DELETE FROM cases WHERE id = ?', [id]);
      return id;
    } catch (error) {
      console.error('Error deleting case:', error);
      throw error;
    }
  }
};
