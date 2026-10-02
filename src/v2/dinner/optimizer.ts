import type { Founder } from '../../shared/founder.js'
import type { CriteriaSet } from './criteria.js'
import {
  detectRuleConflicts,
  findRuleViolations,
  founderMatchesFieldCountRule,
  type HardRule,
  type RuleConflict,
} from './rules.js'
import {
  buildPairwiseScores,
  scoreFounderPair,
  type PairwiseScoreCache,
} from './scoring.js'

export const DEFAULT_MAX_ITERATIONS = 5
export const DEFAULT_MAX_COMPARISONS = 50_000
export const INITIAL_ASSIGNMENT_NODE_LIMIT = 250_000

export interface DinnerLock {
  readonly founderId: string
  readonly tableIndex: number
  readonly seatIndex?: number
}

export interface DinnerMetrics {
  readonly founderFitVector: readonly number[]
  readonly tableQualityVector: readonly number[]
  readonly meanFounderFit: number
  readonly meanTableQuality: number
}

export interface DinnerTable {
  readonly index: number
  readonly capacity: number
  readonly founderIds: readonly string[]
  readonly seats: readonly (string | null)[]
  readonly founderFits: Readonly<Record<string, number>>
  readonly quality: number
}

export interface DinnerSolution {
  readonly tables: readonly DinnerTable[]
  readonly metrics: DinnerMetrics
  readonly criteria: CriteriaSet
  readonly rules: readonly HardRule[]
  readonly locks: readonly DinnerLock[]
  readonly optimization: {
    readonly iterations: number
    readonly comparisons: number
    readonly converged: boolean
  }
}

export interface DinnerRequest {
  readonly founders: readonly Founder[]
  readonly tableCount: number
  readonly criteria: CriteriaSet
  readonly rules?: readonly HardRule[]
  readonly locks?: readonly DinnerLock[]
  readonly maxIterations?: number
  readonly maxComparisons?: number
}

interface Component {
  readonly id: string
  readonly founderIds: readonly string[]
  readonly fixedTableIndex?: number
  readonly locked: boolean
}

export interface PreparedDinnerRequest {
  readonly request: DinnerRequest
  readonly capacities: readonly number[]
  readonly rules: readonly HardRule[]
  readonly locks: readonly DinnerLock[]
  readonly effectiveLocks: readonly DinnerLock[]
  readonly components: readonly Component[]
  readonly minimumRules: readonly Extract<HardRule, { type: 'field-count' }>[]
  readonly founderById: ReadonlyMap<string, Founder>
  readonly scoreCache: PairwiseScoreCache
}

type PreparedRequest = PreparedDinnerRequest

export interface DinnerImprovementOptions {
  readonly maxIterations?: number
  readonly maxComparisons?: number
  readonly acceptCandidate?: (
    assignment: readonly (readonly string[])[],
    metrics: DinnerMetrics,
  ) => boolean
}

export class DinnerConflictError extends Error {
  readonly conflicts: readonly RuleConflict[]

  constructor(conflicts: readonly RuleConflict[]) {
    super(
      conflicts.length === 1
        ? conflicts[0]!.message
        : `Dinner request has ${conflicts.length} conflicting constraints`,
    )
    this.name = 'DinnerConflictError'
    this.conflicts = conflicts
  }
}

class UnionFind {
  private readonly parent = new Map<string, string>()

  add(value: string) {
    if (!this.parent.has(value)) {
      this.parent.set(value, value)
    }
  }

  find(value: string): string {
    this.add(value)
    const parent = this.parent.get(value)!
    if (parent === value) {
      return value
    }
    const root = this.find(parent)
    this.parent.set(value, root)
    return root
  }

  union(left: string, right: string) {
    const leftRoot = this.find(left)
    const rightRoot = this.find(right)
    if (leftRoot !== rightRoot) {
      const [root, child] =
        leftRoot < rightRoot ? [leftRoot, rightRoot] : [rightRoot, leftRoot]
      this.parent.set(child, root)
    }
  }
}

function ruleConflict(
  ruleIds: readonly string[],
  founderIds: readonly string[],
  message: string,
): RuleConflict {
  return {
    ruleIds: [...new Set(ruleIds)].sort(),
    founderIds: [...new Set(founderIds)].sort(),
    message,
  }
}

export function capacities(founderCount: number, tableCount: number): number[] {
  if (!Number.isInteger(founderCount) || founderCount < 0) {
    throw new Error('Founder count must be a non-negative integer')
  }
  if (!Number.isInteger(tableCount) || tableCount <= 0) {
    throw new Error('Table count must be a positive integer')
  }
  if (founderCount > 0 && tableCount > founderCount) {
    throw new Error('Table count cannot exceed founder count')
  }

  const base = Math.floor(founderCount / tableCount)
  const remainder = founderCount % tableCount
  return Array.from(
    { length: tableCount },
    (_, tableIndex) => base + (tableIndex < remainder ? 1 : 0),
  )
}

function compareNumbers(left: number, right: number) {
  const difference = left - right
  return Math.abs(difference) <= 1e-12 ? 0 : difference > 0 ? 1 : -1
}

function compareVectors(left: readonly number[], right: readonly number[]) {
  const length = Math.min(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    const comparison = compareNumbers(left[index]!, right[index]!)
    if (comparison !== 0) {
      return comparison
    }
  }
  return compareNumbers(left.length, right.length)
}

