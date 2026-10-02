import { z } from 'zod'

import { createApiEnvelopeSchema } from './contracts.js'
import { FOUNDER_SCHEMA, type FounderFieldKey } from './schemaRegistry.js'

export const DINNER_MAX_FOUNDERS = 1000
export const DINNER_MAX_TABLES = 200
export const DINNER_MAX_ALTERNATIVES = 3
export const DINNER_NAME_MAX_LENGTH = 120
export const DINNER_DEFAULT_THRESHOLD = 70

const IdSchema = z.string().min(1).max(128)
const FounderIdSchema = z.string().min(1).max(128)
const IndexSchema = z.int().min(0).max(DINNER_MAX_TABLES * 100)
const UnitIntervalSchema = z.number().min(0).max(1)

const MATCH_FIELD_KEYS = FOUNDER_SCHEMA.filter((field) => field.match).map(
  (field) => field.key,
) as [FounderFieldKey, ...FounderFieldKey[]]
export const DinnerFieldKeySchema = z.enum(MATCH_FIELD_KEYS)

export const CRITERION_WEIGHTS = { L: 1, M: 2, H: 3 } as const

// Mirrors the Task 6 dinner engine Criterion, HardRule, DinnerLock, and DinnerTable shapes.
export const CriterionSchema = z
  .object({
    id: IdSchema,
    field: DinnerFieldKeySchema,
    objective: z.enum(['similarity', 'diversity']),
    weightLevel: z.enum(['L', 'M', 'H']),
    weight: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    operator: z.enum(['categorical', 'jaccard', 'numeric', 'hierarchical']),
    missingValuePolicy: z.enum(['exclude', 'zero']),
    enabled: z.boolean(),
    provenance: z.enum(['manual', 'ai', 'hybrid']),
  })
  .strict()
export type Criterion = z.infer<typeof CriterionSchema>

export const CriteriaSetSchema = z
  .object({ criteria: z.array(CriterionSchema).max(100) })
  .strict()

const FounderGroupSchema = z.array(FounderIdSchema).min(2).max(DINNER_MAX_FOUNDERS)
const FieldValueSchema = z.union([z.string().max(500), z.number()])

export const HardRuleSchema = z.discriminatedUnion('type', [
  z
    .object({
      id: IdSchema,
      type: z.literal('must-sit-together'),
      founderIds: FounderGroupSchema,
    })
    .strict(),
  z
    .object({
      id: IdSchema,
      type: z.literal('cannot-sit-together'),
      founderIds: FounderGroupSchema,
    })
    .strict(),
  z
    .object({ id: IdSchema, type: z.literal('same-company-separation') })
    .strict(),
  z
    .object({
      id: IdSchema,
      type: z.literal('field-count'),
      field: DinnerFieldKeySchema,
      value: FieldValueSchema.optional(),
      minValue: z.number().optional(),
      maxValue: z.number().optional(),
      min: z.int().min(0).optional(),
      max: z.int().min(0).optional(),
    })
    .strict(),
  z
    .object({
      id: IdSchema,
      type: z.literal('fixed-table-size'),
      size: z.int().min(1).max(100),
    })
    .strict(),
  z
    .object({
      id: IdSchema,
      type: z.literal('pinned-table'),
      founderId: FounderIdSchema,
      tableIndex: IndexSchema,
    })
    .strict(),
  z
    .object({
      id: IdSchema,
      type: z.literal('pinned-seat'),
      founderId: FounderIdSchema,
      tableIndex: IndexSchema,
      seatIndex: IndexSchema,
    })
    .strict(),
])
export type HardRule = z.infer<typeof HardRuleSchema>

export const DinnerLockSchema = z
  .object({
    founderId: FounderIdSchema,
    tableIndex: IndexSchema,
    seatIndex: IndexSchema.optional(),
  })
  .strict()
export type DinnerLock = z.infer<typeof DinnerLockSchema>

