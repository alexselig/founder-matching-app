import { describe, expect, it } from 'vitest'
import { compileCriteria } from './criteria.js'
import {
  buildPairwiseScores,
  scoreCriterionValues,
  scoreFounderPair,
} from './scoring.js'
import type { Founder } from '../../shared/founder.js'

function founder(
  id: string,
  overrides: Partial<Founder> = {},
): Founder {
  return {
    id,
    name: `Founder ${id}`,
    cohortGroup: '1',
    cohortSection: '1A',
    companyVertical: 'Software -> Infrastructure',
    companyVerticalLevels: ['Software', 'Infrastructure'],
    company: `Company ${id}`,
    age: 30,
    education: 'Computer Science',
    role: 'Engineering',
    searchName: `founder ${id}`,
    raw: Object.freeze({}),
    ...overrides,
  }
}

describe('criteria compilation', () => {
  it('maps organizer weight levels to deterministic engine weights', () => {
    const criteria = compileCriteria({
      source: 'manual',
      criteria: [
        { field: 'company vertical', objective: 'similarity', weight: 'L' },
        { field: 'role', objective: 'diversity', weight: 'M' },
        { field: 'age', objective: 'diversity', weight: 'H' },
      ],
    })

    expect(criteria.criteria.map((criterion) => criterion.weight)).toEqual([1, 2, 3])
    expect(criteria.criteria.map((criterion) => criterion.field)).toEqual([
      'companyVertical',
      'role',
      'age',
    ])
  })

  it('normalizes AI and manual criteria through the same canonical path', () => {
    const draft = [
      { field: 'industry', objective: 'Similar', weight: 'High' },
      { field: 'function', objective: 'Diverse', weight: 'Medium' },
    ] as const

    const manual = compileCriteria({ source: 'manual', criteria: draft })
    const ai = compileCriteria({ source: 'ai', criteria: draft })

    expect(
      manual.criteria.map(({ provenance: _provenance, ...criterion }) => criterion),
    ).toEqual(ai.criteria.map(({ provenance: _provenance, ...criterion }) => criterion))
    expect(manual.criteria.map((criterion) => criterion.provenance)).toEqual([
      'manual',
      'manual',
    ])
    expect(ai.criteria.map((criterion) => criterion.provenance)).toEqual(['ai', 'ai'])
  })

  it('rejects unknown or non-matchable schema fields', () => {
    expect(() =>
      compileCriteria({
        source: 'manual',
        criteria: [{ field: 'favorite color', objective: 'similarity', weight: 'M' }],
      }),
    ).toThrow(/unknown match criterion/i)
  })
})

describe('component scoring', () => {
  it('supports categorical, Jaccard, numeric, and hierarchical operators', () => {
    expect(
      scoreCriterionValues(
        { operator: 'categorical', objective: 'similarity', missingValuePolicy: 'exclude' },
        'Engineering',
        'Engineering',
      ),
    ).toBe(1)
    expect(
      scoreCriterionValues(
        { operator: 'jaccard', objective: 'similarity', missingValuePolicy: 'exclude' },
        ['ai', 'security'],
        ['ai', 'developer-tools'],
      ),
    ).toBeCloseTo(1 / 3)
    expect(
      scoreCriterionValues(
        { operator: 'numeric', objective: 'diversity', missingValuePolicy: 'exclude' },
        20,
        30,
        { min: 20, max: 40 },
      ),
    ).toBe(0.5)
    expect(
      scoreCriterionValues(
        { operator: 'hierarchical', objective: 'similarity', missingValuePolicy: 'exclude' },
        ['Software', 'Infrastructure'],
        ['Software', 'Developer tools'],
      ),
    ).toBe(0.5)
  })

  it('never treats missing values as positive matches', () => {
    expect(
      scoreCriterionValues(
        { operator: 'categorical', objective: 'similarity', missingValuePolicy: 'exclude' },
        undefined,
        undefined,
      ),
    ).toBeNull()
    expect(
      scoreCriterionValues(
        { operator: 'categorical', objective: 'similarity', missingValuePolicy: 'zero' },
        undefined,
        undefined,
      ),
    ).toBe(0)
  })

  it('stores pairwise components once and reweights without raw comparisons', () => {
    const founders = [
      founder('a', { role: 'Engineering', age: 20 }),
      founder('b', { role: 'Design', age: 40 }),
    ]
    const firstCriteria = compileCriteria({
      source: 'manual',
      criteria: [
        { field: 'role', objective: 'diversity', weight: 'L' },
        { field: 'age', objective: 'similarity', weight: 'H' },
      ],
    })
    const reweighted = compileCriteria({
      source: 'manual',
      criteria: [
        { field: 'role', objective: 'diversity', weight: 'H' },
        { field: 'age', objective: 'similarity', weight: 'L' },
      ],
    })

    const cache = buildPairwiseScores(founders, firstCriteria)
    const componentsBefore = cache.components
    const firstScore = scoreFounderPair(cache, firstCriteria, 'a', 'b')
    const secondScore = scoreFounderPair(cache, reweighted, 'a', 'b')

    expect(cache.components).toBe(componentsBefore)
    expect(firstScore).toBe(0.25)
    expect(secondScore).toBe(0.75)
  })
})
