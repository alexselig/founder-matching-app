import { describe, expect, it } from 'vitest'

import type { ProviderAdapter } from '../providers/types.js'
import { ProviderError } from '../providers/types.js'
import { createAiInterpretationService } from './aiInterpretation.js'

function fakeProvider(
  overrides: Partial<ProviderAdapter> = {},
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
    parseSearch: async () => ({
      text: '',
      dimensions: [
        {
          field: 'companyVertical',
          operator: 'contains',
          value: 'fintech',
        },
      ],
    }),
    parseDinnerCriteria: async () => ({
      criteria: [
        {
          field: 'companyVertical',
          objective: 'similar',
          weight: 'high',
          enabled: true,
        },
        {
          field: 'role',
          objective: 'diverse',
          weight: 'medium',
          enabled: true,
        },
      ],
    }),
    parseHardRule: async () => ({
      type: 'field_count',
      field: 'role',
      value: 'Technical',
      min: 2,
    }),
    searchWeb: async () => [],
    ...overrides,
  }
}

describe('AI interpretation', () => {
  it('returns a validated structured search query', async () => {
    const service = createAiInterpretationService({
      providers: [fakeProvider()],
    })

    await expect(
      service.interpretSearch('openai', 'fintech founders'),
    ).resolves.toEqual({
      status: 'interpreted',
      provider: 'openai',
      value: {
        text: '',
        dimensions: [
          {
            field: 'companyVertical',
            operator: 'contains',
            value: 'fintech',
          },
        ],
      },
    })
  })

  it('validates dinner criteria through the shared contract', async () => {
    const service = createAiInterpretationService({
      providers: [fakeProvider()],
    })

    await expect(
      service.interpretDinnerCriteria('openai', 'similar sectors, mixed roles'),
    ).resolves.toMatchObject({
      status: 'interpreted',
      value: {
        criteria: [
          {
            field: 'companyVertical',
            objective: 'similar',
            weight: 'high',
          },
          {
            field: 'role',
            objective: 'diverse',
            weight: 'medium',
          },
        ],
      },
    })
  })

  it('validates a canonical hard rule before returning it', async () => {
    const service = createAiInterpretationService({
      providers: [fakeProvider()],
    })

    await expect(
      service.interpretHardRule('openai', 'at least two technical founders'),
    ).resolves.toEqual({
      status: 'interpreted',
      provider: 'openai',
      value: {
        type: 'field_count',
        field: 'role',
        value: 'Technical',
        min: 2,
      },
    })
  })

  it('falls back without resubmission when provider output is invalid', async () => {
    const service = createAiInterpretationService({
      providers: [
        fakeProvider({
          parseSearch: async () => ({
            text: '',
            dimensions: [
              {
                field: 'fabricatedField',
                operator: 'is',
                value: 'fiction',
              },
            ],
          }),
        }),
      ],
    })

    await expect(
      service.interpretSearch('openai', 'fiction'),
    ).resolves.toEqual({
      status: 'fallback',
      provider: 'openai',
      reason: 'invalid_output',
      message:
        'AI interpretation could not be validated. Use the deterministic manual path without resubmission.',
    })
  })

  it('returns an explicit rate-limited fallback', async () => {
    const service = createAiInterpretationService({
      providers: [
        fakeProvider({
          parseHardRule: async () => {
            throw new ProviderError(
              'rate_limited',
              'Provider rate limited the request',
              { retryable: true },
            )
          },
        }),
      ],
    })

    await expect(
      service.interpretHardRule('openai', 'keep two founders apart'),
    ).resolves.toEqual({
      status: 'fallback',
      provider: 'openai',
      reason: 'rate_limited',
      message:
        'AI interpretation is rate-limited. Use the deterministic manual path without resubmission.',
    })
  })

  it('returns an unavailable fallback for a provider that is not configured', async () => {
    const service = createAiInterpretationService({
      providers: [],
    })

    await expect(
      service.interpretSearch('anthropic', 'operators'),
    ).resolves.toEqual({
      status: 'fallback',
      provider: 'anthropic',
      reason: 'unavailable',
      message:
        'AI interpretation is unavailable. Use the deterministic manual path without resubmission.',
    })
  })
})
