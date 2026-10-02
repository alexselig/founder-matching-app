import { generateAlternatives } from './alternatives'
import { assignmentOf, swapAssignment } from './dinnerState'
import {
  compareDinnerMetrics,
  evaluatePreparedDinnerAssignment,
  optimizeDinner,
  prepareDinnerRequest,
  type DinnerRequest,
  type DinnerSolution,
} from './optimizer'

export type DinnerAssignment = readonly (readonly string[])[]

/**
 * Async boundary around the Task 6 optimizer so the workbench can be driven by
 * a worker, a server, or a test double without changing the UI.
 */
export interface DinnerEngine {
  optimize(request: DinnerRequest): Promise<DinnerSolution>
  evaluate(request: DinnerRequest, assignment: DinnerAssignment): Promise<DinnerSolution>
  improveFounder(request: DinnerRequest, solution: DinnerSolution, founderId: string): Promise<DinnerSolution | null>
  rebalanceTable(request: DinnerRequest, solution: DinnerSolution, tableIndex: number): Promise<DinnerSolution | null>
  alternatives(request: DinnerRequest, base: DinnerSolution): Promise<readonly DinnerSolution[]>
}

function deferred<T>(work: () => T): Promise<T> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        resolve(work())
      } catch (error) {
        reject(error)
      }
    }, 0)
  })
}

interface SwapCandidate {
  readonly solution: DinnerSolution
  readonly score: number
}

function swapCandidates(
  request: DinnerRequest,
  solution: DinnerSolution,
  movers: readonly string[],
  score: (candidate: DinnerSolution) => number,
): SwapCandidate[] {
  const prepared = prepareDinnerRequest(request)
  const assignment = assignmentOf(solution)
  const locked = new Set((request.locks ?? []).map((lock) => lock.founderId))
  const tableOf = new Map(assignment.flatMap((table, index) => table.map((id) => [id, index] as const)))
  const candidates: SwapCandidate[] = []
  for (const mover of movers) {
    if (locked.has(mover)) continue
    const home = tableOf.get(mover)
    if (home === undefined) continue
    assignment.forEach((table, index) => {
      if (index === home) return
      for (const other of table) {
        if (locked.has(other)) continue
        let candidate: DinnerSolution
        try {
          candidate = evaluatePreparedDinnerAssignment(prepared, swapAssignment(assignment, mover, other))
        } catch {
          continue
        }
        candidates.push({ solution: candidate, score: score(candidate) })
      }
    })
  }
  return candidates
}

function minimumFit(solution: DinnerSolution) {
  return solution.metrics.founderFitVector[0] ?? 0
}

function fitOf(solution: DinnerSolution, founderId: string) {
  for (const table of solution.tables) {
    const fit = table.founderFits[founderId]
    if (fit !== undefined) return fit
  }
  return 0
}

function pickBest(candidates: readonly SwapCandidate[], current: number, floor: number) {
  let best: SwapCandidate | null = null
  for (const candidate of candidates) {
    if (candidate.score <= current + 1e-9) continue
    if (minimumFit(candidate.solution) + 1e-9 < floor) continue
    if (
      !best ||
      candidate.score > best.score + 1e-9 ||
      (Math.abs(candidate.score - best.score) <= 1e-9 && compareDinnerMetrics(candidate.solution.metrics, best.solution.metrics) > 0)
    ) {
      best = candidate
    }
  }
  return best?.solution ?? null
}

/** Moves one founder to the cross-table seat that most raises their own fit without lowering the room's floor. */
export function findFounderSwap(request: DinnerRequest, solution: DinnerSolution, founderId: string) {
  const candidates = swapCandidates(request, solution, [founderId], (candidate) => fitOf(candidate, founderId))
  return pickBest(candidates, fitOf(solution, founderId), minimumFit(solution))
}

function roleSpread(request: DinnerRequest, solution: DinnerSolution, tableIndex: number) {
  const roles = new Map(request.founders.map((founder) => [founder.id, founder.role]))
  const table = solution.tables.find((item) => item.index === tableIndex)
  return new Set((table?.founderIds ?? []).map((id) => roles.get(id))).size
}

/** Swaps one founder out of a table so it gains role coverage, keeping the room's minimum fit intact. */
export function findRebalanceSwap(request: DinnerRequest, solution: DinnerSolution, tableIndex: number) {
  const table = solution.tables.find((item) => item.index === tableIndex)
  if (!table) return null
  const score = (candidate: DinnerSolution) =>
    roleSpread(request, candidate, tableIndex) + (candidate.tables[tableIndex]?.quality ?? 0) / 100
  const candidates = swapCandidates(request, solution, table.founderIds, score)
  const best = pickBest(candidates, score(solution), minimumFit(solution))
  return best && roleSpread(request, best, tableIndex) > roleSpread(request, solution, tableIndex) ? best : null
}

export const defaultDinnerEngine: DinnerEngine = {
  optimize: (request) => deferred(() => optimizeDinner(request)),
  evaluate: (request, assignment) => deferred(() => evaluatePreparedDinnerAssignment(prepareDinnerRequest(request), assignment)),
  improveFounder: (request, solution, founderId) => deferred(() => findFounderSwap(request, solution, founderId)),
  rebalanceTable: (request, solution, tableIndex) => deferred(() => findRebalanceSwap(request, solution, tableIndex)),
  alternatives: (request, base) => deferred(() => generateAlternatives(request, 2, base)),
}
