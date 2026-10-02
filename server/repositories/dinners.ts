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

export interface DinnerConfigurationSummary extends DinnerConfiguration {
  latestVersion: number
}

export interface NewDinnerVersion {
  id: string
  snapshot: unknown
  createdAt: string
}

export interface NextDinnerVersion extends NewDinnerVersion {
  configurationId: string
  name: string
  founderIds: string[]
  configuration: unknown
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

function assertTimestamp(
  value: unknown,
  label: string,
): asserts value is string {
  if (
    typeof value !== 'string' ||
    !value ||
    Number.isNaN(Date.parse(value))
  ) {
    throw new RepositoryError(
      `${label} must be a valid timestamp`,
      'invalid_data',
    )
  }
}

function assertDinnerConfiguration(
  value: unknown,
): asserts value is DinnerConfiguration {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RepositoryError(
      'Dinner configuration must be an object',
      'invalid_data',
    )
  }

  const configuration = value as Record<string, unknown>
  assertRequiredString(
    configuration.id,
    'Dinner configuration ID',
  )
  assertRequiredString(
    configuration.name,
    'Dinner configuration name',
  )

  if (
    !Array.isArray(configuration.founderIds)
  ) {
    throw new RepositoryError(
      'Dinner founder IDs must be an array',
      'invalid_data',
    )
  }
  assertDenseArray(
    configuration.founderIds,
    'Dinner founder IDs',
  )
  if (
    !configuration.founderIds.every(
      (founderId) =>
        typeof founderId === 'string' && founderId.length > 0,
    )
  ) {
    throw new RepositoryError(
      'Dinner founder IDs must be non-empty strings',
      'invalid_data',
    )
  }

  if (
    !Object.hasOwn(configuration, 'configuration') ||
    configuration.configuration === undefined
  ) {
    throw new RepositoryError(
      'Dinner configuration payload is required',
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
}

function assertDinnerVersion(
  value: unknown,
): asserts value is DinnerVersion {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RepositoryError(
      'Dinner version must be an object',
      'invalid_data',
    )
  }

  const version = value as Record<string, unknown>
  assertRequiredString(version.id, 'Dinner version ID')
  assertRequiredString(
    version.configurationId,
    'Dinner configuration ID',
  )

  if (
    typeof version.version !== 'number' ||
    !Number.isSafeInteger(version.version) ||
    version.version < 1
  ) {
    throw new RepositoryError(
      'Dinner version must be a positive integer',
      'invalid_data',
    )
  }

  if (!Object.hasOwn(version, 'snapshot') || version.snapshot === undefined) {
    throw new RepositoryError(
      'Dinner version snapshot is required',
      'invalid_data',
    )
  }

  assertTimestamp(
    version.createdAt,
    'Dinner version creation time',
  )
}

function assertVersionNumber(value: unknown): asserts value is number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 1
  ) {
    throw new RepositoryError(
      'Dinner version must be a positive integer',
      'invalid_data',
    )
  }
}

const CONFIGURATION_COLUMNS = `id,
  name,
  founder_ids_json,
  configuration_json,
  created_at,
  updated_at`

