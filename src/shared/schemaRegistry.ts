export type RawFounderField =
  | 'Id'
  | 'Name'
  | 'Group'
  | 'Group Section'
  | 'Company vertical'
  | 'Company'
  | 'Age'
  | 'Education'
  | 'Role'

export type FounderFieldKey =
  | 'id'
  | 'name'
  | 'cohortGroup'
  | 'cohortSection'
  | 'companyVertical'
  | 'company'
  | 'age'
  | 'education'
  | 'role'

export type FounderFieldKind = 'text' | 'number'

export type FounderFieldNormalizer =
  | 'opaque-string'
  | 'unicode-text'
  | 'category-code'
  | 'vertical-path'
  | 'integer'

export interface FounderFieldDefinition {
  readonly key: FounderFieldKey
  readonly path: FounderFieldKey
  readonly label: string
  readonly kind: FounderFieldKind
  readonly source: RawFounderField
  readonly provenance: 'src/founders.json'
  readonly search: boolean
  readonly filter: boolean
  readonly group: boolean
  readonly sort: boolean
  readonly display: boolean
  readonly match: boolean
  readonly aliases: readonly string[]
  readonly normalizer: FounderFieldNormalizer
}

const provenance = 'src/founders.json' as const

function freezeDefinition(definition: FounderFieldDefinition): FounderFieldDefinition {
  return Object.freeze({
    ...definition,
    aliases: Object.freeze([...definition.aliases]),
  })
}

export const FOUNDER_SCHEMA = Object.freeze<readonly FounderFieldDefinition[]>([
  freezeDefinition({
    key: 'id',
    path: 'id',
    label: 'Founder ID',
    kind: 'text',
    source: 'Id',
    provenance,
    search: true,
    filter: true,
    group: false,
    sort: true,
    display: false,
    match: true,
    aliases: ['founder id', 'id', 'record id'],
    normalizer: 'opaque-string',
  }),
  freezeDefinition({
    key: 'name',
    path: 'name',
    label: 'Founder name',
    kind: 'text',
    source: 'Name',
    provenance,
    search: true,
    filter: false,
    group: true,
    sort: true,
    display: true,
    match: true,
    aliases: ['founder', 'founder name', 'name'],
    normalizer: 'unicode-text',
  }),
  freezeDefinition({
    key: 'cohortGroup',
    path: 'cohortGroup',
    label: 'Cohort group',
    kind: 'text',
    source: 'Group',
    provenance,
    search: true,
    filter: true,
    group: true,
    sort: true,
    display: true,
    match: true,
    aliases: ['cohort', 'cohort group', 'group'],
    normalizer: 'category-code',
  }),
  freezeDefinition({
    key: 'cohortSection',
    path: 'cohortSection',
    label: 'Cohort section',
    kind: 'text',
    source: 'Group Section',
    provenance,
    search: true,
    filter: true,
    group: true,
    sort: true,
    display: true,
    match: true,
    aliases: ['cohort section', 'group section', 'section'],
    normalizer: 'category-code',
  }),
  freezeDefinition({
    key: 'companyVertical',
    path: 'companyVertical',
    label: 'Company vertical',
    kind: 'text',
    source: 'Company vertical',
    provenance,
    search: true,
    filter: true,
    group: true,
    sort: true,
    display: true,
    match: true,
    aliases: ['company vertical', 'industry', 'sector', 'vertical'],
    normalizer: 'vertical-path',
  }),
  freezeDefinition({
    key: 'company',
    path: 'company',
    label: 'Company',
    kind: 'text',
    source: 'Company',
    provenance,
    search: true,
    filter: true,
    group: true,
    sort: true,
    display: true,
    match: true,
    aliases: ['company', 'startup'],
    normalizer: 'unicode-text',
  }),
  freezeDefinition({
    key: 'age',
    path: 'age',
    label: 'Age',
    kind: 'number',
    source: 'Age',
    provenance,
    search: true,
    filter: true,
    group: false,
    sort: true,
    display: true,
    match: true,
    aliases: ['age'],
    normalizer: 'integer',
  }),
  freezeDefinition({
    key: 'education',
    path: 'education',
    label: 'Education',
    kind: 'text',
    source: 'Education',
    provenance,
    search: true,
    filter: true,
    group: true,
    sort: true,
    display: true,
    match: true,
    aliases: ['education', 'background', 'degree', 'study'],
    normalizer: 'unicode-text',
  }),
  freezeDefinition({
    key: 'role',
    path: 'role',
    label: 'Role',
    kind: 'text',
    source: 'Role',
    provenance,
    search: true,
    filter: true,
    group: true,
    sort: true,
    display: true,
    match: true,
    aliases: ['function', 'role'],
    normalizer: 'unicode-text',
  }),
])
