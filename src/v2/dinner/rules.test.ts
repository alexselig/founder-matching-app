import { describe, expect, it } from 'vitest'
import type { Founder } from '../../shared/founder.js'
import { compileHardRules } from './rules.js'

function founder(
  id: string,
  name: string,
  overrides: Partial<Founder> = {},
): Founder {
  return {
    id,
    name,
    cohortGroup: '1',
    cohortSection: '1A',
    companyVertical: 'Software',
    companyVerticalLevels: ['Software'],
    company: `Company ${id}`,
    age: 30,
    education: 'Computer Science',
    role: 'Engineering',
    searchName: name.toLowerCase(),
    raw: Object.freeze({}),
    ...overrides,
  }
}

describe('hard-rule compilation', () => {
  it('rejects ambiguous founder names instead of activating the rule', () => {
    const founders = [
      founder('a', 'Alex Kim'),
      founder('b', 'Alex Kim'),
      founder('c', 'Jordan Lee'),
    ]

    const result = compileHardRules(
      [
        {
          id: 'together-1',
          type: 'must-sit-together',
          founders: [{ name: 'Alex Kim' }, { id: 'c' }],
        },
      ],
      founders,
    )

    expect(result.rules).toEqual([])
    expect(result.conflicts).toEqual([
      expect.objectContaining({
        ruleIds: ['together-1'],
        founderIds: ['a', 'b'],
        message: expect.stringMatching(/ambiguous/i),
      }),
    ])
  })

  it('returns identified conflicts for transitive together/apart rules', () => {
    const founders = [
      founder('a', 'A'),
      founder('b', 'B'),
      founder('c', 'C'),
    ]

    const result = compileHardRules(
      [
        {
          id: 'together-ab',
          type: 'must-sit-together',
          founders: [{ id: 'a' }, { id: 'b' }],
        },
        {
          id: 'together-bc',
          type: 'must-sit-together',
          founders: [{ id: 'b' }, { id: 'c' }],
        },
        {
          id: 'apart-ac',
          type: 'cannot-sit-together',
          founders: [{ id: 'a' }, { id: 'c' }],
        },
      ],
      founders,
    )

    expect(result.conflicts).toEqual([
      expect.objectContaining({
        ruleIds: ['apart-ac', 'together-ab', 'together-bc'],
        founderIds: ['a', 'c'],
        message: expect.stringMatching(/together.*apart/i),
      }),
    ])
  })

  it('identifies incompatible table pins for the same founder', () => {
    const founders = [founder('a', 'A')]

    const result = compileHardRules(
      [
        { id: 'pin-0', type: 'pinned-table', founder: { id: 'a' }, tableIndex: 0 },
        { id: 'pin-1', type: 'pinned-table', founder: { id: 'a' }, tableIndex: 1 },
      ],
      founders,
    )

    expect(result.conflicts).toEqual([
      expect.objectContaining({
        ruleIds: ['pin-0', 'pin-1'],
        founderIds: ['a'],
      }),
    ])
  })

  it('reports transitive must-link and same-company conflicts with every rule ID', () => {
    const founders = [
      founder('a', 'A', { company: 'Shared' }),
      founder('b', 'B', { company: 'Other' }),
      founder('c', 'C', { company: 'Shared' }),
    ]

    const result = compileHardRules(
      [
        {
          id: 'together-ab',
          type: 'must-sit-together',
          founders: [{ id: 'a' }, { id: 'b' }],
        },
        {
          id: 'together-bc',
          type: 'must-sit-together',
          founders: [{ id: 'b' }, { id: 'c' }],
        },
        { id: 'company-separation', type: 'same-company-separation' },
      ],
      founders,
    )

    expect(result.conflicts).toEqual([
      expect.objectContaining({
        ruleIds: ['company-separation', 'together-ab', 'together-bc'],
        founderIds: ['a', 'c'],
      }),
    ])
  })

  it('canonicalizes case-insensitive string and numeric-string field values', () => {
    const founders = [
      founder('a', 'A', { role: 'Engineering', age: 30 }),
      founder('b', 'B', { role: 'Design', age: 28 }),
    ]

    const result = compileHardRules(
      [
        {
          id: 'engineering-minimum',
          type: 'field-count',
          field: 'role',
          value: 'engineering',
          min: 1,
        },
        {
          id: 'age-30-maximum',
          type: 'field-count',
          field: 'age',
          value: '30',
          max: 1,
        },
      ],
      founders,
    )

    expect(result.conflicts).toEqual([])
    expect(result.rules).toEqual([
      expect.objectContaining({ id: 'engineering-minimum', value: 'Engineering' }),
      expect.objectContaining({ id: 'age-30-maximum', value: 30 }),
    ])
  })

  it('rejects exact field values that match no founder', () => {
    const founders = [founder('a', 'A', { role: 'Engineering' })]

    const result = compileHardRules(
      [
        {
          id: 'unknown-role',
          type: 'field-count',
          field: 'role',
          value: 'Astronaut',
          min: 1,
        },
      ],
      founders,
    )

    expect(result.rules).toEqual([])
    expect(result.conflicts).toEqual([
      expect.objectContaining({
        ruleIds: ['unknown-role'],
        founderIds: [],
        message: expect.stringMatching(/matches no founder/i),
      }),
    ])
  })

  it('compiles inclusive numeric field ranges and validates their bounds', () => {
    const founders = [
      founder('a', 'A', { age: 25 }),
      founder('b', 'B', { age: 30 }),
    ]

    const valid = compileHardRules(
      [
        {
          id: 'under-30',
          type: 'field-count',
          field: 'age',
          maxValue: '29',
          min: 1,
        },
      ],
      founders,
    )
    const invalid = compileHardRules(
      [
        {
          id: 'invalid-age-range',
          type: 'field-count',
          field: 'age',
          minValue: 40,
          maxValue: 20,
          min: 1,
        },
      ],
      founders,
    )

    expect(valid.conflicts).toEqual([])
    expect(valid.rules).toEqual([
      expect.objectContaining({
        id: 'under-30',
        field: 'age',
        minValue: undefined,
        maxValue: 29,
      }),
    ])
    expect(invalid.rules).toEqual([])
    expect(invalid.conflicts).toEqual([
      expect.objectContaining({
        ruleIds: ['invalid-age-range'],
        message: expect.stringMatching(/numeric.*range/i),
      }),
    ])
  })
})
