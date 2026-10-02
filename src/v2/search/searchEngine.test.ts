import { describe, expect, it } from 'vitest'

import rawFounders from '../../founders.json'
import { normalizeFounders, type Founder } from '../../shared/founder'
import {
  SEARCH_FIELDS,
  SearchQueryError,
  compileSearchText,
  executeSearch,
  formatDimensionValue,
  validateStructuredQuery,
  type SearchFieldDefinition,
  type StructuredSearchQuery,
} from './searchEngine'

const founders = normalizeFounders(rawFounders)

function query(dimensions: StructuredSearchQuery['dimensions'], text = ''): StructuredSearchQuery {
  return { text, dimensions }
}

function ids(results: { founder: Founder }[]) {
  return results.map((result) => result.founder.id)
}

describe('executeSearch', () => {
  it('matches exact values case-insensitively and reports the exact matcher', () => {
    const results = executeSearch(founders, query([{ field: 'role', operator: 'is', value: 'engineering' }]))

    expect(results).toHaveLength(185)
    expect(results.every((result) => result.founder.role === 'Engineering')).toBe(true)
    expect(results[0].matchedDimensions).toEqual([
      expect.objectContaining({
        field: 'role',
        label: 'Role',
        operator: 'is',
        matchType: 'exact',
        value: 'Engineering',
        reason: 'Role is Engineering',
      }),
    ])
  })

  it('matches prefixes and substrings with distinct matcher output', () => {
    const prefix = executeSearch(founders, query([{ field: 'company', operator: 'startsWith', value: 'LANT' }]))
    const substring = executeSearch(founders, query([{ field: 'education', operator: 'contains', value: 'science' }]))

    expect(prefix.map((result) => result.founder.name).sort()).toEqual(['Di Qi', 'Narek Galstyan'])
    expect(prefix[0].matchedDimensions[0]).toMatchObject({
      matchType: 'prefix',
      reason: 'Company "Lantern" starts with "LANT"',
    })
    expect(substring).toHaveLength(92)
    expect(substring[0].matchedDimensions[0]).toMatchObject({
      matchType: 'substring',
      reason: 'Education "Computer Science" contains "science"',
    })
  })

  it('matches accents insensitively in free text and explains which field matched', () => {
    const results = executeSearch(founders, query([], 'leonard'))

    expect(results.map((result) => result.founder.name).sort()).toEqual(['Leonardo Ubbiali', 'Léonard Henriquez'])
    const henriquez = results.find((result) => result.founder.name === 'Léonard Henriquez')
    expect(henriquez?.matchedDimensions).toEqual([
      expect.objectContaining({ field: 'name', source: 'text', matchType: 'prefix', value: 'Léonard Henriquez' }),
    ])
  })

  it('requires every free-text token to match some searchable field', () => {
    const results = executeSearch(founders, query([], 'di qi'))

    expect(ids(results)).toEqual(['343105'])
    expect(results[0].matchedDimensions.map((dimension) => dimension.field)).toEqual(['name', 'name'])
  })

  it('matches the company-vertical hierarchy at any level', () => {
    const topLevel = executeSearch(
      founders,
      query([{ field: 'companyVertical', operator: 'is', value: 'B2B Software and Services' }]),
    )
    const childLevel = executeSearch(founders, query([{ field: 'companyVertical', operator: 'is', value: 'Analytics' }]))

    expect(topLevel).toHaveLength(377)
    const child = topLevel.find((result) => result.founder.companyVerticalLevels.length > 1)
    expect(child?.matchedDimensions[0]).toMatchObject({ matchType: 'hierarchy' })
    expect(child?.matchedDimensions[0].reason).toBe(
      `Company vertical ${child?.founder.companyVertical} is within B2B Software and Services`,
    )
    const exact = topLevel.find((result) => result.founder.companyVerticalLevels.length === 1)
    expect(exact?.matchedDimensions[0]).toMatchObject({ matchType: 'exact' })
    expect(childLevel).toHaveLength(41)
    expect(childLevel.every((result) => result.founder.companyVerticalLevels[1] === 'Analytics')).toBe(true)
  })

  it('matches numeric exact values and inclusive ranges', () => {
    const between = executeSearch(founders, query([{ field: 'age', operator: 'between', value: { min: 25, max: 33 } }]))
    const atLeast = executeSearch(founders, query([{ field: 'age', operator: 'atLeast', value: 38 }]))
    const atMost = executeSearch(founders, query([{ field: 'age', operator: 'atMost', value: 18 }]))
    const exact = executeSearch(founders, query([{ field: 'age', operator: 'is', value: 33 }]))

    expect(between.every((result) => result.founder.age >= 25 && result.founder.age <= 33)).toBe(true)
    expect(between[0].matchedDimensions[0]).toMatchObject({
      matchType: 'range',
      reason: `Age ${between[0].founder.age} is between 25 and 33`,
    })
    expect(atLeast.map((result) => result.founder.age).every((age) => age >= 38)).toBe(true)
    expect(atLeast).toHaveLength(7)
    expect(atLeast[0].matchedDimensions[0].reason).toBe(`Age ${atLeast[0].founder.age} is at least 38`)
    expect(atMost).toHaveLength(15)
    expect(atMost[0].matchedDimensions[0].reason).toBe('Age 18 is at most 18')
    expect(exact).toHaveLength(23)
    expect(exact[0].matchedDimensions[0]).toMatchObject({ matchType: 'exact', reason: 'Age is 33' })
  })

  it('supports enum, boolean, nested-field, and array schema fields', () => {
    const syntheticFields: SearchFieldDefinition[] = [
      ...SEARCH_FIELDS,
      { key: 'stage', path: 'stage', label: 'Stage', kind: 'enum', values: ['Seed', 'Series A'], search: false, filter: true, group: true, sort: true, aliases: ['stage'] },
      { key: 'openToIntros', path: 'openToIntros', label: 'Open to intros', kind: 'boolean', search: false, filter: true, group: true, sort: false, aliases: [] },
      { key: 'rawSection', path: 'raw.Group Section', label: 'Raw section', kind: 'text', search: false, filter: true, group: false, sort: false, aliases: [] },
      { key: 'verticalLevels', path: 'companyVerticalLevels', label: 'Vertical levels', kind: 'text', search: false, filter: true, group: false, sort: false, aliases: [] },
    ]
    const sample = founders
      .slice(0, 4)
      .map((founder, index) => ({ ...founder, stage: index % 2 ? 'Series A' : 'Seed', openToIntros: index < 3 }) as Founder)

    const seed = executeSearch(sample, query([{ field: 'stage', operator: 'is', value: 'seed' }]), syntheticFields)
    const open = executeSearch(sample, query([{ field: 'openToIntros', operator: 'is', value: false }]), syntheticFields)
    const nested = executeSearch(founders, query([{ field: 'rawSection', operator: 'is', value: '3i' }]), syntheticFields)
    const array = executeSearch(founders, query([{ field: 'verticalLevels', operator: 'is', value: 'payments' }]), syntheticFields)

    expect(seed).toHaveLength(2)
    expect(seed[0].matchedDimensions[0]).toMatchObject({ matchType: 'enum', reason: 'Stage is Seed' })
    expect(open).toHaveLength(1)
    expect(open[0].matchedDimensions[0]).toMatchObject({ matchType: 'boolean', reason: 'Open to intros is no' })
    expect(nested).toHaveLength(17)
    expect(array).toHaveLength(6)
    expect(array[0].matchedDimensions[0]).toMatchObject({ value: 'Payments', matchType: 'exact' })
    expect(() =>
      executeSearch(sample, query([{ field: 'stage', operator: 'is', value: 'Series Z' }]), syntheticFields),
    ).toThrow('Stage must be one of Seed, Series A')
  })

  it('combines dimensions with AND semantics and builds explanations from matcher output', () => {
    const results = executeSearch(
      founders,
      query([
        { field: 'role', operator: 'is', value: 'Engineering' },
        { field: 'companyVertical', operator: 'is', value: 'B2B Software and Services' },
        { field: 'age', operator: 'between', value: { min: 25, max: 33 } },
      ]),
    )

    expect(results).toHaveLength(56)
    for (const result of results) {
      expect(result.matchedDimensions.map((dimension) => dimension.field)).toEqual(['role', 'companyVertical', 'age'])
      expect(result.explanation).toBe(result.matchedDimensions.map((dimension) => dimension.reason).join('; '))
      expect(result.score).toBe(result.matchedDimensions.reduce((total, dimension) => total + dimension.score, 0))
    }
  })

  it('orders deterministically by score, then name, then id', () => {
    const first = executeSearch(founders, query([], 'design'))
    const second = executeSearch([...founders].reverse(), query([], 'design'))

    expect(first.length).toBeGreaterThan(0)
    expect(ids(first)).toEqual(ids(second))
    for (let index = 1; index < first.length; index += 1) {
      const previous = first[index - 1]
      const current = first[index]
      expect(
        previous.score > current.score ||
          (previous.score === current.score && previous.founder.name.localeCompare(current.founder.name) <= 0),
      ).toBe(true)
    }
  })

  it('rejects unknown fields, non-filterable fields, unsupported operators, and invalid values', () => {
    expect(() => executeSearch(founders, query([{ field: 'favoriteColor', operator: 'is', value: 'blue' }]))).toThrow(
      new SearchQueryError('Unknown search field "favoriteColor"'),
    )
    expect(() => validateStructuredQuery(query([{ field: 'name', operator: 'is', value: 'Di Qi' }]))).toThrow(
      'Founder name cannot be used as a search dimension',
    )
    expect(() => validateStructuredQuery(query([{ field: 'role', operator: 'between', value: { min: 1, max: 2 } }]))).toThrow(
      'Unsupported operator "between" for Role',
    )
    expect(() => validateStructuredQuery(query([{ field: 'age', operator: 'between', value: { min: 40, max: 20 } }]))).toThrow(
      'Age range must have a minimum no greater than its maximum',
    )
    expect(() => validateStructuredQuery(query([{ field: 'role', operator: 'is', value: '   ' }]))).toThrow(
      'Role needs a value',
    )
  })
})

