import type { Founder } from './founder'

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

function stableHash(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function distinctCount(values: readonly string[] | readonly number[]) {
  return new Set(values).size
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

function variationScore(stats: VariationStats, requirements: VariationRequirements) {
  return (
    Math.min(stats.companyVertical / requirements.companyVertical, 1) * 5 +
    Math.min(stats.company / requirements.company, 1) * 5 +
    Math.min(stats.age / requirements.age, 1) * 3 +
    Math.min(stats.education / requirements.education, 1) * 2 +
    Math.min(stats.role / requirements.role, 1) * 2 +
    Math.min(stats.cohortGroup / requirements.cohortGroup, 1) * 2 +
    Math.min(stats.cohortSection / requirements.cohortSection, 1) * 3
  )
}

export function buildScaleFixture(founders: Founder[], scenario: ScaleScenario): Founder[] {
  const targetCount = SCENARIO_COUNTS[scenario]

  if (founders.length < targetCount) {
    throw new Error(`Scenario ${scenario} requires ${targetCount} founders`)
  }

  const ordered = [...founders].sort(
    (left, right) => stableHash(left.id) - stableHash(right.id) || left.id.localeCompare(right.id),
  )
  const requirements = buildVariationRequirements(founders, targetCount)
  let bestOffset = 0
  let bestScore = -Infinity

  for (let offset = 0; offset <= ordered.length - targetCount; offset += 1) {
    const selection = ordered.slice(offset, offset + targetCount)
    const stats = buildVariationStats(selection)

    if (meetsVariationRequirements(stats, requirements)) {
      return selection
    }

    const score = variationScore(stats, requirements)
    if (score > bestScore) {
      bestScore = score
      bestOffset = offset
    }
  }

  return ordered.slice(bestOffset, bestOffset + targetCount)
}
