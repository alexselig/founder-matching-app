import type { SqliteDatabase } from '../database.js'
import {
  RepositoryError,
  throwRepositoryFailure,
} from './errors.js'

export interface DinnerConfiguration {
  id: string
  name: string
  founderIds: string[]
  configuration: unknown
  createdAt: string
  updatedAt: string
}

export interface DinnerVersion {
  id: string
  configurationId: string
  version: number
  snapshot: unknown
  createdAt: string
}

interface DinnerConfigurationRow {
  id: string
  name: string
  founder_ids_json: string
  configuration_json: string
  created_at: string
  updated_at: string
}

interface DinnerVersionRow {
  id: string
  configuration_id: string
  version: number
  snapshot_json: string
  created_at: string
}

function encodeJson(value: unknown, label: string) {
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

function parseJson(value: string, label: string): unknown {
  try {
    return JSON.parse(value) as unknown
  } catch {
    throw new RepositoryError(
      `Stored ${label} is invalid`,
      'storage_failure',
    )
  }
}

function assertTimestamp(value: string, label: string) {
  if (!value || Number.isNaN(Date.parse(value))) {
    throw new RepositoryError(
      `${label} must be a valid timestamp`,
      'invalid_data',
    )
  }
}

function rowToConfiguration(
  row: DinnerConfigurationRow,
): DinnerConfiguration {
  const founderIds = parseJson(
    row.founder_ids_json,
    'dinner founder IDs',
  )

  if (
    !Array.isArray(founderIds) ||
    !founderIds.every((founderId) => typeof founderId === 'string')
  ) {
    throw new RepositoryError(
      'Stored dinner founder IDs have an invalid shape',
      'storage_failure',
    )
  }

  return {
    id: row.id,
    name: row.name,
    founderIds,
    configuration: parseJson(
      row.configuration_json,
      'dinner configuration',
    ),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function rowToVersion(row: DinnerVersionRow): DinnerVersion {
  return {
    id: row.id,
    configurationId: row.configuration_id,
    version: row.version,
    snapshot: parseJson(row.snapshot_json, 'dinner version'),
    createdAt: row.created_at,
  }
}

export class DinnerRepository {
  constructor(private readonly database: SqliteDatabase) {}

  saveConfiguration(configuration: DinnerConfiguration): void {
    if (!configuration.id || !configuration.name) {
      throw new RepositoryError(
        'Dinner configuration ID and name are required',
        'invalid_data',
      )
    }
    if (
      !Array.isArray(configuration.founderIds) ||
      !configuration.founderIds.every(
        (founderId) => typeof founderId === 'string' && founderId.length > 0,
      )
    ) {
      throw new RepositoryError(
        'Dinner founder IDs must be non-empty strings',
        'invalid_data',
      )
    }
    assertTimestamp(
      configuration.createdAt,
      'Dinner creation time',
    )
    assertTimestamp(
      configuration.updatedAt,
      'Dinner update time',
    )

    try {
      this.database
        .prepare(
          `INSERT INTO dinner_configurations (
             id,
             name,
             founder_ids_json,
             configuration_json,
             created_at,
             updated_at
           ) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             founder_ids_json = excluded.founder_ids_json,
             configuration_json = excluded.configuration_json,
             updated_at = excluded.updated_at`,
        )
        .run(
          configuration.id,
          configuration.name,
          encodeJson(
            configuration.founderIds,
            'Dinner founder IDs',
          ),
          encodeJson(
            configuration.configuration,
            'Dinner configuration',
          ),
          configuration.createdAt,
          configuration.updatedAt,
        )
    } catch (error) {
      throwRepositoryFailure(
        error,
        `Failed to save dinner configuration ${configuration.id}`,
      )
    }
  }

  getConfiguration(id: string): DinnerConfiguration {
    try {
      const row = this.database
        .prepare(
          `SELECT
             id,
             name,
             founder_ids_json,
             configuration_json,
             created_at,
             updated_at
           FROM dinner_configurations
           WHERE id = ?`,
        )
        .get(id) as DinnerConfigurationRow | undefined

      if (!row) {
        throw new RepositoryError(
          `Dinner configuration ${id} was not found`,
          'not_found',
        )
      }

      return rowToConfiguration(row)
    } catch (error) {
      throwRepositoryFailure(
        error,
        `Failed to read dinner configuration ${id}`,
      )
    }
  }

  appendVersion(version: DinnerVersion): void {
    if (
      !version.id ||
      !version.configurationId ||
      !Number.isInteger(version.version) ||
      version.version < 1
    ) {
      throw new RepositoryError(
        'Dinner version ID, configuration ID, and positive version are required',
        'invalid_data',
      )
    }
    assertTimestamp(version.createdAt, 'Dinner version creation time')

    try {
      const configuration = this.database
        .prepare(
          'SELECT id FROM dinner_configurations WHERE id = ?',
        )
        .get(version.configurationId)

      if (!configuration) {
        throw new RepositoryError(
          `Dinner configuration ${version.configurationId} was not found`,
          'not_found',
        )
      }

      this.database
        .prepare(
          `INSERT INTO dinner_versions (
             id,
             configuration_id,
             version,
             snapshot_json,
             created_at
           ) VALUES (?, ?, ?, ?, ?)`,
        )
        .run(
          version.id,
          version.configurationId,
          version.version,
          encodeJson(version.snapshot, 'Dinner version snapshot'),
          version.createdAt,
        )
    } catch (error) {
      throwRepositoryFailure(
        error,
        `Failed to append dinner version ${version.id}`,
      )
    }
  }

  listVersions(configurationId: string): DinnerVersion[] {
    try {
      const configuration = this.database
        .prepare(
          'SELECT id FROM dinner_configurations WHERE id = ?',
        )
        .get(configurationId)

      if (!configuration) {
        throw new RepositoryError(
          `Dinner configuration ${configurationId} was not found`,
          'not_found',
        )
      }

      const rows = this.database
        .prepare(
          `SELECT
             id,
             configuration_id,
             version,
             snapshot_json,
             created_at
           FROM dinner_versions
           WHERE configuration_id = ?
           ORDER BY version DESC`,
        )
        .all(configurationId) as DinnerVersionRow[]

      return rows.map(rowToVersion)
    } catch (error) {
      throwRepositoryFailure(
        error,
        `Failed to list dinner versions for ${configurationId}`,
      )
    }
  }
}