export const DinnerTableSchema = z
  .object({
    index: IndexSchema,
    capacity: z.int().min(1).max(100),
    founderIds: z.array(FounderIdSchema).max(100),
    seats: z.array(FounderIdSchema.nullable()).max(100),
    founderFits: z.record(FounderIdSchema, UnitIntervalSchema),
    quality: UnitIntervalSchema,
  })
  .strict()
export type DinnerTable = z.infer<typeof DinnerTableSchema>

export const DinnerMetricsSchema = z
  .object({
    founderFitVector: z.array(UnitIntervalSchema).max(DINNER_MAX_FOUNDERS),
    tableQualityVector: z.array(UnitIntervalSchema).max(DINNER_MAX_TABLES),
    meanFounderFit: UnitIntervalSchema,
    meanTableQuality: UnitIntervalSchema,
  })
  .strict()
export type DinnerMetrics = z.infer<typeof DinnerMetricsSchema>

export const DinnerAlternativeSchema = z
  .object({
    id: IdSchema,
    kind: z.enum(['recommended', 'alternative']),
    tables: z.array(DinnerTableSchema).min(1).max(DINNER_MAX_TABLES),
    metrics: DinnerMetricsSchema,
  })
  .strict()
export type DinnerAlternative = z.infer<typeof DinnerAlternativeSchema>

export const DinnerNoteSchema = z
  .object({
    id: IdSchema,
    text: z
      .string()
      .max(2000)
      .refine((value) => value.trim().length > 0, 'Note text is required'),
    founderId: FounderIdSchema.optional(),
    tableIndex: IndexSchema.optional(),
  })
  .strict()
export type DinnerNote = z.infer<typeof DinnerNoteSchema>

export const DinnerCohortSchema = z
  .object({
    source: z.enum(['search', 'direct']),
    founderIds: z.array(FounderIdSchema).min(1).max(DINNER_MAX_FOUNDERS),
    searchText: z.string().max(1000).optional(),
  })
  .strict()
export type DinnerCohort = z.infer<typeof DinnerCohortSchema>

type IssueContext = z.core.$RefinementCtx<unknown>

function issue(
  context: IssueContext,
  path: PropertyKey[],
  message: string,
) {
  context.addIssue({ code: 'custom', path, message })
}

function checkUnique(
  context: IssueContext,
  values: readonly string[],
  path: PropertyKey[],
  label: string,
) {
  const seen = new Set<string>()
  values.forEach((value, index) => {
    if (seen.has(value)) {
      issue(context, [...path, index], `Duplicate ${label} ${value}`)
    }
    seen.add(value)
  })
}

function checkCoverage(
  context: IssueContext,
  tables: readonly DinnerTable[],
  cohort: ReadonlySet<string>,
  tableCount: number | null,
  path: PropertyKey[],
) {
  if (tableCount !== tables.length) {
    issue(context, path, 'Table count must match the number of tables')
  }

  const seated = new Set<string>()
  tables.forEach((table, tableIndex) => {
    const tablePath = [...path, tableIndex]
    if (table.index !== tableIndex) {
      issue(context, [...tablePath, 'index'], 'Tables must be indexed in order')
    }
    if (table.seats.length !== table.capacity) {
      issue(context, [...tablePath, 'seats'], 'Seats must match table capacity')
    }

    const occupied = table.seats.filter(
      (seat): seat is string => seat !== null,
    )
    const founders = new Set(table.founderIds)
    if (
      founders.size !== table.founderIds.length ||
      occupied.length !== founders.size ||
      !occupied.every((founderId) => founders.has(founderId))
    ) {
      issue(
        context,
        [...tablePath, 'founderIds'],
        'Table founders must match its occupied seats',
      )
    }

    const fitKeys = Object.keys(table.founderFits)
    if (
      fitKeys.length !== founders.size ||
      !fitKeys.every((founderId) => founders.has(founderId))
    ) {
      issue(
        context,
        [...tablePath, 'founderFits'],
        'Founder fits must cover exactly the seated founders',
      )
    }

    for (const founderId of table.founderIds) {
      if (!cohort.has(founderId)) {
        issue(context, [...tablePath, 'founderIds'], `Founder ${founderId} is not in the cohort`)
      }
      if (seated.has(founderId)) {
        issue(context, [...tablePath, 'founderIds'], `Founder ${founderId} is seated twice`)
      }
      seated.add(founderId)
    }
  })

  if (seated.size !== cohort.size) {
    issue(context, path, 'Every cohort founder must be seated exactly once')
  }
}

