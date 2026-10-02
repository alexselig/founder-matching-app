import type { Founder } from '../../shared/founder'
import type { FounderFieldKey } from '../../shared/schemaRegistry'
import { compileCriteria, type CriterionObjective, type CriterionWeightLevel } from './criteria'
import { capacities, type DinnerLock, type DinnerRequest, type DinnerSolution } from './optimizer'
import { compileHardRules, type HardRuleInput, type RuleConflict } from './rules'
import { scoreCriterionValues } from './scoring'

export interface CriterionDraft {
  readonly field: FounderFieldKey
  readonly label: string
  readonly description: string
  readonly objective: CriterionObjective
  readonly weight: CriterionWeightLevel
}

export interface DinnerCohort {
  readonly id: string
  readonly label: string
  readonly hint: string
  readonly source: 'search' | 'saved' | 'all'
  readonly founderIds: readonly string[]
}

export interface DinnerCohortOption {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly founderIds: readonly string[]
}

export interface TableSetup {
  readonly tableCount: number
  readonly targetSeats: number
}

export interface RuleDraft {
  readonly id: string
  readonly text: string
  readonly input: HardRuleInput
}

export interface SetupSnapshot {
  readonly planName: string
  readonly cohort: DinnerCohort | null
  readonly tables: TableSetup | null
  readonly rules: readonly RuleDraft[]
}

export const MAX_TABLES = 100
export const MIN_SEATS = 2
export const MAX_SEATS = 12
export const DEFAULT_THRESHOLD = 70

export const DEFAULT_BRIEF =
  'Keep founders in similar industries so they share market context. Mix roles and ages at every table.'

export const BRIEF_STARTERS: readonly { label: string; text: string }[] = [
  { label: 'Shared context', text: 'Prioritize shared industries, but mix roles and ages at every table.' },
  { label: 'Maximum diversity', text: 'Create the most diverse tables possible across industry, role, age, and cohort.' },
  { label: 'Stage + industry', text: 'Group founders by similar company stage and industry, while mixing functional roles.' },
]

export const DEFAULT_CRITERIA: readonly CriterionDraft[] = [
  { field: 'companyVertical', label: 'Company vertical', description: 'Shared market context', objective: 'similarity', weight: 'H' },
  { field: 'role', label: 'Role', description: 'Cross-functional tables', objective: 'diversity', weight: 'H' },
  { field: 'age', label: 'Age', description: 'Broader perspectives', objective: 'diversity', weight: 'M' },
]

const DIMENSION_OPTIONS: readonly CriterionDraft[] = [
  { field: 'education', label: 'Education', description: 'Mix academic backgrounds', objective: 'diversity', weight: 'M' },
  { field: 'company', label: 'Company', description: 'Avoid over-concentration', objective: 'diversity', weight: 'M' },
  { field: 'cohortGroup', label: 'Cohort group', description: 'Mix founder cohorts', objective: 'diversity', weight: 'M' },
  { field: 'cohortSection', label: 'Cohort section', description: 'Broaden existing networks', objective: 'diversity', weight: 'M' },
]

const ALL_DIMENSIONS: readonly CriterionDraft[] = [...DEFAULT_CRITERIA, ...DIMENSION_OPTIONS]

export function objectiveLabel(objective: CriterionObjective) {
  return objective === 'similarity' ? 'Similar' : 'Diverse'
}

export function canAddDimension(criteria: readonly CriterionDraft[]) {
  return availableDimensions(criteria).length > 0
}

export function availableDimensions(criteria: readonly CriterionDraft[]) {
  const used = new Set(criteria.map((criterion) => criterion.field))
  return ALL_DIMENSIONS.filter((option) => !used.has(option.field))
}

export function addDimension(
  criteria: readonly CriterionDraft[],
  field: FounderFieldKey,
  weight: CriterionWeightLevel,
): readonly CriterionDraft[] {
  if (criteria.some((criterion) => criterion.field === field)) return criteria
  const dimension = ALL_DIMENSIONS.find((option) => option.field === field)
  return dimension ? [...criteria, { ...dimension, weight }] : criteria
}

export function removeDimension(criteria: readonly CriterionDraft[], field: FounderFieldKey) {
  return criteria.filter((criterion) => criterion.field !== field)
}

