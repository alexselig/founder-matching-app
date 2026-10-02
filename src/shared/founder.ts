import { FOUNDER_SCHEMA } from './schemaRegistry.js'

export { FOUNDER_SCHEMA }
export type { FounderFieldDefinition } from './schemaRegistry.js'

export interface RawFounder {
  Id: string
  Name: string
  Group: string
  'Group Section': string
  'Company vertical': string
  Company: string
  Age: number
  Education: string
  Role: string
}

export interface Founder {
  id: string
  name: string
  cohortGroup: string
  cohortSection: string
  companyVertical: string
  companyVerticalLevels: string[]
  company: string
  age: number
  education: string
  role: string
  searchName: string
  raw: Readonly<Record<string, unknown>>
}

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

function normalizeSearchText(value: string) {
  return normalizeText(value)
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

function requireRecord(value: unknown, index: number): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Founder record ${index + 1} must be an object`)
  }
  return value as Record<string, unknown>
}

function requireSourceString(
  row: Record<string, unknown>,
  key: keyof RawFounder,
  index: number,
) {
  const field = row[key]
  if (typeof field !== 'string') {
    throw new Error(`Founder record ${index + 1} is missing ${String(key)}`)
  }

  if (!normalizeText(field)) {
    throw new Error(`Founder record ${index + 1} is missing ${String(key)}`)
  }
  return field
}

function requireNormalizedSourceString(
  row: Record<string, unknown>,
  key: keyof RawFounder,
  index: number,
) {
  return normalizeText(requireSourceString(row, key, index))
}

function requireAge(row: Record<string, unknown>, index: number) {
  const age = row.Age
  if (typeof age !== 'number' || !Number.isInteger(age) || age < 0) {
    throw new Error(`Founder record ${index + 1} has an invalid Age`)
  }
  return age
}

function buildRawRecord(row: Record<string, unknown>): Readonly<Record<string, unknown>> {
  return Object.freeze({ ...row })
}

export function normalizeFounders(input: unknown): Founder[] {
  if (!Array.isArray(input)) {
    throw new Error('Founder dataset must be an array')
  }

  const seenIds = new Set<string>()

  return input.map((entry, index) => {
    const row = requireRecord(entry, index)
    const id = requireSourceString(row, 'Id', index)

    if (seenIds.has(id)) {
      throw new Error(`Duplicate founder ID ${id}`)
    }
    seenIds.add(id)

    const name = requireSourceString(row, 'Name', index)
    const companyVertical = requireNormalizedSourceString(row, 'Company vertical', index)

    return {
      id,
      name,
      cohortGroup: requireNormalizedSourceString(row, 'Group', index),
      cohortSection: requireNormalizedSourceString(row, 'Group Section', index),
      companyVertical,
      companyVerticalLevels: companyVertical.split('->').map((level) => normalizeText(level)).filter(Boolean),
      company: requireNormalizedSourceString(row, 'Company', index),
      age: requireAge(row, index),
      education: requireNormalizedSourceString(row, 'Education', index),
      role: requireNormalizedSourceString(row, 'Role', index),
      searchName: normalizeSearchText(name),
      raw: buildRawRecord(row),
    }
  })
}
