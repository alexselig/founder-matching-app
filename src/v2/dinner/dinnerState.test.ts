import { describe, expect, it } from 'vitest'

import rawFounders from '../../founders.json'
import { buildScaleFixture } from '../../shared/fixtures'
import { normalizeFounders, type Founder } from '../../shared/founder'
import {
  addDimension,
  assignmentOf,
  buildDinnerRequest,
  buildDinnerView,
  capacityNote,
  capacityResolutions,
  cohortCard,
  DEFAULT_CRITERIA,
  defaultTableSetup,
  describeRule,
  fitBand,
  fitClass,
  locksForTables,
  objectivePerformance,
  parseRuleText,
  percent,
  qualityClass,
  removeDimension,
  RULE_SUGGESTIONS,
  setWeight,
  setupStage,
  summaryCopy,
  swapAssignment,
  tableName,
  tablePresets,
  tablesCard,
  toggleObjective,
  type DinnerCohort,
  type SetupSnapshot,
} from './dinnerState'
import { evaluateDinnerAssignment, type DinnerSolution } from './optimizer'

const founders = normalizeFounders(rawFounders)

function cohortOf(list: readonly Founder[], label = `${list.length} founders`): DinnerCohort {
  return { id: 'test', label, hint: 'From Founder Search · ordered results', source: 'search', founderIds: list.map((f) => f.id) }
}

function roundRobin(list: readonly Founder[], tableCount: number) {
  const tables: string[][] = Array.from({ length: tableCount }, () => [])
  list.forEach((founder, index) => tables[index % tableCount]!.push(founder.id))
  return tables
}

function solve(list: readonly Founder[], tableCount: number): DinnerSolution {
  const built = buildDinnerRequest({ founders: list, tableCount, criteria: DEFAULT_CRITERIA, rules: [] })
  if (!('request' in built)) throw new Error('unexpected conflicts')
  return evaluateDinnerAssignment(built.request, roundRobin(list, tableCount))
}

const empty: SetupSnapshot = { planName: '', cohort: null, tables: null, rules: [] }

describe('setup gating copy', () => {
  it('walks name → cohort → tables → ready with approved hints and summary copy', () => {
    expect(setupStage(empty)).toBe('name')
    expect(cohortCard(empty)).toMatchObject({ disabled: true, value: 'Select cohort', hint: 'Name the seating plan first', action: 'Select' })
    expect(tablesCard(empty)).toMatchObject({ disabled: true, value: 'Select tables', hint: 'Name the seating plan first' })
    expect(summaryCopy(empty)).toEqual({ primary: 'Name this seating plan to continue', secondary: '0 hard rules added' })

    const named = { ...empty, planName: '  Demo Day Dinner ' }
    expect(setupStage(named)).toBe('cohort')
    expect(cohortCard(named)).toMatchObject({ disabled: false, hint: 'Choose founders to include', action: 'Select' })
    expect(tablesCard(named)).toMatchObject({ disabled: true, hint: 'Available after cohort' })
    expect(summaryCopy(named).primary).toBe('Select a cohort to continue')

    const withCohort = { ...named, cohort: cohortOf(founders.slice(0, 48)) }
    expect(setupStage(withCohort)).toBe('tables')
    expect(cohortCard(withCohort)).toMatchObject({ value: '48 founders', hint: 'From Founder Search · ordered results', action: 'Change' })
    expect(tablesCard(withCohort)).toMatchObject({ disabled: false, value: 'Select tables', hint: 'Choose tables and seats', action: 'Select' })
    expect(summaryCopy(withCohort).primary).toBe('48 founders selected · Choose table setup')

    const ready = { ...withCohort, tables: { tableCount: 6, targetSeats: 8 }, rules: [{ id: 'r1', text: 'Separate founders from the same company', input: { id: 'r1', type: 'same-company-separation' as const } }] }
    expect(setupStage(ready)).toBe('ready')
    expect(tablesCard(ready)).toMatchObject({ value: '6 × 8', hint: '6 tables × 8 target seats', action: 'Edit' })
    expect(summaryCopy(ready)).toEqual({ primary: '48 founders · 6 tables · 8 target seats', secondary: '1 hard rule added' })
  })
})

