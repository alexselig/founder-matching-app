import type { Founder } from '../../src/shared/founder.js'
import { FOUNDER_LIST_MAX_LIMIT } from '../../src/shared/contracts.js'
import type { SqliteDatabase } from '../database.js'
import {
  RepositoryError,
  throwRepositoryFailure,
} from './errors.js'
import {
  assertDenseArray,
  assertNoSparseArrays,
  assertRepositoryId,
} from './validation.js'

interface FounderRow {
  id: string
  name: string
  cohort_group: string
  cohort_section: string
  company_vertical: string
  company_vertical_levels_json: string
  company: string
  age: number
  education: string
  role: string
  search_name: string
  raw_json: string
}

export interface FounderListOptions {
  limit?: number
  offset?: number
}

interface FounderParameters {
  id: string
  name: string
  cohortGroup: string
  cohortSection: string
  companyVertical: string
  companyVerticalLevelsJson: string
  company: string
  age: number
  education: string
  role: string
  searchName: string
  rawJson: string
}

function assertRequiredString(
  value: unknown,
  label: string,
): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new RepositoryError(
      `${label} is required`,
      'invalid_data',
    )
  }
}

function assertFounder(
  value: unknown,
  index: number,
): asserts value is Founder {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RepositoryError(
      `Founder record ${index + 1} must be an object`,
      'invalid_data',
    )
  }

  const founder = value as Record<string, unknown>
  assertRequiredString(founder.id, 'Founder ID')
  assertRequiredString(founder.name, 'Founder name')
  assertRequiredString(founder.cohortGroup, 'Founder cohort group')
  assertRequiredString(founder.cohortSection, 'Founder cohort section')
  assertRequiredString(
    founder.companyVertical,
    'Founder company vertical',
  )
  assertRequiredString(founder.company, 'Founder company')
  assertRequiredString(founder.education, 'Founder education')
  assertRequiredString(founder.role, 'Founder role')
  assertRequiredString(founder.searchName, 'Founder search name')

  if (
    !Array.isArray(founder.companyVerticalLevels)
  ) {
    throw new RepositoryError(
      'Founder company vertical levels must be an array',
      'invalid_data',
    )
  }
  assertDenseArray(
    founder.companyVerticalLevels,
    'Founder company vertical levels',
  )
  if (
    !founder.companyVerticalLevels.every(
      (level) => typeof level === 'string' && level.trim().length > 0,
    )
  ) {
    throw new RepositoryError(
      'Founder company vertical levels must be non-empty strings',
      'invalid_data',
    )
  }

  if (
    typeof founder.age !== 'number' ||
    !Number.isSafeInteger(founder.age) ||
    founder.age < 0
  ) {
    throw new RepositoryError(
      'Founder age must be a non-negative integer',
      'invalid_data',
    )
  }

  if (
    !founder.raw ||
    typeof founder.raw !== 'object' ||
    Array.isArray(founder.raw)
  ) {
    throw new RepositoryError(
      'Founder source record must be an object',
      'invalid_data',
    )
  }
}

function requireJson(value: unknown, label: string) {
  assertNoSparseArrays(value, label)

  try {
    const encoded = JSON.stringify(value)
    if (encoded === undefined) {
      throw new Error(`${label} is not JSON serializable`)
    }
    return encoded
  } catch {
    throw new RepositoryError(
      `${label} is not JSON serializable`,
      'invalid_data',
    )
  }
}

function parseJson<T>(value: string, label: string): T {
  try {
    return JSON.parse(value) as T
  } catch {
    throw new RepositoryError(
      `Stored ${label} is invalid`,
      'storage_failure',
    )
  }
}

function rowToFounder(row: FounderRow): Founder {
  const companyVerticalLevels = parseJson<unknown>(
    row.company_vertical_levels_json,
    'founder vertical levels',
  )
  const raw = parseJson<unknown>(row.raw_json, 'founder source record')

  if (
    !Array.isArray(companyVerticalLevels) ||
    !companyVerticalLevels.every((value) => typeof value === 'string') ||
    !raw ||
    typeof raw !== 'object' ||
    Array.isArray(raw)
  ) {
    throw new RepositoryError(
      'Stored founder data has an invalid shape',
      'storage_failure',
    )
  }

  return {
    id: row.id,
    name: row.name,
    cohortGroup: row.cohort_group,
    cohortSection: row.cohort_section,
    companyVertical: row.company_vertical,
    companyVerticalLevels,
    company: row.company,
    age: row.age,
    education: row.education,
    role: row.role,
    searchName: row.search_name,
    raw: Object.freeze(raw as Record<string, unknown>),
  }
}