const VERSION_COLUMNS = `id,
  configuration_id,
  version,
  snapshot_json,
  created_at`

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
    assertDinnerConfiguration(configuration)
    const founderIdsJson = encodeJson(
      configuration.founderIds,
      'Dinner founder IDs',
    )
    const configurationJson = encodeJson(
      configuration.configuration,
      'Dinner configuration',
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
          founderIdsJson,
          configurationJson,
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
    assertRepositoryId(id, 'Dinner configuration ID')

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
    assertDinnerVersion(version)
    const snapshotJson = encodeJson(
      version.snapshot,
      'Dinner version snapshot',
    )

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
          snapshotJson,
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
    assertRepositoryId(
      configurationId,
      'Dinner configuration ID',
    )

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

  createWithFirstVersion(
    configuration: DinnerConfiguration,
    first: NewDinnerVersion,
  ): DinnerVersion {
    assertDinnerConfiguration(configuration)
    const version: DinnerVersion = {
      id: first?.id,
      configurationId: configuration.id,
      version: 1,
      snapshot: first?.snapshot,
      createdAt: first?.createdAt,
    }
    assertDinnerVersion(version)
    const founderIdsJson = encodeJson(
      configuration.founderIds,
      'Dinner founder IDs',
    )
    const configurationJson = encodeJson(
      configuration.configuration,
      'Dinner configuration',
    )
    const snapshotJson = encodeJson(
      version.snapshot,
      'Dinner version snapshot',
    )

    try {
      this.database
        .transaction(() => {
          this.database
            .prepare(
              `INSERT INTO dinner_configurations (${CONFIGURATION_COLUMNS})
               VALUES (?, ?, ?, ?, ?, ?)`,
            )
            .run(
              configuration.id,
              configuration.name,
              founderIdsJson,
              configurationJson,
              configuration.createdAt,
              configuration.updatedAt,
            )
          this.insertVersion(version, snapshotJson)
        })
        .immediate()
      return version
    } catch (error) {
      throwRepositoryFailure(
        error,
        `Failed to create dinner configuration ${configuration.id}`,
      )
    }
  }

  appendNextVersion(next: NextDinnerVersion): DinnerVersion {
    if (!next || typeof next !== 'object') {
      throw new RepositoryError(
        'Dinner version must be an object',
        'invalid_data',
      )
    }
    assertDinnerConfiguration({
      id: next.configurationId,
      name: next.name,
      founderIds: next.founderIds,
      configuration: next.configuration,
      createdAt: next.createdAt,
      updatedAt: next.createdAt,
    })
    assertDinnerVersion({
      id: next.id,
      configurationId: next.configurationId,
      version: 1,
      snapshot: next.snapshot,
      createdAt: next.createdAt,
    })
    const founderIdsJson = encodeJson(next.founderIds, 'Dinner founder IDs')
    const configurationJson = encodeJson(
      next.configuration,
      'Dinner configuration',
    )
    const snapshotJson = encodeJson(next.snapshot, 'Dinner version snapshot')

    try {
      return this.database
        .transaction((): DinnerVersion => {
          const current = this.database
            .prepare(
              `SELECT MAX(version) AS latest
               FROM dinner_configurations AS configuration
               LEFT JOIN dinner_versions AS version
                 ON version.configuration_id = configuration.id
               WHERE configuration.id = ?
               GROUP BY configuration.id`,
            )
            .get(next.configurationId) as
            | { latest: number | null }
            | undefined

          if (!current) {
            throw new RepositoryError(
              `Dinner configuration ${next.configurationId} was not found`,
              'not_found',
            )
          }

          const version: DinnerVersion = {
            id: next.id,
            configurationId: next.configurationId,
            version: (current.latest ?? 0) + 1,
            snapshot: next.snapshot,
            createdAt: next.createdAt,
          }
          this.insertVersion(version, snapshotJson)
          this.database
            .prepare(
              `UPDATE dinner_configurations
               SET name = ?,
                   founder_ids_json = ?,
                   configuration_json = ?,
                   updated_at = ?
               WHERE id = ?`,
            )
            .run(
              next.name,
              founderIdsJson,
              configurationJson,
              next.createdAt,
              next.configurationId,
            )
          return version
        })
        .immediate()
    } catch (error) {
      throwRepositoryFailure(
        error,
        `Failed to append dinner version ${next.id}`,
      )
    }
  }

  listConfigurations(): DinnerConfigurationSummary[] {
    try {
      const rows = this.database
        .prepare(
          `SELECT
             ${CONFIGURATION_COLUMNS},
             (
               SELECT MAX(version)
               FROM dinner_versions
               WHERE configuration_id = dinner_configurations.id
             ) AS latest_version
           FROM dinner_configurations
           ORDER BY updated_at DESC, id`,
        )
        .all() as Array<
        DinnerConfigurationRow & { latest_version: number | null }
      >

      return rows
        .filter((row) => row.latest_version !== null)
        .map((row) => ({
          ...rowToConfiguration(row),
          latestVersion: row.latest_version!,
        }))
    } catch (error) {
      throwRepositoryFailure(error, 'Failed to list dinner configurations')
    }
  }

  getVersion(configurationId: string, version: number): DinnerVersion {
    assertRepositoryId(configurationId, 'Dinner configuration ID')
    assertVersionNumber(version)

    try {
      const row = this.database
        .prepare(
          `SELECT ${VERSION_COLUMNS}
           FROM dinner_versions
           WHERE configuration_id = ? AND version = ?`,
        )
        .get(configurationId, version) as DinnerVersionRow | undefined

      if (!row) {
        throw new RepositoryError(
          `Dinner ${configurationId} version ${version} was not found`,
          'not_found',
        )
      }
      return rowToVersion(row)
    } catch (error) {
      throwRepositoryFailure(
        error,
        `Failed to read dinner ${configurationId} version ${version}`,
      )
    }
  }

  getLatestVersion(configurationId: string): DinnerVersion {
    assertRepositoryId(configurationId, 'Dinner configuration ID')

    try {
      const row = this.database
        .prepare(
          `SELECT ${VERSION_COLUMNS}
           FROM dinner_versions
           WHERE configuration_id = ?
           ORDER BY version DESC
           LIMIT 1`,
        )
        .get(configurationId) as DinnerVersionRow | undefined

      if (!row) {
        throw new RepositoryError(
          `Dinner configuration ${configurationId} was not found`,
          'not_found',
        )
      }
      return rowToVersion(row)
    } catch (error) {
      throwRepositoryFailure(
        error,
        `Failed to read latest version of dinner ${configurationId}`,
      )
    }
  }

  private insertVersion(version: DinnerVersion, snapshotJson: string) {
    this.database
      .prepare(
        `INSERT INTO dinner_versions (${VERSION_COLUMNS})
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        version.id,
        version.configurationId,
        version.version,
        snapshotJson,
        version.createdAt,
      )
  }
}
