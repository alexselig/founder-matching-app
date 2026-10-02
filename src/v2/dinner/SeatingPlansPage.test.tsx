import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import rawFounders from '../../founders.json'
import { normalizeFounders } from '../../shared/founder'
import { ACCOUNT_ROLE_KEY } from '../search/accountState'
import { SeatingPlansPage, type SeatingPlanSummary, type SeatingPlansPageProps } from './SeatingPlansPage'

const FOUNDERS = normalizeFounders(rawFounders)
const NOW = new Date(2026, 9, 1, 18, 0)

const PLANS: readonly SeatingPlanSummary[] = [
  {
    id: 'demo-day',
    name: 'Demo Day Founder Dinner',
    description: 'Shared industries · mixed roles and ages · 2 hard rules',
    status: 'ready',
    founderCount: 48,
    tableCount: 6,
    seatsPerTable: 8,
    version: 4,
    updatedAt: new Date(2026, 9, 1, 16, 42).toISOString(),
    updatedBy: 'YC Admin',
    versions: [
      { version: 4, title: 'Manual swaps and final locks', detail: '48 founders · 6 tables · 2 hard rules', savedAt: new Date(2026, 9, 1, 16, 42).toISOString(), savedBy: 'YC Admin' },
      { version: 3, title: 'Alternative 2 selected', detail: '48 founders · 6 tables · 2 hard rules', savedAt: new Date(2026, 9, 1, 15, 18).toISOString(), savedBy: 'YC Admin' },
      { version: 2, title: 'Added competitor separation rule', detail: '48 founders · 6 tables · 2 hard rules', savedAt: new Date(2026, 9, 1, 14, 51).toISOString(), savedBy: 'YC Admin' },
      { version: 1, title: 'Initial generated tables', detail: '48 founders · 6 tables · 1 hard rule', savedAt: new Date(2026, 9, 1, 14, 34).toISOString(), savedBy: 'YC Admin' },
    ],
  },
  {
    id: 'ai-infra',
    name: 'AI Infrastructure Roundtable',
    description: 'Shared market context · role diversity · no hard rules',
    status: 'draft',
    founderCount: 24,
    tableCount: 3,
    seatsPerTable: 8,
    version: 2,
    updatedAt: new Date(2026, 8, 30, 18, 15).toISOString(),
    updatedBy: 'YC Admin',
  },
  {
    id: 'fintech',
    name: 'Fintech Operator Mix',
    description: 'Maximum functional diversity · engineering at every table',
    status: 'ready',
    founderCount: 40,
    tableCount: 5,
    seatsPerTable: 8,
    version: 7,
    updatedAt: new Date(2026, 8, 29, 11, 8).toISOString(),
    updatedBy: 'Maya Chen',
  },
  {
    id: 'all-cohort',
    name: 'All Cohort Dinner Test',
    description: '1 founder record changed since this plan was saved',
    status: 'warning',
    founderCount: 160,
    needsReview: 1,
    tableCount: 20,
    seatsPerTable: 8,
    version: 3,
    updatedAt: new Date(2026, 8, 28, 9, 27).toISOString(),
    updatedBy: 'YC Admin',
  },
  {
    id: 'w24',
    name: 'W24 New Founder Welcome',
    description: 'Similar company stage · mixed cohort sections',
    status: 'draft',
    founderCount: 0,
    tableCount: 7,
    seatsPerTable: 8,
    version: 1,
    updatedAt: new Date(2026, 8, 26, 14, 3).toISOString(),
    updatedBy: 'YC Admin',
  },
]

function renderPlans(props: Partial<SeatingPlansPageProps> = {}) {
  return render(<SeatingPlansPage founders={FOUNDERS} plans={PLANS} now={() => NOW} {...props} />)
}

function row(name: string) {
  return screen.getByRole('heading', { name, level: 2 }).closest('article') as HTMLElement
}

function liveText() {
  return screen.getByTestId('plans-live-region').textContent
}

beforeEach(() => {
  window.localStorage.clear()
  window.localStorage.setItem('founder-v2-account-tip-dismissed', 'true')
})

afterEach(() => {
  cleanup()
})