function assertListOptions(
  value: unknown,
): asserts value is FounderListOptions {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RepositoryError(
      'Founder list options must be an object',
      'invalid_data',
    )
  }

  const options = value as Record<string, unknown>
  if (
    Object.keys(options).some(
      (key) => key !== 'limit' && key !== 'offset',
    )
  ) {
    throw new RepositoryError(
      'Founder list options contain an unknown field',
      'invalid_data',
    )
  }

  if (
    options.limit !== undefined &&
    (typeof options.limit !== 'number' ||
      !Number.isSafeInteger(options.limit) ||
      options.limit < 1 ||
      options.limit > FOUNDER_LIST_MAX_LIMIT)
  ) {
    throw new RepositoryError(
      `Founder list limit must be a safe integer from 1 through ${FOUNDER_LIST_MAX_LIMIT}`,
      'invalid_data',
    )
  }

  if (
    options.offset !== undefined &&
    (typeof options.offset !== 'number' ||
      !Number.isSafeInteger(options.offset) ||
      options.offset < 0)
  ) {
    throw new RepositoryError(
      'Founder list offset must be a non-negative integer',
      'invalid_data',
    )
  }
}

export class FounderRepository {
  constructor(private readonly database: SqliteDatabase) {}

  saveAll(founders: readonly Founder[]): void {
    assertDenseArray(founders, 'Founders')

    const ids = new Set<string>()
    const parameters = founders.map((founder, index) => {
      assertFounder(founder, index)

      if (ids.has(founder.id)) {
        throw new RepositoryError(
          `Duplicate founder ID ${founder.id}`,
          'invalid_data',
        )
      }
      ids.add(founder.id)

      return {
        id: founder.id,
        name: founder.name,
        cohortGroup: founder.cohortGroup,
        cohortSection: founder.cohortSection,
        companyVertical: founder.companyVertical,
        companyVerticalLevelsJson: requireJson(
          founder.companyVerticalLevels,
          'Founder vertical levels',
        ),
        company: founder.company,
        age: founder.age,
        education: founder.education,
        role: founder.role,
        searchName: founder.searchName,
        rawJson: requireJson(
          founder.raw,
          'Founder source record',
        ),
      } satisfies FounderParameters
    })

    try {
      const statement = this.database.prepare(
        `INSERT INTO founders (
           id,
           name,
           cohort_group,
           cohort_section,
           company_vertical,
           company_vertical_levels_json,
           company,
           age,
           education,
           role,
           search_name,
           raw_json
         ) VALUES (
           @id,
           @name,
           @cohortGroup,
           @cohortSection,
           @companyVertical,
           @companyVerticalLevelsJson,
           @company,
           @age,
           @education,
           @role,
           @searchName,
           @rawJson
         )
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           cohort_group = excluded.cohort_group,
           cohort_section = excluded.cohort_section,
           company_vertical = excluded.company_vertical,
           company_vertical_levels_json =
             excluded.company_vertical_levels_json,
           company = excluded.company,
           age = excluded.age,
           education = excluded.education,
           role = excluded.role,
           search_name = excluded.search_name,
           raw_json = excluded.raw_json`,
      )
      const save = this.database.transaction(
        (records: readonly FounderParameters[]) => {
          for (const record of records) {
            statement.run(record)
          }
        },
      )

      save(parameters)
    } catch (error) {
      throwRepositoryFailure(error, 'Failed to save founders')
    }
  }

  list(options: FounderListOptions = {}): Founder[] {
    assertListOptions(options)

    try {
      const rows = this.database
        .prepare(
          `SELECT
             id,
             name,
             cohort_group,
             cohort_section,
             company_vertical,
             company_vertical_levels_json,
             company,
             age,
             education,
             role,
             search_name,
             raw_json
           FROM founders
           ORDER BY rowid
           LIMIT @limit OFFSET @offset`,
        )
        .all({
          limit: options.limit ?? -1,
          offset: options.offset ?? 0,
        }) as FounderRow[]

      return rows.map(rowToFounder)
    } catch (error) {
      throwRepositoryFailure(error, 'Failed to list founders')
    }
  }

  count(): number {
    try {
      const row = this.database
        .prepare('SELECT COUNT(*) AS count FROM founders')
        .get() as { count: number }

      return row.count
    } catch (error) {
      throwRepositoryFailure(error, 'Failed to count founders')
    }
  }

  get(id: string): Founder {
    assertRepositoryId(id, 'Founder ID')

    try {
      const row = this.database
        .prepare(
          `SELECT
             id,
             name,
             cohort_group,
             cohort_section,
             company_vertical,
             company_vertical_levels_json,
             company,
             age,
             education,
             role,
             search_name,
             raw_json
           FROM founders
           WHERE id = ?`,
        )
        .get(id) as FounderRow | undefined

      if (!row) {
        throw new RepositoryError(
          `Founder ${id} was not found`,
          'not_found',
        )
      }

      return rowToFounder(row)
    } catch (error) {
      throwRepositoryFailure(error, `Failed to read founder ${id}`)
    }
  }
}