describe('table setup', () => {
  it('describes exact fit, open seats, and over-capacity', () => {
    expect(capacityNote(48, { tableCount: 6, targetSeats: 8 })).toMatchObject({ kind: 'exact', lead: 'Exact fit.', text: '6 tables × 8 seats gives every founder a seat.', capacity: 48 })
    expect(capacityNote(48, { tableCount: 5, targetSeats: 10 })).toMatchObject({ kind: 'open', lead: '2 open seats.', text: 'The arrangement can leave capacity unfilled.' })
    expect(capacityNote(48, { tableCount: 7, targetSeats: 7 })).toMatchObject({ kind: 'open', lead: '1 open seat.' })
    expect(capacityNote(48, { tableCount: 5, targetSeats: 8 })).toMatchObject({ kind: 'over', lead: '8 founders over capacity.', text: 'Increase tables or target seats.' })
  })

  it('recommends approved presets and a default setup', () => {
    expect(tablePresets(48)).toEqual([
      { tableCount: 6, targetSeats: 8, title: '6 × 8', primary: 'Balanced', secondary: '48 seats' },
      { tableCount: 5, targetSeats: 10, title: '5 × 10', primary: '2 open seats', secondary: '50 capacity' },
      { tableCount: 8, targetSeats: 6, title: '8 × 6', primary: 'Smaller groups', secondary: '48 seats' },
    ])
    expect(defaultTableSetup(48)).toEqual({ tableCount: 6, targetSeats: 8 })
    expect(defaultTableSetup(160)).toEqual({ tableCount: 20, targetSeats: 8 })
    expect(tablePresets(574).every((preset) => preset.tableCount <= 20)).toBe(true)
  })

  it('offers exact-fit and balanced capacity resolutions', () => {
    expect(capacityResolutions(48, { tableCount: 5, targetSeats: 8 })).toEqual({
      exact: { tableCount: 6, targetSeats: 8 },
      balanced: { tableCount: 5, targetSeats: 10, capacities: [10, 10, 10, 9, 9] },
    })
  })
})

describe('criteria editing', () => {
  it('starts with the approved three dimensions and adds the rest in order', () => {
    expect(DEFAULT_CRITERIA.map((c) => [c.label, c.objective, c.weight, c.description])).toEqual([
      ['Company vertical', 'similarity', 'H', 'Shared market context'],
      ['Role', 'diversity', 'H', 'Cross-functional tables'],
      ['Age', 'diversity', 'M', 'Broader perspectives'],
    ])
    let criteria = DEFAULT_CRITERIA
    for (let i = 0; i < 5; i += 1) criteria = addDimension(criteria)
    expect(criteria.map((c) => c.label)).toEqual(['Company vertical', 'Role', 'Age', 'Education', 'Company', 'Cohort group', 'Cohort section'])
    expect(criteria[3]).toMatchObject({ objective: 'diversity', weight: 'M', description: 'Mix academic backgrounds' })
    criteria = removeDimension(criteria, 'education')
    expect(addDimension(criteria).at(-1)?.label).toBe('Education')
    expect(toggleObjective(DEFAULT_CRITERIA, 'role')[1]!.objective).toBe('similarity')
    expect(setWeight(DEFAULT_CRITERIA, 'age', 'L')[2]!.weight).toBe('L')
  })
})

