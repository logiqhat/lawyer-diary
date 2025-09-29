import * as SQLite from 'expo-sqlite';

const DB_NAME = 'lawyerdiary.db';
let dbPromise = null; // cache a single handle to avoid native NPEs

// Initialize database
export const initDatabase = async () => {
  try {
    console.log('Opening database...');
    if (!dbPromise) dbPromise = SQLite.openDatabaseAsync(DB_NAME);
    const db = await dbPromise;

    // Ensure foreign key constraints are enforced (best-effort)
    try {
      await db.execAsync('PRAGMA foreign_keys = ON;');
      console.log('Foreign keys enabled');
    } catch (e) {
      console.warn('Could not enable foreign keys via PRAGMA:', e);
    }

    console.log('Creating tables...');
    // Create cases table (createdAt/updatedAt stored as ms epoch numbers)
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS cases (
        id TEXT PRIMARY KEY,
        clientName TEXT NOT NULL,
        oppositePartyName TEXT NOT NULL,
        title TEXT NOT NULL,
        details TEXT,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER
      );
    `);

    // Create case_dates table (createdAt/updatedAt stored as ms epoch numbers)
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS case_dates (
        id TEXT PRIMARY KEY,
        caseId TEXT NOT NULL,
        eventDate TEXT NOT NULL,
        notes TEXT,
        photoUri TEXT,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER,
        FOREIGN KEY (caseId) REFERENCES cases (id) ON DELETE CASCADE
      );
    `);

    // Defensive: try to add notes column in case of older installs
    try {
      await db.execAsync('ALTER TABLE case_dates ADD COLUMN notes TEXT;');
    } catch (e) {
      const msg = String(e?.message || '');
      if (!msg.includes('duplicate column name') && !msg.includes('duplicate column')) {
        console.warn('Could not ensure notes column:', e);
      }
    }

    console.log('Database tables created successfully');
    return db;
  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  }
};

// Get database instance (reuse the cached handle; avoid extra PRAGMA calls)
export const getDatabase = async () => {
  if (!dbPromise) dbPromise = SQLite.openDatabaseAsync(DB_NAME);
  return dbPromise;
};
