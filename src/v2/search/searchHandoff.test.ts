import { describe, expect, it } from 'vitest'

import rawFounders from '../../founders.json'
import { normalizeFounders } from '../../shared/founder'
import { executeSearch, type StructuredSearchQuery } from './searchEngine'
import { buildSearchResultsCsv, searchExportFilename } from './searchExport'
import {
  SEARCH_COHORT_KEY_PREFIX,
  buildDinnerHandoffUrl,
  createSearchCohortHandoff,
  parseDinnerHandoff,
  readSearchCohort,
} from './searchHandoff'

const founders = normalizeFounders(rawFounders)
const query: StructuredSearchQuery = { text: '', dimensions: [{ field: 'company', operator: 'is', value: 'Lantern' }] }

describe('Search-to-Dinner handoff', () => {
  it('stores the ordered cohort IDs and returns the approved dinner URL', () => {
    sessionStorage.clear()
    const handoff = createSearchCohortHandoff(sessionStorage, {
      founderIds: ['1518897', '343105'],
      query,
      submittedText: 'company Lantern',
      createdAt: '2026-10-01T12:00:00.000Z',
    })

    expect(handoff.id).toMatch(/^s-[0-9a-f]{8}$/)
    expect(handoff.url).toBe(`/v2/dinner?from=search&cohort=${handoff.id}`)
    expect(sessionStorage.getItem(`${SEARCH_COHORT_KEY_PREFIX}${handoff.id}`)).not.toBeNull()
    expect(readSearchCohort(sessionStorage, handoff.id)).toEqual({
      version: 1,
      id: handoff.id,
      source: 'search',
      founderIds: ['1518897', '343105'],
      count: 2,
      query,
      submittedText: 'company Lantern',
      createdAt: '2026-10-01T12:00:00.000Z',
    })
  })

  it('derives a deterministic cohort id from the ordered founder IDs', () => {
    const first = createSearchCohortHandoff(sessionStorage, { founderIds: ['a', 'b'], query, submittedText: '' })
    const repeat = createSearchCohortHandoff(sessionStorage, { founderIds: ['a', 'b'], query, submittedText: '' })
    const reordered = createSearchCohortHandoff(sessionStorage, { founderIds: ['b', 'a'], query, submittedText: '' })

    expect(repeat.id).toBe(first.id)
    expect(reordered.id).not.toBe(first.id)
  })

  it('parses dinner handoff URLs and rejects malformed cohorts', () => {
    expect(buildDinnerHandoffUrl('s-0000abcd')).toBe('/v2/dinner?from=search&cohort=s-0000abcd')
    expect(parseDinnerHandoff('?from=search&cohort=s-0000abcd')).toEqual({ cohortId: 's-0000abcd' })
    expect(parseDinnerHandoff('?from=direct')).toBeNull()
    expect(parseDinnerHandoff('?from=search')).toBeNull()

    sessionStorage.setItem(`${SEARCH_COHORT_KEY_PREFIX}s-bad`, JSON.stringify({ version: 1, founderIds: 'nope' }))
    expect(readSearchCohort(sessionStorage, 's-bad')).toBeNull()
    expect(readSearchCohort(sessionStorage, 's-missing')).toBeNull()
  })

  it('refuses to hand off a cohort without an active search or without founders', () => {
    sessionStorage.clear()
    const allFounderIds = founders.map((founder) => founder.id)
    const empty: StructuredSearchQuery = { text: '', dimensions: [] }

    expect(() =>
      createSearchCohortHandoff(sessionStorage, { founderIds: allFounderIds, query: empty, submittedText: '' }),
    ).toThrow('Dinner handoff needs an active search with results')
    expect(() => createSearchCohortHandoff(sessionStorage, { founderIds: [], query, submittedText: '' })).toThrow(
      'Dinner handoff needs an active search with results',
    )
    expect(sessionStorage.length).toBe(0)

    const stored = createSearchCohortHandoff(sessionStorage, { founderIds: ['343105'], query, submittedText: '' })
    const key = `${SEARCH_COHORT_KEY_PREFIX}${stored.id}`
    sessionStorage.setItem(key, JSON.stringify({ ...stored.payload, query: empty }))
    expect(readSearchCohort(sessionStorage, stored.id)).toBeNull()
  })
})

describe('Search export', () => {
  it('exports the current ordered result set with every founder source attribute', () => {
    const results = executeSearch(founders, query)
    const csv = buildSearchResultsCsv(results)
    const [header, ...rows] = csv.split('\r\n')

    expect(header).toBe(
      'Founder ID,Founder name,Company,Company vertical,Role,Age,Education,Cohort group,Cohort section,Matched dimensions',
    )
    expect(rows.map((row) => row.split(',')[0])).toEqual(results.map((result) => result.founder.id))
    expect(rows[0]).toContain('Lantern')
  })

  it('escapes CSV cells and neutralizes spreadsheet formulas', () => {
    const [result] = executeSearch(founders, query)
    const hostile = { ...result, founder: { ...result.founder, name: '=HYPERLINK("x")', company: 'Acme, "Inc"' } }
    const csv = buildSearchResultsCsv([hostile])

    expect(csv).toContain(`"'=HYPERLINK(""x"")"`)
    expect(csv).toContain('"Acme, ""Inc"""')
  })

  it('names the export file by date', () => {
    expect(searchExportFilename(new Date('2026-10-01T12:00:00Z'))).toBe('founder-search-results-2026-10-01.csv')
  })
})
