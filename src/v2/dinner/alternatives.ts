import type { HardRule } from './rules.js'
import {
  DinnerConflictError,
  evaluateDinnerAssignment,
  optimizeDinner,
  type DinnerRequest,
  type DinnerSolution,
} from './optimizer.js'

export const ALTERNATIVE_STRUCTURAL_DIFFERENCE = 0.05
export const MAX_ALTERNATIVE_SWAP_ATTEMPTS = 10_000

interface FounderGroup {
  readonly id: string
  readonly founderIds: readonly string[]
  readonly locked: boolean
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

function tableByFounder(solution: DinnerSolution) {
  const result = new Map<string, number>()
  for (const table of solution.tables) {
    for (const founderId of table.founderIds) {
      result.set(founderId, table.index)
    }
  }
  return result
}

export function structuralDifference(
  left: DinnerSolution,
  right: DinnerSolution,
): number {
  const leftTableByFounder = tableByFounder(left)
  const rightTableByFounder = tableByFounder(right)
  const founderIds = [...leftTableByFounder.keys()].sort()
  if (
    founderIds.length !== rightTableByFounder.size ||
    founderIds.some((founderId) => !rightTableByFounder.has(founderId))
  ) {
    return 1
  }

  let changedRelationships = 0
  let relationships = 0
  for (let leftIndex = 0; leftIndex < founderIds.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < founderIds.length;
      rightIndex += 1
    ) {
      const leftFounderId = founderIds[leftIndex]!
      const rightFounderId = founderIds[rightIndex]!
      const togetherOnLeft =
        leftTableByFounder.get(leftFounderId) ===
        leftTableByFounder.get(rightFounderId)
      const togetherOnRight =
        rightTableByFounder.get(leftFounderId) ===
        rightTableByFounder.get(rightFounderId)
      if (togetherOnLeft !== togetherOnRight) {
        changedRelationships += 1
      }
      relationships += 1
    }
  }
  return relationships ? changedRelationships / relationships : 0
}

function locationRules(rules: readonly HardRule[]) {
  return rules.filter(
    (
      rule,
    ): rule is
      | Extract<HardRule, { type: 'pinned-table' }>
      | Extract<HardRule, { type: 'pinned-seat' }> =>
      rule.type === 'pinned-table' || rule.type === 'pinned-seat',
  )
}

function founderGroups(request: DinnerRequest): FounderGroup[] {
  const unionFind = new UnionFind()
  request.founders.forEach((founder) => unionFind.add(founder.id))
  for (const rule of request.rules ?? []) {
    if (rule.type !== 'must-sit-together') {
      continue
    }
    const [first, ...rest] = rule.founderIds
    if (first) {
      rest.forEach((founderId) => unionFind.union(first, founderId))
    }
  }

  const lockedFounderIds = new Set([
    ...(request.locks ?? []).map((lock) => lock.founderId),
    ...locationRules(request.rules ?? []).map((rule) => rule.founderId),
  ])
  const grouped = new Map<string, string[]>()
  for (const founder of request.founders) {
    const root = unionFind.find(founder.id)
    grouped.set(root, [...(grouped.get(root) ?? []), founder.id])
  }
  return [...grouped.values()]
    .map((founderIds) => {
      const sortedIds = [...founderIds].sort()
      return {
        id: sortedIds[0]!,
        founderIds: sortedIds,
        locked: sortedIds.some((founderId) => lockedFounderIds.has(founderId)),
      }
    })
    .sort((left, right) => left.id.localeCompare(right.id))
}

function assignmentFromSolution(solution: DinnerSolution) {
  return solution.tables.map((table) => [...table.founderIds])
}

function groupTableIndex(
  assignment: readonly (readonly string[])[],
  group: FounderGroup,
) {
  return assignment.findIndex((table) => table.includes(group.founderIds[0]!))
}

function swapGroups(
  assignment: readonly (readonly string[])[],
  left: FounderGroup,
  right: FounderGroup,
) {
  const leftTableIndex = groupTableIndex(assignment, left)
  const rightTableIndex = groupTableIndex(assignment, right)
  if (leftTableIndex === rightTableIndex || leftTableIndex < 0 || rightTableIndex < 0) {
    return undefined
  }
  return assignment.map((table, tableIndex) => {
    if (tableIndex === leftTableIndex) {
      return [
        ...table.filter((founderId) => !left.founderIds.includes(founderId)),
        ...right.founderIds,
      ].sort()
    }
    if (tableIndex === rightTableIndex) {
      return [
        ...table.filter((founderId) => !right.founderIds.includes(founderId)),
        ...left.founderIds,
      ].sort()
    }
    return table
  })
}

function minimumDifference(
  solution: DinnerSolution,
  references: readonly DinnerSolution[],
) {
  return Math.min(
    ...references.map((reference) => structuralDifference(reference, solution)),
  )
}

function tablePairs(tableCount: number, seed: number) {
  const indexes = Array.from({ length: tableCount }, (_, index) => index)
  if (seed % 2 === 1) {
    indexes.push(indexes.shift()!)
  }
  const pairs: Array<readonly [number, number]> = []
  for (let index = 0; index + 1 < indexes.length; index += 2) {
    pairs.push([indexes[index]!, indexes[index + 1]!])
  }
  if (indexes.length % 2 === 1 && tableCount > 2) {
    pairs.push([indexes[indexes.length - 1]!, indexes[0]!])
  }
  return pairs
}