export function compareDinnerMetrics(left: DinnerMetrics, right: DinnerMetrics): number {
  return (
    compareVectors(left.founderFitVector, right.founderFitVector) ||
    compareVectors(left.tableQualityVector, right.tableQualityVector) ||
    compareNumbers(left.meanFounderFit, right.meanFounderFit) ||
    compareNumbers(left.meanTableQuality, right.meanTableQuality)
  )
}

function inputConflicts(
  request: DinnerRequest,
  tableCapacities: readonly number[],
  rules: readonly HardRule[],
  locks: readonly DinnerLock[],
) {
  const conflicts: RuleConflict[] = []
  const founderIds = new Set<string>()
  for (const founder of request.founders) {
    if (founderIds.has(founder.id)) {
      conflicts.push(
        ruleConflict([], [founder.id], `Duplicate founder ID ${founder.id} in dinner cohort`),
      )
    }
    founderIds.add(founder.id)
  }

  conflicts.push(...detectRuleConflicts(rules, request.founders))

  const fixedSizeRules = rules.filter(
    (rule): rule is Extract<HardRule, { type: 'fixed-table-size' }> =>
      rule.type === 'fixed-table-size',
  )
  for (const rule of fixedSizeRules) {
    if (tableCapacities.some((capacity) => capacity !== rule.size)) {
      conflicts.push(
        ruleConflict(
          [rule.id],
          [],
          `Rule ${rule.id} requires size ${rule.size}, but balanced capacities are ${tableCapacities.join(', ')}`,
        ),
      )
    }
  }

  for (const rule of rules) {
    if ('founderIds' in rule) {
      const unknownIds = rule.founderIds.filter((founderId) => !founderIds.has(founderId))
      if (unknownIds.length) {
        conflicts.push(
          ruleConflict([rule.id], unknownIds, `Rule ${rule.id} references unknown founders`),
        )
      }
    } else if ('founderId' in rule && !founderIds.has(rule.founderId)) {
      conflicts.push(
        ruleConflict(
          [rule.id],
          [rule.founderId],
          `Rule ${rule.id} references an unknown founder`,
        ),
      )
    }
    if (
      (rule.type === 'pinned-table' || rule.type === 'pinned-seat') &&
      (rule.tableIndex >= request.tableCount ||
        (rule.type === 'pinned-seat' &&
          rule.seatIndex >= (tableCapacities[rule.tableIndex] ?? 0)))
    ) {
      conflicts.push(
        ruleConflict(
          [rule.id],
          [rule.founderId],
          `Rule ${rule.id} pins a founder outside the available tables or seats`,
        ),
      )
    }
  }

  const locksByFounder = new Map<string, DinnerLock[]>()
  const locksBySeat = new Map<string, DinnerLock[]>()
  for (const lock of locks) {
    if (!founderIds.has(lock.founderId)) {
      conflicts.push(
        ruleConflict(
          [`lock:${lock.founderId}`],
          [lock.founderId],
          `Lock references unknown founder ${lock.founderId}`,
        ),
      )
      continue
    }
    if (
      !Number.isInteger(lock.tableIndex) ||
      lock.tableIndex < 0 ||
      lock.tableIndex >= request.tableCount ||
      (lock.seatIndex !== undefined &&
        (!Number.isInteger(lock.seatIndex) ||
          lock.seatIndex < 0 ||
          lock.seatIndex >= (tableCapacities[lock.tableIndex] ?? 0)))
    ) {
      conflicts.push(
        ruleConflict(
          [`lock:${lock.founderId}`],
          [lock.founderId],
          `Lock for ${lock.founderId} is outside the available tables or seats`,
        ),
      )
      continue
    }
    locksByFounder.set(lock.founderId, [
      ...(locksByFounder.get(lock.founderId) ?? []),
      lock,
    ])
    if (lock.seatIndex !== undefined) {
      const seatKey = `${lock.tableIndex}:${lock.seatIndex}`
      locksBySeat.set(seatKey, [...(locksBySeat.get(seatKey) ?? []), lock])
    }
  }
  for (const [founderId, founderLocks] of locksByFounder) {
    const tableIndexes = new Set(founderLocks.map((lock) => lock.tableIndex))
    const seatIndexes = new Set(
      founderLocks.flatMap((lock) =>
        lock.seatIndex === undefined
          ? []
          : [`${lock.tableIndex}:${lock.seatIndex}`],
      ),
    )
    if (tableIndexes.size > 1 || seatIndexes.size > 1) {
      conflicts.push(
        ruleConflict(
          founderLocks.map(() => `lock:${founderId}`),
          [founderId],
          `Founder ${founderId} has incompatible locks`,
        ),
      )
    }
  }
  for (const seatLocks of locksBySeat.values()) {
    const seatedFounderIds = [...new Set(seatLocks.map((lock) => lock.founderId))]
    if (seatedFounderIds.length > 1) {
      conflicts.push(
        ruleConflict(
          seatedFounderIds.map((founderId) => `lock:${founderId}`),
          seatedFounderIds,
          'Multiple founders are locked to the same seat',
        ),
      )
    }
  }

  const sameCompanyRules = rules.filter(
    (rule): rule is Extract<HardRule, { type: 'same-company-separation' }> =>
      rule.type === 'same-company-separation',
  )
  if (sameCompanyRules.length) {
    const foundersByCompany = new Map<string, string[]>()
    for (const founder of request.founders) {
      foundersByCompany.set(founder.company, [
        ...(foundersByCompany.get(founder.company) ?? []),
        founder.id,
      ])
    }
    for (const companyFounderIds of foundersByCompany.values()) {
      if (companyFounderIds.length > request.tableCount) {
        conflicts.push(
          ruleConflict(
            sameCompanyRules.map((rule) => rule.id),
            companyFounderIds,
            'There are more same-company founders than tables available for separation',
          ),
        )
      }
    }
  }

  const fieldCountRules = rules.filter(
    (rule): rule is Extract<HardRule, { type: 'field-count' }> =>
      rule.type === 'field-count',
  )
  for (const rule of fieldCountRules) {
    const matchingFounderIds = request.founders
      .filter((founder) => founderMatchesFieldCountRule(founder, rule))
      .map((founder) => founder.id)
    if (
      rule.min !== undefined &&
      matchingFounderIds.length < rule.min * request.tableCount
    ) {
      conflicts.push(
        ruleConflict(
          [rule.id],
          matchingFounderIds,
          `Rule ${rule.id} requires more matching founders than are available`,
        ),
      )
    }
    if (
      rule.max !== undefined &&
      matchingFounderIds.length > rule.max * request.tableCount
    ) {
      conflicts.push(
        ruleConflict(
          [rule.id],
          matchingFounderIds,
          `Rule ${rule.id} allows fewer matching founders than must be seated`,
        ),
      )
    }
  }
  return conflicts
}