describe('hard rule parsing', () => {
  const cohort = founders.slice(0, 48)

  it('maps every approved suggestion to an enforceable rule or a clear AI requirement', () => {
    expect(RULE_SUGGESTIONS.map((s) => s.label)).toEqual(['Separate same-company founders', 'Engineering at every table', 'Separate direct competitors'])
    expect(parseRuleText(RULE_SUGGESTIONS[0]!.text, cohort)).toMatchObject({ status: 'ready', input: { type: 'same-company-separation' } })
    expect(parseRuleText(RULE_SUGGESTIONS[1]!.text, cohort)).toMatchObject({ status: 'ready', input: { type: 'field-count', field: 'role', value: 'Engineering', min: 1 } })
    expect(parseRuleText(RULE_SUGGESTIONS[2]!.text, cohort)).toMatchObject({ status: 'unsupported' })
    expect(parseRuleText('   ', cohort)).toEqual({ status: 'empty' })
  })

  it('resolves founder names and surfaces ambiguous identities', () => {
    const [a, b] = cohort
    const together = parseRuleText(`Keep ${a!.name} and ${b!.name} together`, cohort)
    expect(together).toMatchObject({ status: 'ready', input: { type: 'must-sit-together', founders: [{ id: a!.id }, { id: b!.id }] } })
    const twin: Founder = { ...a!, id: 'twin-1', company: 'Parable', role: 'Sales' }
    const withTwin = [...cohort, twin]
    const apart = parseRuleText(`Keep ${a!.name} and ${b!.name} at different tables`, withTwin)
    expect(apart).toMatchObject({ status: 'ambiguous', name: a!.name })
    if (apart.status !== 'ambiguous') throw new Error('expected ambiguity')
    expect(apart.candidates.map((f) => f.id)).toEqual([a!.id, 'twin-1'])
    const resolved = parseRuleText(`Keep ${a!.name} and ${b!.name} at different tables`, withTwin, { [a!.name.toLowerCase()]: 'twin-1' })
    expect(resolved).toMatchObject({ status: 'ready', input: { type: 'cannot-sit-together', founders: [{ id: 'twin-1' }, { id: b!.id }] } })
    if (resolved.status !== 'ready') throw new Error('expected ready')
    expect(resolved.description).toBe(`Keep ${a!.name} · Parable and ${b!.name} · ${b!.company} at different tables`)
    expect(parseRuleText('Keep Nobody Atall and Someone Else together', cohort)).toMatchObject({ status: 'unsupported' })
  })

  it('describes compiled rules for the compact rail', () => {
    expect(describeRule({ id: 'x', type: 'field-count', field: 'role', value: 'Engineering', min: 1 }, cohort)).toBe('Every table includes an Engineering founder')
    expect(describeRule({ id: 'y', type: 'same-company-separation' }, cohort)).toBe('Separate founders from the same company')
  })
})

describe('request building', () => {
  it('compiles criteria and reports contradictory rules as conflicts', () => {
    const cohort = founders.slice(0, 24)
    const [a, b] = cohort
    const built = buildDinnerRequest({
      founders: cohort,
      tableCount: 3,
      criteria: DEFAULT_CRITERIA,
      rules: [
        { id: 'r1', text: 'together', input: { id: 'r1', type: 'must-sit-together', founders: [{ id: a!.id }, { id: b!.id }] } },
        { id: 'r2', text: 'apart', input: { id: 'r2', type: 'cannot-sit-together', founders: [{ id: a!.id }, { id: b!.id }] } },
      ],
    })
    expect('conflicts' in built && built.conflicts[0]!.ruleIds).toEqual(expect.arrayContaining(['r1', 'r2']))
    const ok = buildDinnerRequest({ founders: cohort, tableCount: 3, criteria: DEFAULT_CRITERIA, rules: [], maxComparisons: 100 })
    expect('request' in ok && ok.request.criteria.criteria.map((c) => c.field)).toEqual(['companyVertical', 'role', 'age'])
    expect('request' in ok && ok.request.maxComparisons).toBe(100)
  })
})

