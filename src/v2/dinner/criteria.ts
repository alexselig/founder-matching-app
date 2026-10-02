import {
  FOUNDER_SCHEMA,
  type FounderFieldKey,
  type FounderFieldNormalizer,
} from '../../shared/schemaRegistry.js'

export type CriteriaSource = 'manual' | 'ai' | 'hybrid'
export type CriterionObjective = 'similarity' | 'diversity'
export type CriterionWeightLevel = 'L' | 'M' | 'H'
export type CriterionOperator = 'categorical' | 'jaccard' | 'numeric' | 'hierarchical'
export type MissingValuePolicy = 'exclude' | 'zero'

export interface CriterionInput {
  readonly field: string
  readonly objective: string
  readonly weight: string
  readonly operator?: CriterionOperator
  readonly missingValuePolicy?: MissingValuePolicy
  readonly enabled?: boolean
  readonly provenance?: CriteriaSource
}

export interface Criterion {
  readonly id: string
  readonly field: FounderFieldKey
  readonly objective: CriterionObjective
  readonly weightLevel: CriterionWeightLevel
  readonly weight: number
  readonly operator: CriterionOperator
  readonly missingValuePolicy: MissingValuePolicy
  readonly enabled: boolean
  readonly provenance: CriteriaSource
}

export interface CriteriaSet {
  readonly criteria: readonly Criterion[]
}

export interface CriteriaCompileInput {
  readonly source: CriteriaSource
  readonly criteria: readonly CriterionInput[]
}

const WEIGHTS: Readonly<Record<CriterionWeightLevel, number>> = {
  L: 1,
  M: 2,
  H: 3,
}

function normalizeToken(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

function resolveField(value: string) {
  const token = normalizeToken(value)
  const matches = FOUNDER_SCHEMA.filter((field) => {
    const names = [field.key, field.path, field.label, field.source, ...field.aliases]
    return field.match && names.some((name) => normalizeToken(name) === token)
  })

  if (matches.length !== 1) {
    throw new Error(
      matches.length
        ? `Ambiguous match criterion: ${value}`
        : `Unknown match criterion: ${value}`,
    )
  }

  return matches[0]
}

function normalizeObjective(value: string): CriterionObjective {
  switch (normalizeToken(value)) {
    case 'similar':
    case 'similarity':
      return 'similarity'
    case 'diverse':
    case 'diversity':
      return 'diversity'
    default:
      throw new Error(`Unknown criterion objective: ${value}`)
  }
}

function normalizeWeight(value: string): CriterionWeightLevel {
  switch (normalizeToken(value)) {
    case 'l':
    case 'low':
      return 'L'
    case 'm':
    case 'medium':
      return 'M'
    case 'h':
    case 'high':
      return 'H'
    default:
      throw new Error(`Unknown criterion weight: ${value}`)
  }
}

function defaultOperator(normalizer: FounderFieldNormalizer): CriterionOperator {
  switch (normalizer) {
    case 'integer':
      return 'numeric'
    case 'vertical-path':
      return 'hierarchical'
    default:
      return 'categorical'
  }
}

export function compileCriteria(input: CriteriaCompileInput): CriteriaSet {
  const seenFields = new Set<FounderFieldKey>()
  const criteria = input.criteria.map((draft) => {
    const field = resolveField(draft.field)
    if (seenFields.has(field.key)) {
      throw new Error(`Duplicate match criterion: ${field.label}`)
    }
    seenFields.add(field.key)

    const weightLevel = normalizeWeight(draft.weight)
    const criterion: Criterion = {
      id: field.key,
      field: field.key,
      objective: normalizeObjective(draft.objective),
      weightLevel,
      weight: WEIGHTS[weightLevel],
      operator: draft.operator ?? defaultOperator(field.normalizer),
      missingValuePolicy: draft.missingValuePolicy ?? 'exclude',
      enabled: draft.enabled ?? true,
      provenance: draft.provenance ?? input.source,
    }
    return Object.freeze(criterion)
  })

  return Object.freeze({ criteria: Object.freeze(criteria) })
}
