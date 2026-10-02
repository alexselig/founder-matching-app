import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildScaleFixture, type ScaleScenario } from '../../shared/fixtures.js'
import { normalizeFounders, type Founder } from '../../shared/founder.js'
import { compileCriteria } from './criteria.js'
import {
  capacities,
  compareDinnerMetrics,
  DinnerConflictError,
  optimizeDinner,
} from './optimizer.js'
import { compileHardRules, findRuleViolations } from './rules.js'

const rawFounders = JSON.parse(
  readFileSync(resolve(process.cwd(), 'src/founders.json'), 'utf8'),
) as unknown
const referenceFounders = normalizeFounders(rawFounders)
const criteria = compileCriteria({
  source: 'manual',
  criteria: [
    { field: 'company vertical', objective: 'similarity', weight: 'H' },
    { field: 'role', objective: 'diversity', weight: 'H' },
    { field: 'age', objective: 'diversity', weight: 'M' },
  ],
})

function founder(
  id: string,
  role: string,
  company = `Company ${id}`,
): Founder {
  return {
    id,
    name: `Founder ${id}`,
    cohortGroup: '1',
    cohortSection: '1A',
    companyVertical: 'Software',
    companyVerticalLevels: ['Software'],
    company,
    age: 30,
    education: 'Computer Science',
    role,
    searchName: `founder ${id}`,
    raw: Object.freeze({}),
  }
}

function assignedIds(solution: ReturnType<typeof optimizeDinner>) {
  return solution.tables.flatMap((table) => table.founderIds)
}

describe('balanced capacities', () => {
  it('supports the required even and uneven scale fixtures', () => {
    expect(capacities(24, 3)).toEqual([8, 8, 8])
    expect(capacities(40, 5)).toEqual([8, 8, 8, 8, 8])
    expect(capacities(160, 20)).toEqual(Array(20).fill(8))
    expect(capacities(48, 5)).toEqual([10, 10, 10, 9, 9])
  })
})