function rulePins(rules: readonly HardRule[]): DinnerLock[] {
  return rules.flatMap((rule) => {
    if (rule.type === 'pinned-table') {
      return [{ founderId: rule.founderId, tableIndex: rule.tableIndex }]
    }
    if (rule.type === 'pinned-seat') {
      return [
        {
          founderId: rule.founderId,
          tableIndex: rule.tableIndex,
          seatIndex: rule.seatIndex,
        },
      ]
    }
    return []
  })
}

function mergeEffectiveLocks(
  rules: readonly HardRule[],
  locks: readonly DinnerLock[],
): DinnerLock[] {
  const merged = new Map<string, DinnerLock>()
  for (const lock of [...rulePins(rules), ...locks]) {
    const current = merged.get(lock.founderId)
    if (!current || (current.seatIndex === undefined && lock.seatIndex !== undefined)) {
      merged.set(lock.founderId, lock)
    }
  }
  return [...merged.values()].sort(
    (left, right) =>
      left.tableIndex - right.tableIndex ||
      (left.seatIndex ?? Number.MAX_SAFE_INTEGER) -
        (right.seatIndex ?? Number.MAX_SAFE_INTEGER) ||
      left.founderId.localeCompare(right.founderId),
  )
}

function buildComponents(
  founders: readonly Founder[],
  rules: readonly HardRule[],
  locks: readonly DinnerLock[],
): { components: Component[]; conflicts: RuleConflict[] } {
  const unionFind = new UnionFind()
  founders.forEach((founder) => unionFind.add(founder.id))
  for (const rule of rules) {
    if (rule.type !== 'must-sit-together') {
      continue
    }
    const [first, ...rest] = rule.founderIds
    if (first) {
      rest.forEach((founderId) => unionFind.union(first, founderId))
    }
  }

  const grouped = new Map<string, string[]>()
  for (const founder of founders) {
    const root = unionFind.find(founder.id)
    grouped.set(root, [...(grouped.get(root) ?? []), founder.id])
  }
  const locksByFounder = new Map(locks.map((lock) => [lock.founderId, lock]))
  const conflicts: RuleConflict[] = []
  const components = [...grouped.values()].map((founderIds) => {
    const sortedIds = [...founderIds].sort()
    const componentLocks = sortedIds
      .map((founderId) => locksByFounder.get(founderId))
      .filter((lock): lock is DinnerLock => lock !== undefined)
    const fixedTables = new Set(componentLocks.map((lock) => lock.tableIndex))
    if (fixedTables.size > 1) {
      conflicts.push(
        ruleConflict(
          componentLocks.map((lock) => `lock:${lock.founderId}`),
          sortedIds,
          'Founders required together are locked to different tables',
        ),
      )
    }
    return {
      id: sortedIds[0]!,
      founderIds: sortedIds,
      fixedTableIndex: fixedTables.size === 1 ? [...fixedTables][0] : undefined,
      locked: componentLocks.length > 0,
    }
  })
  components.sort(
    (left, right) =>
      Number(right.fixedTableIndex !== undefined) -
        Number(left.fixedTableIndex !== undefined) ||
      right.founderIds.length - left.founderIds.length ||
      left.id.localeCompare(right.id),
  )
  return { components, conflicts }
}