export function toggleObjective(criteria: readonly CriterionDraft[], field: FounderFieldKey) {
  return criteria.map((criterion) =>
    criterion.field === field
      ? { ...criterion, objective: criterion.objective === 'similarity' ? ('diversity' as const) : ('similarity' as const) }
      : criterion,
  )
}

export function setWeight(criteria: readonly CriterionDraft[], field: FounderFieldKey, weight: CriterionWeightLevel) {
  return criteria.map((criterion) => (criterion.field === field ? { ...criterion, weight } : criterion))
}

function plural(count: number, singular: string, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

export function founderCountLabel(count: number) {
  return plural(count, 'founder')
}

export function setupStage(setup: SetupSnapshot): 'name' | 'cohort' | 'tables' | 'ready' {
  if (!setup.planName.trim()) return 'name'
  if (!setup.cohort) return 'cohort'
  if (!setup.tables) return 'tables'
  return 'ready'
}

export interface ScopeCardCopy {
  readonly disabled: boolean
  readonly value: string
  readonly hint: string
  readonly action: 'Select' | 'Change' | 'Edit'
}

export function cohortCard(setup: SetupSnapshot): ScopeCardCopy {
  if (!setup.planName.trim()) {
    return {
      disabled: true,
      value: setup.cohort?.label ?? 'Select cohort',
      hint: setup.cohort?.hint ?? 'Name the seating plan first',
      action: setup.cohort ? 'Change' : 'Select',
    }
  }
  if (!setup.cohort) return { disabled: false, value: 'Select cohort', hint: 'Choose founders to include', action: 'Select' }
  return { disabled: false, value: setup.cohort.label, hint: setup.cohort.hint, action: 'Change' }
}

export function tablesCard(setup: SetupSnapshot): ScopeCardCopy {
  const value = setup.tables ? `${setup.tables.tableCount} × ${setup.tables.targetSeats}` : 'Select tables'
  if (!setup.planName.trim()) return { disabled: true, value, hint: 'Name the seating plan first', action: setup.tables ? 'Edit' : 'Select' }
  if (!setup.cohort) return { disabled: true, value, hint: 'Available after cohort', action: 'Select' }
  if (!setup.tables) return { disabled: false, value, hint: 'Choose tables and seats', action: 'Select' }
  return {
    disabled: false,
    value,
    hint: `${plural(setup.tables.tableCount, 'table')} × ${plural(setup.tables.targetSeats, 'target seat')}`,
    action: 'Edit',
  }
}

export function ruleCountLabel(count: number) {
  return `${plural(count, 'hard rule')} added`
}

export function summaryCopy(setup: SetupSnapshot) {
  const secondary = ruleCountLabel(setup.rules.length)
  switch (setupStage(setup)) {
    case 'name':
      return { primary: 'Name this seating plan to continue', secondary }
    case 'cohort':
      return { primary: 'Select a cohort to continue', secondary }
    case 'tables':
      return { primary: `${founderCountLabel(setup.cohort!.founderIds.length)} selected · Choose table setup`, secondary }
    case 'ready':
      return {
        primary: `${founderCountLabel(setup.cohort!.founderIds.length)} · ${plural(setup.tables!.tableCount, 'table')} · ${plural(setup.tables!.targetSeats, 'target seat')}`,
        secondary,
      }
  }
}

export interface CapacityNote {
  readonly kind: 'exact' | 'open' | 'over'
  readonly lead: string
  readonly text: string
  readonly capacity: number
  readonly delta: number
}

export function capacityNote(founderCount: number, setup: TableSetup): CapacityNote {
  const capacity = setup.tableCount * setup.targetSeats
  const delta = capacity - founderCount
  if (delta === 0) {
    return {
      kind: 'exact',
      lead: 'Exact fit.',
      text: `${plural(setup.tableCount, 'table')} × ${plural(setup.targetSeats, 'seat')} gives every founder a seat.`,
      capacity,
      delta,
    }
  }
  if (delta > 0) {
    return { kind: 'open', lead: `${plural(delta, 'open seat')}.`, text: 'The arrangement can leave capacity unfilled.', capacity, delta }
  }
  return { kind: 'over', lead: `${founderCountLabel(-delta)} over capacity.`, text: 'Increase tables or target seats.', capacity, delta }
}

export function clampTableSetup(founderCount: number, setup: TableSetup): TableSetup {
  const maxTables = Math.max(1, Math.min(MAX_TABLES, founderCount))
  return {
    tableCount: Math.max(1, Math.min(maxTables, setup.tableCount)),
    targetSeats: Math.max(MIN_SEATS, Math.min(MAX_SEATS, setup.targetSeats)),
  }
}

export interface TablePreset extends TableSetup {
  readonly title: string
  readonly primary: string
  readonly secondary: string
}

export function tablePresets(founderCount: number): TablePreset[] {
  const seen = new Set<string>()
  const presets: TablePreset[] = []
  ;[8, 10, 6].forEach((seats, index) => {
    const setup = clampTableSetup(founderCount, { tableCount: Math.ceil(founderCount / seats), targetSeats: seats })
    const key = `${setup.tableCount}x${setup.targetSeats}`
    if (seen.has(key)) return
    seen.add(key)
    const note = capacityNote(founderCount, setup)
    const primary =
      index === 2
        ? 'Smaller groups'
        : note.kind === 'open'
          ? plural(note.delta, 'open seat')
          : note.kind === 'over'
            ? `${-note.delta} over capacity`
            : 'Balanced'
    presets.push({
      ...setup,
      title: `${setup.tableCount} × ${setup.targetSeats}`,
      primary,
      secondary: note.kind === 'exact' ? `${note.capacity} seats` : `${note.capacity} capacity`,
    })
  })
  return presets
}

export function defaultTableSetup(founderCount: number): TableSetup {
  const preset = tablePresets(founderCount)[0]
  return preset ? { tableCount: preset.tableCount, targetSeats: preset.targetSeats } : { tableCount: 1, targetSeats: 8 }
}

export function capacityResolutions(founderCount: number, setup: TableSetup) {
  const tableCount = Math.max(1, Math.min(MAX_TABLES, founderCount, setup.tableCount))
  return {
    exact: {
      tableCount: Math.max(1, Math.min(MAX_TABLES, founderCount, Math.ceil(founderCount / setup.targetSeats))),
      targetSeats: setup.targetSeats,
    },
    balanced: {
      tableCount,
      targetSeats: Math.ceil(founderCount / tableCount),
      capacities: capacities(founderCount, tableCount),
    },
  }
}

export const RULE_SUGGESTIONS: readonly { label: string; text: string }[] = [
  { label: 'Separate same-company founders', text: 'Separate founders from the same company' },
  { label: 'Engineering at every table', text: 'Seat at least one engineering founder at every table' },
  { label: 'Separate direct competitors', text: 'Keep direct competitors at different tables' },
]

type RuleInputBody = HardRuleInput extends infer Rule ? (Rule extends HardRuleInput ? Omit<Rule, 'id'> : never) : never

export type RuleParse =
  | { readonly status: 'empty' }
  | { readonly status: 'ready'; readonly input: RuleInputBody; readonly description: string }
  | { readonly status: 'ambiguous'; readonly name: string; readonly candidates: readonly Founder[]; readonly description: string }
  | { readonly status: 'unsupported'; readonly message: string }

const ROLE_WORDS: readonly [RegExp, string][] = [
  [/\bengineer(?:ing|s)?\b/i, 'Engineering'],
  [/\bsales\b/i, 'Sales'],
  [/\bdesign(?:ers?)?\b/i, 'Design'],
]

const COUNT_WORDS: Readonly<Record<string, number>> = { one: 1, two: 2, three: 3, four: 4, five: 5 }

function parseCount(token: string) {
  return COUNT_WORDS[token.toLowerCase()] ?? Number(token)
}

function articleFor(word: string) {
  return /^[aeiou]/i.test(word) ? 'an' : 'a'
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

export function founderLabel(founder: Founder) {
  return `${founder.name} · ${founder.company}`
}

type NameMatch =
  | { kind: 'found'; founder: Founder }
  | { kind: 'ambiguous'; name: string; candidates: Founder[] }
  | { kind: 'missing'; name: string }

function matchFounder(reference: string, founders: readonly Founder[], resolutions: Readonly<Record<string, string>>): NameMatch {
  const [namePart = '', companyPart] = reference.split('·').map((part) => part.trim())
  const key = normalizeName(namePart)
  let candidates = founders.filter((founder) => normalizeName(founder.name) === key)
  if (companyPart) candidates = candidates.filter((founder) => normalizeName(founder.company) === normalizeName(companyPart))
  if (candidates.length === 0) return { kind: 'missing', name: namePart }
  if (candidates.length === 1) return { kind: 'found', founder: candidates[0]! }
  const resolved = candidates.find((founder) => founder.id === resolutions[key])
  return resolved ? { kind: 'found', founder: resolved } : { kind: 'ambiguous', name: candidates[0]!.name, candidates }
}

const PAIR_PATTERNS: readonly [RegExp, 'must-sit-together' | 'cannot-sit-together'][] = [
  [/^(?:keep|seat|put)\s+(.+?)\s+and\s+(.+?)\s+(?:at different tables|apart|separated?)$/i, 'cannot-sit-together'],
  [/^(.+?)\s+and\s+(.+?)\s+(?:cannot|can't|must not|should not|never)\s+sit together$/i, 'cannot-sit-together'],
  [/^separate\s+(.+?)\s+(?:and|from)\s+(.+?)$/i, 'cannot-sit-together'],
  [/^(?:keep|seat|put)\s+(.+?)\s+and\s+(.+?)\s+(?:together|at the same table)$/i, 'must-sit-together'],
  [/^(.+?)\s+and\s+(.+?)\s+must sit together$/i, 'must-sit-together'],
]

function pairDescription(type: 'must-sit-together' | 'cannot-sit-together', left: string, right: string) {
  return type === 'must-sit-together' ? `Keep ${left} and ${right} together` : `Keep ${left} and ${right} at different tables`
}

export function parseRuleText(
  text: string,
  founders: readonly Founder[],
  resolutions: Readonly<Record<string, string>> = {},
): RuleParse {
  const value = text.trim().replace(/\s+/g, ' ').replace(/\.$/, '')
  if (!value) return { status: 'empty' }

  if (/same[- ]company/i.test(value)) {
    return { status: 'ready', input: { type: 'same-company-separation' }, description: 'Separate founders from the same company' }
  }

  if (/competitor/i.test(value)) {
    return { status: 'unsupported', message: 'This rule needs AI interpretation before it can be enforced.' }
  }

  const role = ROLE_WORDS.find(([pattern]) => pattern.test(value))?.[1]
  if (role) {
    const most = value.match(/\b(?:at most|no more than|max(?:imum)?(?: of)?)\s+(\d+|one|two|three|four|five)\b/i)
    if (most) {
      const max = parseCount(most[1]!)
      return {
        status: 'ready',
        input: { type: 'field-count', field: 'role', value: role, max },
        description: `No table has more than ${plural(max, `${role} founder`)}`,
      }
    }
    if (/\b(?:every|each|per)\s+table\b/i.test(value)) {
      const least = value.match(/\bat least\s+(\d+|one|two|three|four|five)\b/i)
      const min = least ? parseCount(least[1]!) : 1
      return {
        status: 'ready',
        input: { type: 'field-count', field: 'role', value: role, min },
        description:
          min === 1
            ? `Every table includes ${articleFor(role)} ${role} founder`
            : `Every table includes at least ${min} ${role} founders`,
      }
    }
  }

  for (const [pattern, type] of PAIR_PATTERNS) {
    const match = value.match(pattern)
    if (!match) continue
    const left = matchFounder(match[1]!, founders, resolutions)
    const right = matchFounder(match[2]!, founders, resolutions)
    for (const side of [left, right]) {
      if (side.kind === 'missing') {
        return { status: 'unsupported', message: `No founder named “${side.name}” is in this cohort.` }
      }
    }
    const ambiguous = [left, right].find((side): side is Extract<NameMatch, { kind: 'ambiguous' }> => side.kind === 'ambiguous')
    const leftText = left.kind === 'found' ? founderLabel(left.founder) : match[1]!
    const rightText = right.kind === 'found' ? founderLabel(right.founder) : match[2]!
    if (ambiguous) {
      return {
        status: 'ambiguous',
        name: ambiguous.name,
        candidates: ambiguous.candidates,
        description: pairDescription(type, leftText, rightText),
      }
    }
    const pair = [left, right] as { kind: 'found'; founder: Founder }[]
    return {
      status: 'ready',
      input: { type, founders: pair.map((side) => ({ id: side.founder.id })) },
      description: pairDescription(type, leftText, rightText),
    }
  }

  return {
    status: 'unsupported',
    message: 'Try same-company separation, a role at every table, or two named founders together or apart.',
  }
}

function founderReferenceLabel(reference: { id?: string; name?: string }, founders: readonly Founder[]) {
  const founder = founders.find((item) => item.id === reference.id)
  return founder ? founderLabel(founder) : (reference.name ?? reference.id ?? 'Unknown founder')
}

export function describeRule(input: HardRuleInput, founders: readonly Founder[]): string {
  switch (input.type) {
    case 'same-company-separation':
      return 'Separate founders from the same company'
    case 'field-count': {
      const value = String(input.value ?? '')
      if (input.min !== undefined && input.min > 0) {
        return input.min === 1
          ? `Every table includes ${articleFor(value)} ${value} founder`
          : `Every table includes at least ${input.min} ${value} founders`
      }
      return `No table has more than ${plural(input.max ?? 0, `${value} founder`)}`
    }
    case 'must-sit-together':
    case 'cannot-sit-together': {
      const [left, right] = input.founders.map((reference) => founderReferenceLabel(reference, founders))
      return pairDescription(input.type, left ?? '', right ?? '')
    }
    case 'fixed-table-size':
      return `Every table seats exactly ${input.size}`
    case 'pinned-table':
      return `Seat ${founderReferenceLabel(input.founder, founders)} at Table ${tableNumber(input.tableIndex)}`
    case 'pinned-seat':
      return `Seat ${founderReferenceLabel(input.founder, founders)} at Table ${tableNumber(input.tableIndex)} seat ${input.seatIndex + 1}`
  }
}

export interface BuildRequestInput {
  readonly founders: readonly Founder[]
  readonly tableCount: number
  readonly criteria: readonly CriterionDraft[]
  readonly rules: readonly RuleDraft[]
  readonly locks?: readonly DinnerLock[]
  readonly maxIterations?: number
  readonly maxComparisons?: number
}

export function buildDinnerRequest(input: BuildRequestInput): { request: DinnerRequest } | { conflicts: readonly RuleConflict[] } {
  const criteria = compileCriteria({
    source: 'manual',
    criteria: input.criteria.map((criterion) => ({
      field: criterion.field,
      objective: criterion.objective,
      weight: criterion.weight,
    })),
  })
  const compiled = compileHardRules(
    input.rules.map((rule) => rule.input),
    input.founders,
  )
  if (compiled.conflicts.length) return { conflicts: compiled.conflicts }
  return {
    request: {
      founders: input.founders,
      tableCount: input.tableCount,
      criteria,
      rules: compiled.rules,
      locks: input.locks ?? [],
      ...(input.maxIterations === undefined ? {} : { maxIterations: input.maxIterations }),
      ...(input.maxComparisons === undefined ? {} : { maxComparisons: input.maxComparisons }),
    },
  }
}

export const TABLE_NAMES: readonly string[] = [
  'Market Builders',
  'Product Operators',
  'Cross-Pollinators',
  'Systems Thinkers',
  'Growth Loops',
  'Frontier Makers',
  'Category Creators',
  'Technical Storytellers',
  'Platform Shapers',
  'Design Partners',
  'Capital Efficient',
  'Workflow Reinventors',
  'Deep Tech Exchange',
  'Trust Builders',
  'Global Operators',
  'Founder Led Sales',
  'Data Advantage',
  'Customer Obsessed',
  'Applied Intelligence',
  'New Market Makers',
]

export function tableNumber(index: number) {
  return String(index + 1).padStart(2, '0')
}

export function tableName(index: number) {
  return TABLE_NAMES[index % TABLE_NAMES.length]!
}

export function percent(fit: number) {
  return Math.round(fit * 100)
}

export type FitBand = 'strong' | 'good' | 'watch' | 'risk'

export function fitBand(score: number): FitBand {
  if (score >= 90) return 'strong'
  if (score >= 80) return 'good'
  if (score >= 70) return 'watch'
  return 'risk'
}

export function fitClass(score: number): '' | 'watch' | 'risk' {
  if (score < 70) return 'risk'
  if (score < 80) return 'watch'
  return ''
}

export function qualityClass(score: number): '' | 'watch' | 'risk' {
  if (score < 75) return 'risk'
  if (score < 80) return 'watch'
  return ''
}

export interface SeatView {
  readonly founderId: string
  readonly founder: Founder | null
  readonly score: number
  readonly band: FitBand
  readonly fitClass: '' | 'watch' | 'risk'
}

export interface TableView {
  readonly index: number
  readonly number: string
  readonly name: string
  readonly quality: number
  readonly average: number
  readonly qualityClass: '' | 'watch' | 'risk'
  readonly seats: readonly SeatView[]
  readonly openSeats: number
  readonly below: number
  readonly risks: number
  readonly statusLabel: string
  readonly statusClass: '' | 'warning' | 'risk'
  readonly indexClass: '' | 'has-watch' | 'has-risk'
  readonly indexLabel: string
}

export const ROLE_ORDER: readonly string[] = ['Engineering', 'Sales', 'Design', 'Operations']

export function roleClass(role: string) {
  switch (role) {
    case 'Engineering':
      return 'eng'
    case 'Sales':
      return 'sales'
    case 'Design':
      return 'design'
    default:
      return 'ops'
  }
}

export interface DinnerView {
  readonly overall: number
  readonly minimum: number
  readonly tableCount: number
  readonly total: number
  readonly watchCount: number
  readonly aboveCount: number
  readonly strongCount: number
  readonly roles: readonly string[]
  readonly tables: readonly TableView[]
  readonly distribution: readonly { label: string; band: FitBand; count: number }[]
  readonly roleMakeup: readonly { number: string; segments: readonly { role: string; count: number; share: number }[] }[]
  readonly weakest: readonly { founder: Founder; tableNumber: string; score: number; note: string }[]
}

export function buildDinnerView(
  solution: DinnerSolution,
  foundersById: ReadonlyMap<string, Founder>,
  threshold: number,
): DinnerView {
  const tables: TableView[] = solution.tables.map((table) => {
    const ids = table.seats.length ? table.seats : table.founderIds
    const seats: SeatView[] = ids.map((founderId) => {
      const id = founderId ?? ''
      const score = percent(table.founderFits[id] ?? 0)
      return { founderId: id, founder: foundersById.get(id) ?? null, score, band: fitBand(score), fitClass: fitClass(score) }
    })
    const seated = seats.filter((seat) => seat.founder)
    const below = seated.filter((seat) => seat.score < threshold).length
    const risks = seated.filter((seat) => seat.score < 70).length
    const quality = percent(table.quality)
    const number = tableNumber(table.index)
    const statusLabel = below ? `${below} below ${threshold}` : `All above ${threshold}`
    const fits = seated.map((seat) => table.founderFits[seat.founderId] ?? 0)
    return {
      index: table.index,
      number,
      name: tableName(table.index),
      quality,
      average: percent(fits.length ? fits.reduce((sum, fit) => sum + fit, 0) / fits.length : 0),
      qualityClass: qualityClass(quality),
      seats: seated,
      openSeats: seats.length - seated.length,
      below,
      risks,
      statusLabel,
      statusClass: risks ? 'risk' : below ? 'warning' : '',
      indexClass: risks ? 'has-risk' : below ? 'has-watch' : '',
      indexLabel: `Table ${number}, ${quality} quality, ${statusLabel}`,
    }
  })

  const seats = tables.flatMap((table) => table.seats.map((seat) => ({ seat, table })))
  const scores = seats.map(({ seat }) => seat.score)
  const watchCount = scores.filter((score) => score < threshold).length
  const presentRoles = new Set(seats.map(({ seat }) => seat.founder!.role))
  const roles = [
    ...ROLE_ORDER.filter((role) => presentRoles.has(role)),
    ...[...presentRoles].filter((role) => !ROLE_ORDER.includes(role)).sort(),
  ]

  return {
    overall: percent(solution.metrics.meanFounderFit),
    minimum: percent(solution.metrics.founderFitVector[0] ?? 0),
    tableCount: tables.length,
    total: seats.length,
    watchCount,
    aboveCount: seats.length - watchCount,
    strongCount: scores.filter((score) => score >= 90).length,
    roles,
    tables,
    distribution: [
      { label: '<70', band: 'risk', count: scores.filter((score) => score < 70).length },
      { label: '70–79', band: 'watch', count: scores.filter((score) => score >= 70 && score < 80).length },
      { label: '80–89', band: 'good', count: scores.filter((score) => score >= 80 && score < 90).length },
      { label: '90+', band: 'strong', count: scores.filter((score) => score >= 90).length },
    ],
    roleMakeup: tables.map((table) => ({
      number: table.number,
      segments: roles.map((role) => {
        const count = table.seats.filter((seat) => seat.founder!.role === role).length
        return { role, count, share: table.seats.length ? count / table.seats.length : 0 }
      }),
    })),
    weakest: [...seats]
      .sort((left, right) => left.seat.score - right.seat.score || left.table.index - right.table.index)
      .slice(0, 3)
      .map(({ seat, table }) => ({
        founder: seat.founder!,
        tableNumber: table.number,
        score: seat.score,
        note: `Table ${table.number} · ${seat.founder!.role} mix needs review`,
      })),
  }
}

const OBJECTIVE_NOUNS: Partial<Record<FounderFieldKey, string>> = {
  companyVertical: 'Industry',
  role: 'Role',
  age: 'Age',
  education: 'Education',
  company: 'Company',
  cohortGroup: 'Cohort group',
  cohortSection: 'Cohort section',
}

function criterionValue(founder: Founder, field: FounderFieldKey): unknown {
  return field === 'companyVertical' ? founder.companyVerticalLevels : founder[field as keyof Founder]
}

export function objectivePerformance(solution: DinnerSolution, founders: readonly Founder[]) {
  const byId = new Map(founders.map((founder) => [founder.id, founder]))
  const rows = solution.criteria.criteria
    .filter((criterion) => criterion.enabled)
    .map((criterion) => {
      const numbers = founders
        .map((founder) => criterionValue(founder, criterion.field))
        .filter((value): value is number => typeof value === 'number')
      const range = numbers.length ? { min: Math.min(...numbers), max: Math.max(...numbers) } : undefined
      const tableScores = solution.tables.flatMap((table) => {
        const members = table.founderIds.map((id) => byId.get(id)).filter((founder): founder is Founder => !!founder)
        let total = 0
        let count = 0
        for (let left = 0; left < members.length; left += 1) {
          for (let right = left + 1; right < members.length; right += 1) {
            const score = scoreCriterionValues(
              criterion,
              criterionValue(members[left]!, criterion.field),
              criterionValue(members[right]!, criterion.field),
              range,
            )
            if (score === null) continue
            total += score
            count += 1
          }
        }
        return count ? [total / count] : []
      })
      const mean = tableScores.length ? tableScores.reduce((sum, score) => sum + score, 0) / tableScores.length : 0
      const noun = OBJECTIVE_NOUNS[criterion.field] ?? criterion.field
      return { label: `${noun} ${criterion.objective === 'similarity' ? 'similarity' : 'diversity'}`, score: percent(mean) }
    })
  const qualities = solution.metrics.tableQualityVector
  const max = qualities.length ? Math.max(...qualities) : 0
  const min = qualities.length ? Math.min(...qualities) : 0
  return [...rows, { label: 'Table balance', score: max > 0 ? percent(min / max) : 0 }]
}

export function assignmentOf(solution: DinnerSolution): string[][] {
  return solution.tables.map((table) =>
    table.seats.length ? table.seats.filter((id): id is string => id !== null) : [...table.founderIds],
  )
}

export function swapAssignment(assignment: readonly (readonly string[])[], left: string, right: string): string[][] {
  return assignment.map((table) => table.map((id) => (id === left ? right : id === right ? left : id)))
}

export function locksForTables(solution: DinnerSolution, tableIndexes: ReadonlySet<number>): DinnerLock[] {
  return solution.tables
    .filter((table) => tableIndexes.has(table.index))
    .flatMap((table) => table.founderIds.map((founderId) => ({ founderId, tableIndex: table.index })))
}

/** Seats per table as one label: `8` when uniform, `7–8` for uneven capacities. */
export function seatShape(seatCounts: readonly number[]) {
  if (!seatCounts.length) return '0'
  const min = Math.min(...seatCounts)
  const max = Math.max(...seatCounts)
  return min === max ? String(max) : `${min}–${max}`
}