describe('deterministic constrained maximin optimization', () => {
  it.each([
    ['three-tables', 3],
    ['five-tables', 5],
    ['twenty-tables', 20],
    ['uneven-five-tables', 5],
  ] as const)(
    'conserves every founder and fills capacities for %s',
    (scenario: ScaleScenario, tableCount: number) => {
      const founders = buildScaleFixture(referenceFounders, scenario)
      const solution = optimizeDinner({
        founders,
        tableCount,
        criteria,
        maxIterations: 1,
      })

      expect(solution.tables.map((table) => table.founderIds.length)).toEqual(
        capacities(founders.length, tableCount),
      )
      expect([...assignedIds(solution)].sort()).toEqual(
        founders.map((candidate) => candidate.id).sort(),
      )
      expect(new Set(assignedIds(solution)).size).toBe(founders.length)
    },
    20_000,
  )

  it('returns the same assignment and metrics for the same request', () => {
    const founders = buildScaleFixture(referenceFounders, 'three-tables')
    const request = { founders, tableCount: 3, criteria, maxIterations: 2 }

    expect(optimizeDinner(request)).toEqual(optimizeDinner(request))
  })

  it('preserves table and seat locks while satisfying hard rules', () => {
    const founders = [
      founder('a', 'Engineering', 'Shared'),
      founder('b', 'Design', 'Shared'),
      founder('c', 'Sales'),
      founder('d', 'Engineering'),
      founder('e', 'Design'),
      founder('f', 'Sales'),
    ]
    const compiledRules = compileHardRules(
      [
        {
          id: 'together-cd',
          type: 'must-sit-together',
          founders: [{ id: 'c' }, { id: 'd' }],
        },
        {
          id: 'apart-ab',
          type: 'cannot-sit-together',
          founders: [{ id: 'a' }, { id: 'b' }],
        },
        { id: 'company-separation', type: 'same-company-separation' },
      ],
      founders,
    )

    const solution = optimizeDinner({
      founders,
      tableCount: 2,
      criteria,
      rules: compiledRules.rules,
      locks: [
        { founderId: 'a', tableIndex: 0, seatIndex: 1 },
        { founderId: 'b', tableIndex: 1 },
      ],
    })

    expect(solution.tables[0]?.seats[1]).toBe('a')
    expect(solution.tables[1]?.founderIds).toContain('b')
    expect(findRuleViolations(solution.tables, founders, compiledRules.rules)).toEqual([])
  })

  it('allows a table pin and a seat lock at the same table', () => {
    const founders = [
      founder('a', 'Engineering'),
      founder('b', 'Design'),
      founder('c', 'Sales'),
      founder('d', 'Engineering'),
    ]
    const compiledRules = compileHardRules(
      [{ id: 'pin-a', type: 'pinned-table', founder: { id: 'a' }, tableIndex: 0 }],
      founders,
    )

    const solution = optimizeDinner({
      founders,
      tableCount: 2,
      criteria,
      rules: compiledRules.rules,
      locks: [{ founderId: 'a', tableIndex: 0, seatIndex: 1 }],
    })

    expect(solution.tables[0]?.seats[1]).toBe('a')
  })

  it('reports the rules and founders that make a request unsatisfiable', () => {
    const founders = [
      founder('a', 'Engineering', 'Shared'),
      founder('b', 'Design', 'Shared'),
    ]
    const compiledRules = compileHardRules(
      [{ id: 'company-separation', type: 'same-company-separation' }],
      founders,
    )

    expect(() =>
      optimizeDinner({
        founders,
        tableCount: 1,
        criteria,
        rules: compiledRules.rules,
      }),
    ).toThrow(DinnerConflictError)

    try {
      optimizeDinner({
        founders,
        tableCount: 1,
        criteria,
        rules: compiledRules.rules,
      })
    } catch (error) {
      expect(error).toBeInstanceOf(DinnerConflictError)
      expect((error as DinnerConflictError).conflicts).toEqual([
        expect.objectContaining({
          ruleIds: ['company-separation'],
          founderIds: ['a', 'b'],
        }),
      ])
    }
  })

  it('improves the weakest-fit objective lexicographically', () => {
    const founders = [
      founder('a1', 'Engineering'),
      founder('a2', 'Engineering'),
      founder('a3', 'Engineering'),
      founder('b1', 'Design'),
      founder('b2', 'Design'),
      founder('b3', 'Design'),
    ]
    const diversityOnly = compileCriteria({
      source: 'manual',
      criteria: [{ field: 'role', objective: 'diversity', weight: 'H' }],
    })
    const initial = optimizeDinner({
      founders,
      tableCount: 2,
      criteria: diversityOnly,
      maxIterations: 0,
    })
    const improved = optimizeDinner({
      founders,
      tableCount: 2,
      criteria: diversityOnly,
      maxIterations: 10,
    })

    expect(compareDinnerMetrics(improved.metrics, initial.metrics)).toBeGreaterThan(0)
    expect(improved.metrics.founderFitVector[0]).toBeGreaterThan(
      initial.metrics.founderFitVector[0] ?? 0,
    )
  })

  it('uses constrained component moves when a one-for-one swap cannot improve', () => {
    const founders = [
      founder('a1', 'Engineering'),
      founder('a2', 'Engineering'),
      founder('b1', 'Engineering'),
      founder('b2', 'Engineering'),
      founder('c1', 'Design'),
      founder('c2', 'Design'),
      founder('c3', 'Design'),
      founder('c4', 'Design'),
    ]
    const diversityOnly = compileCriteria({
      source: 'manual',
      criteria: [{ field: 'role', objective: 'diversity', weight: 'H' }],
    })
    const compiledRules = compileHardRules(
      [
        {
          id: 'together-a',
          type: 'must-sit-together',
          founders: [{ id: 'a1' }, { id: 'a2' }],
        },
      ],
      founders,
    )
    const request = {
      founders,
      tableCount: 2,
      criteria: diversityOnly,
      rules: compiledRules.rules,
      locks: [
        { founderId: 'b1', tableIndex: 0 },
        { founderId: 'b2', tableIndex: 0 },
      ],
    } as const
    const initial = optimizeDinner({ ...request, maxIterations: 0 })
    const improved = optimizeDinner({ ...request, maxIterations: 10 })

    expect(compareDinnerMetrics(improved.metrics, initial.metrics)).toBeGreaterThan(0)
    const movedComponentTable = improved.tables.find((table) =>
      table.founderIds.includes('a1'),
    )
    expect(movedComponentTable?.founderIds).toEqual(
      expect.arrayContaining(['a1', 'a2']),
    )
    expect(
      movedComponentTable?.founderIds.filter((founderId) => founderId.startsWith('c')),
    ).toHaveLength(2)
  })
})
