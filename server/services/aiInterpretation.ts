import type { z } from 'zod'

import {
  DinnerCriteriaSetSchema,
  HardRuleSchema,
  StructuredSearchQuerySchema,
  type InterpretationResult,
  type ProviderId,
} from '../../src/shared/contracts.js'
import {
  ProviderError,
  type ProviderAdapter,
} from '../providers/types.js'

export interface AiInterpretationServiceOptions {
  providers: readonly ProviderAdapter[]
}

export interface AiInterpretationService {
  interpretSearch(
    provider: ProviderId,
    input: string,
  ): Promise<InterpretationResult>
  interpretDinnerCriteria(
    provider: ProviderId,
    input: string,
  ): Promise<InterpretationResult>
  interpretHardRule(
    provider: ProviderId,
    input: string,
  ): Promise<InterpretationResult>
}

type InterpretationValue = Extract<
  InterpretationResult,
  { status: 'interpreted' }
>['value']

type InterpretationCapability =
  | 'searchIntent'
  | 'dinnerCriteria'
  | 'hardRules'

const FALLBACK_MESSAGES = {
  disabled:
    'AI interpretation is disabled. Use the deterministic manual path without resubmission.',
  unavailable:
    'AI interpretation is unavailable. Use the deterministic manual path without resubmission.',
  invalid_output:
    'AI interpretation could not be validated. Use the deterministic manual path without resubmission.',
  rate_limited:
    'AI interpretation is rate-limited. Use the deterministic manual path without resubmission.',
} as const

function fallback(
  provider: ProviderId,
  reason: keyof typeof FALLBACK_MESSAGES,
): InterpretationResult {
  return {
    status: 'fallback',
    provider,
    reason,
    message: FALLBACK_MESSAGES[reason],
  }
}

function providerFailureReason(error: unknown) {
  if (!(error instanceof ProviderError)) {
    return 'unavailable' as const
  }
  if (error.code === 'rate_limited') {
    return 'rate_limited' as const
  }
  if (error.code === 'invalid_response') {
    return 'invalid_output' as const
  }
  return 'unavailable' as const
}

export function createAiInterpretationService(
  options: AiInterpretationServiceOptions,
): AiInterpretationService {
  const providers = new Map(
    options.providers.map((provider) => [provider.id, provider]),
  )

  async function interpret<T extends z.ZodType>(
    providerId: ProviderId,
    capability: InterpretationCapability,
    schema: T,
    execute: (provider: ProviderAdapter) => Promise<unknown>,
  ): Promise<InterpretationResult> {
    const provider = providers.get(providerId)
    if (!provider) {
      return fallback(providerId, 'unavailable')
    }
    if (!provider.capabilities[capability]) {
      return fallback(providerId, 'disabled')
    }

    try {
      const raw = await execute(provider)
      const parsed = schema.safeParse(raw)
      if (!parsed.success) {
        return fallback(providerId, 'invalid_output')
      }
      return {
        status: 'interpreted',
        provider: providerId,
        value: parsed.data as InterpretationValue,
      }
    } catch (error) {
      return fallback(providerId, providerFailureReason(error))
    }
  }

  return {
    interpretSearch(provider, input) {
      return interpret(
        provider,
        'searchIntent',
        StructuredSearchQuerySchema,
        (adapter) => adapter.parseSearch(input),
      )
    },
    interpretDinnerCriteria(provider, input) {
      return interpret(
        provider,
        'dinnerCriteria',
        DinnerCriteriaSetSchema,
        (adapter) => adapter.parseDinnerCriteria(input),
      )
    },
    interpretHardRule(provider, input) {
      return interpret(
        provider,
        'hardRules',
        HardRuleSchema,
        (adapter) => adapter.parseHardRule(input),
      )
    },
  }
}
