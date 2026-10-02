import { describe, expect, it } from 'vitest'

import rawFounders from '../../founders.json'
import { normalizeFounders } from '../../shared/founder'
import { buildScaleFixture } from '../../shared/fixtures'
import { buildDinnerRequest, DEFAULT_CRITERIA } from './dinnerState'
import { buildDinnerCsv, dinnerExportFilename } from './dinnerExport'
import { findFounderSwap, findRebalanceSwap, defaultDinnerEngine } from './dinnerEngine'
import { capacities, evaluateDinnerAssignment, type DinnerRequest } from './optimizer'

const FOUNDERS = normalizeFounders(rawFounders)

function roundRobin(request: DinnerRequest) {
  const sizes = capacities(request.founders.length, request.tableCount)
  const tables: string[][] = sizes.map(() => [])
  let cursor = 0
  for (const founder of request.founders) {
    while (tables[cursor]!.length >= sizes[cursor]!) cursor += 1
    tables[cursor]!.push(founder.id)
  }
  return evaluateDinnerAssignment(request, tables)
}

function requestFor(scenario: 'three-tables' | 'five-tables', tableCount: number) {
  const founders = buildScaleFixture(FOUNDERS, scenario)
  const built = buildDinnerRequest({ founders, tableCount, criteria: DEFAULT_CRITERIA, rules: [] })
  if (!('request' in built)) throw new Error('expected a request')
  return built.request
}

describe('dinner CSV export', () => {
  it('writes one row per seated founder in table order with optional founder details', () => {
    const request = requestFor('three-tables', 3)
    const solution = roundRobin(request)
    const byId = new Map(request.founders.map((founder) => [founder.id, founder]))
    const csv = buildDinnerCsv(solution, byId, { includeDetails: true })
    const rows = csv.split('\r\n')
    expect(rows[0]).toBe(
      'Table,Table name,Seat,Founder ID,Founder name,Founder fit,Table quality,Company,Role,Age,Education,Cohort group,Cohort section',
    )
    expect(rows).toHaveLength(25)
    expect(rows[1]).toMatch(/^01,Market Builders,1,/)
    expect(rows[24]).toMatch(/^03,Cross-Pollinators,8,/)

    const compact = buildDinnerCsv(solution, byId, { includeDetails: false }).split('\r\n')
    expect(compact[0]).toBe('Table,Table name,Seat,Founder ID,Founder name,Founder fit,Table quality')
  })

  it('guards spreadsheet formulas in founder text', () => {
    const request = requestFor('three-tables', 3)
    const solution = roundRobin(request)
    const first = solution.tables[0]!.founderIds[0]!
    const byId = new Map(request.founders.map((founder) => [founder.id, founder.id === first ? { ...founder, name: '=HYPERLINK("x")' } : founder]))
    expect(buildDinnerCsv(solution, byId, { includeDetails: false })).toContain(`"'=HYPERLINK(""x"")"`)
  })

  it('names the file from the seating plan', () => {
    expect(dinnerExportFilename('Demo Day Founder Dinner', new Date('2026-10-01T12:00:00Z'))).toBe(
      'demo-day-founder-dinner-2026-10-01.csv',
    )
    expect(dinnerExportFilename('   ', new Date('2026-10-01T12:00:00Z'))).toBe('seating-plan-2026-10-01.csv')
  })
})

describe('dinner engine adapter', () => {
  it('raises a weak founder without lowering the room floor', () => {
    const request = requestFor('three-tables', 3)
    const solution = roundRobin(request)
    const weakest = solution.tables
      .flatMap((table) => table.founderIds.map((id) => ({ id, fit: table.founderFits[id] ?? 0 })))
      .sort((left, right) => left.fit - right.fit)[0]!
    const improved = findFounderSwap(request, solution, weakest.id)
    expect(improved).not.toBeNull()
    const fitAfter = improved!.tables.flatMap((table) => Object.entries(table.founderFits)).find(([id]) => id === weakest.id)![1]
    expect(fitAfter).toBeGreaterThan(weakest.fit)
    expect(improved!.metrics.founderFitVector[0]!).toBeGreaterThanOrEqual(solution.metrics.founderFitVector[0]!)
  })

  it('never moves locked founders', () => {
    const request = requestFor('three-tables', 3)
    const solution = roundRobin(request)
    const founderId = solution.tables[0]!.founderIds[0]!
    const locked = { ...request, locks: [{ founderId, tableIndex: 0 }] }
    expect(findFounderSwap(locked, solution, founderId)).toBeNull()
  })

  it('rebalances a table only when its role coverage improves', () => {
    const request = requestFor('five-tables', 5)
    const solution = roundRobin(request)
    const result = findRebalanceSwap(request, solution, 0)
    if (result) {
      const roles = (index: number, value: typeof solution) =>
        new Set(value.tables[index]!.founderIds.map((id) => request.founders.find((founder) => founder.id === id)!.role)).size
      expect(roles(0, result)).toBeGreaterThan(roles(0, solution))
    }
  })

  it('wraps the Task 6 optimizer asynchronously', async () => {
    const request = { ...requestFor('three-tables', 3), maxIterations: 1, maxComparisons: 200 }
    const solution = await defaultDinnerEngine.optimize(request)
    expect(solution.tables).toHaveLength(3)
    expect(solution.tables.flatMap((table) => table.founderIds)).toHaveLength(24)
    const evaluated = await defaultDinnerEngine.evaluate(request, solution.tables.map((table) => table.founderIds))
    expect(evaluated.metrics.meanFounderFit).toBeCloseTo(solution.metrics.meanFounderFit)
    await expect(defaultDinnerEngine.evaluate(request, [[], [], []])).rejects.toThrow()
  })
})
