import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  FounderDetailResponseSchema,
  FounderListResponseSchema,
} from '../../src/shared/contracts.js'
import { normalizeFounders } from '../../src/shared/founder.js'
import { createDatabase, type SqliteDatabase } from '../database.js'
import { FounderRepository } from '../repositories/founders.js'
import { founderRoutes } from './founders.js'

const fixturePath = resolve(process.cwd(), 'src/founders.json')
const founders = normalizeFounders(
  JSON.parse(readFileSync(fixturePath, 'utf8')) as unknown,
)

describe('founder routes', () => {
  let database: SqliteDatabase
  let repository: FounderRepository
  let server: FastifyInstance

  beforeEach(async () => {
    database = createDatabase({ filename: ':memory:' })
    repository = new FounderRepository(database)
    repository.saveAll(founders)
    server = Fastify()
    await server.register(founderRoutes, { repository })
  })

  afterEach(async () => {
    await server.close()
    if (database.open) {
      database.close()
    }
  })

  it('returns a paginated founder list in a success envelope', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/v2/founders?limit=2&offset=1',
    })

    expect(response.statusCode).toBe(200)
    expect(FounderListResponseSchema.parse(response.json())).toEqual({
      ok: true,
      data: {
        items: founders.slice(1, 3),
        total: 574,
        limit: 2,
        offset: 1,
      },
    })
  })

  it('returns one authoritative founder without flattened web evidence', async () => {
    const founder = founders.find(
      (candidate) => candidate.id === '343105',
    )!
    const response = await server.inject({
      method: 'GET',
      url: `/api/v2/founders/${encodeURIComponent(founder.id)}`,
    })

    expect(response.statusCode).toBe(200)
    expect(FounderDetailResponseSchema.parse(response.json())).toEqual({
      ok: true,
      data: founder,
    })
    expect(response.json().data).not.toHaveProperty('webResults')
    expect(response.json().data).not.toHaveProperty('web_results')
  })

  it('returns a validated error envelope for invalid list query parameters', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/v2/founders?limit=0&unexpected=true',
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({
      ok: false,
      error: {
        code: 'invalid_request',
        message: 'Invalid founder list query',
      },
    })
    expect(response.json().error.details).toEqual(expect.any(Array))
  })

  it('maps repository not-found errors to the API error envelope', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/v2/founders/missing-founder',
    })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({
      ok: false,
      error: {
        code: 'not_found',
        message: 'Founder missing-founder was not found',
      },
    })
  })

  it('surfaces storage failures instead of returning an empty success envelope', async () => {
    database.close()

    const response = await server.inject({
      method: 'GET',
      url: '/api/v2/founders',
    })

    expect(response.statusCode).toBe(500)
    expect(response.json()).toMatchObject({
      ok: false,
      error: {
        code: 'storage_failure',
      },
    })
  })
})