function validateDinnerState(state: DinnerStateInput, context: IssueContext) {
  const cohortIds = state.cohort.founderIds
  checkUnique(context, cohortIds, ['cohort', 'founderIds'], 'founder')
  const cohort = new Set(cohortIds)
  const tableCount = state.tableCount

  const inCohort = (founderId: string, path: PropertyKey[]) => {
    if (!cohort.has(founderId)) {
      issue(context, path, `Founder ${founderId} is not in the cohort`)
    }
  }
  const tableInRange = (tableIndex: number, path: PropertyKey[]) => {
    if (tableCount === null || tableIndex >= tableCount) {
      issue(context, path, `Table ${tableIndex + 1} does not exist`)
    }
  }

  checkUnique(
    context,
    state.criteria.criteria.map((criterion) => criterion.id),
    ['criteria', 'criteria'],
    'criterion',
  )
  state.criteria.criteria.forEach((criterion, index) => {
    if (CRITERION_WEIGHTS[criterion.weightLevel] !== criterion.weight) {
      issue(
        context,
        ['criteria', 'criteria', index, 'weight'],
        'Criterion weight must match its level',
      )
    }
  })

  checkUnique(context, state.rules.map((rule) => rule.id), ['rules'], 'rule')
  state.rules.forEach((rule, index) => {
    const path = ['rules', index]
    switch (rule.type) {
      case 'must-sit-together':
      case 'cannot-sit-together':
        checkUnique(context, rule.founderIds, [...path, 'founderIds'], 'founder')
        rule.founderIds.forEach((founderId, founderIndex) =>
          inCohort(founderId, [...path, 'founderIds', founderIndex]),
        )
        break
      case 'field-count':
        if (rule.min === undefined && rule.max === undefined) {
          issue(context, path, 'Field-count rules need a minimum or maximum')
        }
        if (
          rule.min !== undefined &&
          rule.max !== undefined &&
          rule.min > rule.max
        ) {
          issue(context, path, 'Field-count minimum exceeds maximum')
        }
        if (
          rule.minValue !== undefined &&
          rule.maxValue !== undefined &&
          rule.minValue > rule.maxValue
        ) {
          issue(context, path, 'Field-count value range is inverted')
        }
        break
      case 'pinned-table':
      case 'pinned-seat':
        inCohort(rule.founderId, [...path, 'founderId'])
        tableInRange(rule.tableIndex, [...path, 'tableIndex'])
        break
      default:
        break
    }
  })

  checkUnique(
    context,
    state.locks.map((lock) => lock.founderId),
    ['locks'],
    'lock for founder',
  )
  state.locks.forEach((lock, index) => {
    inCohort(lock.founderId, ['locks', index, 'founderId'])
    tableInRange(lock.tableIndex, ['locks', index, 'tableIndex'])
  })

  checkUnique(context, state.notes.map((note) => note.id), ['notes'], 'note')
  state.notes.forEach((note, index) => {
    if (note.founderId !== undefined) {
      inCohort(note.founderId, ['notes', index, 'founderId'])
    }
    if (note.tableIndex !== undefined) {
      tableInRange(note.tableIndex, ['notes', index, 'tableIndex'])
    }
  })

  if (state.assignments.length === 0) {
    if (state.metrics !== null) {
      issue(context, ['metrics'], 'Unassigned dinners cannot have metrics')
    }
    if (state.alternatives.length > 0) {
      issue(context, ['alternatives'], 'Alternatives require assignments')
    }
  } else {
    checkCoverage(context, state.assignments, cohort, tableCount, ['assignments'])
    if (state.metrics === null) {
      issue(context, ['metrics'], 'Assigned dinners require metrics')
    }
    state.locks.forEach((lock, index) => {
      const table = state.assignments[lock.tableIndex]
      const held =
        lock.seatIndex === undefined
          ? table?.founderIds.includes(lock.founderId)
          : table?.seats[lock.seatIndex] === lock.founderId
      if (!held) {
        issue(context, ['locks', index], 'Locked founder is not at the locked position')
      }
    })
  }

  checkUnique(
    context,
    state.alternatives.map((alternative) => alternative.id),
    ['alternatives'],
    'alternative',
  )
  if (
    state.alternatives.filter((alternative) => alternative.kind === 'recommended')
      .length > 1
  ) {
    issue(context, ['alternatives'], 'Only one alternative can be recommended')
  }
  state.alternatives.forEach((alternative, index) =>
    checkCoverage(context, alternative.tables, cohort, tableCount, [
      'alternatives',
      index,
      'tables',
    ]),
  )
  if (
    state.chosenAlternativeId !== null &&
    !state.alternatives.some(
      (alternative) => alternative.id === state.chosenAlternativeId,
    )
  ) {
    issue(context, ['chosenAlternativeId'], 'Chosen alternative does not exist')
  }
}

