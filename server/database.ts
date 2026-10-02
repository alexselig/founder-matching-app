import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

import Database from 'better-sqlite3'

export type SqliteDatabase = Database.Database

export interface DatabaseOptions {
  filename: string
  migrationPath?: string
}

function ensureEnrichmentRunColumns(database: SqliteDatabase) {
  const columns = new Set(
    (
      database
        .prepare('PRAGMA table_info(web_enrichment_runs)')
        .all() as Array<{ name: string }>
    ).map((column) => column.name),
  )
  const additions = [
    [
      'status',
      `ALTER TABLE web_enrichment_runs
       ADD COLUMN status TEXT NOT NULL DEFAULT 'complete'
       CHECK (
         status IN (
           'queued',
           'running',
           'complete',
           'partial',
           'failed'
         )
       )`,
    ],
    [
      'completed_at',
      'ALTER TABLE web_enrichment_runs ADD COLUMN completed_at TEXT',
    ],
    [
      'warnings_json',
      `ALTER TABLE web_enrichment_runs
       ADD COLUMN warnings_json TEXT
       CHECK (warnings_json IS NULL OR json_valid(warnings_json))`,
    ],
    [
      'error_json',
      `ALTER TABLE web_enrichment_runs
       ADD COLUMN error_json TEXT
       CHECK (error_json IS NULL OR json_valid(error_json))`,
    ],
  ] as const

  for (const [column, statement] of additions) {
    if (!columns.has(column)) {
      database.exec(statement)
    }
  }
}

function defaultMigrationPath() {
  const candidates: string[] = []
  const moduleUrl = new URL(import.meta.url)
  if (moduleUrl.protocol === 'file:') {
    candidates.push(
      fileURLToPath(
        new URL('./migrations/001-v2.sql', moduleUrl),
      ),
    )
  }
  candidates.push(
    resolve(process.cwd(), 'server/migrations/001-v2.sql'),
    resolve(
      process.cwd(),
      'dist-server/server/migrations/001-v2.sql',
    ),
  )
  const migrationPath = candidates.find((candidate) =>
    existsSync(candidate),
  )

  if (!migrationPath) {
    throw new Error('Could not locate server/migrations/001-v2.sql')
  }

  return migrationPath
}

export function createDatabase(
  options: DatabaseOptions,
): SqliteDatabase {
  if (
    !options ||
    typeof options.filename !== 'string' ||
    !options.filename
  ) {
    throw new Error(
      'Database filename is required; use :memory: explicitly for ephemeral storage',
    )
  }

  const database = new Database(options.filename)
  const migrationPath =
    options.migrationPath ?? defaultMigrationPath()

  try {
    database.pragma('foreign_keys = ON')
    database.exec(readFileSync(migrationPath, 'utf8'))
    ensureEnrichmentRunColumns(database)
    return database
  } catch (error) {
    database.close()
    throw error
  }
}
