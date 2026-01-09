// database/wmProvider.js
// WatermelonDB-backed services implementing the same interface
// as database/caseService.js and database/dateService.js.
// This module avoids importing WatermelonDB at top-level to keep optional.

let dbInstance = null
let currentDbName = 'lawyerdiary'

export function setWatermelonDbName(name) {
  if (!name || name === currentDbName) return
  currentDbName = name
  // Force a fresh instance next time to avoid cross-account data.
  dbInstance = null
}

async function ensureDatabase() {
  if (dbInstance) return dbInstance
  try {
    const { Database } = require('@nozbe/watermelondb')
    const SQLiteAdapter = require('@nozbe/watermelondb/adapters/sqlite').default
    const { schema } = require('./wm/schema')
    const { Case } = require('./wm/models/Case')
    const { CaseDate } = require('./wm/models/CaseDate')

    const adapter = new SQLiteAdapter({ schema, dbName: currentDbName, jsi: true })
    dbInstance = new Database({ adapter, modelClasses: [Case, CaseDate] })
    return dbInstance
  } catch (e) {
    const hint = 'Install @nozbe/watermelondb and react-native-quick-sqlite, then rebuild a dev client.'
    throw new Error(`[WatermelonDB] Initialization failed: ${e?.message || e}. ${hint}`)
  }
}

export async function getWatermelonDatabase() {
  return ensureDatabase()
}

function mapCaseRecord(r) {
  return {
    id: r.id,
    clientName: r.client_name,
    oppositePartyName: r.opposite_party_name,
    title: r.title,
    details: r.details || '',
    // expose ms epoch numbers to app layer
    createdAt: r.created_at,
    updatedAt: r.updated_at || null,
  }
}

function mapDateRecord(r) {
  return {
    id: r.id,
    caseId: r.case_id,
    eventDate: r.event_date,
    notes: r.notes || '',
    photoUri: r.photo_uri || null,
    // expose ms epoch numbers to app layer
    createdAt: r.created_at,
    updatedAt: r.updated_at || null,
  }
}

export const wmCaseService = {
  getAllCases: async () => {
    const db = await ensureDatabase()
    const { Q } = require('@nozbe/watermelondb')
    const collection = db.collections.get('cases')
    const records = await collection.query(
      Q.where('deleted', false),
      Q.sortBy('created_at', Q.desc),
    ).fetch()
    return records.map(mapCaseRecord)
  },
  getCaseById: async (id) => {
    const db = await ensureDatabase()
    try {
      const rec = await db.collections.get('cases').find(id)
      if (rec.deleted) return null
      return mapCaseRecord(rec)
    } catch (e) {
      return null
    }
  },
  addCase: async (caseData) => {
    const db = await ensureDatabase()
    const n = Date.now()
    await db.write(async () => {
      await db.collections.get('cases').create((rec) => {
        rec._raw.id = caseData.id
        rec.client_name = caseData.clientName
        rec.opposite_party_name = caseData.oppositePartyName
        rec.title = caseData.title
        rec.details = caseData.details || ''
        // store ms numbers
        rec.created_at = typeof caseData.createdAt === 'number' ? caseData.createdAt : n
        rec.updated_at = typeof caseData.updatedAt === 'number' ? caseData.updatedAt : rec.created_at
        rec.deleted = false
      })
    })
    return { ...caseData, details: caseData.details || '', createdAt: typeof caseData.createdAt === 'number' ? caseData.createdAt : n, updatedAt: typeof caseData.updatedAt === 'number' ? caseData.updatedAt : (typeof caseData.createdAt === 'number' ? caseData.createdAt : n) }
  },
  updateCase: async (caseData) => {
    const db = await ensureDatabase()
    const n = Date.now()
    await db.write(async () => {
      const rec = await db.collections.get('cases').find(caseData.id)
      await rec.update((r) => {
        r.client_name = caseData.clientName
        r.opposite_party_name = caseData.oppositePartyName
        r.title = caseData.title
        r.details = caseData.details || ''
        // ms epoch
        r.updated_at = typeof caseData.updatedAt === 'number' ? caseData.updatedAt : n
      })
    })
    return { ...caseData, details: caseData.details || '', updatedAt: typeof caseData.updatedAt === 'number' ? caseData.updatedAt : n }
  },
  deleteCase: async (id) => {
    const db = await ensureDatabase()
    const { Q } = require('@nozbe/watermelondb')
    await db.write(async () => {
      // Soft-delete related dates first
      const dates = await db.collections.get('case_dates').query(
        Q.where('case_id', id),
        Q.where('deleted', false)
      ).fetch()
      const n = Date.now()
      for (const d of dates) {
        // First set your domain flag, then mark for deletion so Watermelon includes it in sync
        // eslint-disable-next-line no-await-in-loop
        await d.update((r) => { r.deleted = true; r.updated_at = n })
        // eslint-disable-next-line no-await-in-loop
        await d.markAsDeleted()
      }
      const rec = await db.collections.get('cases').find(id)
      await rec.update((r) => { r.deleted = true; r.updated_at = n })
      await rec.markAsDeleted()
    })
    return id
  },
}

