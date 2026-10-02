import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import rawFounders from '../../founders.json'
import { normalizeFounders } from '../../shared/founder'
import { ACCOUNT_ROLE_KEY, ACCOUNT_TIP_DISMISSED_KEY, CURRENT_FOUNDER_KEY } from './accountState'
import { buildDiscoveryCollections } from './discovery'
import { executeSearch, type SearchResult } from './searchEngine'
import { SEARCH_COHORT_KEY_PREFIX } from './searchHandoff'
import { SearchPage } from './SearchPage'

const founders = normalizeFounders(rawFounders)
const approvedText = 'Engineering founders in B2B software, age 25–33'

function renderSearch() {
  const navigate = vi.fn<(url: string) => void>()
  const exportResults = vi.fn<(results: readonly SearchResult[]) => void>()
  const view = render(<SearchPage founders={founders} navigate={navigate} exportResults={exportResults} />)
  return { ...view, navigate, exportResults }
}

function search(text: string) {
  fireEvent.change(screen.getByLabelText('Describe the founders you want to meet'), { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: 'Search' }))
}

function resultCount() {
  return screen.getByTestId('result-count').textContent
}

function liveRegion() {
  return screen.getByTestId('search-live-region')
}

function chooseAccount(name: RegExp) {
  fireEvent.click(screen.getByRole('button', { name: /Current (organizer|founder)/ }))
  fireEvent.click(screen.getByRole('menuitemradio', { name }))
}

