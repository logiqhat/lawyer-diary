import { Model } from '@nozbe/watermelondb'
import { field, relation } from '@nozbe/watermelondb/decorators'

export class CaseDate extends Model {
  static table = 'case_dates'

  static associations = {
    cases: { type: 'belongs_to', key: 'case_id' },
  }

  @field('case_id') case_id
  @field('event_date') event_date
  @field('notes') notes
  @field('photo_uri') photo_uri
  // ms epoch numbers
  @field('created_at') created_at
  @field('updated_at') updated_at
  @field('deleted') deleted

  @relation('cases', 'case_id') case
}
