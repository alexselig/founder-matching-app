import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { normalizeFounders } from '../../src/shared/founder.js'
import { createDatabase, type SqliteDatabase } from '../database.js'
import { createAnthropicProvider } from '../providers/anthropic.js'
import { createOpenAIProvider } from '../providers/openai.js'
import type {
  ProviderAdapter,
  ProviderWebResult,
  WebSearchQuery,
} from '../providers/types.js'
import { ProviderError } from '../providers/types.js'
import { createXaiProvider } from '../providers/xai.js'
import { FounderRepository } from '../repositories/founders.js'
import { WebResultsRepository } from '../repositories/webResults.js'
import { createEnrichmentService } from './enrichment.js'

const founders = normalizeFounders(
  JSON.parse(
    readFileSync(resolve(process.cwd(), 'src/founders.json'), 'utf8'),
  ) as unknown,
)

const baseResults: ProviderWebResult[] = [
  {
    id: 'company-only',
    title: `${founders[0]!.company} company profile`,
    url: 'https://company.test/about?utm_source=provider',
    snippet: `News about ${founders[0]!.company}.`,
    confidence: 0.99,
    provenance: 'citation',
  },
  {
    id: 'both',
    title: `${founders[0]!.name} at ${founders[0]!.company}`,
    url: 'https://profiles.test/founder/',
    snippet: `${founders[0]!.name} founded ${founders[0]!.company}.`,
    confidence: 0.8,
    provenance: 'source_metadata',
  },
  {
    id: 'duplicate',
    title: 'Duplicate tracking URL',
    url: 'https://PROFILES.test/founder?utm_campaign=duplicate#bio',
    snippet: `${founders[0]!.name} and ${founders[0]!.company}.`,
    confidence: 0.7,
    provenance: 'citation',
  },
  ...Array.from({ length: 5 }, (_, index) => ({
    id: `extra-${index}`,
    title: `Evidence ${index}`,
    url: `https://evidence.test/${index}`,
    snippet: `${founders[0]!.name} evidence ${index}.`,
    confidence: 0.6 - index * 0.05,
    provenance: 'citation' as const,
  })),
]

function fakeProvider(
  searchWeb: (query: WebSearchQuery) => Promise<ProviderWebResult[]>,
): ProviderAdapter {
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
    parseSearch: async () => ({}),
    parseDinnerCriteria: async () => ({}),
    parseHardRule: async () => ({}),
    searchWeb,
  }
}