function expectZeroQueryDiscovery() {
  expect(screen.getByRole('heading', { level: 2, name: 'Same sector, different seat' })).toBeInTheDocument()
  expect(screen.getByLabelText('Describe the founders you want to meet')).toHaveValue('')
  expect(screen.queryByTestId('result-count')).not.toBeInTheDocument()
  expect(screen.queryByText('No dimensions yet')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Export Results' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Create Dinner Matching/ })).not.toBeInTheDocument()
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

afterEach(() => {
  cleanup()
})

describe('SearchPage zero-query discovery', () => {
  it('shows the approved hero and three explainable collections without result actions', () => {
    renderSearch()

    expect(screen.getByRole('heading', { level: 1, name: 'Find the right founders.' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Describe the founders you want to meet' })).toHaveAttribute(
      'placeholder',
      'Try “Sales founders in fintech”',
    )
    for (const title of ['Same sector, different seat', 'Operators who round you out', 'People likely to get it quickly']) {
      expect(screen.getByRole('heading', { level: 2, name: title })).toBeInTheDocument()
    }
    const diQi = founders.find((founder) => founder.id === '343105')!
    const expected = buildDiscoveryCollections(founders, diQi)
    const firstCollection = screen.getByRole('region', { name: 'Same sector, different seat' })
    const rows = within(firstCollection).getAllByRole('button', { name: /More/ })
    expect(rows).toHaveLength(4)
    expect(rows[0]).toHaveTextContent(expected[0].founders[0].founder.name)
    expect(rows[0]).toHaveTextContent(expected[0].founders[0].reason)

    expect(screen.queryByText('Search dimensions used')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Export Results' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Create Dinner Matching/ })).not.toBeInTheDocument()
  })

  it('expands a recommendation to show every source attribute', () => {
    renderSearch()
    const row = within(screen.getByRole('region', { name: 'Same sector, different seat' })).getAllByRole('button', {
      name: /More/,
    })[0]

    expect(row).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(row)
    expect(row).toHaveAttribute('aria-expanded', 'true')
    expect(row).toHaveTextContent('Less ⌃')
    const details = document.getElementById(row.getAttribute('aria-controls')!)!
    expect(within(details).getByText('Founder ID')).toBeInTheDocument()
    expect(within(details).getByText('Cohort section')).toBeInTheDocument()
  })

  it('recomputes discovery for the persisted current founder', () => {
    const current = founders.find((founder) => founder.role === 'Sales' && founder.companyVerticalLevels[0] === 'Healthcare')!
    localStorage.setItem(CURRENT_FOUNDER_KEY, current.id)
    renderSearch()

    const [expected] = buildDiscoveryCollections(founders, current)
    const rows = within(screen.getByRole('region', { name: 'Same sector, different seat' })).getAllByRole('button', {
      name: /More/,
    })
    expect(rows.map((row) => row.querySelector('strong')?.textContent)).toEqual(
      expected.founders.map(({ founder }) => founder.name),
    )
  })
})

describe('SearchPage results', () => {
  it('compiles a query into editable dimensions and shows grid results grouped by company vertical', () => {
    renderSearch()
    search(approvedText)

    expect(resultCount()).toBe('56')
    expect(screen.getByText('Search dimensions used')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove Role dimension' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove Company vertical dimension' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove Age dimension' })).toBeInTheDocument()
    expect(screen.getByTestId('dimension-age')).toHaveTextContent('Age 25–33')
    expect(screen.getByLabelText('Group by')).toHaveValue('companyVertical')
    expect(screen.getByLabelText('Sort by')).toHaveValue('relevance')
    expect(screen.getByRole('button', { name: 'Grid view' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('heading', { level: 2, name: 'B2B Software and Services' })).toBeInTheDocument()
    expect(screen.getAllByRole('article')).toHaveLength(56)
    expect(screen.getByRole('button', { name: 'Export Results' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create Dinner Matching →' })).toBeInTheDocument()
  })

  it('shows matched dimensions and an independent attribute disclosure on each grid card', () => {
    renderSearch()
    search('company Lantern')

    const card = screen.getAllByRole('article')[0]
    expect(within(card).getByRole('heading', { level: 3 })).toHaveTextContent('Di Qi')
    expect(within(card).getByText('Matched dimensions')).toBeInTheDocument()
    expect(within(card).getByText('Lantern', { selector: '.v2-match-chip' })).toBeInTheDocument()
    const more = within(card).getByRole('button', { name: 'More ⌄' })
    expect(more).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(more)
    expect(more).toHaveAttribute('aria-expanded', 'true')
    expect(more).toHaveTextContent('Less ⌃')
    expect(within(card).getByText('343105')).toBeVisible()
  })

  it('switches between grid and list views with shared results', () => {
    renderSearch()
    search(approvedText)

    fireEvent.click(screen.getByRole('button', { name: 'List view' }))
    expect(screen.getByRole('button', { name: 'List view' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Grid view' })).toHaveAttribute('aria-pressed', 'false')
    const rows = screen.getAllByRole('article')
    expect(rows).toHaveLength(56)
    expect(rows[0]).toHaveTextContent(/\d · \d[A-Z]/)
    expect(within(rows[0]).getByRole('button', { name: /More/ })).toHaveAttribute('aria-expanded', 'false')
  })

  it('reruns Basic Search when a dimension chip is removed', () => {
    renderSearch()
    search(approvedText)

    fireEvent.click(screen.getByRole('button', { name: 'Remove Age dimension' }))
    const expected = executeSearch(founders, {
      text: '',
      dimensions: [
        { field: 'role', operator: 'is', value: 'Engineering' },
        { field: 'companyVertical', operator: 'is', value: 'B2B Software and Services' },
      ],
    })
    expect(resultCount()).toBe(String(expected.length))
    expect(screen.queryByTestId('dimension-age')).not.toBeInTheDocument()
    expect(liveRegion()).toHaveTextContent('Age dimension removed')
  })

  it('regroups and resorts without losing the result set', () => {
    renderSearch()
    search(approvedText)

    fireEvent.change(screen.getByLabelText('Group by'), { target: { value: 'education' } })
    expect(screen.getByRole('heading', { level: 2, name: 'Computer Science' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Group by'), { target: { value: 'none' } })
    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'age' } })
    const ages = screen.getAllByRole('article').map((card) => Number(card.getAttribute('data-age')))
    expect(ages).toEqual([...ages].sort((a, b) => a - b))
    expect(ages).toHaveLength(56)
  })

  it('restores the submitted search from the session', () => {
    const first = renderSearch()
    search(approvedText)
    fireEvent.click(screen.getByRole('button', { name: 'List view' }))
    first.unmount()

    renderSearch()
    expect(screen.getByLabelText('Describe the founders you want to meet')).toHaveValue(approvedText)
    expect(resultCount()).toBe('56')
    expect(screen.getByRole('button', { name: 'List view' })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('SearchPage dimension picker', () => {
  it('adds a schema dimension through the picker and returns focus', () => {
    renderSearch()
    search(approvedText)

    const add = screen.getByRole('button', { name: '+ Add dimension' })
    fireEvent.click(add)
    const dialog = screen.getByRole('dialog', { name: 'Add search dimension' })
    expect(add).toHaveAttribute('aria-expanded', 'true')
    expect(within(dialog).getByLabelText('Search fields')).toHaveFocus()

    const options = within(within(dialog).getByRole('listbox')).getAllByRole('option')
    expect(options.slice(-3).map((option) => option.textContent)).toEqual([
      'Company vertical Remove',
      'Age Remove',
      'Role Remove',
    ])
    fireEvent.click(within(dialog).getByRole('option', { name: /Cohort section/ }))
    expect(within(dialog).getByRole('heading', { level: 3, name: 'Cohort section' })).toBeInTheDocument()
    fireEvent.change(within(dialog).getByLabelText('Value'), { target: { value: '3I' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add dimension' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(add).toHaveFocus()
    expect(screen.getByTestId('dimension-cohortSection')).toHaveTextContent('Cohort section 3I')
    const expected = executeSearch(founders, {
      text: '',
      dimensions: [
        { field: 'role', operator: 'is', value: 'Engineering' },
        { field: 'companyVertical', operator: 'is', value: 'B2B Software and Services' },
        { field: 'age', operator: 'between', value: { min: 25, max: 33 } },
        { field: 'cohortSection', operator: 'is', value: '3I' },
      ],
    })
    expect(resultCount()).toBe(String(expected.length))
    expect(liveRegion()).toHaveTextContent('Cohort section dimension added')
  })

  it('filters fields, supports keyboard navigation, validates values, and closes on Escape', () => {
    renderSearch()
    search(approvedText)
    const add = screen.getByRole('button', { name: '+ Add dimension' })
    fireEvent.click(add)
    const dialog = screen.getByRole('dialog', { name: 'Add search dimension' })
    const fieldSearch = within(dialog).getByLabelText('Search fields')

    fireEvent.change(fieldSearch, { target: { value: 'educ' } })
    expect(within(within(dialog).getByRole('listbox')).getAllByRole('option')).toHaveLength(1)
    fireEvent.keyDown(fieldSearch, { key: 'ArrowDown' })
    expect(within(dialog).getByRole('option', { name: /Education/ })).toHaveFocus()
    fireEvent.keyDown(within(dialog).getByRole('option', { name: /Education/ }), { key: 'Enter' })
    expect(within(dialog).getByLabelText('Value')).toHaveFocus()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Add dimension' }))
    expect(liveRegion()).toHaveTextContent('Enter a value before adding the dimension')
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.change(fieldSearch, { target: { value: 'zzz' } })
    expect(within(dialog).getByText('No matching fields')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(add).toHaveFocus()
    expect(add).toHaveAttribute('aria-expanded', 'false')
  })

  it('removes an active field from inside the picker and supports number operators', () => {
    renderSearch()
    search(approvedText)
    fireEvent.click(screen.getByRole('button', { name: '+ Add dimension' }))
    const dialog = screen.getByRole('dialog', { name: 'Add search dimension' })

    fireEvent.click(within(dialog).getByRole('option', { name: /Age Remove/ }))
    expect(screen.queryByTestId('dimension-age')).not.toBeInTheDocument()
    expect(liveRegion()).toHaveTextContent('Age dimension removed')

    fireEvent.click(within(dialog).getByRole('option', { name: /Age \+ Add/ }))
    const operator = within(dialog).getByLabelText('Operator')
    expect([...(operator as HTMLSelectElement).options].map((option) => option.text)).toEqual([
      'is between',
      'is',
      'is at least',
      'is at most',
    ])
    fireEvent.change(operator, { target: { value: 'atLeast' } })
    fireEvent.change(within(dialog).getByLabelText('Value'), { target: { value: '30' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add dimension' }))
    expect(screen.getByTestId('dimension-age')).toHaveTextContent('Age at least 30')
  })
})

describe('SearchPage no-results recovery', () => {
  it('keeps the failed search applied and offers the approved recovery actions', () => {
    renderSearch()
    search('engineers age 50')

    expect(resultCount()).toBe('0')
    expect(screen.getByText('No results')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'No founders match both dimensions.' })).toBeInTheDocument()
    expect(
      screen.getByText('Your search and dimensions are still applied. Adjust one constraint rather than starting over.'),
    ).toBeInTheDocument()
    expect(screen.getByTestId('failed-query')).toHaveTextContent('engineers age 50')
    expect(screen.getByText('Tip: remove or broaden one dimension to preserve the intent of the original search.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Export Results' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Edit dimensions' }))
    expect(screen.getByRole('dialog', { name: 'Add search dimension' })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByRole('button', { name: 'Edit dimensions' })).toHaveFocus()

    fireEvent.click(screen.getByRole('button', { name: 'Clear all dimensions' }))
    expectZeroQueryDiscovery()
    expect(liveRegion()).toHaveTextContent('All dimensions cleared. Founder discovery shown')
  })

  it('returns to discovery when the final chip is removed instead of showing every founder', () => {
    const { navigate, exportResults } = renderSearch()
    search('company Lantern')
    expect(resultCount()).toBe(String(executeSearch(founders, { text: '', dimensions: [{ field: 'company', operator: 'is', value: 'Lantern' }] }).length))

    fireEvent.click(screen.getByRole('button', { name: 'Remove Company dimension' }))
    expectZeroQueryDiscovery()
    expect(liveRegion()).toHaveTextContent('Company dimension removed. Founder discovery shown')

    search('leonard')
    expect(screen.getByTestId('dimension-keywords')).toHaveTextContent('Keywords leonard')
    fireEvent.click(screen.getByRole('button', { name: 'Remove Keywords dimension' }))
    expectZeroQueryDiscovery()
    expect(navigate).not.toHaveBeenCalled()
    expect(exportResults).not.toHaveBeenCalled()
    expect(JSON.parse(sessionStorage.getItem('founder-v2-search-state') ?? '{}')).toMatchObject({ active: false })
  })

  it('returns to discovery when the final dimension is removed inside the picker', () => {
    renderSearch()
    search('company Lantern')
    fireEvent.click(screen.getByRole('button', { name: '+ Add dimension' }))
    const dialog = screen.getByRole('dialog', { name: 'Add search dimension' })

    fireEvent.click(within(dialog).getByRole('option', { name: /Company Remove/ }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expectZeroQueryDiscovery()
    expect(screen.getByLabelText('Describe the founders you want to meet')).toHaveFocus()
  })

  it('restores a stored search that has no constraints as discovery', () => {
    sessionStorage.setItem(
      'founder-v2-search-state',
      JSON.stringify({
        active: true,
        input: '',
        submittedText: '',
        query: { text: '', dimensions: [] },
        view: 'grid',
        groupBy: null,
        sortBy: null,
      }),
    )
    renderSearch()
    expectZeroQueryDiscovery()
  })

  it('returns to discovery when submitted text contains no searchable criteria', () => {
    renderSearch()
    search('founders')

    expectZeroQueryDiscovery()
    expect(liveRegion()).toHaveTextContent('No searchable criteria recognized. Founder discovery shown')
    expect(JSON.parse(sessionStorage.getItem('founder-v2-search-state') ?? '{}')).toMatchObject({ active: false })
  })

  it('describes the applied dimensions once the failed search has been edited', () => {
    renderSearch()
    search('engineers in fintech from Lantern age 50')
    expect(screen.getByTestId('failed-query')).toHaveTextContent('engineers in fintech from Lantern age 50')

    fireEvent.click(screen.getByRole('button', { name: 'Remove Company vertical dimension' }))
    expect(resultCount()).toBe('0')
    expect(screen.getByRole('heading', { level: 2, name: 'No founders match all three dimensions.' })).toBeInTheDocument()
    expect(screen.getByTestId('failed-query')).toHaveTextContent('Role Engineering · Company Lantern · Age 50')
  })

  it('returns to zero-query discovery', () => {
    renderSearch()
    search('company Lantern age 50')
    expect(screen.getByRole('heading', { level: 2, name: 'No founders match both dimensions.' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Return to discovery' }))
    expectZeroQueryDiscovery()
    expect(screen.getByLabelText('Describe the founders you want to meet')).toHaveFocus()
    expect(screen.queryByText('Search dimensions used')).not.toBeInTheDocument()
  })

  it('counts every applied dimension in the recovery heading', () => {
    renderSearch()
    search('engineers in fintech from Lantern age 50')
    expect(screen.getByRole('heading', { level: 2, name: 'No founders match all four dimensions.' })).toBeInTheDocument()
  })

  it('counts the Keywords chip as an applied constraint in the recovery heading', () => {
    renderSearch()
    search('engineers age 50 xyzzy')
    expect(screen.getByTestId('dimension-keywords')).toHaveTextContent('Keywords xyzzy')
    expect(screen.getByRole('heading', { level: 2, name: 'No founders match all three dimensions.' })).toBeInTheDocument()

    search('xyzzy')
    expect(screen.getByRole('heading', { level: 2, name: 'No founders match this dimension.' })).toBeInTheDocument()

    search('engineers age 50 xyzzy')
    fireEvent.click(screen.getByRole('button', { name: 'Remove Role dimension' }))
    expect(screen.getByRole('heading', { level: 2, name: 'No founders match both dimensions.' })).toBeInTheDocument()
    expect(screen.getByTestId('failed-query')).toHaveTextContent('Age 50 · Keywords xyzzy')
  })

  it('keeps a second value for the same field visible as a Keywords chip', () => {
    renderSearch()
    search('fintech or healthcare')

    expect(screen.getByTestId('dimension-companyVertical')).toHaveTextContent('Financial Technology and Services')
    expect(screen.getByTestId('dimension-keywords')).toHaveTextContent('Keywords healthcare')
    const expected = executeSearch(founders, {
      text: 'healthcare',
      dimensions: [{ field: 'companyVertical', operator: 'is', value: 'Financial Technology and Services' }],
    })
    expect(resultCount()).toBe(String(expected.length))
  })
})

describe('SearchPage roles and handoff', () => {
  it('shows organizer navigation and both result actions for YC Admin', () => {
    renderSearch()

    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(within(nav).getByRole('link', { name: 'Founder Index' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('link', { name: 'Seating Plans' })).toHaveAttribute('href', '/v2/seating-plans')
    expect(screen.getByRole('button', { name: /Current organizer/ })).toHaveTextContent('YC Admin')
  })

  it('switches to the founder account and keeps Export as the only result action', () => {
    renderSearch()
    chooseAccount(/Founder account/)

    expect(localStorage.getItem(ACCOUNT_ROLE_KEY)).toBe('founder')
    expect(screen.queryByRole('navigation', { name: 'Primary' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Current founder/ })).toHaveTextContent('Di Qi · Lantern')
    expect(screen.getByTestId('account-live-region')).toHaveTextContent(
      'Founder account selected. Export Results is the primary action.',
    )

    search(approvedText)
    expect(screen.getByRole('button', { name: 'Export Results' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Create Dinner Matching/ })).not.toBeInTheDocument()

    chooseAccount(/Organizer account/)
    expect(screen.getByRole('button', { name: /Create Dinner Matching/ })).toBeInTheDocument()
  })

  it('opens the account menu with keyboard support and closes it on Escape', () => {
    renderSearch()
    const trigger = screen.getByRole('button', { name: /Current organizer/ })

    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    const menu = screen.getByRole('menu')
    expect(within(menu).getByRole('menuitemradio', { name: /Organizer account/ })).toHaveFocus()
    expect(within(menu).getByRole('menuitemradio', { name: /Organizer account/ })).toHaveAttribute('aria-checked', 'true')
    fireEvent.keyDown(menu, { key: 'ArrowUp' })
    expect(within(menu).getByRole('menuitemradio', { name: /Founder account/ })).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('shows the account tip until it is dismissed', () => {
    const first = renderSearch()
    expect(screen.getByRole('complementary', { name: 'Switch account views' })).toHaveTextContent(
      'Toggle between Founder and YC Admin here.',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss account switcher tip' }))
    expect(screen.queryByRole('complementary', { name: 'Switch account views' })).not.toBeInTheDocument()
    expect(localStorage.getItem(ACCOUNT_TIP_DISMISSED_KEY)).toBe('true')
    first.unmount()

    renderSearch()
    expect(screen.queryByRole('complementary', { name: 'Switch account views' })).not.toBeInTheDocument()
  })

  it('hands the ordered result cohort to Dinner Matching', () => {
    const { navigate } = renderSearch()
    search(approvedText)

    fireEvent.click(screen.getByRole('button', { name: 'Create Dinner Matching →' }))
    expect(navigate).toHaveBeenCalledTimes(1)
    const url = navigate.mock.calls[0][0]
    expect(url).toMatch(/^\/v2\/dinner\?from=search&cohort=s-[0-9a-f]{8}$/)
    const cohortId = new URLSearchParams(url.split('?')[1]).get('cohort')
    const stored = JSON.parse(sessionStorage.getItem(`${SEARCH_COHORT_KEY_PREFIX}${cohortId}`)!)
    const displayedIds = screen.getAllByRole('article').map((card) => card.getAttribute('data-founder-id'))
    expect(stored.founderIds).toEqual(displayedIds)
    expect(stored.count).toBe(56)
    expect(stored.submittedText).toBe(approvedText)
  })

  it('exports the current ordered result set', () => {
    const { exportResults } = renderSearch()
    search(approvedText)
    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'name' } })

    fireEvent.click(screen.getByRole('button', { name: 'Export Results' }))
    const exported = exportResults.mock.calls[0][0].map((result) => result.founder.id)
    expect(exported).toEqual(screen.getAllByRole('article').map((card) => card.getAttribute('data-founder-id')))
    expect(liveRegion()).toHaveTextContent('Exported 56 founders')
  })

  it('renders the version switch and AI status in the footer', () => {
    renderSearch()
    const footer = screen.getByRole('contentinfo')

    expect(within(footer).getByRole('link', { name: 'V1' })).toHaveAttribute('href', '/v1')
    expect(within(footer).getByRole('link', { name: 'V2' })).toHaveAttribute('aria-current', 'page')
    expect(within(footer).getByText('+ AI Disabled')).toBeInTheDocument()
  })

  it('closes the account menu on an outside click', () => {
    renderSearch()
    fireEvent.click(screen.getByRole('button', { name: /Current organizer/ }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    act(() => {
      fireEvent.mouseDown(document.body)
    })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
