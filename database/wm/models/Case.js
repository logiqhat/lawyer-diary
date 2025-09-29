import { Model } from '@nozbe/watermelondb'
import { field, children } from '@nozbe/watermelondb/decorators'

export class Case extends Model {
  static table = 'cases'

  static associations = {
    case_dates: { type: 'has_many', foreignKey: 'case_id' },
  }

  @field('client_name') client_name
  @field('opposite_party_name') opposite_party_name
  @field('title') title
  @field('details') details
  // ms epoch numbers
  @field('created_at') created_at
  @field('updated_at') updated_at
  @field('deleted') deleted

  @children('case_dates') dates
}