describe('web enrichment service', () => {
  let database: SqliteDatabase
  let founderRepository: FounderRepository
  let webResultsRepository: WebResultsRepository

  beforeEach(() => {
    database = createDatabase({ filename: ':memory:' })
    founderRepository = new FounderRepository(database)
    founderRepository.saveAll(founders)
    webResultsRepository = new WebResultsRepository(database)
  })

  afterEach(() => {
    if (database.open) {
      database.close()
    }
  })

  it('builds identity-aware context, deduplicates canonical URLs, ranks both matches first, and persists five', async () => {
    const searchWeb = vi.fn(async () => baseResults)
    const service = createEnrichmentService({
      founderRepository,
      webResultsRepository,
      providers: [fakeProvider(searchWeb)],
      now: () => new Date('2026-10-01T12:00:00.000Z'),
      createId: () => 'run-1',
    })

    const result = await service.enrichFounder(founders[0]!.id, {
      provider: 'openai',
    })

    expect(searchWeb).toHaveBeenCalledWith({
      founderId: founders[0]!.id,
      context: {
        name: founders[0]!.name,
        company: founders[0]!.company,
        companyVertical: founders[0]!.companyVertical,
        role: founders[0]!.role,
        education: founders[0]!.education,
        cohortGroup: founders[0]!.cohortGroup,
        cohortSection: founders[0]!.cohortSection,
      },
      query: expect.stringContaining(founders[0]!.cohortSection),
    })
    expect(result.status).toBe('complete')
    expect(result.items).toHaveLength(5)
    expect(new Set(result.items.map((item) => item.url)).size).toBe(5)
    expect(result.items[0]!.entityMatch).toEqual({
      founder: true,
      company: true,
    })
    expect(result.items[0]!.classification).toBe('both')
    expect(webResultsRepository.listRuns(founders[0]!.id)).toHaveLength(1)
  })

  it.each([
    {
      providerId: 'openai' as const,
      createProvider: (transport: typeof fetch) =>
        createOpenAIProvider({
          apiKey: 'openai-secret',
          model: 'openai-test-model',
          transport,
        }),
    },
    {
      providerId: 'xai' as const,
      createProvider: (transport: typeof fetch) =>
        createXaiProvider({
          apiKey: 'xai-secret',
          model: 'xai-test-model',
          transport,
        }),
    },
  ])(
    'uses source-local $providerId citations for identity ranking',
    async ({ providerId, createProvider }) => {
      const founder = founders[0]!
      const founderSentence =
        `${founder.name} leads ${founder.company}.`
      const companySentence =
        `${founder.company} announced a new product.`
      const text = `${founderSentence} ${companySentence}`
      const transport = vi.fn(async () =>
        new Response(JSON.stringify({
          output: [
            {
              type: 'message',
              content: [
                {
                  type: 'output_text',
                  text,
                  annotations: [
                    {
                      type: 'url_citation',
                      url: 'https://profiles.test/founder',
                      title: `${founder.name} profile`,
                      start_index: 0,
                      end_index: founderSentence.length,
                    },
                    {
                      type: 'url_citation',
                      url: 'https://news.test/company',
                      title: `${founder.company} news`,
                      start_index: founderSentence.length + 1,
                      end_index: text.length,
                    },
                  ],
                },
              ],
            },
          ],
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      const service = createEnrichmentService({
        founderRepository,
        webResultsRepository,
        providers: [createProvider(transport)],
        now: () => new Date('2026-10-01T12:00:00.000Z'),
        createId: () => `${providerId}-local-citations`,
      })

      const result = await service.enrichFounder(founder.id, {
        provider: providerId,
      })

      expect(result.items).toHaveLength(2)
      expect(result.items[0]).toMatchObject({
        url: 'https://profiles.test/founder',
        classification: 'both',
      })
      expect(result.items[1]).toMatchObject({
        url: 'https://news.test/company',
        classification: 'company',
      })
      expect(result.items[1]!.snippet).not.toContain(founder.name)
    },
  )

  it('reuses a non-stale query fingerprint without appending history', async () => {
    const searchWeb = vi.fn(async () => baseResults)
    const service = createEnrichmentService({
      founderRepository,
      webResultsRepository,
      providers: [fakeProvider(searchWeb)],
      now: () => new Date('2026-10-01T12:00:00.000Z'),
      createId: () => 'run-cache',
    })

    const first = await service.enrichFounder(founders[0]!.id, {
      provider: 'openai',
    })
    const second = await service.enrichFounder(founders[0]!.id, {
      provider: 'openai',
    })

    expect(first.cached).toBe(false)
    expect(second.cached).toBe(true)
    expect(second.runId).toBe(first.runId)
    expect(searchWeb).toHaveBeenCalledTimes(1)
    expect(webResultsRepository.listRuns(founders[0]!.id)).toHaveLength(1)
  })

  it('refreshes stale evidence by appending a new run', async () => {
    let currentTime = new Date('2026-10-01T12:00:00.000Z')
    let id = 0
    const searchWeb = vi.fn(async () => baseResults)
    const service = createEnrichmentService({
      founderRepository,
      webResultsRepository,
      providers: [fakeProvider(searchWeb)],
      now: () => currentTime,
      staleAfterMs: 60_000,
      createId: () => `run-${++id}`,
    })

    await service.enrichFounder(founders[0]!.id, {
      provider: 'openai',
    })
    currentTime = new Date('2026-10-01T12:02:00.000Z')
    const refreshed = await service.enrichFounder(founders[0]!.id, {
      provider: 'openai',
    })

    expect(refreshed.cached).toBe(false)
    expect(searchWeb).toHaveBeenCalledTimes(2)
    expect(webResultsRepository.listRuns(founders[0]!.id)).toHaveLength(2)
  })

  it('retries rate limits with capped exponential backoff', async () => {
    let attempts = 0
    const sleep = vi.fn(async () => undefined)
    const service = createEnrichmentService({
      founderRepository,
      webResultsRepository,
      providers: [
        fakeProvider(async () => {
          attempts += 1
          if (attempts < 3) {
            throw new ProviderError(
              'rate_limited',
              'rate limited',
              { retryable: true },
            )
          }
          return baseResults
        }),
      ],
      now: () => new Date('2026-10-01T12:00:00.000Z'),
      createId: () => 'run-retry',
      sleep,
      retry: {
        maxAttempts: 3,
        baseDelayMs: 20_000,
        maxDelayMs: 30_000,
      },
    })

    const result = await service.enrichFounder(founders[0]!.id, {
      provider: 'openai',
    })

    expect(result.status).toBe('complete')
    expect(attempts).toBe(3)
    expect(sleep.mock.calls).toEqual([[20_000], [30_000]])
  })

  it('uses exponential backoff for xAI when Retry-After is absent', async () => {
    let attempts = 0
    const sleep = vi.fn(async () => undefined)
    const founder = founders[0]!
    const transport = vi.fn(async () => {
      attempts += 1
      if (attempts === 1) {
        return new Response('{}', {
          status: 429,
          headers: { 'content-type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({
        output: [
          {
            content: [
              {
                text: `${founder.name} leads ${founder.company}.`,
                annotations: [
                  {
                    type: 'url_citation',
                    url: 'https://profiles.test/founder',
                    title: `${founder.name} profile`,
                    start_index: 0,
                    end_index:
                      `${founder.name} leads ${founder.company}.`.length,
                  },
                ],
              },
            ],
          },
        ],
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })
    const service = createEnrichmentService({
      founderRepository,
      webResultsRepository,
      providers: [
        createXaiProvider({
          apiKey: 'xai-secret',
          model: 'xai-test-model',
          transport,
        }),
      ],
      now: () => new Date('2026-10-01T12:00:00.000Z'),
      createId: () => 'xai-retry-run',
      sleep,
      retry: {
        maxAttempts: 2,
        baseDelayMs: 1250,
        maxDelayMs: 30_000,
      },
    })

    await service.enrichFounder(founder.id, {
      provider: 'xai',
    })

    expect(sleep).toHaveBeenCalledWith(1250)
  })

  it('uses exponential backoff for Anthropic when Retry-After is absent', async () => {
    const founder = founders[0]!
    const sleep = vi.fn(async () => undefined)
    let attempts = 0
    const provider = createAnthropicProvider({
      apiKey: 'anthropic-secret',
      clientFactory: () => ({
        messages: {
          create: vi.fn(async () => {
            attempts += 1
            if (attempts === 1) {
              throw new (await import('@anthropic-ai/sdk')).default.RateLimitError(
                429,
                {},
                'rate limited',
                new Headers(),
              )
            }
            return {
              content: [
                {
                  type: 'text',
                  text: `${founder.name} leads ${founder.company}.`,
                  citations: [
                    {
                      type: 'web_search_result_location',
                      url: 'https://profiles.test/founder',
                      title: `${founder.name} profile`,
                      cited_text:
                        `${founder.name} leads ${founder.company}.`,
                      encrypted_index: 'opaque',
                    },
                  ],
                },
              ],
              stop_reason: 'end_turn',
            }
          }),
        },
        models: { retrieve: vi.fn() },
      }),
    })
    const service = createEnrichmentService({
      founderRepository,
      webResultsRepository,
      providers: [provider],
      now: () => new Date('2026-10-01T12:00:00.000Z'),
      createId: () => 'anthropic-retry-run',
      sleep,
      retry: {
        maxAttempts: 2,
        baseDelayMs: 1500,
        maxDelayMs: 30_000,
      },
    })

    await service.enrichFounder(founder.id, {
      provider: 'anthropic',
    })

    expect(sleep).toHaveBeenCalledWith(1500)
  })

  it('caches successful and failed provider validation without searching', async () => {
    const validateSuccess = vi.fn(async () => undefined)
    const successful = fakeProvider(async () => baseResults)
    successful.validateCredential = validateSuccess
    const successService = createEnrichmentService({
      founderRepository,
      webResultsRepository,
      providers: [successful],
    })

    await Promise.all([
      successService.validateProvider('openai'),
      successService.validateProvider('openai'),
    ])
    expect(validateSuccess).toHaveBeenCalledTimes(1)

    const validateFailure = vi.fn(async () => {
      throw new ProviderError(
        'invalid_credential',
        'OpenAI rejected the configured credential',
      )
    })
    const failed = fakeProvider(async () => baseResults)
    failed.validateCredential = validateFailure
    const failureService = createEnrichmentService({
      founderRepository,
      webResultsRepository,
      providers: [failed],
    })

    await expect(
      failureService.validateProvider('openai'),
    ).rejects.toMatchObject({ code: 'invalid_credential' })
    await expect(
      failureService.validateProvider('openai'),
    ).rejects.toMatchObject({ code: 'invalid_credential' })
    expect(validateFailure).toHaveBeenCalledTimes(1)
  })

  it('never allows configured retry delays to exceed thirty seconds', async () => {
    let attempts = 0
    const sleep = vi.fn(async () => undefined)
    const service = createEnrichmentService({
      founderRepository,
      webResultsRepository,
      providers: [
        fakeProvider(async () => {
          attempts += 1
          if (attempts === 1) {
            throw new ProviderError(
              'rate_limited',
              'rate limited',
              { retryable: true, retryAfterMs: 120_000 },
            )
          }
          return baseResults
        }),
      ],
      now: () => new Date('2026-10-01T12:00:00.000Z'),
      createId: () => 'run-hard-cap',
      sleep,
      retry: {
        maxAttempts: 2,
        baseDelayMs: 60_000,
        maxDelayMs: 120_000,
      },
    })

    await service.enrichFounder(founders[0]!.id, {
      provider: 'openai',
    })

    expect(sleep).toHaveBeenCalledWith(30_000)
  })

  it('isolates one founder failure and never exceeds concurrency four', async () => {
    const selected = founders.slice(0, 7)
    let active = 0
    let maxActive = 0
    const provider = fakeProvider(async (query) => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await Promise.resolve()
      active -= 1

      if (query.founderId === selected[3]!.id) {
        throw new ProviderError('unavailable', 'provider unavailable')
      }

      return [
        {
          title: `${query.context.name} at ${query.context.company}`,
          url: `https://example.test/${query.founderId}`,
          snippet: `${query.context.name} founded ${query.context.company}.`,
          provenance: 'citation',
        },
      ]
    })
    let id = 0
    const service = createEnrichmentService({
      founderRepository,
      webResultsRepository,
      providers: [provider],
      now: () => new Date('2026-10-01T12:00:00.000Z'),
      createId: () => `batch-run-${++id}`,
      concurrency: 4,
      retry: { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 1 },
    })

    const progress = []
    for await (const item of service.enrichAllFounders({
      provider: 'openai',
      founderIds: selected.map((founder) => founder.id),
    })) {
      progress.push(item)
    }

    expect(maxActive).toBe(4)
    expect(progress).toHaveLength(7)
    expect(progress.filter((item) => item.status === 'failed')).toHaveLength(1)
    expect(progress.filter((item) => item.status === 'complete')).toHaveLength(6)
    expect(
      webResultsRepository.listRuns(selected[3]!.id)[0]?.status,
    ).toBe('failed')
  })

  it('redacts credentials and request prompts before persistence', async () => {
    const secret = 'sk-test-secret-123'
    const provider = fakeProvider(async () => [
      {
        title: `${founders[0]!.name} at ${founders[0]!.company}`,
        url: 'https://example.test/founder',
        snippet: `${founders[0]!.name} founded ${founders[0]!.company}.`,
        provenance: 'citation',
        rawMetadata: {
          apiKey: secret,
          authorization: `Bearer ${secret}`,
          prompt: `Find ${founders[0]!.name}`,
          safe: 'source-metadata',
        },
      },
    ])
    const service = createEnrichmentService({
      founderRepository,
      webResultsRepository,
      providers: [provider],
      now: () => new Date('2026-10-01T12:00:00.000Z'),
      createId: () => 'run-redaction',
    })

    await service.enrichFounder(founders[0]!.id, {
      provider: 'openai',
    })

    const persisted = JSON.stringify(
      webResultsRepository.listRuns(founders[0]!.id),
    )
    expect(persisted).not.toContain(secret)
    expect(persisted).not.toContain(`Find ${founders[0]!.name}`)
    expect(persisted).toContain('source-metadata')
  })
})