describe('SeatingPlansPage index', () => {
  it('renders the approved archive with derived hero stats, row metadata, and shared chrome', () => {
    const { container } = renderPlans()

    expect(screen.getByRole('link', { name: 'Seating Plans' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('heading', { name: 'Seating plans.', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Pick up where you left off.', level: 2 })).toBeInTheDocument()
    const stats = [...container.querySelectorAll('.v2-plans-hero-stat')].map((stat) => stat.textContent)
    expect(stats).toEqual(['5Saved plans', '272Founders placed', '41Total tables'])
    expect(screen.getByText('5 seating plans')).toBeInTheDocument()

    const demo = row('Demo Day Founder Dinner')
    expect(within(demo).getByText('Shared industries · mixed roles and ages · 2 hard rules')).toBeInTheDocument()
    expect(within(demo).getByText('Ready')).toHaveClass('v2-plans-status', 'v2-plans-ready')
    expect(within(demo).getByText('48 founders')).toBeInTheDocument()
    expect(within(demo).getByText('Complete cohort')).toBeInTheDocument()
    expect(within(demo).getByText('6 tables')).toBeInTheDocument()
    expect(within(demo).getByText('8 seats each')).toBeInTheDocument()
    expect(within(demo).getByText('Today · 4:42 PM')).toBeInTheDocument()
    expect(within(demo).getByText('Version 4 · YC Admin')).toBeInTheDocument()
    expect(within(demo).getByRole('button', { name: 'Reopen' })).toHaveClass('v2-plans-reopen')
    expect(within(demo).getByRole('button', { name: 'Versions · 4' })).toHaveAttribute('aria-expanded', 'false')
    expect(within(demo).getByRole('button', { name: 'Delete Demo Day Founder Dinner' })).toHaveTextContent('×')

    expect(within(row('AI Infrastructure Roundtable')).getByText('Sep 30 · 6:15 PM')).toBeInTheDocument()
    const warning = row('All Cohort Dinner Test')
    expect(within(warning).getByText('Needs attention')).toHaveClass('v2-plans-warning')
    expect(within(warning).getByText('1 needs review')).toBeInTheDocument()
    expect(within(warning).getByRole('button', { name: 'Review' })).toBeInTheDocument()
    const setupOnly = row('W24 New Founder Welcome')
    expect(within(setupOnly).getByText('Cohort not selected')).toBeInTheDocument()
    expect(within(setupOnly).getByText('Setup only')).toBeInTheDocument()
    expect(within(setupOnly).getByText('Draft')).toHaveClass('v2-plans-draft')
  })

  it('shows the approved zero state and routes both creation actions to the dinner workbench', () => {
    const navigate = vi.fn()
    const { container } = renderPlans({ plans: [], navigate })

    expect(screen.getByRole('heading', { name: 'Build your first dinner.', level: 2 })).toBeInTheDocument()
    expect(screen.getByText('Start with a cohort and table count, then shape the introductions with matching criteria.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Your first dinner starts here.', level: 2 })).toBeInTheDocument()
    expect([...container.querySelectorAll('.v2-plans-hero-stat strong')].map((stat) => stat.textContent)).toEqual(['0', '0', '0'])
    expect(container.querySelector('.v2-plans-hero-summary')).toHaveClass('v2-plans-zero-state')
    expect(screen.queryByLabelText('Find a plan')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /New seating plan/ })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Create your first seating plan/ }))
    expect(navigate).toHaveBeenCalledWith('/v2/dinner')

    cleanup()
    renderPlans({ navigate })
    fireEvent.click(screen.getByRole('button', { name: /New seating plan/ }))
    expect(navigate).toHaveBeenLastCalledWith('/v2/dinner')
  })

  it('filters by name and status, keeps the count in sync, and closes open history', () => {
    renderPlans()
    fireEvent.click(within(row('Demo Day Founder Dinner')).getByRole('button', { name: 'Versions · 4' }))
    expect(screen.getByRole('region', { name: 'Version history · Demo Day Founder Dinner' })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Find a plan'), { target: { value: 'DINNER' } })
    expect(screen.queryByRole('region', { name: /Version history/ })).not.toBeInTheDocument()
    expect(screen.getByText('2 seating plans')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Fintech Operator Mix' })).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'warning' } })
    expect(screen.getByText('1 seating plan')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'All Cohort Dinner Test' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Demo Day Founder Dinner' })).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Find a plan'), { target: { value: 'nothing here' } })
    expect(screen.getByText('0 seating plans')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Pick up where you left off.' })).toBeInTheDocument()
  })
})

describe('SeatingPlansPage reopen and versions', () => {
  it('reopens the latest version and flags missing-founder recovery for plans that need attention', () => {
    const onOpenPlan = vi.fn()
    renderPlans({ onOpenPlan })

    fireEvent.click(within(row('Demo Day Founder Dinner')).getByRole('button', { name: 'Reopen' }))
    expect(onOpenPlan).toHaveBeenCalledWith('demo-day', 4)
    expect(liveText()).toBe('Demo Day Founder Dinner reopened at its latest version')

    fireEvent.click(within(row('All Cohort Dinner Test')).getByRole('button', { name: 'Review' }))
    expect(onOpenPlan).toHaveBeenLastCalledWith('all-cohort', 3)
    expect(liveText()).toBe('All Cohort Dinner Test opened with a missing-founder recovery warning')
  })

  it('defaults reopen navigation to the dinner workbench with the plan and version', () => {
    const navigate = vi.fn()
    renderPlans({ navigate })
    fireEvent.click(within(row('Fintech Operator Mix')).getByRole('button', { name: 'Reopen' }))
    expect(navigate).toHaveBeenCalledWith('/v2/dinner?plan=fintech&version=7')
  })

  it('opens one version history at a time, opens specific versions, and returns focus on close', () => {
    const onOpenPlan = vi.fn()
    renderPlans({ onOpenPlan })
    const demo = row('Demo Day Founder Dinner')
    const trigger = within(demo).getByRole('button', { name: 'Versions · 4' })

    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(demo).toHaveClass('v2-plans-history-open')
    expect(liveText()).toBe('Showing version history for Demo Day Founder Dinner')
    const history = screen.getByRole('region', { name: 'Version history · Demo Day Founder Dinner' })
    expect(within(history).getByText('Opening an earlier version keeps the latest intact. Saving it creates the next version.')).toBeInTheDocument()
    const rows = [...history.querySelectorAll('.v2-plans-version-row')]
    expect(rows.map((item) => item.querySelector('.v2-plans-version-number')?.textContent)).toEqual(['V4Current', 'V3', 'V2', 'V1'])
    expect(within(history).getByText('Added competitor separation rule')).toBeInTheDocument()
    expect(within(history).getByText('48 founders · 6 tables · 1 hard rule')).toBeInTheDocument()
    expect(within(history).getAllByText('Today · 2:51 PM')).toHaveLength(1)

    fireEvent.click(within(rows[0] as HTMLElement).getByRole('button', { name: 'Open current' }))
    expect(onOpenPlan).toHaveBeenCalledWith('demo-day', 4)
    expect(liveText()).toBe('Opening current version 4')
    fireEvent.click(within(rows[1] as HTMLElement).getByRole('button', { name: 'Open version' }))
    expect(onOpenPlan).toHaveBeenLastCalledWith('demo-day', 3)
    expect(liveText()).toBe('Opening version 3 as an editable copy')

    fireEvent.click(within(row('Fintech Operator Mix')).getByRole('button', { name: 'Versions · 7' }))
    expect(screen.getAllByRole('region', { name: /Version history/ })).toHaveLength(1)
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    const compact = screen.getByRole('region', { name: 'Version history · Fintech Operator Mix' })
    expect([...compact.querySelectorAll('.v2-plans-version-number')].map((item) => item.textContent)).toEqual([
      'V7Current', 'V6', 'V5', 'V4', 'V3', 'V2', 'V1',
    ])
    expect(within(compact).getByText('Latest saved configuration')).toBeInTheDocument()
    expect(within(compact).getAllByText('Earlier saved configuration')).toHaveLength(6)
    expect(within(compact).getByText('Most recent')).toBeInTheDocument()
    expect(within(compact).getByText('1 save earlier')).toBeInTheDocument()
    expect(within(compact).getByText('6 saves earlier')).toBeInTheDocument()

    fireEvent.click(within(compact).getByRole('button', { name: 'Close version history ↑' }))
    expect(screen.queryByRole('region', { name: /Version history/ })).not.toBeInTheDocument()
    expect(within(row('Fintech Operator Mix')).getByRole('button', { name: 'Versions · 7' })).toHaveFocus()
  })
})

describe('SeatingPlansPage delete confirmation', () => {
  it('confirms permanently, traps focus, and returns focus to the trigger on cancel or Escape', () => {
    const onDeletePlan = vi.fn()
    renderPlans({ onDeletePlan })
    const trigger = within(row('Demo Day Founder Dinner')).getByRole('button', { name: 'Delete Demo Day Founder Dinner' })
    trigger.focus()
    fireEvent.click(trigger)

    const dialog = screen.getByRole('dialog', { name: 'Delete seating plan?' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(within(dialog).getByText('Permanent action')).toBeInTheDocument()
    expect(within(dialog).getByText(/This cannot be undone\. The saved configuration, assignments, rules, locks, alternatives, and every prior version will be permanently removed\./)).toBeInTheDocument()
    expect(within(dialog).getByText('Demo Day Founder Dinner')).toBeInTheDocument()
    expect(within(dialog).getByText('4 versions · 48 founders · 6 tables')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Delete seating plan' })).toHaveFocus()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    expect(onDeletePlan).not.toHaveBeenCalled()

    fireEvent.click(within(row('W24 New Founder Welcome')).getByRole('button', { name: 'Delete W24 New Founder Welcome' }))
    expect(within(screen.getByRole('dialog')).getByText('1 version · 0 founders · 7 tables')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(within(row('W24 New Founder Welcome')).getByRole('button', { name: 'Delete W24 New Founder Welcome' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close delete confirmation' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(onDeletePlan).not.toHaveBeenCalled()
  })

  it('deletes through the injected callback, refreshes stats and count, and falls back to the zero state', async () => {
    const onDeletePlan = vi.fn(async () => undefined)
    const { container } = renderPlans({ plans: PLANS.slice(0, 2), onDeletePlan })

    fireEvent.click(screen.getByRole('button', { name: 'Delete Demo Day Founder Dinner' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete seating plan' }))
    })
    expect(onDeletePlan).toHaveBeenCalledWith('demo-day')
    expect(screen.queryByRole('heading', { name: 'Demo Day Founder Dinner' })).not.toBeInTheDocument()
    expect(liveText()).toBe('Demo Day Founder Dinner permanently deleted')
    expect(screen.getByText('1 seating plan')).toBeInTheDocument()
    expect([...container.querySelectorAll('.v2-plans-hero-stat strong')].map((stat) => stat.textContent)).toEqual(['1', '24', '3'])

    fireEvent.click(screen.getByRole('button', { name: 'Delete AI Infrastructure Roundtable' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete seating plan' }))
    })
    expect(screen.getByRole('heading', { name: 'Your first dinner starts here.' })).toBeInTheDocument()
  })

  it('keeps the plan and reports the failure when deletion is rejected', async () => {
    const onDeletePlan = vi.fn(async () => {
      throw new Error('offline')
    })
    renderPlans({ onDeletePlan })
    fireEvent.click(screen.getByRole('button', { name: 'Delete Fintech Operator Mix' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete seating plan' }))
    })
    expect(screen.getByRole('heading', { name: 'Fintech Operator Mix' })).toBeInTheDocument()
    expect(liveText()).toBe('Fintech Operator Mix could not be deleted. Try again.')
    expect(screen.getByRole('button', { name: 'Delete seating plan' })).toBeEnabled()
  })

  it('disables destructive controls when no delete handler is injected', () => {
    renderPlans()
    expect(screen.getByRole('button', { name: 'Delete Demo Day Founder Dinner' })).toBeDisabled()
  })
})

describe('SeatingPlansPage access and layout', () => {
  it('restricts founder accounts to the Founder Index', () => {
    window.localStorage.setItem(ACCOUNT_ROLE_KEY, 'founder')
    renderPlans()
    expect(screen.getByRole('heading', { name: 'Seating plans are for YC admins.' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open Founder Index →' })).toHaveAttribute('href', '/v2/search')
    expect(screen.queryByRole('heading', { name: 'Demo Day Founder Dinner' })).not.toBeInTheDocument()
  })

  it('scopes responsive rules to the plans container and stacks to one column on mobile', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/v2/dinner/seating-plans.css'), 'utf8')
    expect(css).toMatch(/\.v2-plans-main \{[^}]*container: plans \/ inline-size/)
    expect(css).toMatch(/@container plans \(max-width: 760px\) \{[^@]*\.v2-plans-hero \{[^}]*grid-template-columns: 1fr;/)
    expect(css).toMatch(/@container plans \(max-width: 760px\) \{[^@]*\.v2-plans-plan-row \{[^}]*grid-template-columns: 1fr;/)
    expect(css).toMatch(/@container plans \(max-width: 760px\) \{[^@]*\.v2-plans-table-head \{ display: none; \}/)
    expect(css).toMatch(/\.v2-plans-delete-dialog \{[^}]*width: min\(510px, calc\(100vw - 32px\)\)/)
  })

  it('adds a tablet tier so the desktop hero, rows, history, and zero state never clip between phone and desktop', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/v2/dinner/seating-plans.css'), 'utf8')
    const tablet = css.slice(css.indexOf('@container plans (max-width: 1120px)'), css.indexOf('@container plans (max-width: 760px)'))
    expect(tablet).not.toBe('')
    expect(tablet).toMatch(/\.v2-plans-hero \{[^}]*grid-template-columns: 1fr;/)
    expect(tablet).toMatch(/\.v2-plans-hero-copy \{[^}]*grid-column: 1 \/ -1;/)
    expect(tablet).toMatch(/\.v2-plans-row-actions \{[^}]*grid-column: 1 \/ -1;/)
    expect(tablet).toMatch(/\.v2-plans-history-panel \{[^}]*grid-template-columns: 1fr;/)
    expect(tablet).toMatch(/\.v2-plans-empty-cta \{[^}]*min-width: min\(360px, 100%\)/)
  })
})
