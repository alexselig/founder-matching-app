import type { Founder } from '../../shared/founder'
import { buildDinnerView, objectivePerformance, percent, tableNumber, type RuleDraft } from './dinnerState'
import type { DinnerSolution } from './optimizer'
import type { RuleConflict } from './rules'

const NUMBER_WORDS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty',
]

export function numberWord(value: number, capitalize = true) {
  const word = NUMBER_WORDS[value]
  if (!word) return String(value)
  return capitalize ? word[0]!.toUpperCase() + word.slice(1) : word
}

export function fitAssignmentToCapacities(
  assignment: readonly (readonly string[])[],
  tableCapacities: readonly number[],
): string[][] {
  const tables = tableCapacities.map((_, index) => [...(assignment[index] ?? [])])
  const overflow = assignment.slice(tableCapacities.length).flat()
  tables.forEach((table, index) => {
    const capacity = tableCapacities[index]!
    if (table.length > capacity) overflow.push(...table.splice(capacity))
  })
  tables.forEach((table, index) => {
    while (table.length < tableCapacities[index]! && overflow.length) table.push(overflow.shift()!)
  })
  return tables
}

export function balanceLabel(tableCapacities: readonly number[]) {
  if (tableCapacities.length <= 6) return tableCapacities.join(' / ')
  const groups: { size: number; count: number }[] = []
  for (const size of tableCapacities) {
    const last = groups.at(-1)
    if (last && last.size === size) last.count += 1
    else groups.push({ size, count: 1 })
  }
  return groups.map((group) => (group.count > 1 ? `${group.count} × ${group.size}` : String(group.size))).join(' / ')
}

export interface ConflictOption {
  readonly label: string
  readonly note: string
  readonly removeRuleIds: readonly string[]
  readonly removeRuleId: string
}

export interface ConflictView {
  readonly index: string
  readonly numbers: readonly string[]
  readonly ruleIds: readonly string[]
  readonly headline: string
  readonly detail: string
  readonly subject: string
  readonly options: readonly ConflictOption[]
  readonly edit: { readonly ruleId: string; readonly label: string } | null
  readonly rows: readonly { readonly id: string; readonly number: string; readonly text: string; readonly status: string; readonly conflict: boolean }[]
}

function listJoin(values: readonly string[]) {
  if (values.length <= 1) return values.join('')
  if (values.length === 2) return `${values[0]} and ${values[1]}`
  return `${values.slice(0, -1).join(', ')}, and ${values.at(-1)}`
}

export function describeConflict(conflict: RuleConflict, rules: readonly RuleDraft[], founders: readonly Founder[]): ConflictView {
  const numberOf = (id: string) => {
    const position = rules.findIndex((rule) => rule.id === id)
    return position >= 0 ? tableNumber(position) : id
  }
  const ruleIds = [...conflict.ruleIds].sort((left, right) => {
    const a = rules.findIndex((rule) => rule.id === left)
    const b = rules.findIndex((rule) => rule.id === right)
    return a - b
  })
  const numbers = ruleIds.map(numberOf)
  const names = conflict.founderIds.map((id) => founders.find((founder) => founder.id === id)?.name ?? id)
  const drafts = ruleIds.map((id) => rules.find((rule) => rule.id === id))
  const types = new Set(drafts.map((draft) => draft?.input.type))
  const togetherApart = ruleIds.length === 2 && types.has('must-sit-together') && types.has('cannot-sit-together') && names.length >= 2

  let headline: string
  if (togetherApart) headline = `${names[0]} and ${names[1]} must sit together and apart.`
  else if (ruleIds.length === 1) headline = `Rule ${numbers[0]} cannot be satisfied with this cohort.`
  else if (ruleIds.length === 2) headline = `Rules ${numbers[0]} and ${numbers[1]} cannot both be true.`
  else headline = `Rules ${listJoin(numbers)} cannot all be true.`

  const detail = togetherApart
    ? 'Together at one table / never at the same table'
    : drafts.map((draft) => draft?.text ?? conflict.message).join(' / ')
  const subject = names.length ? names.join(' + ') : conflict.message

  const keepNote = (draft: RuleDraft | undefined, number: string) => {
    if (draft?.input.type === 'must-sit-together' && names.length >= 2) return `${names[0]} and ${names[1]} will be assigned together.`
    if (draft?.input.type === 'cannot-sit-together' && names.length >= 2) return `${names[0]} and ${names[1]} will be assigned separately.`
    return `Rule ${number} stays active; everything else is unchanged.`
  }

  const options: ConflictOption[] =
    ruleIds.length === 2
      ? ruleIds.map((_keepId, position) => {
          const removeId = ruleIds[1 - position]!
          return {
            label: `Keep rule ${numbers[position]} · remove rule ${numbers[1 - position]}`,
            note: keepNote(drafts[position], numbers[position]!),
            removeRuleIds: [removeId],
            removeRuleId: removeId,
          }
        })
      : ruleIds.map((id, position) => ({
          label: `Remove rule ${numbers[position]}`,
          note: `Only rule ${numbers[position]} changes; the cohort, criteria, and table setup stay as entered.`,
          removeRuleIds: [id],
          removeRuleId: id,
        }))

  const editId = ruleIds.at(-1)
  const edit = editId && rules.some((rule) => rule.id === editId) ? { ruleId: editId, label: `Edit rule ${numberOf(editId)}` } : null

  const rows = rules.map((rule, position) => {
    const inConflict = ruleIds.includes(rule.id)
    const others = numbers.filter((number) => number !== tableNumber(position))
    return {
      id: rule.id,
      number: tableNumber(position),
      text: rule.text,
      status: !inConflict ? 'Compatible' : others.length ? `Conflicts with ${others.join(', ')}` : 'Cannot be satisfied',
      conflict: inConflict,
    }
  })

  return { index: numbers.join('↔'), numbers, ruleIds, headline, detail, subject, options, edit, rows }
}

