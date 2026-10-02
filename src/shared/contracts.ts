import { z } from 'zod'

import type { Founder } from './founder.js'

export const appVersion = 'v2'

export const DatabaseStatusSchema = z.enum(['ready', 'not-ready'])
export type DatabaseStatus = z.infer<typeof DatabaseStatusSchema>

export const HealthResponseSchema = z.object({
  version: z.literal(appVersion),
  database: DatabaseStatusSchema,
})
export type HealthResponse = z.infer<typeof HealthResponseSchema>

export function createHealthResponse(database: DatabaseStatus): HealthResponse {
  return HealthResponseSchema.parse({
    version: appVersion,
    database,
  })
}

export const FounderListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(1000).default(574),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict()
export type FounderListQuery = z.infer<typeof FounderListQuerySchema>

export const FounderParamsSchema = z
  .object({
    id: z.string().min(1),
  })
  .strict()
export type FounderParams = z.infer<typeof FounderParamsSchema>

export const ApiErrorSchema = z
  .object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  })
  .strict()
export type ApiError = z.infer<typeof ApiErrorSchema>

export const ApiFailureEnvelopeSchema = z
  .object({
    ok: z.literal(false),
    error: ApiErrorSchema,
  })
  .strict()

export function createApiEnvelopeSchema<T extends z.ZodType>(
  dataSchema: T,
) {
  return z.discriminatedUnion('ok', [
    z
      .object({
        ok: z.literal(true),
        data: dataSchema,
      })
      .strict(),
    ApiFailureEnvelopeSchema,
  ])
}

export type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiError }

export const FounderResponseSchema: z.ZodType<Founder> = z
  .object({
    id: z.string(),
    name: z.string(),
    cohortGroup: z.string(),
    cohortSection: z.string(),
    companyVertical: z.string(),
    companyVerticalLevels: z.array(z.string()),
    company: z.string(),
    age: z.number().int().nonnegative(),
    education: z.string(),
    role: z.string(),
    searchName: z.string(),
    raw: z.record(z.string(), z.unknown()),
  })
  .strict()

export const FounderListDataSchema = z
  .object({
    items: z.array(FounderResponseSchema),
    total: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
  })
  .strict()
export type FounderListData = z.infer<typeof FounderListDataSchema>

export const FounderListResponseSchema = createApiEnvelopeSchema(
  FounderListDataSchema,
)

export const FounderDetailResponseSchema = createApiEnvelopeSchema(
  FounderResponseSchema,
)