function componentConstraintConflicts(
  components: readonly Component[],
  tableCapacities: readonly number[],
  rules: readonly HardRule[],
  founderById: ReadonlyMap<string, Founder>,
) {
  const conflicts: RuleConflict[] = []
  const sameCompanyRules = rules.filter(
    (rule): rule is Extract<HardRule, { type: 'same-company-separation' }> =>
      rule.type === 'same-company-separation',
  )
  const fieldCountRules = rules.filter(
    (rule): rule is Extract<HardRule, { type: 'field-count' }> =>
      rule.type === 'field-count' && rule.max !== undefined,
  )

  for (const component of components) {
    const maximumCapacity =
      component.fixedTableIndex === undefined
        ? Math.max(...tableCapacities)
        : (tableCapacities[component.fixedTableIndex] ?? 0)
    if (component.founderIds.length > maximumCapacity) {
      conflicts.push(
        ruleConflict(
          [],
          component.founderIds,
          'A must-sit-together component is larger than every available table',
        ),
      )
    }
    if (sameCompanyRules.length) {
      const byCompany = new Map<string, string[]>()
      for (const founderId of component.founderIds) {
        const company = founderById.get(founderId)?.company
        if (company) {
          byCompany.set(company, [...(byCompany.get(company) ?? []), founderId])
        }
      }
      for (const sameCompanyFounderIds of byCompany.values()) {
        if (sameCompanyFounderIds.length > 1) {
          conflicts.push(
            ruleConflict(
              sameCompanyRules.map((rule) => rule.id),
              sameCompanyFounderIds,
              'A must-sit-together component contains same-company founders',
            ),
          )
        }
      }
    }
    for (const rule of fieldCountRules) {
      const count = component.founderIds.filter(
        (founderId) => {
          const founder = founderById.get(founderId)
          return founder ? founderMatchesFieldCountRule(founder, rule) : false
        },
      ).length
      if (count > rule.max!) {
        conflicts.push(
          ruleConflict(
            [rule.id],
            component.founderIds,
            `A must-sit-together component exceeds rule ${rule.id}`,
          ),
        )
      }
    }
  }
  return conflicts
}

export function prepareDinnerRequest(request: DinnerRequest): PreparedDinnerRequest {
  const tableCapacities = capacities(request.founders.length, request.tableCount)
  const rules = request.rules ?? []
  const locks = request.locks ?? []
  const effectiveLocks = mergeEffectiveLocks(rules, locks)
  const conflicts = inputConflicts(
    request,
    tableCapacities,
    rules,
    [...rulePins(rules), ...locks],
  )
  const founderById = new Map(request.founders.map((founder) => [founder.id, founder]))
  const componentResult = buildComponents(request.founders, rules, effectiveLocks)
  conflicts.push(...componentResult.conflicts)
  conflicts.push(
    ...componentConstraintConflicts(
      componentResult.components,
      tableCapacities,
      rules,
      founderById,
    ),
  )
  if (conflicts.length) {
    throw new DinnerConflictError(conflicts)
  }
  const minimumRules = rules.filter(
    (rule): rule is Extract<HardRule, { type: 'field-count' }> =>
      rule.type === 'field-count' && rule.min !== undefined,
  )
  const components = [...componentResult.components].sort((left, right) => {
    const minimumMatchCount = (component: Component) =>
      minimumRules.reduce(
        (count, rule) =>
          count +
          matchingCount(
            component.founderIds,
            founderById,
            rule,
          ),
        0,
      )
    return (
      Number(right.fixedTableIndex !== undefined) -
        Number(left.fixedTableIndex !== undefined) ||
      minimumMatchCount(right) - minimumMatchCount(left) ||
      right.founderIds.length - left.founderIds.length ||
      left.id.localeCompare(right.id)
    )
  })

  return {
    request,
    capacities: tableCapacities,
    rules,
    locks,
    effectiveLocks,
    components,
    minimumRules,
    founderById,
    scoreCache: buildPairwiseScores(request.founders, request.criteria),
  }
}

function componentFitsTable(
  component: Component,
  tableFounderIds: readonly string[],
  tableCapacity: number,
  prepared: PreparedRequest,
) {
  if (tableFounderIds.length + component.founderIds.length > tableCapacity) {
    return false
  }
  const combined = [...tableFounderIds, ...component.founderIds]
  const combinedSet = new Set(combined)

  for (const rule of prepared.rules) {
    switch (rule.type) {
      case 'cannot-sit-together': {
        let present = 0
        for (const founderId of rule.founderIds) {
          if (combinedSet.has(founderId)) {
            present += 1
          }
        }
        if (present > 1) {
          return false
        }
        break
      }
      case 'same-company-separation': {
        const companies = new Set<string>()
        for (const founderId of combined) {
          const company = prepared.founderById.get(founderId)?.company
          if (company && companies.has(company)) {
            return false
          }
          if (company) {
            companies.add(company)
          }
        }
        break
      }
      case 'field-count':
        if (rule.max !== undefined) {
          const count = combined.filter(
            (founderId) => {
              const founder = prepared.founderById.get(founderId)
              return founder ? founderMatchesFieldCountRule(founder, rule) : false
            },
          ).length
          if (count > rule.max) {
            return false
          }
        }
        break
      default:
        break
    }
  }
  return true
}

function matchingCount(
  founderIds: readonly string[],
  founderById: ReadonlyMap<string, Founder>,
  rule: Extract<HardRule, { type: 'field-count' }>,
) {
  return founderIds.filter(
    (founderId) => {
      const founder = founderById.get(founderId)
      return founder ? founderMatchesFieldCountRule(founder, rule) : false
    },
  ).length
}

