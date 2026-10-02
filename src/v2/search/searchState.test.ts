import { describe, expect, it } from 'vitest'

import rawFounders from '../../founders.json'
import { normalizeFounders } from '../../shared/founder'
import { executeSearch, type StructuredSearchQuery } from './searchEngine'
import {
  INITIAL_SEARCH_SESSION,
  SEARCH_SESSION_KEY,
  countActiveConstraints,
  deriveDefaultGroupBy,
  groupOptions,
  groupResults,
  isSearchActive,
  readSearchSession,
  sortOptions,
  sortResults,
  writeSearchSession,
} from './searchState'
import {
  ACCOUNT_ROLE_KEY,
  CURRENT_FOUNDER_KEY,
  readAccountRole,
  readCurrentFounderId,
  writeAccountRole,
  writeCurrentFounderId,
} from './accountState'

const founders = normalizeFounders(rawFounders)
const approvedQuery: StructuredSearchQuery = {
  text: '',
  dimensions: [
    { field: 'role', operator: 'is', value: 'Engineering' },
    { field: 'companyVertical', operator: 'is', value: 'B2B Software and Services' },
    { field: 'age', operator: 'between', value: { min: 25, max: 33 } },
  ],
}

describe('search presentation defaults', () => {
  it('populates Group by and Sort by from the schema registry', () => {
    expect(groupOptions().map((option) => option.label)).toEqual([
      'None',
      'Founder name',
      'Cohort group',
      'Cohort section',
      'Company vertical',
      'Company',
      'Education',
      'Role',
    ])
    expect(sortOptions().map((option) => option.label)).toEqual([
      'Relevance',
      'Founder ID',
      'Founder name',
      'Cohort group',
      'Cohort section',
      'Company vertical',
      'Company',
      'Age',
      'Education',
      'Role',
    ])
  })

  it('derives the default grouping from the matched dimensions', () => {
    expect(deriveDefaultGroupBy(approvedQuery)).toBe('companyVertical')
    expect(deriveDefaultGroupBy({ text: '', dimensions: [approvedQuery.dimensions[2], approvedQuery.dimensions[0]] })).toBe('role')
    expect(deriveDefaultGroupBy({ text: 'lantern', dimensions: [] })).toBe('none')
  })

  it('groups company verticals by top-level hierarchy in a stable order', () => {
    const results = executeSearch(founders, { text: '', dimensions: [{ field: 'role', operator: 'is', value: 'Sales' }] })
    const groups = groupResults(results, 'companyVertical')

    expect(groups.map((group) => group.label)).toEqual([...groups.map((group) => group.label)].sort())
    expect(groups.find((group) => group.label === 'B2B Software and Services')?.results.length).toBe(
      results.filter((result) => result.founder.companyVerticalLevels[0] === 'B2B Software and Services').length,
    )
    expect(groups.reduce((total, group) => total + group.results.length, 0)).toBe(results.length)
    expect(groupResults(results, 'none')).toEqual([{ key: 'all', label: null, results }])
  })

  it('sorts by relevance or by any sortable field without losing results', () => {
    const results = executeSearch(founders, approvedQuery)
    const byAge = sortResults(results, 'age')
    const byName = sortResults(results, 'name')

    expect(byAge.map((result) => result.founder.age)).toEqual([...results.map((result) => result.founder.age)].sort((a, b) => a - b))
    expect(byName.map((result) => result.founder.name)).toEqual(
      [...results.map((result) => result.founder.name)].sort((a, b) => a.localeCompare(b)),
    )
    expect(sortResults(results, 'relevance')).toEqual(results)
  })
})

describe('search session persistence', () => {
  it('round-trips the search session and rejects invalid stored state', () => {
    const session = { ...INITIAL_SEARCH_SESSION, active: true, input: 'engineers', submittedText: 'engineers', query: approvedQuery, view: 'list' as const }

    writeSearchSession(sessionStorage, session)
    expect(readSearchSession(sessionStorage)).toEqual(session)

    sessionStorage.setItem(SEARCH_SESSION_KEY, JSON.stringify({ ...session, query: { text: '', dimensions: [{ field: 'secret', operator: 'is', value: 'x' }] } }))
    expect(readSearchSession(sessionStorage)).toEqual(INITIAL_SEARCH_SESSION)

    sessionStorage.setItem(SEARCH_SESSION_KEY, '{not json')
    expect(readSearchSession(sessionStorage)).toEqual(INITIAL_SEARCH_SESSION)
  })

  it('restores a stored search with no constraints as zero-query discovery', () => {
    const emptied = { ...INITIAL_SEARCH_SESSION, active: true, input: 'engineers', submittedText: 'engineers', view: 'list' as const }

    writeSearchSession(sessionStorage, emptied)
    expect(readSearchSession(sessionStorage)).toEqual({ ...INITIAL_SEARCH_SESSION, view: 'list' })
  })
})

describe('search activity', () => {
  it('treats a query as active only when it has a dimension or keyword text', () => {
    expect(isSearchActive({ text: '', dimensions: [] })).toBe(false)
    expect(isSearchActive({ text: '   ', dimensions: [] })).toBe(false)
    expect(isSearchActive({ text: 'leonard', dimensions: [] })).toBe(true)
    expect(isSearchActive(approvedQuery)).toBe(true)
  })

  it('counts the keyword chip as an active constraint whenever keyword text is present', () => {
    expect(countActiveConstraints({ text: '', dimensions: [] })).toBe(0)
    expect(countActiveConstraints({ text: 'leonard', dimensions: [] })).toBe(1)
    expect(countActiveConstraints(approvedQuery)).toBe(3)
    expect(countActiveConstraints({ ...approvedQuery, text: 'design' })).toBe(4)
  })
})

describe('account state', () => {
  it('defaults to the YC Admin role and persists account changes', () => {
    localStorage.clear()
    expect(readAccountRole(localStorage)).toBe('admin')

    writeAccountRole(localStorage, 'founder')
    expect(localStorage.getItem(ACCOUNT_ROLE_KEY)).toBe('founder')
    expect(readAccountRole(localStorage)).toBe('founder')

    localStorage.setItem(ACCOUNT_ROLE_KEY, 'superuser')
    expect(readAccountRole(localStorage)).toBe('admin')
  })

  it('defaults the current founder to Di Qi and ignores unknown stored founders', () => {
    localStorage.clear()
    expect(readCurrentFounderId(localStorage, founders)).toBe('343105')

    writeCurrentFounderId(localStorage, '1518897')
    expect(localStorage.getItem(CURRENT_FOUNDER_KEY)).toBe('1518897')
    expect(readCurrentFounderId(localStorage, founders)).toBe('1518897')

    localStorage.setItem(CURRENT_FOUNDER_KEY, 'missing')
    expect(readCurrentFounderId(localStorage, founders)).toBe('343105')
    const withoutDiQi = founders.filter((founder) => founder.id !== '343105')
    expect(readCurrentFounderId(localStorage, withoutDiQi)).toBe(withoutDiQi[0].id)
    expect(readCurrentFounderId(localStorage, [])).toBeNull()
  })
})
