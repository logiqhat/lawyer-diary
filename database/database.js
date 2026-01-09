// Watermelon-only database surface. Keeping the same function names so callers
// (AppInitializer, scripts) can remain unchanged.
import { getWatermelonDatabase } from './wmProvider';

export const initDatabase = async () => {
  try {
    const db = await getWatermelonDatabase();
    console.log('Watermelon database initialized successfully');
    return db;
  } catch (error) {
    console.error('Watermelon database initialization error:', error);
    throw error;
  }
};

export const getDatabase = async () => getWatermelonDatabase();
