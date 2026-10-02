import { z } from 'zod'

export const PROVIDER_IDS = ['openai', 'anthropic', 'xai'] as const
export const ProviderIdSchema = z.enum(PROVIDER_IDS)
export type ProviderId = z.infer<typeof ProviderIdSchema>
