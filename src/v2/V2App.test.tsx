import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import rawFounders from '../founders.json'
import { buildScaleFixture } from '../shared/fixtures'
import { normalizeFounders } from '../shared/founder'
import { matchDinnerRoute, readPlanRequest } from './dinner/dinnerRoutes'
import { createSearchCohortHandoff } from './search/searchHandoff'
import { V2App } from './V2App'

const THREE = buildScaleFixture(normalizeFounders(rawFounders), 'three-tables')

beforeEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
  window.localStorage.setItem('founder-v2-account-tip-dismissed', 'true')
})

afterEach(() => cleanup())

describe('dinner route matching', () => {
  it('matches only the Task 7 dinner paths, tolerating a trailing slash', () => {
    expect(matchDinnerRoute('/v2/dinner')).toBe('dinner')
    expect(matchDinnerRoute('/v2/dinner/')).toBe('dinner')
    expect(matchDinnerRoute('/v2/seating-plans')).toBe('seating-plans')
    expect(matchDinnerRoute('/v2/seating-plans/')).toBe('seating-plans')
    expect(matchDinnerRoute('/v2')).toBeNull()
    expect(matchDinnerRoute('/v2/search')).toBeNull()
    expect(matchDinnerRoute('/v2/dinnerx')).toBeNull()
    expect(matchDinnerRoute('/v1/dinner')).toBeNull()
  })

  it('reads a saved-plan reopen request for the coordinator', () => {
    expect(readPlanRequest('?plan=demo-day&version=4')).toEqual({ planId: 'demo-day', version: 4 })
    expect(readPlanRequest('?plan=demo%20day')).toEqual({ planId: 'demo day', version: null })
    expect(readPlanRequest('?plan=demo&version=zero')).toEqual({ planId: 'demo', version: null })
    expect(readPlanRequest('?from=search&cohort=abc')).toBeNull()
    expect(readPlanRequest('')).toBeNull()
  })
})

describe('V2App routing', () => {
  it('keeps the V2 shell at /v2', () => {
    render(<V2App pathname="/v2" search="" />)
    expect(screen.getByText('Founder Search')).toBeInTheDocument()
  })

  it('renders the dinner workbench at /v2/dinner with direct entry', async () => {
    render(<V2App pathname="/v2/dinner" search="" />)
    expect(await screen.findByLabelText(/Seating plan name/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Seating Plans' })).toHaveAttribute('aria-current', 'page')
  })

  it('passes the Search cohort handoff through to the dinner workbench', async () => {
    const handoff = createSearchCohortHandoff(window.sessionStorage, {
      founderIds: THREE.map((founder) => founder.id),
      query: { text: '', dimensions: [{ field: 'company', operator: 'is', value: 'Lantern' }] },
      submittedText: 'Lantern founders',
    })
    const { container } = render(<V2App pathname="/v2/dinner" search={`?from=search&cohort=${handoff.id}`} />)
    await screen.findByLabelText(/Seating plan name/)
    expect(container.querySelector('.v2-setup-handoff-badge')).toHaveClass('v2-setup-handoff-visible')
  })

  it('renders the seating plans archive at /v2/seating-plans', async () => {
    render(<V2App pathname="/v2/seating-plans/" search="" />)
    expect(await screen.findByRole('heading', { name: 'Seating plans.', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Your first dinner starts here.' })).toBeInTheDocument()
  })
})
