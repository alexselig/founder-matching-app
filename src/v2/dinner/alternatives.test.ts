import { describe, expect, it } from 'vitest'
import type { Founder } from '../../shared/founder.js'
import { generateAlternatives, structuralDifference } from './alternatives.js'
import { compileCriteria } from './criteria.js'
import { optimizeDinner } from './optimizer.js'

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
    const request = {
      founders,
      tableCount: 3,
      criteria,
      locks: [{ founderId: '0', tableIndex: 0, seatIndex: 0 }],
      maxIterations: 2,
    } as const
    const base = optimizeDinner(request)
    const alternatives = generateAlternatives(request, 2)

    expect(alternatives).toHaveLength(2)
    expect(generateAlternatives(request, 2)).toEqual(alternatives)
    for (const alternative of alternatives) {
      expect(alternative.criteria).toEqual(criteria)
      expect(alternative.tables[0]?.seats[0]).toBe('0')
      expect(
        alternative.tables.flatMap((table) => table.founderIds).sort(),
      ).toEqual(founders.map((candidate) => candidate.id).sort())
      expect(structuralDifference(base, alternative)).toBeGreaterThanOrEqual(0.05)
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
})
