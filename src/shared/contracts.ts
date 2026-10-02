import { z } from 'zod'

import type { Founder } from './founder.js'
import { ProviderIdSchema } from './providerIds.js'
import { FOUNDER_SCHEMA } from './schemaRegistry.js'

export { ProviderIdSchema, type ProviderId } from './providerIds.js'

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

export const ProviderCapabilitiesSchema = z
  .object({
    searchIntent: z.boolean(),
    dinnerCriteria: z.boolean(),
    hardRules: z.boolean(),
    reranking: z.boolean(),
    webSearch: z.boolean(),
    citations: z.boolean(),
  })
  .strict()

export const SearchOperatorSchema = z.enum([
  'is',
  'contains',
  'startsWith',
  'between',
  'atLeast',
  'atMost',
])

const NumericRangeSchema = z
  .object({
    min: z.number().finite(),
    max: z.number().finite(),
  })
  .strict()
  .refine(
    ({ min, max }) => min <= max,
    'Range minimum must not exceed maximum',
  )

const AI_SEARCH_FIELDS = FOUNDER_SCHEMA.filter(
  (field) => field.filter,
)
const AI_SEARCH_FIELD_KEYS = AI_SEARCH_FIELDS.map(
  (field) => field.key,
) as [string, ...string[]]
const AI_SEARCH_FIELD_BY_KEY = new Map<
  string,
  (typeof AI_SEARCH_FIELDS)[number]
>(
  AI_SEARCH_FIELDS.map((field) => [field.key, field]),
)
const TEXT_SEARCH_OPERATORS = ['is', 'contains', 'startsWith'] as const
const NUMBER_SEARCH_OPERATORS = [
  'between',
  'is',
  'atLeast',
  'atMost',
] as const

export const SearchDimensionSchema = z
  .object({
    field: z.enum(AI_SEARCH_FIELD_KEYS),
    operator: SearchOperatorSchema,
    value: z.union([
      z.string().min(1),
      z.number().finite(),
      z.boolean(),
      NumericRangeSchema,
    ]),
  })
  .strict()
  .superRefine((dimension, context) => {
    const field = AI_SEARCH_FIELD_BY_KEY.get(dimension.field)
    const allowedOperators =
      field?.kind === 'number'
        ? NUMBER_SEARCH_OPERATORS
        : TEXT_SEARCH_OPERATORS
    if (!(allowedOperators as readonly string[]).includes(
      dimension.operator,
    )) {
      context.addIssue({
        code: 'custom',
        message: `${dimension.operator} is not valid for ${dimension.field}`,
        path: ['operator'],
      })
    }

    if (field?.kind === 'number') {
      if (
        dimension.operator === 'between' &&
        typeof dimension.value !== 'object'
      ) {
        context.addIssue({
          code: 'custom',
          message: 'Age between searches require a numeric range',
        })
      } else if (
        dimension.operator !== 'between' &&
        typeof dimension.value !== 'number'
      ) {
        context.addIssue({
          code: 'custom',
          message: 'Age searches require a numeric value',
        })
      }
      return
    }

    if (
      typeof dimension.value !== 'string'
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Text searches require a supported text operator and value',
      })
    }
  })

export const StructuredSearchQuerySchema = z
  .object({
    text: z.string(),
    dimensions: z.array(SearchDimensionSchema),
  })
  .strict()
export type StructuredSearchQuery = z.infer<
  typeof StructuredSearchQuerySchema
>

export const DinnerCriterionSchema = z
  .object({
    field: z.enum([
      'companyVertical',
      'age',
      'education',
      'role',
      'company',
      'cohortGroup',
      'cohortSection',
    ]),
    objective: z.enum(['similar', 'diverse']),
    weight: z.enum(['low', 'medium', 'high']),
    enabled: z.boolean(),
  })
  .strict()

export const DinnerCriteriaSetSchema = z
  .object({
    criteria: z.array(DinnerCriterionSchema).min(1),
  })
  .strict()
