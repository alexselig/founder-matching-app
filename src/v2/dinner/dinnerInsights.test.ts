import { describe, expect, it } from 'vitest'

import rawFounders from '../../founders.json'
import { normalizeFounders } from '../../shared/founder'
import { buildScaleFixture } from '../../shared/fixtures'
import { buildDinnerRequest, DEFAULT_CRITERIA, type RuleDraft } from './dinnerState'
import {
  balanceLabel,
  baselineTradeoffs,
  compareAlternative,
  describeConflict,
  fitAssignmentToCapacities,
  numberWord,
  solutionSummary,
} from './dinnerInsights'
import { capacities, evaluateDinnerAssignment, type DinnerRequest } from './optimizer'

const FOUNDERS = normalizeFounders(rawFounders)

function roundRobin(request: DinnerRequest, rotate = 0) {
  const sizes = capacities(request.founders.length, request.tableCount)
  const tables: string[][] = sizes.map(() => [])
  const ordered = [...request.founders.slice(rotate), ...request.founders.slice(0, rotate)]
  let cursor = 0
  for (const founder of ordered) {
    while (tables[cursor]!.length >= sizes[cursor]!) cursor += 1
    tables[cursor]!.push(founder.id)
  }
  return evaluateDinnerAssignment(request, tables)
}

function threeTableRequest() {
  const founders = buildScaleFixture(FOUNDERS, 'three-tables')
  const built = buildDinnerRequest({ founders, tableCount: 3, criteria: DEFAULT_CRITERIA, rules: [] })
  if (!('request' in built)) throw new Error('expected request')
  return built.request
}

describe('numberWord', () => {
  it('spells small counts for headlines and falls back to digits', () => {
    expect(numberWord(1)).toBe('One')
    expect(numberWord(8)).toBe('Eight')
    expect(numberWord(20)).toBe('Twenty')
    expect(numberWord(21)).toBe('21')
    expect(numberWord(8, false)).toBe('eight')
  })
})

describe('fitAssignmentToCapacities', () => {
  it('moves the fewest founders needed to match positional capacities', () => {
    expect(fitAssignmentToCapacities([['a', 'b', 'c'], ['d'], ['e', 'f']], [2, 2, 2])).toEqual([
      ['a', 'b'],
      ['d', 'c'],
      ['e', 'f'],
    ])
  })

  it('leaves an already valid assignment untouched', () => {
    const assignment = [['a', 'b'], ['c']]
    expect(fitAssignmentToCapacities(assignment, [2, 1])).toEqual(assignment)
  })
})

describe('balanceLabel', () => {
  it('lists up to six capacities and compresses longer shapes', () => {
    expect(balanceLabel([10, 10, 10, 9, 9])).toBe('10 / 10 / 10 / 9 / 9')
    expect(balanceLabel([7, 7, 7, 7, 6, 6, 6, 6])).toBe('4 × 7 / 4 × 6')
  })
})

describe('describeConflict', () => {
  const founders = FOUNDERS.slice(0, 6)
  const [alex, di] = founders
  const rules: RuleDraft[] = [
    { id: 'rule-01', text: 'Separate founders from the same company', input: { id: 'rule-01', type: 'same-company-separation' } },
    {
      id: 'rule-02',
      text: 'Keep A and B together',
      input: { id: 'rule-02', type: 'must-sit-together', founders: [{ id: alex!.id }, { id: di!.id }] },
    },
    {
      id: 'rule-03',
      text: 'Keep A and B apart',
      input: { id: 'rule-03', type: 'cannot-sit-together', founders: [{ id: alex!.id }, { id: di!.id }] },
    },
  ]

  it('explains a together/apart pair with numbered rules and keep options', () => {
    const view = describeConflict(
      { ruleIds: ['rule-02', 'rule-03'], founderIds: [alex!.id, di!.id], message: 'x' },
      rules,
      founders,
    )
    expect(view.index).toBe('02↔03')
    expect(view.numbers).toEqual(['02', '03'])
    expect(view.headline).toBe(`${alex!.name} and ${di!.name} must sit together and apart.`)
    expect(view.detail).toBe('Together at one table / never at the same table')
    expect(view.subject).toBe(`${alex!.name} + ${di!.name}`)
    expect(view.options.map((option) => option.label)).toEqual([
      'Keep rule 02 · remove rule 03',
      'Keep rule 03 · remove rule 02',
    ])
    expect(view.options[0]!.removeRuleId).toBe('rule-03')
    expect(view.options[0]!.note).toBe(`${alex!.name} and ${di!.name} will be assigned together.`)
    expect(view.options[1]!.note).toBe(`${alex!.name} and ${di!.name} will be assigned separately.`)
    expect(view.rows.map((row) => row.status)).toEqual(['Compatible', 'Conflicts with 03', 'Conflicts with 02'])
  })

  it('offers per-rule removal when a single rule cannot be satisfied', () => {
    const view = describeConflict({ ruleIds: ['rule-01'], founderIds: [], message: 'x' }, rules, founders)
    expect(view.index).toBe('01')
    expect(view.headline).toBe('Rule 01 cannot be satisfied with this cohort.')
    expect(view.options.map((option) => option.label)).toEqual(['Remove rule 01'])
  })
})

describe('solution comparison', () => {
  it('summarizes metrics at a threshold and compares an alternative against the base', () => {
    const request = threeTableRequest()
    const base = roundRobin(request)
    const alternative = roundRobin(request, 5)
    const byId = new Map(request.founders.map((founder) => [founder.id, founder]))

    const summary = solutionSummary(base, request.founders, 70)
    expect(summary.overall).toBe(Math.round(base.metrics.meanFounderFit * 100))
    expect(summary.objectives.at(-1)!.label).toBe('Table balance')

    const comparison = compareAlternative(base, alternative, request.founders, byId, 70)
    expect(comparison.moved).toBeGreaterThan(0)
    expect(comparison.deltas).toHaveLength(summary.objectives.length)
    expect(comparison.changes.length).toBeLessThanOrEqual(3)
    expect(comparison.changes[0]!.tables).toMatch(/^\d{2} ↔ \d{2}$/)
    expect(['Safer floor', 'Shared context', 'Broader mix', 'Different arrangement']).toContain(comparison.title)
    expect(comparison.tradeoffs.at(-1)!.text).toContain(`of ${request.founders.length} founders move`)
  })
})

describe('baselineTradeoffs', () => {
  it('describes the current solution relative to its alternatives', () => {
    const request = threeTableRequest()
    const base = roundRobin(request)
    const alternative = roundRobin(request, 5)
    const notes = baselineTradeoffs(base, [alternative], request.founders, 70)
    expect(notes.length).toBeGreaterThan(0)
    expect(notes.length).toBeLessThanOrEqual(3)
    expect(notes.every((note) => ['', 'gain', 'cost'].includes(note.kind))).toBe(true)
  })
})
