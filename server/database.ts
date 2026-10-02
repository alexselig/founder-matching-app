import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import Database from 'better-sqlite3'

export type SqliteDatabase = Database.Database

export interface DatabaseOptions {
  filename: string
  migrationPath?: string
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
    options.migrationPath ??
    resolve(process.cwd(), 'server/migrations/001-v2.sql')

  try {
    database.pragma('foreign_keys = ON')
    database.exec(readFileSync(migrationPath, 'utf8'))
    return database
  } catch (error) {
    database.close()
    throw error
  }
}