export type DinnerCriteriaSet = z.infer<
  typeof DinnerCriteriaSetSchema
>

const FounderPairRuleSchema = z
  .object({
    type: z.enum([
      'must_sit_together',
      'cannot_sit_together',
    ]),
    founderIds: z.array(z.string().min(1)).min(2),
  })
  .strict()

const FieldCountRuleSchema = z
  .object({
    type: z.literal('field_count'),
    field: z.enum([
      'companyVertical',
      'age',
      'education',
      'role',
      'company',
      'cohortGroup',
      'cohortSection',
    ]),
    value: z.union([
      z.string().min(1),
      z.number().finite(),
      NumericRangeSchema,
    ]),
    min: SafeIntegerSchema.nonnegative().optional(),
    max: SafeIntegerSchema.nonnegative().optional(),
  })
  .strict()
  .superRefine((rule, context) => {
    if (rule.min === undefined && rule.max === undefined) {
      context.addIssue({
        code: 'custom',
        message: 'A field-count rule requires a minimum or maximum',
      })
    }
    if (
      rule.min !== undefined &&
      rule.max !== undefined &&
      rule.min > rule.max
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Field-count minimum must not exceed maximum',
      })
    }
  })

export const HardRuleSchema = z.union([
  FounderPairRuleSchema,
  z
    .object({
      type: z.literal('same_company_separation'),
    })
    .strict(),
  FieldCountRuleSchema,
  z
    .object({
      type: z.literal('fixed_table_size'),
      size: SafeIntegerSchema.positive(),
    })
    .strict(),
  z
    .object({
      type: z.literal('pinned_table'),
      founderId: z.string().min(1),
      tableId: z.string().min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal('pinned_seat'),
      founderId: z.string().min(1),
      tableId: z.string().min(1),
      seat: SafeIntegerSchema.nonnegative(),
    })
    .strict(),
])
export type HardRule = z.infer<typeof HardRuleSchema>

export const InterpretationFallbackReasonSchema = z.enum([
  'disabled',
  'unavailable',
  'invalid_output',
  'rate_limited',
])

export const InterpretationResultSchema = z.union([
  z
    .object({
      status: z.literal('interpreted'),
      provider: ProviderIdSchema,
      value: z.union([
        StructuredSearchQuerySchema,
        DinnerCriteriaSetSchema,
        HardRuleSchema,
      ]),
    })
    .strict(),
  z
    .object({
      status: z.literal('fallback'),
      provider: ProviderIdSchema,
      reason: InterpretationFallbackReasonSchema,
      message: z.string().min(1),
    })
    .strict(),
])
export type InterpretationResult = z.infer<
  typeof InterpretationResultSchema
>

export const InterpretationRequestSchema = z
  .object({
    provider: ProviderIdSchema,
    input: z.string().trim().min(1),
  })
  .strict()

export const InterpretationResponseSchema = createApiEnvelopeSchema(
  InterpretationResultSchema,
)

export const EnrichmentStatusSchema = z.enum([
  'queued',
  'running',
  'complete',
  'partial',
  'failed',
])
export type EnrichmentStatus = z.infer<
  typeof EnrichmentStatusSchema
>

const TimestampSchema = z
  .string()
  .refine(
    (value) => !Number.isNaN(Date.parse(value)),
    'Expected a valid timestamp',
  )

export const EntityMatchSchema = z
  .object({
    founder: z.boolean(),
    company: z.boolean(),
  })
  .strict()

export const PublicWebResultSchema = z
  .object({
    runId: z.string().min(1),
    founderId: z.string().min(1),
    rank: SafeIntegerSchema.min(1).max(5),
    classification: z.enum(['founder', 'company', 'both']),
    title: z.string().min(1),
    url: z.url(),
    domain: z.string().min(1),
    snippet: z.string().min(1),
    provider: ProviderIdSchema,
    providerResultId: z.string().min(1).optional(),
    retrievedAt: TimestampSchema,
    confidence: z.number().min(0).max(1).optional(),
    entityMatch: EntityMatchSchema,
    staleAfter: TimestampSchema.optional(),
  })
  .strict()
