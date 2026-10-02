import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  EnrichmentBatchResponseSchema,
  EnrichmentProgressResponseSchema,
  FounderWebResultsResponseSchema,
  InterpretationResponseSchema,
} from '../../src/shared/contracts.js'
import { normalizeFounders } from '../../src/shared/founder.js'
import { createDatabase, type SqliteDatabase } from '../database.js'
import type { ProviderAdapter } from '../providers/types.js'
import { ProviderError } from '../providers/types.js'
import { FounderRepository } from '../repositories/founders.js'
import { WebResultsRepository } from '../repositories/webResults.js'
import { aiRoutes } from './ai.js'
import { enrichmentRoutes } from './enrichment.js'
import { createAiInterpretationService } from '../services/aiInterpretation.js'
import {
  createEnrichmentRunManager,
  createEnrichmentService,
} from '../services/enrichment.js'

const founders = normalizeFounders(
  JSON.parse(
    readFileSync(resolve(process.cwd(), 'src/founders.json'), 'utf8'),
  ) as unknown,
)

function provider(): ProviderAdapter {
  return {
    id: 'openai',
    capabilities: {
      searchIntent: true,
      dinnerCriteria: true,
      hardRules: true,
      reranking: true,
      webSearch: true,
      citations: true,
    },
    validateCredential: async () => undefined,
    parseSearch: async () => ({
      text: '',
      dimensions: [
        {
          field: 'role',
          operator: 'is',
          value: 'Technical',
        },
      ],
    }),
    parseDinnerCriteria: async () => ({
      criteria: [
        {
          field: 'role',
          objective: 'diverse',
          weight: 'high',
          enabled: true,
        },
      ],
    }),
    parseHardRule: async () => ({
      type: 'same_company_separation',
    }),
    searchWeb: async (query) => [
      {
        title: `${query.context.name} at ${query.context.company}`,
        url: `https://example.test/${query.founderId}`,
        snippet: `${query.context.name} founded ${query.context.company}.`,
        provenance: 'citation',
        rawMetadata: {
          apiKey: 'never-return-this-key',
        },
      },
    ],
  }
}

async function waitForBatch(
  server: FastifyInstance,
  runId: string,
) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await server.inject({
      method: 'GET',
      url: `/api/v2/enrichment/runs/${runId}`,
    })
    const envelope = EnrichmentBatchResponseSchema.parse(response.json())
    if (
      envelope.ok &&
      ['complete', 'partial', 'failed'].includes(envelope.data.status)
    ) {
      return envelope.data
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 0))
  }

  throw new Error('Timed out waiting for enrichment batch')
}