const DinnerStateObjectSchema = z
  .object({
    cohort: DinnerCohortSchema,
    brief: z.string().max(4000).optional(),
    tableCount: z.int().min(1).max(DINNER_MAX_TABLES).nullable(),
    criteria: CriteriaSetSchema,
    rules: z.array(HardRuleSchema).max(500),
    locks: z.array(DinnerLockSchema).max(DINNER_MAX_FOUNDERS),
    assignments: z.array(DinnerTableSchema).max(DINNER_MAX_TABLES),
    metrics: DinnerMetricsSchema.nullable(),
    alternatives: z.array(DinnerAlternativeSchema).max(DINNER_MAX_ALTERNATIVES),
    chosenAlternativeId: IdSchema.nullable(),
    threshold: z.int().min(0).max(100),
    notes: z.array(DinnerNoteSchema).max(1000),
  })
  .strict()
type DinnerStateInput = z.infer<typeof DinnerStateObjectSchema>

export const DinnerStateSchema = DinnerStateObjectSchema.superRefine(
  validateDinnerState,
)
export type DinnerState = z.infer<typeof DinnerStateSchema>

const DinnerNameSchema = z.string().trim().min(1).max(DINNER_NAME_MAX_LENGTH)
const VersionNoteSchema = z.string().trim().max(2000)

export const CreateDinnerRequestSchema = z
  .object({
    name: DinnerNameSchema,
    note: VersionNoteSchema.optional(),
    state: DinnerStateSchema,
  })
  .strict()
export type CreateDinnerRequest = z.infer<typeof CreateDinnerRequestSchema>

export const AppendDinnerVersionRequestSchema = z
  .object({
    name: DinnerNameSchema.optional(),
    note: VersionNoteSchema.optional(),
    state: DinnerStateSchema,
  })
  .strict()
export type AppendDinnerVersionRequest = z.infer<
  typeof AppendDinnerVersionRequestSchema
>

export const DinnerParamsSchema = z.object({ id: IdSchema }).strict()
export const DinnerVersionParamsSchema = z
  .object({
    id: IdSchema,
    version: z.coerce
      .number()
      .refine(Number.isSafeInteger, 'Expected a safe integer')
      .refine((value) => value >= 1, 'Version must be positive'),
  })
  .strict()

export const DinnerStatusSchema = z.enum(['draft', 'ready', 'needs_attention'])
export type DinnerStatus = z.infer<typeof DinnerStatusSchema>