describe('compileSearchText', () => {
  it('compiles the approved example into role, vertical hierarchy, and age range dimensions', () => {
    expect(compileSearchText('Engineering founders in B2B software, age 25–33', founders)).toEqual({
      text: '',
      dimensions: [
        { field: 'role', operator: 'is', value: 'Engineering' },
        { field: 'companyVertical', operator: 'is', value: 'B2B Software and Services' },
        { field: 'age', operator: 'between', value: { min: 25, max: 33 } },
      ],
    })
  })

  it('recognizes vertical synonyms and child verticals as hierarchy paths', () => {
    expect(compileSearchText('Sales founders in fintech', founders).dimensions).toEqual([
      { field: 'role', operator: 'is', value: 'Sales' },
      { field: 'companyVertical', operator: 'is', value: 'Financial Technology and Services' },
    ])
    expect(compileSearchText('designers working on payments', founders).dimensions).toEqual([
      { field: 'role', operator: 'is', value: 'Design' },
      { field: 'companyVertical', operator: 'is', value: 'Financial Technology and Services -> Payments' },
    ])
  })

  it('recognizes schema aliases, cohort codes, education, and companies in reading order', () => {
    expect(compileSearchText('industry: healthcare cohort 3', founders).dimensions).toEqual([
      { field: 'companyVertical', operator: 'is', value: 'Healthcare' },
      { field: 'cohortGroup', operator: 'is', value: '3' },
    ])
    expect(compileSearchText('physics founders in section 3i at Lantern', founders).dimensions).toEqual([
      { field: 'education', operator: 'is', value: 'Physics' },
      { field: 'cohortSection', operator: 'is', value: '3I' },
      { field: 'company', operator: 'is', value: 'Lantern' },
    ])
  })

  it('recognizes open-ended and decade age expressions', () => {
    expect(compileSearchText('founders over 30', founders).dimensions).toEqual([
      { field: 'age', operator: 'atLeast', value: 31 },
    ])
    expect(compileSearchText('founders under 25', founders).dimensions).toEqual([
      { field: 'age', operator: 'atMost', value: 24 },
    ])
    expect(compileSearchText('engineers in their 30s', founders).dimensions).toEqual([
      { field: 'role', operator: 'is', value: 'Engineering' },
      { field: 'age', operator: 'between', value: { min: 30, max: 39 } },
    ])
    expect(compileSearchText('aged 33', founders).dimensions).toEqual([{ field: 'age', operator: 'is', value: 33 }])
  })

  it('keeps unrecognized words as free text and drops filler words', () => {
    expect(compileSearchText('Find founders like Léonard', founders)).toEqual({ text: 'leonard', dimensions: [] })
    expect(compileSearchText('   ', founders)).toEqual({ text: '', dimensions: [] })
  })

  it('treats bare schema alias words as interpretation hints rather than required keywords', () => {
    expect(compileSearchText('designers with a business background', founders)).toEqual({
      text: '',
      dimensions: [
        { field: 'role', operator: 'is', value: 'Design' },
        { field: 'education', operator: 'is', value: 'Business' },
      ],
    })
  })

  it('produces queries that validate and execute through Basic Search', () => {
    const compiled = compileSearchText('Engineering founders in B2B software, age 25–33', founders)

    expect(() => validateStructuredQuery(compiled)).not.toThrow()
    expect(executeSearch(founders, compiled)).toHaveLength(56)
  })
})

describe('formatDimensionValue', () => {
  it('formats dimension values for chips', () => {
    expect(formatDimensionValue({ field: 'age', operator: 'between', value: { min: 25, max: 33 } })).toBe('25–33')
    expect(formatDimensionValue({ field: 'age', operator: 'atLeast', value: 31 })).toBe('at least 31')
    expect(formatDimensionValue({ field: 'age', operator: 'atMost', value: 24 })).toBe('at most 24')
    expect(formatDimensionValue({ field: 'role', operator: 'is', value: 'Engineering' })).toBe('Engineering')
    expect(formatDimensionValue({ field: 'company', operator: 'contains', value: 'lan' })).toBe('contains “lan”')
    expect(formatDimensionValue({ field: 'company', operator: 'startsWith', value: 'lan' })).toBe('starts with “lan”')
  })
})
