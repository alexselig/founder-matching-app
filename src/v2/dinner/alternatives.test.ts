import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildScaleFixture } from '../../shared/fixtures.js'
import type { Founder } from '../../shared/founder.js'
import { normalizeFounders } from '../../shared/founder.js'
import {
  ALTERNATIVE_MAX_WEAKEST_FIT_DROP,
  ALTERNATIVE_STRUCTURAL_DIFFERENCE,
  generateAlternatives,
  structuralDifference,
} from './alternatives.js'
import { compileCriteria } from './criteria.js'
import {
  compareDinnerMetrics,
  DinnerConflictError,
  optimizeDinner,
} from './optimizer.js'
import { compileHardRules, findRuleViolations } from './rules.js'

function founder(id: string, role: string): Founder {
  return {
    id,
    name: `Founder ${id}`,
    cohortGroup: String((Number(id) % 3) + 1),
    cohortSection: `${(Number(id) % 3) + 1}A`,
    companyVertical: Number(id) % 2 ? 'Software' : 'Health',
    companyVerticalLevels: [Number(id) % 2 ? 'Software' : 'Health'],
    company: `Company ${id}`,
    age: 24 + Number(id),
    education: Number(id) % 2 ? 'Computer Science' : 'Business',
    role,
    searchName: `founder ${id}`,
    raw: Object.freeze({}),
  }
}

const referenceFounders = normalizeFounders(
  JSON.parse(
    readFileSync(resolve(process.cwd(), 'src/founders.json'), 'utf8'),
  ) as unknown,
)
const scaleCriteria = compileCriteria({
  source: 'manual',
  criteria: [
    { field: 'company vertical', objective: 'similarity', weight: 'H' },
    { field: 'role', objective: 'diversity', weight: 'H' },
    { field: 'age', objective: 'diversity', weight: 'M' },
  ],
})

describe('dinner alternatives', () => {
  it('returns exactly two deterministic, structurally distinct valid solutions', () => {
    const founders = Array.from({ length: 24 }, (_, index) =>
      founder(String(index), ['Engineering', 'Design', 'Sales'][index % 3] ?? 'Engineering'),
    )
    const criteria = compileCriteria({
      source: 'manual',
      criteria: [
        { field: 'company vertical', objective: 'similarity', weight: 'H' },
        { field: 'role', objective: 'diversity', weight: 'H' },
        { field: 'age', objective: 'diversity', weight: 'M' },
      ],
    })
    const compiledRules = compileHardRules(
      [
        {
          id: 'apart-1-2',
          type: 'cannot-sit-together',
          founders: [{ id: '1' }, { id: '2' }],
        },
      ],
      founders,
    )
    const request = {
      founders,
      tableCount: 3,
      criteria,
      rules: compiledRules.rules,
      locks: [{ founderId: '0', tableIndex: 0, seatIndex: 0 }],
      maxIterations: 2,
    } as const
    const base = optimizeDinner(request)
    const alternatives = generateAlternatives(request, 2, base)

    expect(alternatives).toHaveLength(2)
    expect(generateAlternatives(request, 2, base)).toEqual(alternatives)
    for (const alternative of alternatives) {
      expect(alternative.criteria).toEqual(criteria)
      expect(alternative.tables[0]?.seats[0]).toBe('0')
      expect(
        alternative.tables.flatMap((table) => table.founderIds).sort(),
      ).toEqual(founders.map((candidate) => candidate.id).sort())
      expect(structuralDifference(base, alternative)).toBeGreaterThanOrEqual(0.05)
      expect(alternative.metrics.founderFitVector[0]).toBeGreaterThanOrEqual(
        (base.metrics.founderFitVector[0] ?? 0) - ALTERNATIVE_MAX_WEAKEST_FIT_DROP,
      )
      expect(alternative.optimization.iterations).toBeGreaterThan(0)
      expect(
        findRuleViolations(alternative.tables, founders, compiledRules.rules),
      ).toEqual([])
    }
    expect(structuralDifference(alternatives[0]!, alternatives[1]!)).toBeGreaterThanOrEqual(
      0.05,
    )
  })

  it('enforces the product contract of exactly two alternatives', () => {
    const founders = Array.from({ length: 6 }, (_, index) =>
      founder(String(index), index % 2 ? 'Engineering' : 'Design'),
    )
    const criteria = compileCriteria({
      source: 'manual',
      criteria: [{ field: 'role', objective: 'diversity', weight: 'H' }],
    })

    expect(() =>
      generateAlternatives({ founders, tableCount: 2, criteria }, 1),
    ).toThrow(/exactly two/i)
  })

  it(
    'keeps the optimized 20-table base at least as strong as both alternatives',
    () => {
      const founders = buildScaleFixture(referenceFounders, 'twenty-tables')
      const request = { founders, tableCount: 20, criteria: scaleCriteria }
      const base = optimizeDinner(request)
      const alternatives = generateAlternatives(request, 2, base)

      expect(alternatives).toHaveLength(2)
      for (const alternative of alternatives) {
        expect(compareDinnerMetrics(alternative.metrics, base.metrics)).toBeLessThanOrEqual(
          0,
        )
        expect(structuralDifference(base, alternative)).toBeGreaterThanOrEqual(
          ALTERNATIVE_STRUCTURAL_DIFFERENCE,
        )
      }
    },
    30_000,
  )

  it(
    'generates two structurally distinct alternatives for the full 574-founder dataset',
    () => {
      const tableCount = Math.ceil(referenceFounders.length / 8)
      const request = {
        founders: referenceFounders,
        tableCount,
        criteria: scaleCriteria,
        maxIterations: 1,
        maxComparisons: 5_000,
      }
      const base = optimizeDinner(request)
      const alternatives = generateAlternatives(request, 2, base)

      expect(referenceFounders).toHaveLength(574)
      expect(alternatives).toHaveLength(2)
      expect(structuralDifference(base, alternatives[0]!)).toBeGreaterThanOrEqual(
        ALTERNATIVE_STRUCTURAL_DIFFERENCE,
      )
      expect(structuralDifference(base, alternatives[1]!)).toBeGreaterThanOrEqual(
        ALTERNATIVE_STRUCTURAL_DIFFERENCE,
      )
      expect(structuralDifference(alternatives[0]!, alternatives[1]!)).toBeGreaterThanOrEqual(
        ALTERNATIVE_STRUCTURAL_DIFFERENCE,
      )
    },
    60_000,
  )

  it('reports fully locked cohorts as structurally rigid', () => {
    const founders = Array.from({ length: 16 }, (_, index) =>
      founder(String(index), index % 2 ? 'Engineering' : 'Design'),
    )
    const criteria = compileCriteria({
      source: 'manual',
      criteria: [{ field: 'role', objective: 'diversity', weight: 'H' }],
    })
    const request = {
      founders,
      tableCount: 2,
      criteria,
      locks: founders.map((candidate, index) => ({
        founderId: candidate.id,
        tableIndex: index < 8 ? 0 : 1,
      })),
      maxIterations: 0,
    }

    expect(() => generateAlternatives(request, 2)).toThrow(DinnerConflictError)
    try {
      generateAlternatives(request, 2)
    } catch (error) {
      expect((error as DinnerConflictError).conflicts).toEqual([
        expect.objectContaining({
          ruleIds: ['alternative-structural-difference'],
          message: expect.stringMatching(/rigid|locked|movable/i),
        }),
      ])
    }
  })
})
