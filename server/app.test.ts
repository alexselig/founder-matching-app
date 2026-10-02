import path from 'node:path'
import { readFileSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  FounderDetailResponseSchema,
  FounderListResponseSchema,
} from '../src/shared/contracts.js'
import { normalizeFounders } from '../src/shared/founder.js'
import { buildDinnerState } from '../src/test/dinnerStateFixture.js'
import { createDatabase, type SqliteDatabase } from './database.js'
import {
  requireDurableDatabasePath,
  startServer,
} from './index.js'
import { DinnerRepository } from './repositories/dinners.js'
import { FounderRepository } from './repositories/founders.js'
import { ProviderCredentialRepository } from './repositories/providerCredentials.js'
import { WebResultsRepository } from './repositories/webResults.js'
import {
  CredentialVault,
  ProviderSecret,
  createCredentialVault,
} from './services/credentials.js'
import { DinnerService } from './services/dinners.js'
import { ExportService } from './services/export.js'
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
  const dinnerService = new DinnerService({
    dinners: new DinnerRepository(database),
    founders: founderRepository,
  })
  return {
    databaseStatus: () => 'ready' as const,
    founderRepository,
    credentialVault: createCredentialVault(database, {}),
    dinnerService,
    exportService: new ExportService({
      dinners: dinnerService,
      founders: founderRepository,
      webResults: new WebResultsRepository(database),
    }),
    staticRoot,
  }
}

const MASTER_KEY = Buffer.alloc(32, 7).toString('base64')
const OTHER_MASTER_KEY = Buffer.alloc(32, 9).toString('base64')
const STORED_SECRET = 'sk-startup-secret-0000000000wxyz'

function runtimeEnvironment(name: string, overrides: NodeJS.ProcessEnv = {}) {
  return {
    DATABASE_PATH: path.join(staticRoot, `${name}.sqlite`),
    HOST: '127.0.0.1',
    PORT: '0',
    STATIC_ROOT: staticRoot,
    ...overrides,
  }
}

function trackingDatabase() {
  const opened: SqliteDatabase[] = []
  return {
    opened,
    openDatabase: (filename: string) => {
      const created = createDatabase({ filename })
      opened.push(created)
      return created
    },
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
      STATIC_ROOT: staticRoot,
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

  it('exposes credential, dinner, and export routes through createServer', async () => {
    const server = createServer(serverOptions())
    const cohortIds = founders.slice(0, 6).map((founder) => founder.id)

    const credentials = await server.inject({
      method: 'GET',
      url: '/api/v2/providers/credentials',
    })
    const created = await server.inject({
      method: 'POST',
      url: '/api/v2/dinners',
      payload: { name: 'Wired Dinner', state: buildDinnerState(cohortIds) },
    })
    const id = created.json().data.id as string
    const reopened = await server.inject({ method: 'GET', url: `/api/v2/dinners/${id}` })
    const dinnerExport = await server.inject({
      method: 'GET',
      url: `/api/v2/dinners/${id}/export?format=json&includeWebResults=true`,
    })
    const founderExport = await server.inject({
      method: 'POST',
      url: '/api/v2/exports/founders',
      payload: { founderIds: cohortIds.slice(0, 2), format: 'csv' },
    })

    expect(credentials.statusCode).toBe(200)
    expect(credentials.json()).toMatchObject({
      ok: true,
      data: { masterKeyConfigured: false },
    })
    expect(created.statusCode).toBe(201)
    expect(reopened.json().data.state).toEqual(buildDinnerState(cohortIds))
    expect(dinnerExport.statusCode).toBe(200)
    expect(dinnerExport.headers['content-disposition']).toMatch(/^attachment; filename="wired-dinner-v1-/)
    expect(founderExport.statusCode).toBe(200)
    expect(founderExport.body.split('\r\n')).toHaveLength(3)

    await server.close()
  })

  it('starts without a master key when no provider credentials are stored', async () => {
    const server = await startServer(runtimeEnvironment('no-master-key'))

    const response = await server.inject({
      method: 'GET',
      url: '/api/v2/providers/credentials',
    })
    const save = await server.inject({
      method: 'PUT',
      url: '/api/v2/providers/openai/credential',
      payload: { secret: STORED_SECRET },
    })

    expect(response.json()).toMatchObject({
      ok: true,
      data: {
        masterKeyConfigured: false,
        providers: [
          { provider: 'openai', status: 'not_configured' },
          { provider: 'anthropic', status: 'not_configured' },
          { provider: 'xai', status: 'not_configured' },
        ],
      },
    })
    expect(save.statusCode).toBe(503)
    expect(save.json().error.code).toBe('master_key_missing')
    await server.close()
  })

  it.each([
    ['not base64', 'not-a-key!'],
    ['the wrong length', Buffer.alloc(16, 1).toString('base64')],
    ['whitespace', '   '],
  ])('rejects a master key that is %s and closes the database', async (_label, key) => {
    const tracker = trackingDatabase()

    await expect(
      startServer(
        runtimeEnvironment(`invalid-key-${tracker.opened.length}-${key.length}`, {
          FOUNDER_APP_MASTER_KEY: key,
        }),
        { openDatabase: tracker.openDatabase },
      ),
    ).rejects.toMatchObject({
      name: 'CredentialError',
      code: 'master_key_invalid',
      message: expect.not.stringContaining(key.trim() || 'never'),
    })
    expect(tracker.opened).toHaveLength(1)
    expect(tracker.opened[0]!.open).toBe(false)
  })

  it('requires the original master key once provider credentials are stored', async () => {
    const environment = runtimeEnvironment('stored-credential')
    const seed = createDatabase({ filename: environment.DATABASE_PATH })
    new CredentialVault(
      new ProviderCredentialRepository(seed),
      { masterKey: Buffer.from(MASTER_KEY, 'base64') },
    ).store('openai', new ProviderSecret(STORED_SECRET))
    seed.close()

    const missing = trackingDatabase()
    const missingKey = await startServer(environment, {
      openDatabase: missing.openDatabase,
    }).catch((error: unknown) => error)
    const wrong = trackingDatabase()
    const wrongKey = await startServer(
      { ...environment, FOUNDER_APP_MASTER_KEY: OTHER_MASTER_KEY },
      { openDatabase: wrong.openDatabase },
    ).catch((error: unknown) => error)

    expect(missingKey).toMatchObject({ name: 'CredentialError', code: 'master_key_missing' })
    expect(wrongKey).toMatchObject({ name: 'CredentialError', code: 'master_key_mismatch' })
    for (const error of [missingKey, wrongKey]) {
      expect(String((error as Error).message)).not.toContain(STORED_SECRET)
      expect(String((error as Error).message)).not.toContain(OTHER_MASTER_KEY)
    }
    expect(missing.opened[0]!.open).toBe(false)
    expect(wrong.opened[0]!.open).toBe(false)

    const server = await startServer({
      ...environment,
      FOUNDER_APP_MASTER_KEY: MASTER_KEY,
    })
    const response = await server.inject({
      method: 'GET',
      url: '/api/v2/providers/credentials',
    })

    expect(response.json().data.providers[0]).toMatchObject({
      provider: 'openai',
      status: 'valid',
      lastFour: 'wxyz',
    })
    expect(response.body).not.toContain(STORED_SECRET)
    await server.close()
  })
})
