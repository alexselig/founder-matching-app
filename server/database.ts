import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

import Database from 'better-sqlite3'

export type SqliteDatabase = Database.Database

export interface DatabaseOptions {
  filename: string
  migrationPath?: string
}

function defaultMigrationPath() {
  const candidates = [
    resolve(process.cwd(), 'server/migrations/001-v2.sql'),
    resolve(
      process.cwd(),
      'dist-server/server/migrations/001-v2.sql',
    ),
  ]
  const moduleUrl = new URL(import.meta.url)
  if (moduleUrl.protocol === 'file:') {
    candidates.push(
      fileURLToPath(
        new URL('./migrations/001-v2.sql', moduleUrl),
      ),
    )
  }
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
    return database
  } catch (error) {
    database.close()
    throw error
  }
}