export const MissingFounderSchema = z
  .object({
    founderId: FounderIdSchema,
    name: z.string().nullable(),
    company: z.string().nullable(),
    role: z.string().nullable(),
    tableIndex: IndexSchema.nullable(),
    seatIndex: IndexSchema.nullable(),
    locked: z.boolean(),
  })
  .strict()
export type MissingFounder = z.infer<typeof MissingFounderSchema>

export const DinnerRecoverySchema = z
  .object({
    status: z.enum(['complete', 'missing_founders']),
    savedFounderCount: z.int().min(0),
    restoredFounderCount: z.int().min(0),
    missingFounders: z.array(MissingFounderSchema),
  })
  .strict()
export type DinnerRecovery = z.infer<typeof DinnerRecoverySchema>

export const SavedDinnerSchema = z
  .object({
    id: IdSchema,
    name: z.string(),
    note: z.string().nullable(),
    version: z.int().min(1),
    versionId: IdSchema,
    latestVersion: z.int().min(1),
    status: DinnerStatusSchema,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    savedAt: z.iso.datetime(),
    state: DinnerStateObjectSchema,
    recovery: DinnerRecoverySchema,
  })
  .strict()
export type SavedDinner = z.infer<typeof SavedDinnerSchema>

export const DinnerSummarySchema = z
  .object({
    id: IdSchema,
    name: z.string(),
    status: DinnerStatusSchema,
    founderCount: z.int().min(0),
    tableCount: z.int().min(1).nullable(),
    latestVersion: z.int().min(1),
    missingFounderCount: z.int().min(0),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict()
export type DinnerSummary = z.infer<typeof DinnerSummarySchema>

export const DinnerVersionSummarySchema = z
  .object({
    versionId: IdSchema,
    version: z.int().min(1),
    name: z.string(),
    note: z.string().nullable(),
    status: DinnerStatusSchema,
    founderCount: z.int().min(0),
    tableCount: z.int().min(1).nullable(),
    savedAt: z.iso.datetime(),
  })
  .strict()
export type DinnerVersionSummary = z.infer<typeof DinnerVersionSummarySchema>

export const SavedDinnerEnvelopeSchema = createApiEnvelopeSchema(SavedDinnerSchema)
export const DinnerListEnvelopeSchema = createApiEnvelopeSchema(
  z.object({ items: z.array(DinnerSummarySchema) }).strict(),
)
export const DinnerVersionListEnvelopeSchema = createApiEnvelopeSchema(
  z.object({ items: z.array(DinnerVersionSummarySchema) }).strict(),
)

export const ExportFormatSchema = z.enum(['csv', 'json'])
export type ExportFormat = z.infer<typeof ExportFormatSchema>

const BooleanQuerySchema = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1')

export const DinnerExportQuerySchema = z
  .object({
    format: ExportFormatSchema.default('csv'),
    version: DinnerVersionParamsSchema.shape.version.optional(),
    includeWebResults: BooleanQuerySchema.default(false),
  })
  .strict()
  .refine(
    (query) => !(query.format === 'csv' && query.includeWebResults),
    {
      message: 'Web results can only be included in JSON exports',
      path: ['includeWebResults'],
    },
  )
export type DinnerExportQuery = z.infer<typeof DinnerExportQuerySchema>

export const FounderExportRequestSchema = z
  .object({
    founderIds: z
      .array(FounderIdSchema)
      .min(1)
      .max(DINNER_MAX_FOUNDERS)
      .refine(
        (ids) => new Set(ids).size === ids.length,
        'Founder IDs must be unique',
      ),
    format: ExportFormatSchema,
    includeDetails: z.boolean().default(false),
    includeWebResults: z.boolean().default(false),
  })
  .strict()
  .refine(
    (request) => !(request.format === 'csv' && request.includeWebResults),
    {
      message: 'Web results can only be included in JSON exports',
      path: ['includeWebResults'],
    },
  )
export type FounderExportRequest = z.infer<typeof FounderExportRequestSchema>
