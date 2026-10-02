import Anthropic from '@anthropic-ai/sdk'
import { describe, expect, it, vi } from 'vitest'

import { createAnthropicProvider } from './anthropic.js'
import { createOpenAIProvider } from './openai.js'
import { createXaiProvider } from './xai.js'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('provider adapters', () => {
  it('uses the OpenAI Responses API through an injected transport', async () => {
    const transport = vi.fn(async () =>
      jsonResponse({
        output_text: JSON.stringify({
          text: '',
          dimensions: [],
        }),
      }),
    )
    const provider = createOpenAIProvider({
      apiKey: 'openai-secret',
      model: 'openai-test-model',
      transport,
    })

    await expect(provider.parseSearch('find fintech founders')).resolves.toEqual({
      text: '',
      dimensions: [],
    })
    expect(transport).toHaveBeenCalledTimes(1)
    const [url, request] = transport.mock.calls[0]!
    expect(url).toBe('https://api.openai.com/v1/responses')
    expect(request.headers).toMatchObject({
      Authorization: 'Bearer openai-secret',
    })
  })

  it('uses the xAI Responses API through its isolated injected transport', async () => {
    const transport = vi.fn(async () =>
      jsonResponse({
        output: [
          {
            type: 'message',
            content: [
              {
                type: 'output_text',
                text: JSON.stringify({
                  criteria: [
                    {
                      field: 'role',
                      objective: 'diverse',
                      weight: 'high',
                      enabled: true,
                    },
                  ],
                }),
              },
            ],
          },
        ],
      }),
    )
    const provider = createXaiProvider({
      apiKey: 'xai-secret',
      model: 'xai-test-model',
      transport,
    })

    await expect(
      provider.parseDinnerCriteria('mix founder roles'),
    ).resolves.toMatchObject({
      criteria: [{ field: 'role', objective: 'diverse' }],
    })
    const [url] = transport.mock.calls[0]!
    expect(url).toBe('https://api.x.ai/v1/responses')
  })

  it('extracts source-local OpenAI citation text instead of copying the whole answer', async () => {
    const founderSentence =
      'Ada Founder leads Analytical Engines.'
    const companySentence =
      'Analytical Engines announced a new analytics product.'
    const text = `${founderSentence} ${companySentence}`
    const transport = vi.fn(async () =>
      jsonResponse({
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
                    url: 'https://profiles.test/ada',
                    title: 'Ada Founder profile',
                    start_index: 0,
                    end_index: founderSentence.length,
                  },
                  {
                    type: 'url_citation',
                    url: 'https://news.test/company',
                    title: 'Analytical Engines news',
                    start_index: founderSentence.length + 1,
                    end_index: text.length,
                  },
                ],
              },
            ],
          },
        ],
      }),
    )
    const provider = createOpenAIProvider({
      apiKey: 'openai-secret',
      model: 'openai-test-model',
      transport,
    })

    const results = await provider.searchWeb({
      founderId: 'founder-1',
      context: {
        name: 'Ada Founder',
        company: 'Analytical Engines',
        companyVertical: 'B2B Software -> Analytics',
        role: 'CEO',
        education: 'Mathematics',
        cohortGroup: 'W26',
        cohortSection: 'A',
      },
      query: '"Ada Founder" "Analytical Engines"',
    })

    expect(results).toEqual([
      expect.objectContaining({
        url: 'https://profiles.test/ada',
        snippet: founderSentence,
      }),
      expect.objectContaining({
        url: 'https://news.test/company',
        snippet: companySentence,
      }),
    ])
    expect(results[1]!.snippet).not.toContain('Ada Founder')
  })

  it('parses nested xAI citation annotations and keeps top-level citations source-local', async () => {
    const founderSentence =
      'Ada Founder leads Analytical Engines.'
    const companySentence =
      'Analytical Engines announced a new analytics product.'
    const text = `${founderSentence} ${companySentence}`
    const transport = vi.fn(async () =>
      jsonResponse({
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
                    url: 'https://profiles.test/ada',
                    title: 'Ada Founder profile',
                    start_index: 0,
                    end_index: founderSentence.length,
                  },
                  {
                    type: 'url_citation',
                    url: 'https://news.test/company',
                    title: 'Analytical Engines news',
                    start_index: founderSentence.length + 1,
                    end_index: text.length,
                  },
                ],
              },
            ],
          },
        ],
        citations: [
          {
            url: 'https://directory.test/analytical-engines',
            title: 'Company directory',
          },
        ],
      }),
    )
    const provider = createXaiProvider({
      apiKey: 'xai-secret',
      model: 'xai-test-model',
      transport,
    })

    const results = await provider.searchWeb({
      founderId: 'founder-1',
      context: {
        name: 'Ada Founder',
        company: 'Analytical Engines',
        companyVertical: 'B2B Software -> Analytics',
        role: 'CEO',
        education: 'Mathematics',
        cohortGroup: 'W26',
        cohortSection: 'A',
      },
      query: '"Ada Founder" "Analytical Engines"',
    })

    expect(results.slice(0, 2)).toEqual([
      expect.objectContaining({
        url: 'https://profiles.test/ada',
        snippet: founderSentence,
      }),
      expect.objectContaining({
        url: 'https://news.test/company',
        snippet: companySentence,
      }),
    ])
    expect(results[2]).toMatchObject({
      url: 'https://directory.test/analytical-engines',
      title: 'Company directory',
    })
    expect(results[2]!.snippet).not.toContain('Ada Founder')
  })

  it('uses the preceding claim when xAI annotation offsets span an inline citation marker', async () => {
    const claim = 'Ada Founder leads Analytical Engines.'
    const marker = '[[1]](https://profiles.test/ada)'
    const text = `${claim} ${marker}`
    const markerStart = text.indexOf(marker)
    const transport = vi.fn(async () =>
      jsonResponse({
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
                    url: 'https://profiles.test/ada',
                    title: 'Profile source',
                    start_index: markerStart,
                    end_index: markerStart + marker.length,
                  },
                ],
              },
            ],
          },
        ],
      }),
    )
    const provider = createXaiProvider({
      apiKey: 'xai-secret',
      model: 'xai-test-model',
      transport,
    })

    const results = await provider.searchWeb({
      founderId: 'founder-1',
      context: {
        name: 'Ada Founder',
        company: 'Analytical Engines',
        companyVertical: 'B2B Software -> Analytics',
        role: 'CEO',
        education: 'Mathematics',
        cohortGroup: 'W26',
        cohortSection: 'A',
      },
      query: '"Ada Founder" "Analytical Engines"',
    })

    expect(results).toEqual([
      expect.objectContaining({
        url: 'https://profiles.test/ada',
        snippet: claim,
      }),
    ])
  })

  it('does not assign an offset-less multi-claim answer to its single citation', async () => {
    const generatedAnswer = [
      'Ada Founder leads Analytical Engines.',
      'Analytical Engines announced a new analytics product.',
    ].join(' ')
    const provider = createOpenAIProvider({
      apiKey: 'openai-secret',
      model: 'openai-test-model',
      transport: vi.fn(async () =>
        jsonResponse({
          output: [
            {
              type: 'message',
              content: [
                {
                  type: 'output_text',
                  text: generatedAnswer,
                  annotations: [
                    {
                      type: 'url_citation',
                      url: 'https://source.test/generic',
                      title: 'Generic source',
                    },
                  ],
                },
              ],
            },
          ],
        }),
      ),
    })

    const results = await provider.searchWeb({
      founderId: 'founder-1',
      context: {
        name: 'Ada Founder',
        company: 'Analytical Engines',
        companyVertical: 'B2B Software -> Analytics',
        role: 'CEO',
        education: 'Mathematics',
        cohortGroup: 'W26',
        cohortSection: 'A',
      },
      query: '"Ada Founder" "Analytical Engines"',
    })

    expect(results).toEqual([
      expect.objectContaining({
        snippet: 'Generic source',
        url: 'https://source.test/generic',
      }),
    ])
    expect(results[0]!.snippet).not.toContain('Ada Founder')
    expect(results[0]!.snippet).not.toContain('Analytical Engines')
  })

  it('does not treat generic xAI top-level citation text as source-local evidence', async () => {
    const provider = createXaiProvider({
      apiKey: 'xai-secret',
      model: 'xai-test-model',
      transport: vi.fn(async () =>
        jsonResponse({
          output_text:
            'Ada Founder leads Analytical Engines without local citations.',
          citations: [
            {
              url: 'https://source.test/generic',
              title: 'Generic source',
              text:
                'Ada Founder leads Analytical Engines. The company launched a product.',
            },
          ],
        }),
      ),
    })

    const results = await provider.searchWeb({
      founderId: 'founder-1',
      context: {
        name: 'Ada Founder',
        company: 'Analytical Engines',
        companyVertical: 'B2B Software -> Analytics',
        role: 'CEO',
        education: 'Mathematics',
        cohortGroup: 'W26',
        cohortSection: 'A',
      },
      query: '"Ada Founder" "Analytical Engines"',
    })

    expect(results).toEqual([
      expect.objectContaining({
        snippet: 'Generic source',
        url: 'https://source.test/generic',
      }),
    ])
  })

  it.each([
    {
      provider: 'OpenAI',
      create: () =>
        createOpenAIProvider({
          apiKey: 'openai-secret',
          model: 'openai-test-model',
          transport: vi.fn(async () =>
            jsonResponse({
              output_text:
                'Ada Founder leads Analytical Engines without citations.',
            }),
          ),
        }),
    },
    {
      provider: 'xAI',
      create: () =>
        createXaiProvider({
          apiKey: 'xai-secret',
          model: 'xai-test-model',
          transport: vi.fn(async () =>
            jsonResponse({
              output: [
                {
                  type: 'message',
                  content: [
                    {
                      type: 'output_text',
                      text:
                        'Ada Founder leads Analytical Engines without citations.',
                    },
                  ],
                },
              ],
            }),
          ),
        }),
    },
  ])(
    'marks an uncited nonempty $provider answer as summary-only',
    async ({ create }) => {
      const results = await create().searchWeb({
        founderId: 'founder-1',
        context: {
          name: 'Ada Founder',
          company: 'Analytical Engines',
          companyVertical: 'B2B Software -> Analytics',
          role: 'CEO',
          education: 'Mathematics',
          cohortGroup: 'W26',
          cohortSection: 'A',
        },
        query: '"Ada Founder" "Analytical Engines"',
      })

      expect(results).toEqual([
        expect.objectContaining({
          provenance: 'summary_only',
          snippet: expect.stringContaining('Ada Founder'),
        }),
      ])
    },
  )

  it('marks an uncited nonempty Anthropic answer as summary-only', async () => {
    const provider = createAnthropicProvider({
      apiKey: 'anthropic-secret',
      clientFactory: () => ({
        messages: {
          create: vi.fn(async () => ({
            content: [
              {
                type: 'text',
                text:
                  'Ada Founder leads Analytical Engines without citations.',
                citations: [],
              },
            ],
            stop_reason: 'end_turn',
          })),
        },
        models: { retrieve: vi.fn() },
      }),
    })

    const results = await provider.searchWeb({
      founderId: 'founder-1',
      context: {
        name: 'Ada Founder',
        company: 'Analytical Engines',
        companyVertical: 'B2B Software -> Analytics',
        role: 'CEO',
        education: 'Mathematics',
        cohortGroup: 'W26',
        cohortSection: 'A',
      },
      query: '"Ada Founder" "Analytical Engines"',
    })

    expect(results).toEqual([
      expect.objectContaining({
        provenance: 'summary_only',
        snippet: expect.stringContaining('Ada Founder'),
      }),
    ])
  })

  it.each([
    {
      provider: 'OpenAI',
      create: () =>
        createOpenAIProvider({
          apiKey: 'openai-secret',
          model: 'openai-test-model',
          transport: vi.fn(async () =>
            jsonResponse({ output: [] }),
          ),
        }),
    },
    {
      provider: 'xAI',
      create: () =>
        createXaiProvider({
          apiKey: 'xai-secret',
          model: 'xai-test-model',
          transport: vi.fn(async () =>
            jsonResponse({ output: [] }),
          ),
        }),
    },
  ])(
    'preserves a truly empty $provider search as no results',
    async ({ create }) => {
      await expect(
        create().searchWeb({
          founderId: 'founder-1',
          context: {
            name: 'Ada Founder',
            company: 'Analytical Engines',
            companyVertical: 'B2B Software -> Analytics',
            role: 'CEO',
            education: 'Mathematics',
            cohortGroup: 'W26',
            cohortSection: 'A',
          },
          query: '"Ada Founder" "Analytical Engines"',
        }),
      ).resolves.toEqual([])
    },
  )

  it('uses the official Anthropic SDK with Claude Opus 4.8', async () => {
    const create = vi.fn(async () => ({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            type: 'same_company_separation',
          }),
        },
      ],
      stop_reason: 'end_turn',
    }))
    const retrieve = vi.fn(async () => ({
      id: 'claude-opus-4-8',
    }))
    const clientFactory = vi.fn(() => ({
      messages: { create },
      models: { retrieve },
    }))
    const provider = createAnthropicProvider({
      apiKey: 'anthropic-secret',
      clientFactory,
    })

    await expect(
      provider.parseHardRule('separate people from the same company'),
    ).resolves.toEqual({
      type: 'same_company_separation',
    })
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-opus-4-8',
        thinking: { type: 'adaptive' },
      }),
    )

    await provider.validateCredential()
    expect(clientFactory).toHaveBeenLastCalledWith('anthropic-secret')
    expect(retrieve).toHaveBeenCalledWith('claude-opus-4-8')
  })

  it('extracts Anthropic web-search source metadata without an OpenAI-compatible shim', async () => {
    const create = vi.fn(async () => ({
      content: [
        {
          type: 'web_search_tool_result',
          tool_use_id: 'tool-1',
          content: [
            {
              type: 'web_search_result',
              url: 'https://example.test/founder',
              title: 'Founder profile',
              encrypted_content: 'opaque',
              page_age: '2026-09-30',
            },
          ],
        },
        {
          type: 'text',
          text: 'Founder profile evidence.',
        },
      ],
      stop_reason: 'end_turn',
    }))
    const provider = createAnthropicProvider({
      apiKey: 'anthropic-secret',
      clientFactory: () => ({
        messages: { create },
        models: { retrieve: vi.fn() },
      }),
    })

    await expect(
      provider.searchWeb({
        founderId: 'founder-1',
        context: {
          name: 'Ada Founder',
          company: 'Analytical Engines',
          companyVertical: 'B2B Software -> Analytics',
          role: 'CEO',
          education: 'Mathematics',
          cohortGroup: 'W26',
          cohortSection: 'A',
        },
        query: '"Ada Founder" "Analytical Engines"',
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        title: 'Founder profile',
        url: 'https://example.test/founder',
        provenance: 'source_metadata',
      }),
    ])
  })

  it('never exposes a rejected credential in adapter errors', async () => {
    const transport = vi.fn(async () =>
      jsonResponse(
        {
          error: {
            message: 'Rejected credential openai-secret',
          },
        },
        401,
      ),
    )
    const provider = createOpenAIProvider({
      apiKey: 'openai-secret',
      model: 'openai-test-model',
      transport,
    })

    await expect(provider.parseSearch('query')).rejects.not.toThrow(
      /openai-secret/,
    )
  })

  it('treats a missing xAI Retry-After header as absent', async () => {
    const provider = createXaiProvider({
      apiKey: 'xai-secret',
      model: 'xai-test-model',
      transport: vi.fn(async () =>
        new Response('{}', {
          status: 429,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    })

    await expect(provider.searchWeb({
      founderId: 'founder-1',
      context: {
        name: 'Ada Founder',
        company: 'Analytical Engines',
        companyVertical: 'Analytics',
        role: 'CEO',
        education: 'Mathematics',
        cohortGroup: 'W26',
        cohortSection: 'A',
      },
      query: 'Ada Founder',
    })).rejects.toMatchObject({
      code: 'rate_limited',
      retryAfterMs: undefined,
    })
  })

  it('treats an empty Anthropic Retry-After header as absent', async () => {
    const rateLimitError = new Anthropic.RateLimitError(
      429,
      {},
      'rate limited',
      new Headers({ 'retry-after': '' }),
    )
    const provider = createAnthropicProvider({
      apiKey: 'anthropic-secret',
      clientFactory: () => ({
        messages: {
          create: vi.fn(async () => {
            throw rateLimitError
          }),
        },
        models: { retrieve: vi.fn() },
      }),
    })

    await expect(provider.parseSearch('query')).rejects.toMatchObject({
      code: 'rate_limited',
      retryAfterMs: undefined,
    })
  })
})
