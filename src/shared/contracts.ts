import { z } from 'zod'

import type { Founder } from './founder.js'

export const appVersion = 'v2'
export const FOUNDER_LIST_MAX_LIMIT = 1000

const SafeIntegerSchema = z
  .number()
  .refine(Number.isSafeInteger, 'Expected a safe integer')
const CoercedSafeIntegerSchema = z.coerce
  .number()
  .refine(Number.isSafeInteger, 'Expected a safe integer')

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
    limit: CoercedSafeIntegerSchema.refine(
      (value) =>
        value >= 1 && value <= FOUNDER_LIST_MAX_LIMIT,
      `Limit must be between 1 and ${FOUNDER_LIST_MAX_LIMIT}`,
    ).default(574),
    offset: CoercedSafeIntegerSchema.refine(
      (value) => value >= 0,
      'Offset must be non-negative',
    ).default(0),
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
    age: SafeIntegerSchema.refine(
      (value) => value >= 0,
      'Age must be non-negative',
    ),
    education: z.string(),
    role: z.string(),
    searchName: z.string(),
    raw: z.record(z.string(), z.unknown()),
  })
  .strict()

export const FounderListDataSchema = z
  .object({
    items: z.array(FounderResponseSchema),
    total: SafeIntegerSchema.refine(
      (value) => value >= 0,
      'Total must be non-negative',
    ),
    limit: SafeIntegerSchema.refine(
      (value) =>
        value >= 1 && value <= FOUNDER_LIST_MAX_LIMIT,
      `Limit must be between 1 and ${FOUNDER_LIST_MAX_LIMIT}`,
    ),
    offset: SafeIntegerSchema.refine(
      (value) => value >= 0,
      'Offset must be non-negative',
    ),
  })
  .strict()
export type FounderListData = z.infer<typeof FounderListDataSchema>

export const FounderListResponseSchema = createApiEnvelopeSchema(
  FounderListDataSchema,
)

export const FounderDetailResponseSchema = createApiEnvelopeSchema(
  FounderResponseSchema,
)