function candidateTableIndexes(
  component: Component,
  tables: readonly (readonly string[])[],
  prepared: PreparedRequest,
) {
  if (component.fixedTableIndex !== undefined) {
    return [component.fixedTableIndex]
  }
  return prepared.capacities
    .map((_, tableIndex) => tableIndex)
    .sort((left, right) => {
      const deficitScore = (tableIndex: number) =>
        prepared.minimumRules.reduce((score, rule) => {
          const componentMatches = matchingCount(
            component.founderIds,
            prepared.founderById,
            rule,
          )
          if (!componentMatches) {
            return score
          }
          const currentMatches = matchingCount(
            tables[tableIndex] ?? [],
            prepared.founderById,
            rule,
          )
          return score + Math.max(0, rule.min! - currentMatches)
        }, 0)
      return deficitScore(right) - deficitScore(left) || left - right
    })
}

function minimumsRemainPossible(
  tables: readonly (readonly string[])[],
  remainingComponents: readonly Component[],
  prepared: PreparedRequest,
) {
  if (!prepared.minimumRules.length) {
    return true
  }
  for (const rule of prepared.minimumRules) {
    const remainingMatches = remainingComponents.reduce(
      (count, component) =>
        count +
        matchingCount(
          component.founderIds,
          prepared.founderById,
          rule,
        ),
      0,
    )
    let totalShortfall = 0
    for (let tableIndex = 0; tableIndex < tables.length; tableIndex += 1) {
      const table = tables[tableIndex]!
      const currentMatches = matchingCount(
        table,
        prepared.founderById,
        rule,
      )
      const shortfall = Math.max(0, rule.min! - currentMatches)
      const remainingCapacity = prepared.capacities[tableIndex]! - table.length
      if (shortfall > remainingCapacity) {
        return false
      }
      totalShortfall += shortfall
    }
    if (remainingMatches < totalShortfall) {
      return false
    }
  }
  return true
}

function buildSeats(
  founderIds: readonly string[],
  capacity: number,
  tableIndex: number,
  locks: readonly DinnerLock[],
) {
  const seats: (string | null)[] = Array(capacity).fill(null)
  const seated = new Set<string>()
  for (const lock of locks) {
    if (
      lock.tableIndex === tableIndex &&
      lock.seatIndex !== undefined &&
      founderIds.includes(lock.founderId)
    ) {
      seats[lock.seatIndex] = lock.founderId
      seated.add(lock.founderId)
    }
  }
  const unseated = founderIds.filter((founderId) => !seated.has(founderId)).sort()
  let founderIndex = 0
  for (let seatIndex = 0; seatIndex < seats.length; seatIndex += 1) {
    if (seats[seatIndex] === null) {
      seats[seatIndex] = unseated[founderIndex] ?? null
      founderIndex += 1
    }
  }
  return seats
}

function assignmentTables(
  tables: readonly (readonly string[])[],
  prepared: PreparedRequest,
) {
  return tables.map((founderIds, tableIndex) => ({
    founderIds,
    seats: buildSeats(
      founderIds,
      prepared.capacities[tableIndex]!,
      tableIndex,
      prepared.effectiveLocks,
    ),
  }))
}

function satisfiesConstraints(
  tables: readonly (readonly string[])[],
  prepared: PreparedRequest,
) {
  if (
    tables.some(
      (founderIds, tableIndex) =>
        founderIds.length !== prepared.capacities[tableIndex],
    )
  ) {
    return false
  }
  if (findRuleViolations(assignmentTables(tables, prepared), prepared.request.founders, prepared.rules).length) {
    return false
  }
  return prepared.effectiveLocks.every((lock) => {
    const table = tables[lock.tableIndex]
    if (!table?.includes(lock.founderId)) {
      return false
    }
    return (
      lock.seatIndex === undefined ||
      buildSeats(
        table,
        prepared.capacities[lock.tableIndex]!,
        lock.tableIndex,
        prepared.effectiveLocks,
      )[lock.seatIndex] === lock.founderId
    )
  })
}

function tableSatisfiesConstraints(
  founderIds: readonly string[],
  tableIndex: number,
  prepared: PreparedRequest,
) {
  if (founderIds.length !== prepared.capacities[tableIndex]) {
    return false
  }
  const founderIdSet = new Set(founderIds)
  for (const rule of prepared.rules) {
    switch (rule.type) {
      case 'must-sit-together':
        break
      case 'cannot-sit-together': {
        let present = 0
        for (const founderId of rule.founderIds) {
          if (founderIdSet.has(founderId)) {
            present += 1
          }
        }
        if (present > 1) {
          return false
        }
        break
      }
      case 'same-company-separation': {
        const companies = new Set<string>()
        for (const founderId of founderIds) {
          const company = prepared.founderById.get(founderId)?.company
          if (company && companies.has(company)) {
            return false
          }
          if (company) {
            companies.add(company)
          }
        }
        break
      }
      case 'field-count': {
        const count = matchingCount(
          founderIds,
          prepared.founderById,
          rule,
        )
        if (
          (rule.min !== undefined && count < rule.min) ||
          (rule.max !== undefined && count > rule.max)
        ) {
          return false
        }
        break
      }
      case 'fixed-table-size':
        if (founderIds.length !== rule.size) {
          return false
        }
        break
      case 'pinned-table':
      case 'pinned-seat':
        if (
          (rule.tableIndex === tableIndex && !founderIdSet.has(rule.founderId)) ||
          (rule.tableIndex !== tableIndex && founderIdSet.has(rule.founderId))
        ) {
          return false
        }
        break
    }
  }

  for (const lock of prepared.effectiveLocks) {
    if (
      (lock.tableIndex === tableIndex && !founderIdSet.has(lock.founderId)) ||
      (lock.tableIndex !== tableIndex && founderIdSet.has(lock.founderId))
    ) {
      return false
    }
    if (
      lock.tableIndex === tableIndex &&
      lock.seatIndex !== undefined &&
      buildSeats(
        founderIds,
        prepared.capacities[tableIndex]!,
        tableIndex,
        prepared.effectiveLocks,
      )[lock.seatIndex] !== lock.founderId
    ) {
      return false
    }
  }
  return true
}

