import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  DinnerListEnvelopeSchema,
  DinnerVersionListEnvelopeSchema,
  SavedDinnerEnvelopeSchema,
} from '../../src/shared/dinnerContracts.js'
import { normalizeFounders } from '../../src/shared/founder.js'
import { csvRecords } from '../../src/test/csv.js'
import {
  buildDinnerState,
  buildDraftDinnerState,
} from '../../src/test/dinnerStateFixture.js'
import { createDatabase, type SqliteDatabase } from '../database.js'
import { DinnerRepository } from '../repositories/dinners.js'
import { FounderRepository } from '../repositories/founders.js'
import { WebResultsRepository } from '../repositories/webResults.js'
import { DinnerService } from '../services/dinners.js'
import { ExportService } from '../services/export.js'
import { dinnerRoutes } from './dinners.js'

const founders = normalizeFounders(
  JSON.parse(
    readFileSync(resolve(process.cwd(), 'src/founders.json'), 'utf8'),
  ) as unknown,
)
const cohort = founders.slice(0, 6)
const cohortIds = cohort.map((founder) => founder.id)

describe('dinner routes', () => {
  let database: SqliteDatabase
  let server: FastifyInstance

  beforeEach(async () => {
    database = createDatabase({ filename: ':memory:' })
    const founderRepository = new FounderRepository(database)
    founderRepository.saveAll(founders)
    const dinners = new DinnerService({
      dinners: new DinnerRepository(database),
      founders: founderRepository,
    })
    server = Fastify()
    await server.register(dinnerRoutes, {
      dinners,
      exports: new ExportService({
        dinners,
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

  async function createDinner(payload: unknown) {
    const response = await server.inject({
      method: 'POST',
      url: '/api/v2/dinners',
      payload: payload as object,
    })
    return response
  }

  it('creates a dinner and reopens every saved setting unchanged', async () => {
    const state = buildDinnerState(cohortIds)

    const created = await createDinner({ name: 'AI Infrastructure Dinner', state })

    expect(created.statusCode).toBe(201)
    const createdBody = SavedDinnerEnvelopeSchema.parse(created.json())
    if (!createdBody.ok) throw new Error('expected success')
    expect(createdBody.data).toMatchObject({ version: 1, status: 'ready' })
    expect(created.headers.location).toBe(`/api/v2/dinners/${createdBody.data.id}`)

    const reopened = await server.inject({
      method: 'GET',
      url: `/api/v2/dinners/${createdBody.data.id}`,
    })

    expect(reopened.statusCode).toBe(200)
    const body = SavedDinnerEnvelopeSchema.parse(reopened.json())
    if (!body.ok) throw new Error('expected success')
    expect(body.data.state).toEqual(state)
    expect(body.data.state.cohort).toEqual(state.cohort)
    expect(body.data.state.criteria).toEqual(state.criteria)
    expect(body.data.state.rules).toEqual(state.rules)
    expect(body.data.state.locks).toEqual(state.locks)
    expect(body.data.state.assignments).toEqual(state.assignments)
    expect(body.data.state.chosenAlternativeId).toBe('alt-recommended')
    expect(body.data.state.threshold).toBe(70)
    expect(body.data.recovery.status).toBe('complete')
  })

  it('appends versions and serves version history and specific versions', async () => {
    const created = (await createDinner({
      name: 'Draft',
      state: buildDraftDinnerState(cohortIds),
    })).json()
    const id = created.data.id as string

    const appended = await server.inject({
      method: 'POST',
      url: `/api/v2/dinners/${id}/versions`,
      payload: { name: 'Generated', note: 'Tables ready', state: buildDinnerState(cohortIds) },
    })
    const versions = await server.inject({ method: 'GET', url: `/api/v2/dinners/${id}/versions` })
    const first = await server.inject({ method: 'GET', url: `/api/v2/dinners/${id}/versions/1` })
    const list = await server.inject({ method: 'GET', url: '/api/v2/dinners' })

    expect(appended.statusCode).toBe(201)
    expect(appended.json().data).toMatchObject({ version: 2, latestVersion: 2, name: 'Generated', note: 'Tables ready' })
    const history = DinnerVersionListEnvelopeSchema.parse(versions.json())
    if (!history.ok) throw new Error('expected success')
    expect(history.data.items.map((item) => [item.version, item.status])).toEqual([
      [2, 'ready'],
      [1, 'draft'],
    ])
    expect(first.json().data).toMatchObject({ version: 1, latestVersion: 2, state: buildDraftDinnerState(cohortIds) })
    const summaries = DinnerListEnvelopeSchema.parse(list.json())
    if (!summaries.ok) throw new Error('expected success')
    expect(summaries.data.items).toEqual([
      expect.objectContaining({ id, name: 'Generated', latestVersion: 2, status: 'ready' }),
    ])
  })

  it('returns a recovery warning when a saved founder is missing', async () => {
    const id = (await createDinner({ name: 'Recovery', state: buildDinnerState(cohortIds) })).json().data.id
    database.prepare('DELETE FROM founders WHERE id = ?').run(cohortIds[4])

    const response = await server.inject({ method: 'GET', url: `/api/v2/dinners/${id}` })

    expect(response.statusCode).toBe(200)
    expect(response.json().data.status).toBe('needs_attention')
    expect(response.json().data.recovery).toEqual({
      status: 'missing_founders',
      savedFounderCount: 6,
      restoredFounderCount: 5,
      missingFounders: [
        {
          founderId: cohortIds[4],
          name: cohort[4]!.name,
          company: cohort[4]!.company,
          role: cohort[4]!.role,
          tableIndex: 1,
          seatIndex: 1,
          locked: false,
        },
      ],
    })
    expect(response.json().data.state).toEqual(buildDinnerState(cohortIds))
  })

  it('rejects invalid dinners with validation details', async () => {
    const response = await createDinner({
      name: 'Bad',
      state: { ...buildDinnerState(cohortIds), chosenAlternativeId: 'missing' },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({
      ok: false,
      error: {
        code: 'invalid_dinner',
        details: [expect.objectContaining({ path: ['state', 'chosenAlternativeId'] })],
      },
    })
  })

  it('rejects unknown founders with their IDs', async () => {
    const response = await createDinner({
      name: 'Unknown',
      state: buildDraftDinnerState([...cohortIds.slice(0, 5), 'ghost']),
    })

    expect(response.statusCode).toBe(422)
    expect(response.json().error).toMatchObject({
      code: 'unknown_founders',
      details: { founderIds: ['ghost'] },
    })
  })

  it('returns JSON envelopes for malformed bodies and unknown dinners', async () => {
    const malformed = await server.inject({
      method: 'POST',
      url: '/api/v2/dinners',
      headers: { 'content-type': 'application/json' },
      payload: '{"name":',
    })
    const missing = await server.inject({ method: 'GET', url: '/api/v2/dinners/missing' })
    const missingVersion = await server.inject({ method: 'GET', url: '/api/v2/dinners/missing/versions/abc' })
    const appendMissing = await server.inject({
      method: 'POST',
      url: '/api/v2/dinners/missing/versions',
      payload: { state: buildDraftDinnerState(cohortIds) },
    })

    expect(malformed.statusCode).toBe(400)
    expect(malformed.json()).toEqual({
      ok: false,
      error: { code: 'invalid_request', message: 'Request body must be valid JSON' },
    })
    expect(missing.statusCode).toBe(404)
    expect(missing.json().error.code).toBe('not_found')
    expect(missingVersion.statusCode).toBe(400)
    expect(appendMissing.statusCode).toBe(404)
  })

  it('downloads a CSV export as an attachment', async () => {
    const id = (await createDinner({ name: 'Export Dinner', state: buildDinnerState(cohortIds) })).json().data.id

    const response = await server.inject({
      method: 'GET',
      url: `/api/v2/dinners/${id}/export?format=csv`,
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toBe('text/csv; charset=utf-8')
    expect(response.headers['content-disposition']).toBe(
      'attachment; filename="export-dinner-v1-2026-10-05.csv"',
    )
    expect(response.headers['cache-control']).toBe('no-store')
    expect(csvRecords(response.body)).toHaveLength(6)
  })

  it('downloads a JSON export with optional nested web results', async () => {
    const id = (await createDinner({ name: 'Export Dinner', state: buildDinnerState(cohortIds) })).json().data.id

    const plain = await server.inject({ method: 'GET', url: `/api/v2/dinners/${id}/export?format=json` })
    const withWeb = await server.inject({
      method: 'GET',
      url: `/api/v2/dinners/${id}/export?format=json&includeWebResults=true&version=1`,
    })

    expect(plain.headers['content-type']).toBe('application/json; charset=utf-8')
    expect(plain.json().founders[0]).not.toHaveProperty('web_results')
    expect(withWeb.json().founders[0].web_results).toEqual([])
    expect(withWeb.json().configuration).toEqual(buildDinnerState(cohortIds))
  })

  it('rejects invalid export requests', async () => {
    const id = (await createDinner({ name: 'Export Dinner', state: buildDinnerState(cohortIds) })).json().data.id

    const csvWithWeb = await server.inject({
      method: 'GET',
      url: `/api/v2/dinners/${id}/export?format=csv&includeWebResults=true`,
    })
    const badFormat = await server.inject({ method: 'GET', url: `/api/v2/dinners/${id}/export?format=xlsx` })
    const missingVersion = await server.inject({
      method: 'GET',
      url: `/api/v2/dinners/${id}/export?format=csv&version=9`,
    })

    expect(csvWithWeb.statusCode).toBe(400)
    expect(csvWithWeb.json().error.code).toBe('invalid_export')
    expect(badFormat.statusCode).toBe(400)
    expect(missingVersion.statusCode).toBe(404)
  })
})