export const wmDateService = {
  getAllDates: async () => {
    const db = await ensureDatabase()
    const { Q } = require('@nozbe/watermelondb')
    const collection = db.collections.get('case_dates')
    const records = await collection.query(
      Q.where('deleted', false),
      Q.sortBy('event_date', Q.asc)
    ).fetch()
    return records.map(mapDateRecord)
  },
  getDatesByCaseId: async (caseId) => {
    const db = await ensureDatabase()
    const { Q } = require('@nozbe/watermelondb')
    const collection = db.collections.get('case_dates')
    const records = await collection.query(
      Q.where('case_id', caseId),
      Q.where('deleted', false),
      Q.sortBy('event_date', Q.asc)
    ).fetch()
    return records.map(mapDateRecord)
  },
  getDateById: async (id) => {
    const db = await ensureDatabase()
    try {
      const rec = await db.collections.get('case_dates').find(id)
      if (rec.deleted) return null
      return mapDateRecord(rec)
    } catch (e) {
      return null
    }
  },
  addDate: async (dateData) => {
    const db = await ensureDatabase()
    const n = Date.now()
    await db.write(async () => {
      await db.collections.get('case_dates').create((rec) => {
        rec._raw.id = dateData.id
        rec.case_id = dateData.caseId
        rec.event_date = dateData.eventDate
        rec.notes = dateData.notes || ''
        rec.photo_uri = dateData.photoUri || null
        // store ms numbers
        rec.created_at = typeof dateData.createdAt === 'number' ? dateData.createdAt : n
        rec.updated_at = typeof dateData.updatedAt === 'number' ? dateData.updatedAt : rec.created_at
        rec.deleted = false
      })
    })
    return { ...dateData, notes: dateData.notes || '', photoUri: dateData.photoUri || null, createdAt: typeof dateData.createdAt === 'number' ? dateData.createdAt : n, updatedAt: typeof dateData.updatedAt === 'number' ? dateData.updatedAt : (typeof dateData.createdAt === 'number' ? dateData.createdAt : n) }
  },
  updateDate: async (dateData) => {
    const db = await ensureDatabase()
    const n = Date.now()
    await db.write(async () => {
      const rec = await db.collections.get('case_dates').find(dateData.id)
      await rec.update((r) => {
        r.case_id = dateData.caseId
        r.event_date = dateData.eventDate
        r.notes = dateData.notes || ''
        r.photo_uri = dateData.photoUri || null
        // ms epoch
        r.updated_at = typeof dateData.updatedAt === 'number' ? dateData.updatedAt : n
      })
    })
    return { ...dateData, notes: dateData.notes || '', photoUri: dateData.photoUri || null, updatedAt: typeof dateData.updatedAt === 'number' ? dateData.updatedAt : n }
  },
  deleteDate: async (id) => {
    const db = await ensureDatabase()
    await db.write(async () => {
      const rec = await db.collections.get('case_dates').find(id)
      const n = Date.now()
      await rec.update((r) => { r.deleted = true; r.updated_at = n })
      await rec.markAsDeleted()
    })
    return id
  },
  deleteDatesByCaseId: async (caseId) => {
    const db = await ensureDatabase()
    const { Q } = require('@nozbe/watermelondb')
    await db.write(async () => {
      const records = await db.collections.get('case_dates').query(
        Q.where('case_id', caseId),
        Q.where('deleted', false)
      ).fetch()
      const n = Date.now()
      for (const rec of records) {
        // eslint-disable-next-line no-await-in-loop
        await rec.update((r) => { r.deleted = true; r.updated_at = n })
        // eslint-disable-next-line no-await-in-loop
        await rec.markAsDeleted()
      }
    })
    return caseId
  },
}
