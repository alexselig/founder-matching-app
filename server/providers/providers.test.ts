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
        output_text: JSON.stringify({
          criteria: [
            {
              field: 'role',
              objective: 'diverse',
              weight: 'high',
              enabled: true,
            },
          ],
        }),
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

    await provider.validateCredential('candidate-secret')
    expect(clientFactory).toHaveBeenLastCalledWith('candidate-secret')
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
})
