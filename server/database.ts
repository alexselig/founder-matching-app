import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import Database from 'better-sqlite3'

export type SqliteDatabase = Database.Database

export interface DatabaseOptions {
  filename?: string
  migrationPath?: string
}

export function createDatabase(
  options: DatabaseOptions = {},
): SqliteDatabase {
  const database = new Database(options.filename ?? ':memory:')
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