function tryEvaluate(
  request: DinnerRequest,
  assignment: readonly (readonly string[])[],
) {
  try {
    return evaluateDinnerAssignment(request, assignment)
  } catch (error) {
    if (error instanceof DinnerConflictError) {
      return undefined
    }
    throw error
  }
}

function buildAlternative(
  request: DinnerRequest,
  base: DinnerSolution,
  priorAlternatives: readonly DinnerSolution[],
  seed: number,
) {
  const groups = founderGroups(request).filter((group) => !group.locked)
  const references = [base, ...priorAlternatives]
  let current = base
  let assignment: readonly (readonly string[])[] = assignmentFromSolution(base)
  let currentDifference = minimumDifference(current, references)
  let attempts = 0
  const usedGroups = new Set<string>()
  const pairs = tablePairs(request.tableCount, seed)

  while (
    currentDifference < ALTERNATIVE_STRUCTURAL_DIFFERENCE &&
    attempts < MAX_ALTERNATIVE_SWAP_ATTEMPTS
  ) {
    let accepted = false
    for (const [leftTableIndex, rightTableIndex] of pairs) {
      const leftGroups = groups.filter(
        (group) =>
          !usedGroups.has(group.id) &&
          groupTableIndex(assignment, group) === leftTableIndex,
      )
      const rightGroups = groups.filter(
        (group) =>
          !usedGroups.has(group.id) &&
          groupTableIndex(assignment, group) === rightTableIndex,
      )
      const candidates = leftGroups.flatMap((left) =>
        rightGroups
          .filter((right) => right.founderIds.length === left.founderIds.length)
          .map((right) => ({ left, right })),
      )
      const offset = candidates.length ? seed % candidates.length : 0
      const orderedCandidates = [
        ...candidates.slice(offset),
        ...candidates.slice(0, offset),
      ]
      for (const candidate of orderedCandidates) {
        attempts += 1
        const swapped = swapGroups(assignment, candidate.left, candidate.right)
        if (!swapped) {
          continue
        }
        const evaluated = tryEvaluate(request, swapped)
        if (!evaluated) {
          continue
        }
        const difference = minimumDifference(evaluated, references)
        if (difference > currentDifference + 1e-12) {
          assignment = swapped
          current = evaluated
          currentDifference = difference
          usedGroups.add(candidate.left.id)
          usedGroups.add(candidate.right.id)
          accepted = true
          break
        }
      }
      if (
        accepted &&
        currentDifference >= ALTERNATIVE_STRUCTURAL_DIFFERENCE
      ) {
        break
      }
    }

    if (accepted) {
      continue
    }

    const fallbackCandidates = groups.flatMap((left, leftIndex) =>
      groups.slice(leftIndex + 1).flatMap((right) =>
        !usedGroups.has(left.id) &&
        !usedGroups.has(right.id) &&
        left.founderIds.length === right.founderIds.length &&
        groupTableIndex(assignment, left) !== groupTableIndex(assignment, right)
          ? [{ left, right }]
          : [],
      ),
    )
    let best:
      | {
          readonly assignment: readonly (readonly string[])[]
          readonly solution: DinnerSolution
          readonly difference: number
          readonly left: FounderGroup
          readonly right: FounderGroup
        }
      | undefined
    for (const candidate of fallbackCandidates) {
      if (attempts >= MAX_ALTERNATIVE_SWAP_ATTEMPTS) {
        break
      }
      attempts += 1
      const swapped = swapGroups(assignment, candidate.left, candidate.right)
      if (!swapped) {
        continue
      }
      const evaluated = tryEvaluate(request, swapped)
      if (!evaluated) {
        continue
      }
      const difference = minimumDifference(evaluated, references)
      if (
        difference > currentDifference + 1e-12 &&
        (!best || difference > best.difference + 1e-12)
      ) {
        best = {
          assignment: swapped,
          solution: evaluated,
          difference,
          left: candidate.left,
          right: candidate.right,
        }
      }
    }
    if (!best) {
      break
    }
    assignment = best.assignment.map((table) => [...table])
    current = best.solution
    currentDifference = best.difference
    usedGroups.add(best.left.id)
    usedGroups.add(best.right.id)
  }

  if (currentDifference < ALTERNATIVE_STRUCTURAL_DIFFERENCE) {
    throw new DinnerConflictError([
      {
        ruleIds: ['alternative-structural-difference'],
        founderIds: request.founders.map((founder) => founder.id).sort(),
        message:
          `Could not produce an alternative with structural difference ` +
          `${ALTERNATIVE_STRUCTURAL_DIFFERENCE} within ${MAX_ALTERNATIVE_SWAP_ATTEMPTS} deterministic swap attempts`,
      },
    ])
  }
  return current
}

export function generateAlternatives(
  request: DinnerRequest,
  count: number,
): DinnerSolution[] {
  if (count !== 2) {
    throw new Error('Dinner matching produces exactly two alternatives')
  }
  const base = optimizeDinner(request)
  const alternatives: DinnerSolution[] = []
  for (let seed = 0; seed < 2; seed += 1) {
    alternatives.push(buildAlternative(request, base, alternatives, seed))
  }
  return alternatives
}
