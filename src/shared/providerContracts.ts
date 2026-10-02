import { z } from 'zod'

import { createApiEnvelopeSchema } from './contracts.js'

export const PROVIDER_IDS = ['openai', 'anthropic', 'xai'] as const
export const ProviderIdSchema = z.enum(PROVIDER_IDS)
export type ProviderId = z.infer<typeof ProviderIdSchema>

export const PROVIDER_LABELS: Readonly<Record<ProviderId, string>> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  xai: 'xAI',
}

export const PROVIDER_SECRET_MIN_LENGTH = 16
export const PROVIDER_SECRET_MAX_LENGTH = 512
const PROVIDER_SECRET_PATTERN = /^[\x21-\x7E]+$/

export function isWellFormedProviderSecret(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= PROVIDER_SECRET_MIN_LENGTH &&
    value.length <= PROVIDER_SECRET_MAX_LENGTH &&
    PROVIDER_SECRET_PATTERN.test(value)
  )
}

export const ProviderCredentialParamsSchema = z
  .object({ provider: ProviderIdSchema })
  .strict()

// The secret is validated by the credential vault so no Zod issue can echo it.
export const ProviderCredentialRequestSchema = z
  .object({ secret: z.string() })
  .strict()
export type ProviderCredentialRequest = z.infer<
  typeof ProviderCredentialRequestSchema
>

export const ProviderCredentialStatusSchema = z
  .object({
    provider: ProviderIdSchema,
    label: z.string(),
    status: z.enum(['not_configured', 'valid']),
    lastFour: z.string().length(4).nullable(),
    validatedAt: z.iso.datetime().nullable(),
  })
  .strict()
export type ProviderCredentialStatus = z.infer<
  typeof ProviderCredentialStatusSchema
>

export const ProviderCredentialListSchema = z
  .object({
    masterKeyConfigured: z.boolean(),
    providers: z.array(ProviderCredentialStatusSchema),
  })
  .strict()
export type ProviderCredentialList = z.infer<
  typeof ProviderCredentialListSchema
>

export const ProviderCredentialStatusEnvelopeSchema = createApiEnvelopeSchema(
  ProviderCredentialStatusSchema,
)
export const ProviderCredentialListEnvelopeSchema = createApiEnvelopeSchema(
  ProviderCredentialListSchema,
)
