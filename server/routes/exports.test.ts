import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { normalizeFounders } from '../../src/shared/founder.js'
import { parseCsv } from '../../src/test/csv.js'
import { createDatabase, type SqliteDatabase } from '../database.js'
import { DinnerRepository } from '../repositories/dinners.js'
import { FounderRepository } from '../repositories/founders.js'
import { WebResultsRepository } from '../repositories/webResults.js'
import { DinnerService } from '../services/dinners.js'
import { ExportService } from '../services/export.js'
import { exportRoutes } from './exports.js'

const founders = normalizeFounders(
  JSON.parse(
    readFileSync(resolve(process.cwd(), 'src/founders.json'), 'utf8'),
  ) as unknown,
)

describe('founder export routes', () => {
  let database: SqliteDatabase
  let server: FastifyInstance

  beforeEach(async () => {
    database = createDatabase({ filename: ':memory:' })
    const founderRepository = new FounderRepository(database)
    founderRepository.saveAll(founders)
    server = Fastify()
    await server.register(exportRoutes, {
      exports: new ExportService({
        dinners: new DinnerService({
          dinners: new DinnerRepository(database),
          founders: founderRepository,
        }),
        founders: founderRepository,
        webResults: new WebResultsRepository(database),
        now: () => new Date('2026-10-05T18:30:00.000Z'),
      }),
    })
  })

  afterEach(async () => {
    await server.close()
    if (database.open) {
      database.close()
    }
  })

  it('downloads selected founders as CSV with optional details', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/api/v2/exports/founders',
      payload: {
        founderIds: [founders[0]!.id, founders[1]!.id],
        format: 'csv',
        includeDetails: true,
      },
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-disposition']).toBe(
      'attachment; filename="founder-search-results-2026-10-05.csv"',
    )
    expect(response.headers['cache-control']).toBe('no-store')
    expect(parseCsv(response.body)).toHaveLength(3)
  })

  it('downloads JSON with nested web results on request', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/api/v2/exports/founders',
      payload: { founderIds: [founders[0]!.id], format: 'json', includeWebResults: true },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().founders).toEqual([
      { founder: { id: founders[0]!.id, name: founders[0]!.name }, web_results: [] },
    ])
  })

  it('rejects unknown founders and invalid requests', async () => {
    const unknown = await server.inject({
      method: 'POST',
      url: '/api/v2/exports/founders',
      payload: { founderIds: ['ghost'], format: 'csv' },
    })
    const invalid = await server.inject({
      method: 'POST',
      url: '/api/v2/exports/founders',
      payload: { founderIds: [], format: 'csv' },
    })

    expect(unknown.statusCode).toBe(422)
    expect(unknown.json().error).toMatchObject({
      code: 'unknown_founders',
      details: { founderIds: ['ghost'] },
    })
    expect(invalid.statusCode).toBe(400)
    expect(invalid.json().error.code).toBe('invalid_export')
  })
})