describe('enrichment and interpretation routes', () => {
  let database: SqliteDatabase
  let server: FastifyInstance

  beforeEach(async () => {
    database = createDatabase({ filename: ':memory:' })
    const founderRepository = new FounderRepository(database)
    founderRepository.saveAll(founders)
    const webResultsRepository = new WebResultsRepository(database)
    const configuredProvider = provider()
    let id = 0
    const enrichmentService = createEnrichmentService({
      founderRepository,
      webResultsRepository,
      providers: [configuredProvider],
      now: () => new Date('2026-10-01T12:00:00.000Z'),
      createId: () => `route-run-${++id}`,
    })
    const runManager = createEnrichmentRunManager({
      service: enrichmentService,
      createId: () => `batch-${++id}`,
      now: () => new Date('2026-10-01T12:00:00.000Z'),
    })
    const interpretationService = createAiInterpretationService({
      providers: [configuredProvider],
    })

    server = Fastify()
    await server.register(enrichmentRoutes, {
      repository: webResultsRepository,
      runManager,
      now: () => new Date('2026-10-01T12:00:00.000Z'),
    })
    await server.register(aiRoutes, {
      service: interpretationService,
    })
  })

  afterEach(async () => {
    await server.close()
    if (database.open) {
      database.close()
    }
  })

  it('creates a run, exposes progress, and reads redacted founder evidence', async () => {
    const founderId = founders[0]!.id
    const createResponse = await server.inject({
      method: 'POST',
      url: '/api/v2/enrichment/runs',
      payload: {
        provider: 'openai',
        founderIds: [founderId],
      },
    })

    expect(createResponse.statusCode).toBe(202)
    const createEnvelope = EnrichmentBatchResponseSchema.parse(
      createResponse.json(),
    )
    expect(createEnvelope).toMatchObject({
      ok: true,
      data: {
        status: 'queued',
        total: 1,
      },
    })
    if (!createEnvelope.ok) {
      throw new Error('Expected a successful batch response')
    }

    const complete = await waitForBatch(server, createEnvelope.data.id)
    expect(complete).toMatchObject({
      status: 'complete',
      completed: 1,
      failed: 0,
    })

    const progressResponse = await server.inject({
      method: 'GET',
      url: `/api/v2/enrichment/runs/${createEnvelope.data.id}/progress`,
    })
    expect(
      EnrichmentProgressResponseSchema.parse(progressResponse.json()),
    ).toMatchObject({
      ok: true,
      data: {
        status: 'complete',
        completed: 1,
        total: 1,
      },
    })

    const resultsResponse = await server.inject({
      method: 'GET',
      url: `/api/v2/founders/${encodeURIComponent(founderId)}/web-results`,
    })
    const body = JSON.stringify(resultsResponse.json())
    expect(resultsResponse.statusCode).toBe(200)
    expect(
      FounderWebResultsResponseSchema.parse(resultsResponse.json()),
    ).toMatchObject({
      ok: true,
      data: {
        founderId,
        status: 'fresh',
        items: [
          {
            title: expect.any(String),
          },
        ],
      },
    })
    expect(body).not.toContain('never-return-this-key')
  })

  it('returns validated AI interpretations and explicit fallbacks', async () => {
    const interpreted = await server.inject({
      method: 'POST',
      url: '/api/v2/ai/interpret/search',
      payload: {
        provider: 'openai',
        input: 'technical founders',
      },
    })

    expect(interpreted.statusCode).toBe(200)
    expect(
      InterpretationResponseSchema.parse(interpreted.json()),
    ).toMatchObject({
      ok: true,
      data: {
        status: 'interpreted',
        provider: 'openai',
      },
    })

    const fallback = await server.inject({
      method: 'POST',
      url: '/api/v2/ai/interpret/search',
      payload: {
        provider: 'anthropic',
        input: 'technical founders',
      },
    })

    expect(fallback.statusCode).toBe(200)
    expect(
      InterpretationResponseSchema.parse(fallback.json()),
    ).toMatchObject({
      ok: true,
      data: {
        status: 'fallback',
        reason: 'unavailable',
      },
    })
  })

  it('validates create bodies before starting a batch', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/api/v2/enrichment/runs',
      payload: {
        provider: 'openai',
        founderIds: [],
        secret: 'must-not-be-accepted',
      },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({
      ok: false,
      error: {
        code: 'invalid_request',
      },
    })
  })

  it('rejects an invalid bulk credential once before searches or history writes', async () => {
    const founderRepository = new FounderRepository(database)
    const webResultsRepository = new WebResultsRepository(database)
    const validateCredential = vi.fn(async () => {
      throw new ProviderError(
        'invalid_credential',
        'OpenAI rejected the configured credential',
      )
    })
    const searchWeb = vi.fn(async () => [])
    const invalidProvider = provider()
    invalidProvider.validateCredential = validateCredential
    invalidProvider.searchWeb = searchWeb
    const service = createEnrichmentService({
      founderRepository,
      webResultsRepository,
      providers: [invalidProvider],
    })
    const invalidServer = Fastify()
    await invalidServer.register(enrichmentRoutes, {
      repository: webResultsRepository,
      runManager: createEnrichmentRunManager({ service }),
    })

    for (let request = 0; request < 2; request += 1) {
      const response = await invalidServer.inject({
        method: 'POST',
        url: '/api/v2/enrichment/runs',
        payload: { provider: 'openai' },
      })
      expect(response.statusCode).toBe(400)
      expect(response.json()).toMatchObject({
        ok: false,
        error: {
          code: 'invalid_credential',
        },
      })
    }

    expect(validateCredential).toHaveBeenCalledTimes(1)
    expect(searchWeb).not.toHaveBeenCalled()
    expect(
      webResultsRepository.listRuns(founders[0]!.id),
    ).toEqual([])
    await invalidServer.close()
  })

  it('exposes a failed provider attempt without erasing prior successful evidence', async () => {
    const founderRepository = new FounderRepository(database)
    const webResultsRepository = new WebResultsRepository(database)
    let id = 0
    const successfulService = createEnrichmentService({
      founderRepository,
      webResultsRepository,
      providers: [provider()],
      now: () => new Date('2026-10-01T12:00:00.000Z'),
      createId: () => `success-${++id}`,
    })
    await successfulService.enrichFounder(founders[1]!.id, {
      provider: 'openai',
    })

    const failedProvider = provider()
    failedProvider.searchWeb = async () => {
      throw new ProviderError('unavailable', 'provider unavailable')
    }
    const failedService = createEnrichmentService({
      founderRepository,
      webResultsRepository,
      providers: [failedProvider],
      now: () => new Date('2026-10-01T13:00:00.000Z'),
      createId: () => `failure-${++id}`,
      retry: { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 1 },
    })
    await failedService.enrichFounder(founders[1]!.id, {
      provider: 'openai',
      forceRefresh: true,
    })

    const response = await server.inject({
      method: 'GET',
      url: `/api/v2/founders/${encodeURIComponent(founders[1]!.id)}/web-results`,
    })

    expect(response.json()).toMatchObject({
      ok: true,
      data: {
        status: 'provider_failure',
        items: [{ title: expect.any(String) }],
        latestAttempt: {
          status: 'failed',
        },
      },
    })
  })

  it('reports the latest unsupported attempt while returning older successful evidence', async () => {
    const founderRepository = new FounderRepository(database)
    const webResultsRepository = new WebResultsRepository(database)
    let id = 0
    const successfulService = createEnrichmentService({
      founderRepository,
      webResultsRepository,
      providers: [provider()],
      now: () => new Date('2026-10-01T12:00:00.000Z'),
      createId: () => `supported-${++id}`,
    })
    await successfulService.enrichFounder(founders[2]!.id, {
      provider: 'openai',
    })

    const unsupportedProvider = provider()
    unsupportedProvider.searchWeb = async (query) => [
      {
        title: `${query.context.company} summary`,
        url: 'https://unsupported.test/summary',
        snippet: 'Summary without source-local provenance.',
        provenance: 'summary_only',
      },
    ]
    const unsupportedService = createEnrichmentService({
      founderRepository,
      webResultsRepository,
      providers: [unsupportedProvider],
      now: () => new Date('2026-10-01T13:00:00.000Z'),
      createId: () => `unsupported-${++id}`,
    })
    await unsupportedService.enrichFounder(founders[2]!.id, {
      provider: 'openai',
      forceRefresh: true,
    })

    const response = await server.inject({
      method: 'GET',
      url: `/api/v2/founders/${encodeURIComponent(founders[2]!.id)}/web-results`,
    })

    expect(response.json()).toMatchObject({
      ok: true,
      data: {
        status: 'unsupported',
        items: [{ title: expect.any(String) }],
        latestRun: {
          status: 'complete',
          resultCount: 1,
        },
        latestAttempt: {
          status: 'partial',
          resultCount: 0,
        },
      },
    })
  })
})