export interface SolutionSummary {
  readonly overall: number
  readonly minimum: number
  readonly watchCount: number
  readonly objectives: readonly { label: string; score: number }[]
}

export function solutionSummary(solution: DinnerSolution, founders: readonly Founder[], threshold: number): SolutionSummary {
  const byId = new Map(founders.map((founder) => [founder.id, founder]))
  const view = buildDinnerView(solution, byId, threshold)
  return {
    overall: view.overall,
    minimum: view.minimum,
    watchCount: view.watchCount,
    objectives: objectivePerformance(solution, founders),
  }
}

export interface Tradeoff {
  readonly kind: '' | 'gain' | 'cost'
  readonly text: string
}

export interface AlternativeComparison {
  readonly title: string
  readonly description: string
  readonly summary: SolutionSummary
  readonly deltas: readonly { label: string; score: number; delta: number; direction: 'up' | 'down' | 'neutral'; text: string }[]
  readonly moved: number
  readonly changes: readonly { tables: string; text: string }[]
  readonly tradeoffs: readonly Tradeoff[]
}

function signed(value: number) {
  if (value === 0) return '—'
  return value > 0 ? `+${value}` : `−${Math.abs(value)}`
}

function tableOf(solution: DinnerSolution) {
  const map = new Map<string, number>()
  for (const table of solution.tables) for (const id of table.founderIds) map.set(id, table.index)
  return map
}

function fitOf(solution: DinnerSolution) {
  const map = new Map<string, number>()
  for (const table of solution.tables) for (const id of table.founderIds) map.set(id, percent(table.founderFits[id] ?? 0))
  return map
}

