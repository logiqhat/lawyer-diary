import { appSchema, tableSchema } from '@nozbe/watermelondb'

export const schema = appSchema({
  version: 1,
  tables: [
    tableSchema({
      name: 'cases',
      columns: [
        { name: 'client_name', type: 'string' },
        { name: 'opposite_party_name', type: 'string' },
        { name: 'title', type: 'string' },
        { name: 'details', type: 'string', isOptional: true },
        // ms epoch numbers; required for sync
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
        { name: 'deleted', type: 'boolean', isOptional: true },
      ],
    }),
    tableSchema({
      name: 'case_dates',
      columns: [
        { name: 'case_id', type: 'string' },
        { name: 'event_date', type: 'string' },
        { name: 'notes', type: 'string', isOptional: true },
        { name: 'photo_uri', type: 'string', isOptional: true },
        // ms epoch numbers; required for sync
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
        { name: 'deleted', type: 'boolean', isOptional: true },
      ],
    }),
  ],
})