function affectedTablesSatisfyConstraints(
  assignment: readonly (readonly string[])[],
  tableIndexes: readonly number[],
  prepared: PreparedRequest,
) {
  return tableIndexes.every((tableIndex) =>
    tableSatisfiesConstraints(assignment[tableIndex]!, tableIndex, prepared),
  )
}

function initialAssignment(prepared: PreparedRequest) {
  const tables: string[][] = prepared.capacities.map(() => [])
  let visitedNodes = 0

  const assign = (componentIndex: number): boolean => {
    visitedNodes += 1
    if (visitedNodes > INITIAL_ASSIGNMENT_NODE_LIMIT) {
      return false
    }
    if (componentIndex >= prepared.components.length) {
      return satisfiesConstraints(tables, prepared)
    }

    const component = prepared.components[componentIndex]!
    const remaining = prepared.components.slice(componentIndex + 1)
    for (const tableIndex of candidateTableIndexes(component, tables, prepared)) {
      const table = tables[tableIndex]!
      if (
        !componentFitsTable(
          component,
          table,
          prepared.capacities[tableIndex]!,
          prepared,
        )
      ) {
        continue
      }
      table.push(...component.founderIds)
      if (minimumsRemainPossible(tables, remaining, prepared) && assign(componentIndex + 1)) {
        return true
      }
      table.splice(table.length - component.founderIds.length)
    }
    return false
  }

  if (!assign(0)) {
    const relevantRuleIds = prepared.rules.map((rule) => rule.id)
    throw new DinnerConflictError([
      ruleConflict(
        relevantRuleIds,
        prepared.request.founders.map((founder) => founder.id),
        visitedNodes > INITIAL_ASSIGNMENT_NODE_LIMIT
          ? `No compliant assignment found within the deterministic ${INITIAL_ASSIGNMENT_NODE_LIMIT}-node search limit`
          : 'No hard-rule-compliant dinner assignment exists',
      ),
    ])
  }
  return tables.map((table) => [...table].sort())
}

function founderFit(
  founderId: string,
  tableFounderIds: readonly string[],
  prepared: PreparedRequest,
) {
  if (tableFounderIds.length <= 1) {
    return 1
  }
  let total = 0
  for (const tablemateId of tableFounderIds) {
    if (tablemateId !== founderId) {
      total += scoreFounderPair(
        prepared.scoreCache,
        prepared.request.criteria,
        founderId,
        tablemateId,
      )
    }
  }
  return total / (tableFounderIds.length - 1)
}

function calculateTable(
  founderIds: readonly string[],
  tableIndex: number,
  prepared: PreparedRequest,
): DinnerTable {
  const sortedFounderIds = [...founderIds].sort()
  const founderFits: Record<string, number> = {}
  for (const founderId of sortedFounderIds) {
    founderFits[founderId] = founderFit(founderId, sortedFounderIds, prepared)
  }
  const fitValues = Object.values(founderFits)
  return {
    index: tableIndex,
    capacity: prepared.capacities[tableIndex]!,
    founderIds: sortedFounderIds,
    seats: buildSeats(
      sortedFounderIds,
      prepared.capacities[tableIndex]!,
      tableIndex,
      prepared.effectiveLocks,
    ),
    founderFits,
    quality: fitValues.length ? Math.min(...fitValues) : 0,
  }
}

function metricsFromTables(tables: readonly DinnerTable[]): DinnerMetrics {
  const founderFits = tables.flatMap((table) => Object.values(table.founderFits))
  const tableQualities = tables.map((table) => table.quality)
  return {
    founderFitVector: [...founderFits].sort((left, right) => left - right),
    tableQualityVector: [...tableQualities].sort((left, right) => left - right),
    meanFounderFit: founderFits.length
      ? founderFits.reduce((sum, score) => sum + score, 0) / founderFits.length
      : 0,
    meanTableQuality: tableQualities.length
      ? tableQualities.reduce((sum, score) => sum + score, 0) / tableQualities.length
      : 0,
  }
}

function replaceDinnerTables(
  currentTables: readonly DinnerTable[],
  replacements: readonly DinnerTable[],
) {
  const replacementByIndex = new Map(
    replacements.map((table) => [table.index, table]),
  )
  return currentTables.map((table) => replacementByIndex.get(table.index) ?? table)
}

function evaluateAffectedTables(
  assignment: readonly (readonly string[])[],
  currentTables: readonly DinnerTable[],
  affectedTableIndexes: readonly number[],
  prepared: PreparedRequest,
) {
  const uniqueTableIndexes = [...new Set(affectedTableIndexes)].sort(
    (left, right) => left - right,
  )
  if (!affectedTablesSatisfyConstraints(assignment, uniqueTableIndexes, prepared)) {
    return undefined
  }
  const replacements = uniqueTableIndexes.map((tableIndex) =>
    calculateTable(assignment[tableIndex]!, tableIndex, prepared),
  )
  const tables = replaceDinnerTables(currentTables, replacements)
  return {
    tables,
    metrics: metricsFromTables(tables),
  }
}

