import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import rawFounders from '../founders.json'
import { buildScaleFixture } from '../shared/fixtures'
import { normalizeFounders } from '../shared/founder'
import { matchDinnerRoute, readPlanRequest } from './dinner/dinnerRoutes'
import { createSearchCohortHandoff } from './search/searchHandoff'
import { V2App } from './V2App'

const THREE = buildScaleFixture(normalizeFounders(rawFounders), 'three-tables')
const FOUNDERS = normalizeFounders(rawFounders)

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
  it('routes /v2 to Founder Search with injected founder data', () => {
    render(
      <V2App
        pathname="/v2"
        search=""
        initialFounders={FOUNDERS}
        initialCredentials={{
          masterKeyConfigured: true,
          providers: [
            { provider: 'openai', label: 'OpenAI', status: 'valid', lastFour: '1234', validatedAt: '2026-10-01T20:00:00.000Z' },
            { provider: 'anthropic', label: 'Anthropic', status: 'not_configured', lastFour: null, validatedAt: null },
            { provider: 'xai', label: 'xAI', status: 'not_configured', lastFour: null, validatedAt: null },
          ],
        }}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Find the right founders.' })).toBeInTheDocument()
    expect(screen.getByText('✓ AI Enabled · OpenAI')).toBeInTheDocument()
  })

  it('renders the dinner workbench at /v2/dinner with direct entry', async () => {
    render(<V2App pathname="/v2/dinner" search="" initialFounders={FOUNDERS} />)
    expect(await screen.findByLabelText(/Seating plan name/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Seating Plans' })).toHaveAttribute('aria-current', 'page')
  })

  it('passes the Search cohort handoff through to the dinner workbench', async () => {
    const handoff = createSearchCohortHandoff(window.sessionStorage, {
      founderIds: THREE.map((founder) => founder.id),
      query: { text: '', dimensions: [{ field: 'company', operator: 'is', value: 'Lantern' }] },
      submittedText: 'Lantern founders',
    })
    const { container } = render(
      <V2App
        pathname="/v2/dinner"
        search={`?from=search&cohort=${handoff.id}`}
        initialFounders={FOUNDERS}
      />,
    )
    await screen.findByLabelText(/Seating plan name/)
    expect(container.querySelector('.v2-setup-handoff-badge')).toHaveClass('v2-setup-handoff-visible')
  })

  it('renders the seating plans archive at /v2/seating-plans', async () => {
    render(
      <V2App
        pathname="/v2/seating-plans/"
        search=""
        initialFounders={FOUNDERS}
        initialPlans={[]}
      />,
    )
    expect(await screen.findByRole('heading', { name: 'Seating plans.', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Your first dinner starts here.' })).toBeInTheDocument()
  })

  it('renders the approved AI provider screen with injected status', async () => {
    render(
      <V2App
        pathname="/v2/settings/ai"
        search=""
        initialFounders={FOUNDERS}
        initialCredentials={{
          masterKeyConfigured: true,
          providers: [
            { provider: 'openai', label: 'OpenAI', status: 'not_configured', lastFour: null, validatedAt: null },
            { provider: 'anthropic', label: 'Anthropic', status: 'not_configured', lastFour: null, validatedAt: null },
            { provider: 'xai', label: 'xAI', status: 'not_configured', lastFour: null, validatedAt: null },
          ],
        }}
      />,
    )
    expect(await screen.findByRole('heading', { name: 'AI Provider' })).toBeInTheDocument()
  })

  it('renders founder web evidence at its detail route', async () => {
    render(
      <V2App
        pathname={`/v2/founders/${FOUNDERS[0]!.id}/evidence`}
        search=""
        initialFounders={FOUNDERS}
        initialEvidence={{ status: 'no_results', items: [] }}
      />,
    )
    expect(
      await screen.findByRole('heading', {
        name: 'Review the evidence, not just the summary.',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText('No citable evidence returned')).toBeInTheDocument()
  })

  it('waits for Demo fixtures before reopening a saved plan', async () => {
    window.localStorage.setItem('founder-app-demo-mode', 'true')
    render(
      <V2App
        pathname="/v2/dinner"
        search="?plan=demo-plan-three-table-roundtable&version=3"
      />,
    )
    expect(
      await screen.findByText('Demo · AI Infrastructure Roundtable'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/could not load/i)).not.toBeInTheDocument()
  })
})