export type PublicWebResult = z.infer<typeof PublicWebResultSchema>

export const PublicEnrichmentRunSchema = z
  .object({
    id: z.string().min(1),
    founderId: z.string().min(1),
    queryFingerprint: z.string().min(1),
    provider: ProviderIdSchema,
    status: EnrichmentStatusSchema,
    retrievedAt: TimestampSchema,
    completedAt: TimestampSchema.optional(),
    warnings: z.array(z.string()).optional(),
    error: z
      .object({
        code: z.string().min(1),
        message: z.string().min(1),
        retryable: z.boolean(),
      })
      .strict()
      .optional(),
    resultCount: SafeIntegerSchema.nonnegative(),
  })
  .strict()

export const FounderWebResultsStatusSchema = z.enum([
  'fresh',
  'stale',
  'no_results',
  'unsupported',
  'provider_failure',
])

export const FounderWebResultsDataSchema = z
  .object({
    founderId: z.string().min(1),
    status: FounderWebResultsStatusSchema,
    stale: z.boolean(),
    items: z.array(PublicWebResultSchema).max(5),
    latestRun: PublicEnrichmentRunSchema.optional(),
    latestAttempt: PublicEnrichmentRunSchema.optional(),
    history: z.array(PublicEnrichmentRunSchema),
  })
  .strict()
export type FounderWebResultsData = z.infer<
  typeof FounderWebResultsDataSchema
>

export const FounderWebResultsResponseSchema =
  createApiEnvelopeSchema(FounderWebResultsDataSchema)

export const CreateEnrichmentRunRequestSchema = z
  .object({
    provider: ProviderIdSchema,
    founderIds: z.array(z.string().min(1)).min(1).max(1000).optional(),
    forceRefresh: z.boolean().optional(),
  })
  .strict()
export type CreateEnrichmentRunRequest = z.infer<
  typeof CreateEnrichmentRunRequestSchema
>

export const EnrichmentProgressItemSchema = z
  .object({
    founderId: z.string().min(1),
    status: z.enum(['complete', 'partial', 'failed']),
    runId: z.string().min(1).optional(),
    cached: z.boolean(),
    error: z.string().min(1).optional(),
  })
  .strict()

export const EnrichmentBatchSchema = z
  .object({
    id: z.string().min(1),
    provider: ProviderIdSchema,
    status: EnrichmentStatusSchema,
    total: SafeIntegerSchema.nonnegative(),
    completed: SafeIntegerSchema.nonnegative(),
    failed: SafeIntegerSchema.nonnegative(),
    cached: SafeIntegerSchema.nonnegative(),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
    completedAt: TimestampSchema.optional(),
    items: z.array(EnrichmentProgressItemSchema),
  })
  .strict()
export type EnrichmentBatch = z.infer<typeof EnrichmentBatchSchema>

export const EnrichmentProgressSchema = z
  .object({
    id: z.string().min(1),
    status: EnrichmentStatusSchema,
    total: SafeIntegerSchema.nonnegative(),
    completed: SafeIntegerSchema.nonnegative(),
    failed: SafeIntegerSchema.nonnegative(),
    cached: SafeIntegerSchema.nonnegative(),
    updatedAt: TimestampSchema,
  })
  .strict()

export const EnrichmentRunParamsSchema = z
  .object({
    id: z.string().min(1),
  })
  .strict()

export const EnrichmentBatchResponseSchema =
  createApiEnvelopeSchema(EnrichmentBatchSchema)
export const EnrichmentProgressResponseSchema =
  createApiEnvelopeSchema(EnrichmentProgressSchema)