export function compareAlternative(
  base: DinnerSolution,
  alternative: DinnerSolution,
  founders: readonly Founder[],
  foundersById: ReadonlyMap<string, Founder>,
  threshold: number,
): AlternativeComparison {
  const baseSummary = solutionSummary(base, founders, threshold)
  const summary = solutionSummary(alternative, founders, threshold)
  const deltas = summary.objectives.map((objective, position) => {
    const delta = objective.score - (baseSummary.objectives[position]?.score ?? objective.score)
    return {
      label: objective.label,
      score: objective.score,
      delta,
      direction: delta > 0 ? ('up' as const) : delta < 0 ? ('down' as const) : ('neutral' as const),
      text: signed(delta),
    }
  })

  const baseTables = tableOf(base)
  const altTables = tableOf(alternative)
  const baseFits = fitOf(base)
  const altFits = fitOf(alternative)
  const movedIds = [...altTables].filter(([id, table]) => baseTables.get(id) !== table).map(([id]) => id)
  const pairs = new Map<string, string[]>()
  for (const id of movedIds) {
    const from = baseTables.get(id) ?? 0
    const to = altTables.get(id) ?? 0
    const key = [from, to].sort((left, right) => left - right).map(tableNumber).join(' ↔ ')
    pairs.set(key, [...(pairs.get(key) ?? []), id])
  }
  const changes = [...pairs]
    .sort((left, right) => right[1].length - left[1].length || left[0].localeCompare(right[0]))
    .slice(0, 3)
    .map(([tables, ids]) => {
      const lead = [...ids].sort(
        (left, right) =>
          Math.abs((altFits.get(right) ?? 0) - (baseFits.get(right) ?? 0)) -
          Math.abs((altFits.get(left) ?? 0) - (baseFits.get(left) ?? 0)),
      )[0]!
      const name = foundersById.get(lead)?.name ?? lead
      const extra = ids.length > 1 ? ` · ${ids.length} founders move` : ''
      return {
        tables,
        text: `${name} moves to Table ${tableNumber(altTables.get(lead) ?? 0)} · fit ${baseFits.get(lead) ?? 0} → ${altFits.get(lead) ?? 0}${extra}`,
      }
    })

  const criteriaDeltas = deltas.filter((delta) => delta.label !== 'Table balance')
  const bestSimilarity = criteriaDeltas.filter((delta) => delta.label.endsWith('similarity')).sort((a, b) => b.delta - a.delta)[0]
  const bestDiversity = criteriaDeltas.filter((delta) => delta.label.endsWith('diversity')).sort((a, b) => b.delta - a.delta)[0]
  const minimumDelta = summary.minimum - baseSummary.minimum
  let title = 'Different arrangement'
  let description = 'A structurally different arrangement with comparable overall quality.'
  if (minimumDelta > 0) {
    title = 'Safer floor'
    description = 'Raises the weakest placements with a more even table mix.'
  } else if (bestSimilarity && bestSimilarity.delta > 0 && bestSimilarity.delta >= (bestDiversity?.delta ?? 0)) {
    title = 'Shared context'
    description = 'Strengthens shared context at each table while keeping every hard rule.'
  } else if (bestDiversity && bestDiversity.delta > 0) {
    title = 'Broader mix'
    description = 'Widens the perspectives represented at each table.'
  }

  const tradeoffs: Tradeoff[] = []
  const cleared = baseSummary.watchCount - summary.watchCount
  if (minimumDelta > 0) {
    tradeoffs.push({
      kind: 'gain',
      text: `Minimum fit rises ${minimumDelta} point${minimumDelta === 1 ? '' : 's'}${cleared > 0 ? ` and ${cleared} watch placement${cleared === 1 ? '' : 's'} clear` : ''}.`,
    })
  } else if (minimumDelta < 0) {
    tradeoffs.push({ kind: 'cost', text: `Minimum fit falls ${Math.abs(minimumDelta)} point${minimumDelta === -1 ? '' : 's'}.` })
  }
  const bestGain = [...deltas].sort((a, b) => b.delta - a.delta)[0]
  if (bestGain && bestGain.delta > 0) tradeoffs.push({ kind: 'gain', text: `${bestGain.label} rises ${bestGain.delta} point${bestGain.delta === 1 ? '' : 's'}.` })
  const worstLoss = [...deltas].sort((a, b) => a.delta - b.delta)[0]
  const moveText = `${movedIds.length} of ${founders.length} founders move`
  tradeoffs.push(
    worstLoss && worstLoss.delta < 0
      ? { kind: 'cost', text: `${worstLoss.label} falls ${Math.abs(worstLoss.delta)} point${worstLoss.delta === -1 ? '' : 's'}; ${moveText}.` }
      : { kind: '', text: `${moveText}; no objective falls.` },
  )

  return { title, description, summary, deltas, moved: movedIds.length, changes, tradeoffs: tradeoffs.slice(-3) }
}

export function baselineTradeoffs(
  base: DinnerSolution,
  alternatives: readonly DinnerSolution[],
  founders: readonly Founder[],
  threshold: number,
): Tradeoff[] {
  const summary = solutionSummary(base, founders, threshold)
  const others = alternatives.map((alternative) => solutionSummary(alternative, founders, threshold))
  const notes: Tradeoff[] = []
  if (others.every((other) => summary.overall >= other.overall)) notes.push({ kind: '', text: 'Highest overall quality across the generated set.' })
  const strongest = summary.objectives
    .filter((objective, position) => others.every((other) => objective.score >= (other.objectives[position]?.score ?? 0)))
    .sort((a, b) => b.score - a.score)[0]
  if (strongest) notes.push({ kind: 'gain', text: `Strongest ${strongest.label.toLowerCase()} of the compared solutions.` })
  if (summary.watchCount > 0) {
    notes.push({
      kind: 'cost',
      text: `${numberWord(summary.watchCount)} founder${summary.watchCount === 1 ? '' : 's'} remain${summary.watchCount === 1 ? 's' : ''} below the ${threshold} threshold.`,
    })
  } else {
    notes.push({ kind: 'gain', text: `Every founder clears the ${threshold} threshold.` })
  }
  return notes.slice(0, 3)
}
