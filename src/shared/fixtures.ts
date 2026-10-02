import type { Founder } from './founder.js'

export type ScaleScenario =
  | 'three-tables'
  | 'five-tables'
  | 'twenty-tables'
  | 'uneven-five-tables'

const SCENARIO_COUNTS: Record<ScaleScenario, number> = {
  'three-tables': 24,
  'five-tables': 40,
  'twenty-tables': 160,
  'uneven-five-tables': 48,
}

interface VariationRequirements {
  companyVertical: number
  company: number
  age: number
  education: number
  role: number
  cohortGroup: number
  cohortSection: number
}

interface VariationStats extends VariationRequirements {}
const TRACKABLE_FIELDS: readonly (keyof VariationRequirements)[] = [
  'companyVertical',
  'company',
  'age',
  'education',
  'role',
  'cohortGroup',
  'cohortSection',
]

function stableHash(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function distinctCount<T>(values: Iterable<T>) {
  return new Set<T>(values).size
}

function hasOwnScenario(value: string): value is ScaleScenario {
  return Object.hasOwn(SCENARIO_COUNTS, value)
}

function assertScaleScenario(value: string): asserts value is ScaleScenario {
  if (!hasOwnScenario(value)) {
    throw new Error(`Unknown scale scenario: ${value}`)
  }
}

function buildVariationStats(founders: readonly Founder[]): VariationStats {
  return {
    companyVertical: distinctCount(founders.map((founder) => founder.companyVertical)),
    company: distinctCount(founders.map((founder) => founder.company)),
    age: distinctCount(founders.map((founder) => founder.age)),
    education: distinctCount(founders.map((founder) => founder.education)),
    role: distinctCount(founders.map((founder) => founder.role)),
    cohortGroup: distinctCount(founders.map((founder) => founder.cohortGroup)),
    cohortSection: distinctCount(founders.map((founder) => founder.cohortSection)),
  }
}

function buildVariationRequirements(founders: readonly Founder[], targetCount: number): VariationRequirements {
  const totals = buildVariationStats(founders)
  return {
    companyVertical: Math.min(totals.companyVertical, Math.max(8, Math.ceil(targetCount * 0.18))),
    company: Math.min(totals.company, Math.max(20, Math.ceil(targetCount * 0.8))),
    age: Math.min(totals.age, Math.max(8, Math.ceil(targetCount * 0.1))),
    education: Math.min(totals.education, 6),
    role: Math.min(totals.role, 3),
    cohortGroup: Math.min(totals.cohortGroup, Math.max(3, Math.ceil(targetCount / 40))),
    cohortSection: Math.min(totals.cohortSection, Math.max(8, Math.ceil(targetCount * 0.2))),
  }
}

function meetsVariationRequirements(
  stats: VariationStats,
  requirements: VariationRequirements,
) {
  return (
    stats.companyVertical >= requirements.companyVertical &&
    stats.company >= requirements.company &&
    stats.age >= requirements.age &&
    stats.education >= requirements.education &&
    stats.role >= requirements.role &&
    stats.cohortGroup >= requirements.cohortGroup &&
    stats.cohortSection >= requirements.cohortSection
  )
}

type TrackableField = keyof VariationRequirements

type CandidateContext = {
  readonly currentDistinctValues: Readonly<Record<TrackableField, ReadonlySet<string>>>
  readonly currentCounts: VariationStats
  readonly requirements: VariationRequirements
  readonly valueFrequencies: Readonly<Record<TrackableField, ReadonlyMap<string, number>>>
}

function stringifyFieldValue(value: string | number) {
  return String(value)
}

function createDistinctValueSets(founders: readonly Founder[]) {
  return {
    companyVertical: new Set(founders.map((founder) => founder.companyVertical)),
    company: new Set(founders.map((founder) => founder.company)),
    age: new Set(founders.map((founder) => stringifyFieldValue(founder.age))),
    education: new Set(founders.map((founder) => founder.education)),
    role: new Set(founders.map((founder) => founder.role)),
    cohortGroup: new Set(founders.map((founder) => founder.cohortGroup)),
    cohortSection: new Set(founders.map((founder) => founder.cohortSection)),
  }
}

function createValueFrequencies(founders: readonly Founder[]) {
  const entries = TRACKABLE_FIELDS.map((fieldName) => [fieldName, new Map<string, number>()])
  const frequencies = Object.fromEntries(entries) as Record<TrackableField, Map<string, number>>

  for (const founder of founders) {
    const fieldValues = founderFieldValues(founder)
    for (const [fieldName, value] of Object.entries(fieldValues) as Array<[TrackableField, string]>) {
      frequencies[fieldName].set(value, (frequencies[fieldName].get(value) ?? 0) + 1)
    }
  }

  return frequencies
}

function founderFieldValues(founder: Founder): Record<TrackableField, string> {
  return {
    companyVertical: founder.companyVertical,
    company: founder.company,
    age: stringifyFieldValue(founder.age),
    education: founder.education,
    role: founder.role,
    cohortGroup: founder.cohortGroup,
    cohortSection: founder.cohortSection,
  }
}

function countRemainingDistinctValues(founders: readonly Founder[]) {
  const frequencies = createValueFrequencies(founders)
  return {
    companyVertical: frequencies.companyVertical.size,
    company: frequencies.company.size,
    age: frequencies.age.size,
    education: frequencies.education.size,
    role: frequencies.role.size,
    cohortGroup: frequencies.cohortGroup.size,
    cohortSection: frequencies.cohortSection.size,
  }
}

function scoreFounder(founder: Founder, context: CandidateContext) {
  const fieldValues = founderFieldValues(founder)
  let score = 0

  for (const fieldName of TRACKABLE_FIELDS) {
    if (context.currentCounts[fieldName] >= context.requirements[fieldName]) {
      continue
    }

    const fieldValue = fieldValues[fieldName]
    if (context.currentDistinctValues[fieldName].has(fieldValue)) {
      continue
    }

    const frequency = context.valueFrequencies[fieldName].get(fieldValue) ?? 1
    const remainingGap = context.requirements[fieldName] - context.currentCounts[fieldName]
    score += remainingGap * 1000 + Math.round(100 / frequency)
  }

  return score
}

function describeRequirements(requirements: VariationRequirements, stats: VariationStats) {
  return `required ${JSON.stringify(requirements)}, actual ${JSON.stringify(stats)}`
}

function buildSatisfyingSelection(
  founders: readonly Founder[],
  targetCount: number,
  requirements: VariationRequirements,
) {
  const ordered = [...founders].sort(
    (left, right) => stableHash(left.id) - stableHash(right.id) || left.id.localeCompare(right.id),
  )
  const remaining = [...ordered]
  const selection: Founder[] = []

  while (selection.length < targetCount) {
    const currentCounts = buildVariationStats(selection)
    if (meetsVariationRequirements(currentCounts, requirements)) {
      break
    }

    const currentDistinctValues = createDistinctValueSets(selection)
    const valueFrequencies = createValueFrequencies(remaining)
    const candidates = remaining
      .map((founder, index) => ({
        founder,
        index,
        score: scoreFounder(founder, {
          currentDistinctValues,
          currentCounts,
          requirements,
          valueFrequencies,
        }),
      }))
      .filter((candidate) => candidate.score > 0)
      .sort((left, right) => right.score - left.score || left.index - right.index)

    if (!candidates.length) {
      break
    }

    const best = candidates[0]
    selection.push(best.founder)
    remaining.splice(best.index, 1)
  }

  for (const founder of remaining) {
    if (selection.length >= targetCount) {
      break
    }
    selection.push(founder)
  }

  return selection
}

function assertVariationRequirementsCanBeMet(
  founders: readonly Founder[],
  targetCount: number,
  requirements: VariationRequirements,
) {
  const remainingCounts = countRemainingDistinctValues(founders)
  for (const fieldName of TRACKABLE_FIELDS) {
    if (remainingCounts[fieldName] < requirements[fieldName]) {
      throw new Error(
        `Could not satisfy variation requirements for ${targetCount} founders: ` +
          `${fieldName} needs ${requirements[fieldName]} distinct values but only ${remainingCounts[fieldName]} exist`,
      )
    }
  }
}

export function buildScaleFixture(founders: Founder[], scenario: ScaleScenario): Founder[]
export function buildScaleFixture(founders: Founder[], scenario: string): Founder[] {
  assertScaleScenario(scenario)
  const targetCount = SCENARIO_COUNTS[scenario]

  if (founders.length < targetCount) {
    throw new Error(`Scenario ${scenario} requires ${targetCount} founders`)
  }

  const requirements = buildVariationRequirements(founders, targetCount)
  assertVariationRequirementsCanBeMet(founders, targetCount, requirements)

  const selection = buildSatisfyingSelection(founders, targetCount, requirements)
  const stats = buildVariationStats(selection)

  if (!meetsVariationRequirements(stats, requirements)) {
    throw new Error(
      `Could not satisfy variation requirements for scenario ${scenario}: ` +
        describeRequirements(requirements, stats),
    )
  }

  return selection
}