function componentTableIndexes(
  assignment: readonly (readonly string[])[],
  components: readonly Component[],
) {
  const tableByFounder = new Map<string, number>()
  assignment.forEach((table, tableIndex) => {
    table.forEach((founderId) => tableByFounder.set(founderId, tableIndex))
  })
  return new Map(
    components.map((component) => [
      component.id,
      tableByFounder.get(component.founderIds[0]!)!,
    ]),
  )
}

function swappedAssignment(
  assignment: readonly (readonly string[])[],
  leftComponent: Component,
  rightComponent: Component,
  leftTableIndex: number,
  rightTableIndex: number,
) {
  return exchangedAssignment(
    assignment,
    [leftComponent],
    [rightComponent],
    leftTableIndex,
    rightTableIndex,
  )
}

function exchangedAssignment(
  assignment: readonly (readonly string[])[],
  leftComponents: readonly Component[],
  rightComponents: readonly Component[],
  leftTableIndex: number,
  rightTableIndex: number,
) {
  const leftFounderIds = leftComponents.flatMap((component) => component.founderIds)
  const rightFounderIds = rightComponents.flatMap((component) => component.founderIds)
  return assignment.map((table, tableIndex) => {
    if (tableIndex === leftTableIndex) {
      const removed = table.filter(
        (founderId) => !leftFounderIds.includes(founderId),
      )
      return [...removed, ...rightFounderIds].sort()
    }
    if (tableIndex === rightTableIndex) {
      const removed = table.filter(
        (founderId) => !rightFounderIds.includes(founderId),
      )
      return [...removed, ...leftFounderIds].sort()
    }
    return table
  })
}

function improveAssignment(
  initial: readonly (readonly string[])[],
  prepared: PreparedRequest,
  options: DinnerImprovementOptions = {},
) {
  let assignment = initial.map((table) => [...table])
  let tables: readonly DinnerTable[] = assignment.map((founderIds, tableIndex) =>
    calculateTable(founderIds, tableIndex, prepared),
  )
  let metrics = metricsFromTables(tables)
  const maxIterations =
    options.maxIterations ??
    prepared.request.maxIterations ??
    DEFAULT_MAX_ITERATIONS
  const maxComparisons =
    options.maxComparisons ??
    prepared.request.maxComparisons ??
    DEFAULT_MAX_COMPARISONS
  let comparisons = 0
  let iterations = 0
  let converged = false

  for (
    let iteration = 0;
    iteration < maxIterations && comparisons < maxComparisons;
    iteration += 1
  ) {
    iterations += 1
    const tableIndexes = componentTableIndexes(assignment, prepared.components)
    let improved = false

    for (
      let leftIndex = 0;
      leftIndex < prepared.components.length && comparisons < maxComparisons;
      leftIndex += 1
    ) {
      const left = prepared.components[leftIndex]!
      if (left.locked || left.founderIds.length < 2) {
        continue
      }
      for (
        let firstRightIndex = 0;
        firstRightIndex < prepared.components.length &&
        comparisons < maxComparisons;
        firstRightIndex += 1
      ) {
        const firstRight = prepared.components[firstRightIndex]!
        if (firstRight.locked || firstRight.id === left.id) {
          continue
        }
        for (
          let secondRightIndex = firstRightIndex + 1;
          secondRightIndex < prepared.components.length &&
          comparisons < maxComparisons;
          secondRightIndex += 1
        ) {
          const secondRight = prepared.components[secondRightIndex]!
          const leftTableIndex = tableIndexes.get(left.id)!
          const rightTableIndex = tableIndexes.get(firstRight.id)!
          if (
            secondRight.locked ||
            rightTableIndex === leftTableIndex ||
            tableIndexes.get(secondRight.id) !== rightTableIndex ||
            firstRight.founderIds.length + secondRight.founderIds.length !==
              left.founderIds.length
          ) {
            continue
          }
          comparisons += 1
          const candidate = exchangedAssignment(
            assignment,
            [left],
            [firstRight, secondRight],
            leftTableIndex,
            rightTableIndex,
          )
          const evaluated = evaluateAffectedTables(
            candidate,
            tables,
            [leftTableIndex, rightTableIndex],
            prepared,
          )
          if (
            !evaluated ||
            (options.acceptCandidate &&
              !options.acceptCandidate(candidate, evaluated.metrics))
          ) {
            continue
          }
          if (compareDinnerMetrics(evaluated.metrics, metrics) > 0) {
            assignment = candidate.map((table) => [...table])
            tables = evaluated.tables
            metrics = evaluated.metrics
            tableIndexes.set(left.id, rightTableIndex)
            tableIndexes.set(firstRight.id, leftTableIndex)
            tableIndexes.set(secondRight.id, leftTableIndex)
            improved = true
          }
        }
      }
    }

    for (
      let leftIndex = 0;
      leftIndex < prepared.components.length && comparisons < maxComparisons;
      leftIndex += 1
    ) {
      const left = prepared.components[leftIndex]!
      if (left.locked) {
        continue
      }
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < prepared.components.length && comparisons < maxComparisons;
        rightIndex += 1
      ) {
        const right = prepared.components[rightIndex]!
        if (right.locked || left.founderIds.length !== right.founderIds.length) {
          continue
        }
        const leftTableIndex = tableIndexes.get(left.id)!
        const rightTableIndex = tableIndexes.get(right.id)!
        if (leftTableIndex === rightTableIndex) {
          continue
        }
        comparisons += 1
        const candidate = swappedAssignment(
          assignment,
          left,
          right,
          leftTableIndex,
          rightTableIndex,
        )
        const evaluated = evaluateAffectedTables(
          candidate,
          tables,
          [leftTableIndex, rightTableIndex],
          prepared,
        )
        if (
          !evaluated ||
          (options.acceptCandidate &&
            !options.acceptCandidate(candidate, evaluated.metrics))
        ) {
          continue
        }
        if (compareDinnerMetrics(evaluated.metrics, metrics) > 0) {
          assignment = candidate.map((table) => [...table])
          tables = evaluated.tables
          metrics = evaluated.metrics
          tableIndexes.set(left.id, rightTableIndex)
          tableIndexes.set(right.id, leftTableIndex)
          improved = true
        }
      }
    }

    if (!improved) {
      converged = true
      break
    }
  }

  return { assignment, tables, metrics, iterations, comparisons, converged }
}

