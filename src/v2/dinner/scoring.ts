import type { Founder } from '../../shared/founder.js'
import type {
  CriteriaSet,
  Criterion,
  CriterionObjective,
  CriterionOperator,
  MissingValuePolicy,
} from './criteria.js'

export interface NumericRange {
  readonly min: number
  readonly max: number
}

export interface PairwiseScoreCache {
  readonly founderIds: ReadonlySet<string>
  readonly components: ReadonlyMap<string, ReadonlyMap<string, number | null>>
}

function isMissing(value: unknown) {
  return (
    value === null ||
    value === undefined ||
    (typeof value === 'string' && value.trim() === '') ||
    (Array.isArray(value) && value.length === 0) ||
    (value instanceof Set && value.size === 0)
  )
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, value))
}

function normalizedSet(value: unknown) {
  const values =
    value instanceof Set
      ? [...value]
      : Array.isArray(value)
        ? value
        : [value]
  return new Set(
    values
      .filter((entry) => !isMissing(entry))
      .map((entry) => String(entry).trim().toLocaleLowerCase()),
  )
}

function hierarchy(value: unknown) {
  const values = Array.isArray(value) ? value : String(value).split('->')
  return values.map((entry) => String(entry).trim().toLocaleLowerCase()).filter(Boolean)
}

function similarity(
  operator: CriterionOperator,
  left: unknown,
  right: unknown,
  range?: NumericRange,
) {
  switch (operator) {
    case 'categorical':
      return left === right ? 1 : 0
    case 'jaccard': {
      const leftSet = normalizedSet(left)
      const rightSet = normalizedSet(right)
      const union = new Set([...leftSet, ...rightSet])
      let intersectionSize = 0
      for (const value of leftSet) {
        if (rightSet.has(value)) {
          intersectionSize += 1
        }
      }
      return union.size ? intersectionSize / union.size : 0
    }
    case 'numeric': {
      if (typeof left !== 'number' || typeof right !== 'number') {
        return 0
      }
      const minimum = range?.min ?? Math.min(left, right)
      const maximum = range?.max ?? Math.max(left, right)
      const span = maximum - minimum
      return span === 0 ? (left === right ? 1 : 0) : 1 - clamp(Math.abs(left - right) / span)
    }
    case 'hierarchical': {
      const leftPath = hierarchy(left)
      const rightPath = hierarchy(right)
      const depth = Math.max(leftPath.length, rightPath.length)
      let sharedDepth = 0
      while (
        sharedDepth < Math.min(leftPath.length, rightPath.length) &&
        leftPath[sharedDepth] === rightPath[sharedDepth]
      ) {
        sharedDepth += 1
      }
      return depth ? sharedDepth / depth : 0
    }
  }
}

export function scoreCriterionValues(
  criterion: {
    readonly operator: CriterionOperator
    readonly objective: CriterionObjective
    readonly missingValuePolicy: MissingValuePolicy
  },
  left: unknown,
  right: unknown,
  range?: NumericRange,
): number | null {
  if (isMissing(left) || isMissing(right)) {
    return criterion.missingValuePolicy === 'exclude' ? null : 0
  }

  const similar = similarity(criterion.operator, left, right, range)
  return criterion.objective === 'similarity' ? similar : 1 - similar
}

function pairKey(leftFounderId: string, rightFounderId: string) {
  return leftFounderId < rightFounderId
    ? `${leftFounderId}\u0000${rightFounderId}`
    : `${rightFounderId}\u0000${leftFounderId}`
}

function criterionValue(founder: Founder, criterion: Criterion): unknown {
  if (criterion.field === 'companyVertical') {
    return founder.companyVerticalLevels
  }
  return founder[criterion.field]
}

function numericRange(founders: readonly Founder[], criterion: Criterion): NumericRange | undefined {
  if (criterion.operator !== 'numeric') {
    return undefined
  }

  const values = founders
    .map((founder) => criterionValue(founder, criterion))
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  return values.length
    ? { min: Math.min(...values), max: Math.max(...values) }
    : undefined
}

function baseComponent(
  left: Founder,
  right: Founder,
  criterion: Criterion,
  range?: NumericRange,
) {
  if (
    criterion.field === 'cohortSection' &&
    left.cohortSection !== right.cohortSection &&
    left.cohortGroup === right.cohortGroup
  ) {
    return 0.5
  }

  return scoreCriterionValues(
    {
      operator: criterion.operator,
      objective: 'similarity',
      missingValuePolicy: criterion.missingValuePolicy,
    },
    criterionValue(left, criterion),
    criterionValue(right, criterion),
    range,
  )
}

export function buildPairwiseScores(
  founders: readonly Founder[],
  criteria: CriteriaSet,
): PairwiseScoreCache {
  const founderIds = new Set<string>()
  for (const founder of founders) {
    if (founderIds.has(founder.id)) {
      throw new Error(`Duplicate founder ID ${founder.id}`)
    }
    founderIds.add(founder.id)
  }

  const ranges = new Map(
    criteria.criteria.map((criterion) => [criterion.id, numericRange(founders, criterion)]),
  )
  const components = new Map<string, ReadonlyMap<string, number | null>>()
  for (let leftIndex = 0; leftIndex < founders.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < founders.length; rightIndex += 1) {
      const left = founders[leftIndex]!
      const right = founders[rightIndex]!
      const scores = new Map<string, number | null>()
      for (const criterion of criteria.criteria) {
        scores.set(
          criterion.id,
          baseComponent(left, right, criterion, ranges.get(criterion.id)),
        )
      }
      components.set(pairKey(left.id, right.id), scores)
    }
  }

  return {
    founderIds,
    components,
  }
}

export function scoreFounderPair(
  cache: PairwiseScoreCache,
  criteria: CriteriaSet,
  leftFounderId: string,
  rightFounderId: string,
): number {
  if (!cache.founderIds.has(leftFounderId) || !cache.founderIds.has(rightFounderId)) {
    throw new Error(`Unknown founder pair: ${leftFounderId}, ${rightFounderId}`)
  }
  if (leftFounderId === rightFounderId) {
    return 1
  }

  const components = cache.components.get(pairKey(leftFounderId, rightFounderId))
  if (!components) {
    throw new Error(`Missing pairwise components for ${leftFounderId}, ${rightFounderId}`)
  }

  let weightedScore = 0
  let totalWeight = 0
  for (const criterion of criteria.criteria) {
    if (!criterion.enabled) {
      continue
    }
    const component = components.get(criterion.id)
    if (component === null || component === undefined) {
      if (criterion.missingValuePolicy === 'zero') {
        totalWeight += criterion.weight
      }
      continue
    }
    const score = criterion.objective === 'similarity' ? component : 1 - component
    weightedScore += score * criterion.weight
    totalWeight += criterion.weight
  }
  return totalWeight ? weightedScore / totalWeight : 0
}