describe('result view derivation', () => {
  it('bands scores and classes exactly like the approved mock', () => {
    expect(percent(0.876)).toBe(88)
    expect([95, 85, 75, 65].map(fitBand)).toEqual(['strong', 'good', 'watch', 'risk'])
    expect([85, 75, 65].map(fitClass)).toEqual(['', 'watch', 'risk'])
    expect([80, 77, 74].map(qualityClass)).toEqual(['', 'watch', 'risk'])
    expect(tableName(0)).toBe('Market Builders')
    expect(tableName(19)).toBe('New Market Makers')
  })

  it.each([
    ['three-tables', 3],
    ['five-tables', 5],
    ['twenty-tables', 20],
    ['uneven-five-tables', 5],
  ] as const)('derives a complete %s view without phantom tables', (scenario, tableCount) => {
    const cohort = buildScaleFixture(founders, scenario)
    const solution = solve(cohort, tableCount)
    const byId = new Map(cohort.map((f) => [f.id, f]))
    const view = buildDinnerView(solution, byId, 70)
    expect(view.tables).toHaveLength(tableCount)
    expect(view.tables.map((t) => t.number)).toEqual(Array.from({ length: tableCount }, (_, i) => String(i + 1).padStart(2, '0')))
    expect(view.tables.reduce((sum, t) => sum + t.seats.length, 0)).toBe(cohort.length)
    expect(view.total).toBe(cohort.length)
    expect(view.aboveCount + view.watchCount).toBe(cohort.length)
    expect(view.minimum).toBe(percent(solution.metrics.founderFitVector[0]!))
    expect(view.overall).toBe(percent(solution.metrics.meanFounderFit))
    expect(view.distribution.reduce((sum, band) => sum + band.count, 0)).toBe(cohort.length)
    expect(view.weakest).toHaveLength(3)
    expect(view.weakest[0]!.score).toBe(view.minimum)
    if (scenario === 'uneven-five-tables') {
      expect(view.tables.map((t) => t.seats.length)).toEqual([10, 10, 10, 9, 9])
    }
  })

  it('recomputes threshold counts and table statuses', () => {
    const cohort = buildScaleFixture(founders, 'five-tables')
    const solution = solve(cohort, 5)
    const byId = new Map(cohort.map((f) => [f.id, f]))
    const low = buildDinnerView(solution, byId, 60)
    const high = buildDinnerView(solution, byId, 85)
    expect(high.watchCount).toBeGreaterThanOrEqual(low.watchCount)
    const table = high.tables[0]!
    const below = table.seats.filter((seat) => seat.score < 85).length
    expect(table.statusLabel).toBe(below ? `${below} below 85` : 'All above 85')
    expect(table.indexLabel).toBe(`Table 01, ${table.quality} quality, ${table.statusLabel}`)
  })

  it('scores each objective plus table balance', () => {
    const cohort = buildScaleFixture(founders, 'three-tables')
    const solution = solve(cohort, 3)
    const rows = objectivePerformance(solution, cohort)
    expect(rows.map((r) => r.label)).toEqual(['Industry similarity', 'Role diversity', 'Age diversity', 'Table balance'])
    rows.forEach((row) => expect(row.score).toBeGreaterThanOrEqual(0))
    rows.forEach((row) => expect(row.score).toBeLessThanOrEqual(100))
  })
})

describe('assignment edits', () => {
  it('swaps founders across tables and builds table locks', () => {
    const cohort = buildScaleFixture(founders, 'three-tables')
    const solution = solve(cohort, 3)
    const assignment = assignmentOf(solution)
    const a = assignment[0]![0]!
    const b = assignment[1]![2]!
    const swapped = swapAssignment(assignment, a, b)
    expect(swapped[0]![0]).toBe(b)
    expect(swapped[1]![2]).toBe(a)
    expect(assignment[0]![0]).toBe(a)
    expect(locksForTables(solution, new Set([1]))).toEqual(solution.tables[1]!.founderIds.map((founderId) => ({ founderId, tableIndex: 1 })))
  })
})
