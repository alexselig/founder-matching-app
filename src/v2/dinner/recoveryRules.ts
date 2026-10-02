import type { MissingDecision, MissingSeat, RecoveryState } from './DinnerRecovery'
import { fitAssignmentToCapacities } from './dinnerInsights'
import { capacities } from './optimizer'

type Assignment = readonly (readonly string[])[]

/** A recovery screen can resume only after the organizer has made its required choice. */
export function recoveryResolved(state: RecoveryState) {
  switch (state.kind) {
    case 'capacity':
      return state.choice !== null
    case 'conflict':
      return state.removedRuleId !== null
    case 'provider':
      return state.choice === 'basic' || state.choice === 'switch'
    case 'missing':
      return state.choice !== null
  }
}

function decisionAt(decisions: readonly MissingDecision[], tableIndex: number, seatIndex: number) {
  return decisions.find((decision) => decision.tableIndex === tableIndex && decision.seatIndex === seatIndex)
}

/** Saved seats with each decided replacement applied; removed seats stay in place so seat indices remain stable. */
export function replacedAssignment(assignment: Assignment, decisions: readonly MissingDecision[]): string[][] {
  return assignment.map((table, tableIndex) =>
    table.map((founderId, seatIndex) => {
      const choice = decisionAt(decisions, tableIndex, seatIndex)?.choice
      return choice?.kind === 'replace' ? choice.founderId : founderId
    }),
  )
}

/** Seats whose founder is not loaded and that have no explicit decision yet, in table and seat order. */
export function pendingMissingSeats(
  assignment: Assignment,
  decisions: readonly MissingDecision[],
  known: ReadonlyMap<string, unknown>,
): MissingSeat[] {
  return assignment.flatMap((table, tableIndex) =>
    table.flatMap((founderId, seatIndex) =>
      known.has(founderId) || decisionAt(decisions, tableIndex, seatIndex) ? [] : [{ founderId, tableIndex, seatIndex }],
    ),
  )
}

/** Applies every seat decision; tables rebalance only when a removal leaves them off the balanced capacities. */
export function recoveredAssignment(assignment: Assignment, decisions: readonly MissingDecision[]): string[][] {
  const replaced = replacedAssignment(assignment, decisions)
  const kept = replaced.map((table, tableIndex) =>
    table.filter((_, seatIndex) => decisionAt(decisions, tableIndex, seatIndex)?.choice.kind !== 'short'),
  )
  const count = kept.flat().length
  return count === replaced.flat().length ? kept : fitAssignmentToCapacities(kept, capacities(count, kept.length))
}

/** The saved cohort order with replaced founders swapped in place and removed founders dropped. */
export function recoveredCohortIds(
  founderIds: readonly string[],
  decisions: readonly MissingDecision[],
  known: ReadonlyMap<string, unknown>,
): string[] {
  const replacements = new Map(decisions.flatMap((decision) => (decision.choice.kind === 'replace' ? [[decision.founderId, decision.choice.founderId] as const] : [])))
  const removed = new Set(decisions.filter((decision) => decision.choice.kind === 'short').map((decision) => decision.founderId))
  const ids = founderIds.flatMap((founderId) => (removed.has(founderId) ? [] : [replacements.get(founderId) ?? founderId]))
  return [...new Set(ids.filter((founderId) => known.has(founderId)))]
}