function solutionFromAssignment(
  assignment: readonly (readonly string[])[],
  prepared: PreparedRequest,
  optimization: DinnerSolution['optimization'],
): DinnerSolution {
  const tables = assignment.map((founderIds, tableIndex) =>
    calculateTable(founderIds, tableIndex, prepared),
  )
  return solutionFromTables(tables, prepared, optimization)
}

function solutionFromTables(
  tables: readonly DinnerTable[],
  prepared: PreparedRequest,
  optimization: DinnerSolution['optimization'],
): DinnerSolution {
  return {
    tables,
    metrics: metricsFromTables(tables),
    criteria: prepared.request.criteria,
    rules: prepared.rules,
    locks: prepared.locks,
    optimization,
  }
}

export function evaluatePreparedDinnerAssignment(
  prepared: PreparedDinnerRequest,
  assignment: readonly (readonly string[])[],
): DinnerSolution {
  const expectedIds = prepared.request.founders.map((founder) => founder.id).sort()
  const actualIds = assignment.flatMap((table) => table).sort()
  if (
    assignment.length !== prepared.request.tableCount ||
    expectedIds.length !== actualIds.length ||
    expectedIds.some((founderId, index) => founderId !== actualIds[index]) ||
    !satisfiesConstraints(assignment, prepared)
  ) {
    throw new DinnerConflictError([
      ruleConflict(
        prepared.rules.map((rule) => rule.id),
        actualIds,
        'The supplied assignment does not preserve the cohort, capacities, locks, and hard rules',
      ),
    ])
  }
  return solutionFromAssignment(assignment, prepared, {
    iterations: 0,
    comparisons: 0,
    converged: true,
  })
}

export function evaluatePreparedDinnerCandidate(
  prepared: PreparedDinnerRequest,
  current: DinnerSolution,
  assignment: readonly (readonly string[])[],
  affectedTableIndexes: readonly number[],
): DinnerSolution {
  const evaluated = evaluateAffectedTables(
    assignment,
    current.tables,
    affectedTableIndexes,
    prepared,
  )
  if (!evaluated) {
    throw new DinnerConflictError([
      ruleConflict(
        prepared.rules.map((rule) => rule.id),
        affectedTableIndexes.flatMap(
          (tableIndex) => assignment[tableIndex] ?? [],
        ),
        'The candidate assignment violates a capacity, lock, or hard rule',
      ),
    ])
  }
  return solutionFromTables(evaluated.tables, prepared, {
    iterations: 0,
    comparisons: 0,
    converged: true,
  })
}

export function improvePreparedDinnerAssignment(
  prepared: PreparedDinnerRequest,
  assignment: readonly (readonly string[])[],
  options: DinnerImprovementOptions = {},
): DinnerSolution {
  if (!satisfiesConstraints(assignment, prepared)) {
    throw new DinnerConflictError([
      ruleConflict(
        prepared.rules.map((rule) => rule.id),
        assignment.flatMap((table) => table),
        'The supplied assignment violates a capacity, lock, or hard rule',
      ),
    ])
  }
  const improved = improveAssignment(assignment, prepared, options)
  return solutionFromTables(improved.tables, prepared, {
    iterations: improved.iterations,
    comparisons: improved.comparisons,
    converged: improved.converged,
  })
}

export function optimizePreparedDinner(
  prepared: PreparedDinnerRequest,
): DinnerSolution {
  const initial = initialAssignment(prepared)
  const improved = improveAssignment(initial, prepared)
  return solutionFromTables(improved.tables, prepared, {
    iterations: improved.iterations,
    comparisons: improved.comparisons,
    converged: improved.converged,
  })
}

export function evaluateDinnerAssignment(
  request: DinnerRequest,
  assignment: readonly (readonly string[])[],
): DinnerSolution {
  return evaluatePreparedDinnerAssignment(prepareDinnerRequest(request), assignment)
}

export function optimizeDinner(request: DinnerRequest): DinnerSolution {
  return optimizePreparedDinner(prepareDinnerRequest(request))
}
