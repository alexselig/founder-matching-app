import path from 'node:path'
import { readFileSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  FounderDetailResponseSchema,
  FounderListResponseSchema,
} from '../src/shared/contracts.js'
import { normalizeFounders } from '../src/shared/founder.js'
import { createDatabase, type SqliteDatabase } from './database.js'
import {
  requireDurableDatabasePath,
  startServer,
} from './index.js'
import { FounderRepository } from './repositories/founders.js'
import { createServer } from './app'

const staticRoot = path.resolve(process.cwd(), 'server/test-fixtures/runtime-dist')
const fixturePath = path.resolve(process.cwd(), 'src/founders.json')
const founders = normalizeFounders(
  JSON.parse(readFileSync(fixturePath, 'utf8')) as unknown,
)
let database: SqliteDatabase
let founderRepository: FounderRepository

beforeAll(async () => {
  await rm(staticRoot, { recursive: true, force: true })
  await mkdir(path.join(staticRoot, 'assets'), { recursive: true })
  await writeFile(
    path.join(staticRoot, 'index.html'),
    `<!doctype html><html lang="en"><head><meta charset="utf-8" /><title>fixture spa</title></head><body><div id="root">fixture spa</div></body></html>`,
  )
  await writeFile(path.join(staticRoot, 'assets/app.js'), `console.log('fixture asset')`)
  database = createDatabase({ filename: ':memory:' })
  founderRepository = new FounderRepository(database)
  founderRepository.saveAll(founders)
})

afterAll(async () => {
  if (database.open) {
    database.close()
  }
  await rm(staticRoot, { recursive: true, force: true })
})

function serverOptions() {
  return {
    databaseStatus: () => 'ready' as const,
    founderRepository,
    staticRoot,
  }
}

describe('createServer', () => {
  it('reports V2 and database readiness from both health endpoints', async () => {
    const server = createServer(serverOptions())

    const apiResponse = await server.inject({
      method: 'GET',
      url: '/api/v2/health',
    })

    expect(apiResponse.json()).toEqual({ version: 'v2', database: 'ready' })

    const healthzResponse = await server.inject({
      method: 'GET',
      url: '/healthz',
    })

    expect(healthzResponse.json()).toEqual({ version: 'v2', database: 'ready' })

    await server.close()
  })

  it('serves built assets and falls back to index.html for non-api routes', async () => {
    const server = createServer(serverOptions())

    const assetResponse = await server.inject({
      method: 'GET',
      url: '/assets/app.js',
    })

    expect(assetResponse.statusCode).toBe(200)
    expect(assetResponse.body).toContain('fixture asset')

    const routeResponse = await server.inject({
      method: 'GET',
      url: '/v2',
    })

    expect(routeResponse.statusCode).toBe(200)
    expect(routeResponse.headers['content-type']).toContain('text/html')
    expect(routeResponse.body).toContain('fixture spa')

    const rootResponse = await server.inject({
      method: 'GET',
      url: '/',
    })

    expect(rootResponse.statusCode).toBe(200)
    expect(rootResponse.body).toContain('fixture spa')

    const nestedRouteResponse = await server.inject({
      method: 'GET',
      url: '/v1/admin',
    })

    expect(nestedRouteResponse.statusCode).toBe(200)
    expect(nestedRouteResponse.body).toContain('fixture spa')

    const apiNotFound = await server.inject({
      method: 'GET',
      url: '/api/unknown',
    })

    expect(apiNotFound.statusCode).toBe(404)
    expect(apiNotFound.headers['content-type']).toContain('application/json')

    await server.close()
  })

  it('returns JSON 404s for API and resource misses while preserving SPA document fallback', async () => {
    const server = createServer(serverOptions())

    const apiRootResponse = await server.inject({
      method: 'GET',
      url: '/api',
    })

    expect(apiRootResponse.statusCode).toBe(404)
    expect(apiRootResponse.headers['content-type']).toContain('application/json')

    const apiQueryResponse = await server.inject({
      method: 'GET',
      url: '/api?x=1',
    })

    expect(apiQueryResponse.statusCode).toBe(404)
    expect(apiQueryResponse.headers['content-type']).toContain('application/json')

    const missingAssetResponse = await server.inject({
      method: 'GET',
      url: '/assets/missing.js',
    })

    expect(missingAssetResponse.statusCode).toBe(404)
    expect(missingAssetResponse.headers['content-type']).toContain('application/json')

    const extensionLookingResponse = await server.inject({
      method: 'GET',
      url: '/missing.txt',
    })

    expect(extensionLookingResponse.statusCode).toBe(404)
    expect(extensionLookingResponse.headers['content-type']).toContain('application/json')

    const extensionlessClientResponse = await server.inject({
      method: 'GET',
      url: '/v2/search/results',
    })

    expect(extensionlessClientResponse.statusCode).toBe(200)
    expect(extensionlessClientResponse.headers['content-type']).toContain('text/html')
    expect(extensionlessClientResponse.body).toContain('fixture spa')

    await server.close()
  })

  it('exposes founder list and detail routes through createServer', async () => {
    const server = createServer(serverOptions())

    const listResponse = await server.inject({
      method: 'GET',
      url: '/api/v2/founders?limit=1',
    })
    const listEnvelope = FounderListResponseSchema.parse(
      listResponse.json(),
    )

    expect(listResponse.statusCode).toBe(200)
    expect(listEnvelope).toEqual({
      ok: true,
      data: {
        items: founders.slice(0, 1),
        total: 574,
        limit: 1,
        offset: 0,
      },
    })

    const founder = founders[0]!
    const detailResponse = await server.inject({
      method: 'GET',
      url: `/api/v2/founders/${encodeURIComponent(founder.id)}`,
    })

    expect(detailResponse.statusCode).toBe(200)
    expect(
      FounderDetailResponseSchema.parse(detailResponse.json()),
    ).toEqual({
      ok: true,
      data: founder,
    })

    await server.close()
  })

  it('requires a durable production database path', () => {
    expect(() => requireDurableDatabasePath({})).toThrow(
      'DATABASE_PATH must name a durable SQLite file',
    )
    expect(() =>
      requireDurableDatabasePath({
        DATABASE_PATH: ':memory:',
      }),
    ).toThrow('DATABASE_PATH must name a durable SQLite file')
    expect(
      requireDurableDatabasePath({
        DATABASE_PATH: 'data/founders.sqlite',
      }),
    ).toBe('data/founders.sqlite')
  })

  it('seeds durable production storage idempotently and closes it with the server', async () => {
    const databasePath = path.join(staticRoot, 'founders.sqlite')
    const environment = {
      DATABASE_PATH: databasePath,
      HOST: '127.0.0.1',
      PORT: '0',
    }

    const firstServer = await startServer(environment)
    const firstResponse = await firstServer.inject({
      method: 'GET',
      url: '/api/v2/founders?limit=1',
    })

    expect(
      FounderListResponseSchema.parse(firstResponse.json()),
    ).toMatchObject({
      ok: true,
      data: {
        total: 574,
      },
    })
    await firstServer.close()

    const secondServer = await startServer(environment)
    const secondResponse = await secondServer.inject({
      method: 'GET',
      url: '/api/v2/founders?limit=1',
    })

    expect(
      FounderListResponseSchema.parse(secondResponse.json()),
    ).toMatchObject({
      ok: true,
      data: {
        total: 574,
      },
    })
    await secondServer.close()
  })
})
