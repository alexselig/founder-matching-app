import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import rawFounders from '../../founders.json'
import { buildScaleFixture } from '../../shared/fixtures'
import { normalizeFounders, type Founder } from '../../shared/founder'
import { ACCOUNT_ROLE_KEY } from '../search/accountState'
import { createSearchCohortHandoff } from '../search/searchHandoff'
import { DinnerPage, type DinnerPageProps } from './DinnerPage'
import { findFounderSwap, findRebalanceSwap, type DinnerEngine } from './dinnerEngine'
import type { DinnerCohortOption } from './dinnerState'
import { capacities, DinnerConflictError, evaluateDinnerAssignment, type DinnerRequest } from './optimizer'

const FOUNDERS = normalizeFounders(rawFounders)
const THREE = buildScaleFixture(FOUNDERS, 'three-tables')
const FIVE = buildScaleFixture(FOUNDERS, 'five-tables')
const TWENTY = buildScaleFixture(FOUNDERS, 'twenty-tables')
const UNEVEN = buildScaleFixture(FOUNDERS, 'uneven-five-tables')

function roundRobin(request: DinnerRequest, rotate = 0) {
  const sizes = capacities(request.founders.length, request.tableCount)
  const tables: string[][] = sizes.map(() => [])
  const ordered = [...request.founders.slice(rotate), ...request.founders.slice(0, rotate)]
  let cursor = 0
  for (const founder of ordered) {
    while (tables[cursor]!.length >= sizes[cursor]!) cursor += 1
    tables[cursor]!.push(founder.id)
  }
  return evaluateDinnerAssignment(request, tables)
}

function fastEngine(overrides: Partial<DinnerEngine> = {}): DinnerEngine {
  return {
    optimize: async (request) => roundRobin(request),
    evaluate: async (request, assignment) => evaluateDinnerAssignment(request, assignment),
    improveFounder: async (request, solution, founderId) => findFounderSwap(request, solution, founderId),
    rebalanceTable: async (request, solution, tableIndex) => findRebalanceSwap(request, solution, tableIndex),
    alternatives: async (request) => [roundRobin(request, 3), roundRobin(request, 7)],
    ...overrides,
  }
}

function cohortOption(founders: readonly Founder[], name = 'Fixture cohort'): DinnerCohortOption {
  return { id: `saved-${founders.length}`, name, description: 'Saved cohort · edited Sep 29', founderIds: founders.map((founder) => founder.id) }
}

function memoryStore() {
  const map = new Map<string, string>()
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
  }
}

function renderDinner(props: Partial<DinnerPageProps> = {}) {
  const engine = props.engine ?? fastEngine()
  return render(
    <DinnerPage
      founders={FOUNDERS}
      search=""
      sessionStore={memoryStore()}
      engine={engine}
      savedCohorts={[cohortOption(THREE), cohortOption(FIVE, 'Forty founders'), cohortOption(TWENTY, 'Full dinner'), cohortOption(UNEVEN, 'Uneven cohort')]}
      {...props}
    />,
  )
}

function liveText() {
  return screen.getByTestId('dinner-live-region').textContent
}

function nameThePlan(name = 'Founders Dinner · Oct 16') {
  fireEvent.change(screen.getByLabelText(/Seating plan name/), { target: { value: name } })
}

function chooseCohort(name: string) {
  fireEvent.click(within(scopeCard('2 · Founder cohort')).getByRole('button'))
  const dialog = screen.getByRole('dialog', { name: 'Select founder cohort' })
  fireEvent.click(within(dialog).getByRole('button', { name: new RegExp(name) }))
}

function scopeCard(step: string) {
  return screen.getByText(step).closest('section')!
}

function choosePreset(title: string) {
  const dialog = screen.getByRole('dialog', { name: 'Set tables and seats' })
  fireEvent.click(within(dialog).getByRole('button', { name: new RegExp(`^${title}`) }))
  fireEvent.click(within(dialog).getByRole('button', { name: 'Use this setup →' }))
}

async function generateTables(cohort: string, preset: string) {
  nameThePlan()
  chooseCohort(cohort)
  choosePreset(preset)
  fireEvent.click(screen.getByRole('button', { name: 'Generate tables →' }))
  await screen.findByRole('heading', { name: 'Founders Dinner · Oct 16', level: 2 })
}

function tableCards(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLElement>('.v2-dinner-table-card')]
}

beforeEach(() => {
  window.localStorage.clear()
  window.localStorage.setItem('founder-v2-account-tip-dismissed', 'true')
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('DinnerPage setup', () => {
  it('gates direct entry from plan name to cohort to tables before Generate is available', async () => {
    const { container } = renderDinner()
    expect(container.querySelector('.v2-shell.v2-dinner-shell')).not.toBeNull()
    expect(screen.getByRole('link', { name: 'Seating Plans' }).getAttribute('aria-current')).toBe('page')
    const generate = screen.getByRole('button', { name: 'Generate tables →' }) as HTMLButtonElement
    expect(generate.disabled).toBe(true)
    expect(screen.getByText('Name this seating plan to continue')).toBeTruthy()
    expect((within(scopeCard('2 · Founder cohort')).getByRole('button') as HTMLButtonElement).disabled).toBe(true)
    expect(container.querySelector('.v2-setup-handoff-badge.v2-setup-handoff-visible')).toBeNull()

    nameThePlan()
    expect(screen.getByText('Select a cohort to continue')).toBeTruthy()
    const cohortButton = within(scopeCard('2 · Founder cohort')).getByRole('button')
    fireEvent.click(cohortButton)
    const cohortDialog = screen.getByRole('dialog', { name: 'Select founder cohort' })
    expect(document.activeElement).toBe(within(cohortDialog).getByLabelText('Search saved cohorts'))
    expect(within(cohortDialog).queryByText('Current Founder Search results')).toBeNull()
    fireEvent.change(within(cohortDialog).getByLabelText('Search saved cohorts'), { target: { value: 'forty' } })
    expect(within(cohortDialog).queryByText('Fixture cohort')).toBeNull()
    fireEvent.change(within(cohortDialog).getByLabelText('Search saved cohorts'), { target: { value: '' } })
    fireEvent.click(within(cohortDialog).getByRole('button', { name: /Fixture cohort/ }))

    const tablesDialog = screen.getByRole('dialog', { name: 'Set tables and seats' })
    expect(within(tablesDialog).getByText('24 founders selected · choose a seating shape.')).toBeTruthy()
    expect(document.activeElement).toBe(within(tablesDialog).getByRole('button', { name: /^3 × 8/ }))
    expect(generate.disabled).toBe(true)
    choosePreset('3 × 8')

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(within(scopeCard('3 · Table setup')).getByText('3 × 8')).toBeTruthy()
    expect(screen.getByText('24 founders · 3 tables · 8 target seats')).toBeTruthy()
    expect(generate.disabled).toBe(false)
    expect(generate.className).toContain('v2-setup-ready')

    fireEvent.click(generate)
    await screen.findByRole('heading', { name: 'Founders Dinner · Oct 16', level: 2 })
    expect(tableCards(container)).toHaveLength(3)
    expect(container.querySelectorAll('.v2-dinner-index-button')).toHaveLength(3)
    expect(screen.queryByText('Table 04')).toBeNull()
    expect(liveText()).toContain('Generated 3 tables for 24 founders')
  })

  it('attaches an ordered Search cohort handoff and preserves its order', () => {
    const store = memoryStore()
    const handoff = createSearchCohortHandoff(store, {
      founderIds: [...THREE].reverse().map((founder) => founder.id),
      query: { text: '', dimensions: [{ field: 'company', operator: 'is', value: 'Lantern' }] },
      submittedText: 'Lantern founders',
    })
    const { container } = renderDinner({ search: `?from=search&cohort=${handoff.id}`, sessionStore: store })
    const badge = container.querySelector('.v2-setup-handoff-badge')!
    expect(badge.className).toContain('v2-setup-handoff-visible')
    expect(badge.textContent).toBe('Search handoff · Ordered 24-founder result cohort is already attached.')
    nameThePlan()
    const card = scopeCard('2 · Founder cohort')
    expect(within(card).getByText('24 founders')).toBeTruthy()
    expect(within(card).getByText('Founder Search · current result order')).toBeTruthy()
    expect(within(card).getByRole('button').textContent).toBe('Change')
    fireEvent.click(within(card).getByRole('button'))
    const dialog = screen.getByRole('dialog', { name: 'Select founder cohort' })
    expect(within(dialog).getByRole('button', { name: /Current Founder Search results/ }).className).toContain('v2-setup-primary')
  })

  it('ignores a handoff that cannot be read', () => {
    const { container } = renderDinner({ search: '?from=search&cohort=s-deadbeef' })
    expect(container.querySelector('.v2-setup-handoff-visible')).toBeNull()
    nameThePlan()
    expect(within(scopeCard('2 · Founder cohort')).getByText('Select cohort')).toBeTruthy()
  })

  it('closes dialogs with Escape or the scrim and returns focus to the trigger', () => {
    const { container } = renderDinner()
    nameThePlan()
    const trigger = within(scopeCard('2 · Founder cohort')).getByRole('button')
    trigger.focus()
    fireEvent.click(trigger)
    const dialog = screen.getByRole('dialog', { name: 'Select founder cohort' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    const close = within(dialog).getByRole('button', { name: 'Close cohort selector' })
    close.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(dialog.contains(document.activeElement)).toBe(true)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)

    fireEvent.click(trigger)
    fireEvent.click(container.querySelector('.v2-setup-scrim')!)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('edits advanced criteria and explicitly adds a selected dimension and weight', () => {
    renderDinner()
    const trigger = screen.getByRole('button', { name: /Advanced criteria/ })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('3 dimensions · AI-assisted and fully editable')).toBeTruthy()

    const role = screen.getByText('Role', { selector: 'strong' }).closest('.v2-setup-interpretation-row') as HTMLElement
    fireEvent.click(within(role).getByRole('button', { name: 'Diverse' }))
    expect(within(role).getByRole('button', { name: 'Similar' })).toBeTruthy()
    const weights = within(role).getByLabelText('Role weight')
    fireEvent.click(within(weights).getByRole('button', { name: 'L' }))
    expect(within(weights).getByRole('button', { name: 'L' }).getAttribute('aria-pressed')).toBe('true')
    expect(within(weights).getByRole('button', { name: 'H' }).getAttribute('aria-pressed')).toBe('false')

    fireEvent.click(screen.getByRole('button', { name: 'Remove Age' }))
    expect(screen.getByText('2 dimensions · AI-assisted and fully editable')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '+ Add dimension' }))
    expect(screen.getByText('2 dimensions · AI-assisted and fully editable')).toBeTruthy()

    const dialog = screen.getByRole('dialog', { name: 'Add matching dimension' })
    fireEvent.change(within(dialog).getByRole('combobox', { name: 'Dimension' }), { target: { value: 'education' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'H' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add dimension' }))

    expect(screen.getByText('3 dimensions · AI-assisted and fully editable')).toBeTruthy()
    const education = screen.getByText('Education', { selector: 'strong' }).closest('.v2-setup-interpretation-row') as HTMLElement
    expect(within(education).getByRole('button', { name: 'H' }).getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: 'Maximum diversity' }))
    expect((screen.getByLabelText(/Your instructions/) as HTMLTextAreaElement).value).toBe(
      'Create the most diverse tables possible across industry, role, age, and cohort.',
    )
  })

  it('adds hard rules from suggestions, resolves ambiguous names, and rejects unsupported text', () => {
    const [first, second] = THREE
    const twin: Founder = { ...first!, id: 'twin-1', company: 'Parable', role: 'Sales' }
    const cohort = [...THREE, twin]
    renderDinner({ founders: [...FOUNDERS, twin], savedCohorts: [cohortOption(cohort, 'Twin cohort')] })
    nameThePlan()
    chooseCohort('Twin cohort')
    fireEvent.keyDown(document, { key: 'Escape' })

    fireEvent.click(screen.getByRole('button', { name: '+ Add custom rule' }))
    let dialog = screen.getByRole('dialog', { name: 'Add custom rule' })
    expect(within(dialog).getByText('Enter a rule to preview it.')).toBeTruthy()
    expect(within(dialog).getByText('Draft · rule required')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Separate same-company founders' }))
    expect(within(dialog).getByText('Draft · confirmation required')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add hard rule' }))
    expect(screen.getByText('Separate founders from the same company')).toBeTruthy()
    expect(screen.getByText('1 hard rule added')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '+ Add another rule' }))
    dialog = screen.getByRole('dialog', { name: 'Add custom rule' })
    const input = within(dialog).getByLabelText('Custom rule · plain language')
    fireEvent.change(input, { target: { value: `Keep ${first!.name} and ${second!.name} apart` } })
    expect(within(dialog).getByText(`Which ${first!.name}?`)).toBeTruthy()
    expect(within(dialog).getByText('Resolve 1 founder to continue')).toBeTruthy()
    const confirm = within(dialog).getByRole('button', { name: 'Add hard rule' }) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
    fireEvent.click(within(dialog).getByRole('button', { name: new RegExp(`${first!.name}.*Parable`) }))
    expect(within(dialog).getByText('Resolved · confirmation required')).toBeTruthy()
    expect(confirm.disabled).toBe(false)
    fireEvent.click(confirm)
    expect(screen.getByText(`Keep ${first!.name} · Parable and ${second!.name} · ${second!.company} at different tables`)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '+ Add another rule' }))
    dialog = screen.getByRole('dialog', { name: 'Add custom rule' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Separate direct competitors' }))
    expect(within(dialog).getByText('This rule needs AI interpretation before it can be enforced.')).toBeTruthy()
    expect((within(dialog).getByRole('button', { name: 'Add hard rule' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    const removeButtons = screen.getAllByRole('button', { name: 'Remove hard rule' })
    fireEvent.click(removeButtons[0]!)
    expect(screen.getByText('1 hard rule added')).toBeTruthy()
  })

  it('shows a restricted notice to founder accounts', () => {
    window.localStorage.setItem(ACCOUNT_ROLE_KEY, 'founder')
    renderDinner()
    expect(screen.getByRole('heading', { name: 'Dinner matching is for YC admins.' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Generate tables →' })).toBeNull()
  })
})

describe('DinnerPage recovery', () => {
  it('blocks an over-capacity setup and resolves it with a balanced uneven shape', async () => {
    const { container } = renderDinner()
    nameThePlan()
    chooseCohort('Uneven cohort')
    const dialog = screen.getByRole('dialog', { name: 'Set tables and seats' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Decrease table count' }))
    expect(within(dialog).getByText('8 founders over capacity.')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Use this setup →' }))
    fireEvent.click(screen.getByRole('button', { name: 'Generate tables →' }))

    expect(await screen.findByRole('heading', { name: 'Eight founders have no seat', level: 1 })).toBeTruthy()
    expect(screen.getByText('48 founders cannot fit into 5 tables of 8.')).toBeTruthy()
    expect(screen.getByLabelText('40 of 48 founders have configured seats')).toBeTruthy()
    const footerGenerate = screen.getByRole('button', { name: 'Generate Tables →' }) as HTMLButtonElement
    expect(footerGenerate.disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /Keep 5 tables · balance 10 \/ 10 \/ 10 \/ 9 \/ 9/ }))
    expect(screen.getByText('Capacity valid')).toBeTruthy()
    expect(liveText()).toBe('Capacity resolved. Every founder now has a seat.')
    expect(footerGenerate.disabled).toBe(false)

    fireEvent.click(footerGenerate)
    await screen.findByRole('heading', { name: 'Founders Dinner · Oct 16', level: 2 })
    const cards = tableCards(container)
    expect(cards).toHaveLength(5)
    expect(cards.map((card) => card.querySelectorAll('.v2-dinner-seat').length)).toEqual([10, 10, 10, 9, 9])
  })

  it('stops on conflicting hard rules and resumes after keeping one', async () => {
    const [first, second] = THREE
    renderDinner()
    nameThePlan()
    chooseCohort('Fixture cohort')
    choosePreset('3 × 8')
    for (const text of [`Keep ${first!.name} and ${second!.name} together`, `Keep ${first!.name} and ${second!.name} apart`]) {
      fireEvent.click(screen.getByRole('button', { name: /^\+ Add (custom|another) rule$/ }))
      const dialog = screen.getByRole('dialog', { name: 'Add custom rule' })
      fireEvent.change(within(dialog).getByLabelText('Custom rule · plain language'), { target: { value: text } })
      fireEvent.click(within(dialog).getByRole('button', { name: 'Add hard rule' }))
    }
    fireEvent.click(screen.getByRole('button', { name: 'Generate tables →' }))

    expect(await screen.findByRole('heading', { name: 'Rules cannot all be true', level: 1 })).toBeTruthy()
    expect(screen.getByText(`${first!.name} and ${second!.name} must sit together and apart.`)).toBeTruthy()
    expect(screen.getByText('Blocks generation')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Keep rule 01 · remove rule 02/ }))
    expect(screen.getByText('Conflict resolved')).toBeTruthy()
    expect(liveText()).toBe('Rule conflict resolved. Generate Tables is available.')
    fireEvent.click(screen.getByRole('button', { name: 'Generate Tables →' }))
    await screen.findByRole('heading', { name: 'Founders Dinner · Oct 16', level: 2 })
  })

  it('falls back to database-only matching when the AI provider fails', async () => {
    const interpretBrief = vi.fn().mockRejectedValue({ status: 429, retryAfter: '14:32' })
    const { container } = renderDinner({ ai: { provider: 'Anthropic', alternateProvider: 'OpenAI', interpretBrief } })
    expect(container.querySelector('.v2-footer-ai')!.textContent).toBe('✓ AI Enabled · Anthropic')
    nameThePlan()
    chooseCohort('Fixture cohort')
    choosePreset('3 × 8')
    fireEvent.click(screen.getByRole('button', { name: 'Generate tables →' }))

    expect(await screen.findByRole('heading', { name: 'Anthropic did not process this request', level: 1 })).toBeTruthy()
    expect(screen.getByText('Anthropic returned HTTP 429 · retry after 14:32')).toBeTruthy()
    expect(container.querySelector('.v2-footer-ai')!.textContent).toBe('⚠ AI Connection Issue · Anthropic')
    expect(interpretBrief).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: /Continue without AI/ }))
    expect(screen.getByText('Database-only mode active')).toBeTruthy()
    expect(container.querySelector('.v2-footer-ai')!.textContent).toBe('AI Off · Database-only matching')
    fireEvent.click(screen.getByRole('button', { name: 'Generate Tables →' }))
    await screen.findByRole('heading', { name: 'Founders Dinner · Oct 16', level: 2 })
    expect(interpretBrief).toHaveBeenCalledOnce()
  })

  it('recovers a saved dinner whose founder is missing by staging a replacement', async () => {
    const navigate = vi.fn()
    const assignment = capacities(THREE.length, 3).map((size, index, sizes) => {
      const start = sizes.slice(0, index).reduce((sum, value) => sum + value, 0)
      return THREE.slice(start, start + size).map((founder) => founder.id)
    })
    assignment[1]![2] = 'ghost-1'
    renderDinner({
      navigate,
      initialPlan: {
        id: 'plan-1',
        name: 'AI Infrastructure Dinner · Sep 29',
        version: 3,
        brief: 'Mix roles.',
        cohort: { id: 'saved', label: '24 founders', hint: 'Saved cohort', source: 'saved', founderIds: assignment.flat() },
        tables: { tableCount: 3, targetSeats: 8 },
        rules: [],
        assignment,
        savedFounders: [{ id: 'ghost-1', name: 'Edward Frazer', company: 'DryMerge', role: THREE[10]!.role }],
      },
    })
    expect(await screen.findByRole('heading', { name: 'One saved founder is missing', level: 1 })).toBeTruthy()
    expect(screen.getByText('Edward Frazer · ID ghost-1 is not in the current dataset.')).toBeTruthy()
    expect(screen.getByText('✓ 23 of 24 founders restored')).toBeTruthy()
    const open = screen.getByRole('button', { name: 'Open recovered dinner →' }) as HTMLButtonElement
    expect(open.disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /Choose a replacement founder/ }))
    const candidates = screen.getAllByRole('button', { name: /founder ID/ })
    expect(candidates.length).toBeGreaterThan(0)
    expect(candidates.length).toBeLessThanOrEqual(3)
    fireEvent.click(candidates[0]!)
    expect(screen.getByText('Replacement staged, not saved')).toBeTruthy()
    expect(open.disabled).toBe(false)
    fireEvent.click(open)
    await screen.findByRole('heading', { name: 'AI Infrastructure Dinner · Sep 29', level: 2 })

    cleanup()
    renderDinner({
      navigate,
      initialPlan: {
        id: 'plan-1', name: 'Saved', version: 3, brief: '', rules: [], assignment,
        cohort: { id: 'saved', label: '24 founders', hint: 'Saved cohort', source: 'saved', founderIds: assignment.flat() },
        tables: { tableCount: 3, targetSeats: 8 },
      },
    })
    fireEvent.click(await screen.findByRole('button', { name: /Return to Saved Dinners/ }))
    expect(navigate).toHaveBeenCalledWith('/v2/seating-plans')
  })
})

describe('DinnerPage results workspace', () => {
  it('drives the compact Tables view: threshold, jump grid, continuous cards, and locks', async () => {
    const optimize = vi.fn(async (request: DinnerRequest) => roundRobin(request))
    const { container } = renderDinner({ engine: fastEngine({ optimize }) })
    await generateTables('Forty founders', '5 × 8')
    expect(tableCards(container)).toHaveLength(5)
    expect(container.querySelector<HTMLElement>('.v2-dinner-index-grid')!.style.getPropertyValue('--v2-index-columns')).toBe('5')
    expect(screen.getByText('Tables', { selector: '.v2-dinner-metric span' }).previousElementSibling!.textContent).toBe('5')
    tableCards(container).forEach((card) => expect(card.querySelectorAll('.v2-dinner-seat')).toHaveLength(8))

    const toolbar = container.querySelector('.v2-dinner-work-tools')!
    expect([...toolbar.children].map((item) => item.className)).toEqual([
      'v2-dinner-view',
      'v2-dinner-threshold',
      'v2-dinner-legend',
    ])
    expect(toolbar.querySelector('.v2-dinner-view')?.firstElementChild?.textContent).toBe('View')
    expect(toolbar.querySelector('.v2-dinner-view')?.lastElementChild).toHaveClass('v2-dinner-segmented')
    expect(toolbar.querySelector('.v2-dinner-threshold')?.firstElementChild?.textContent).toBe('Match threshold')
    expect(toolbar.querySelector('.v2-dinner-threshold')?.lastElementChild).toHaveClass('v2-dinner-threshold-controls')
    expect(toolbar.querySelector('.v2-dinner-legend')?.firstElementChild?.textContent).toBe('Match Threshold Color Coding')
    expect(toolbar.querySelector('.v2-dinner-legend')?.lastElementChild).toHaveClass('v2-dinner-legend-values')
    expect(screen.queryByRole('group', { name: 'Table density' })).toBeNull()

    const threshold = screen.getByLabelText('Match threshold') as HTMLInputElement
    fireEvent.change(threshold, { target: { value: '85' } })
    expect(threshold.value).toBe('85')
    expect(container.querySelector('.v2-dinner-table-foot')!.textContent).toMatch(/85/)
    expect(screen.getByRole('button', { name: 'Increase threshold' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Decrease threshold' }))
    expect(threshold.value).toBe('84')
    fireEvent.change(threshold, { target: { value: '60' } })
    expect(screen.getByRole('button', { name: 'Decrease threshold' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Increase threshold' }))
    expect(threshold.value).toBe('61')

    const jump = container.querySelectorAll<HTMLButtonElement>('.v2-dinner-index-button')
    fireEvent.click(jump[3]!)
    expect(jump[3]!.className).toContain('v2-dinner-active')
    expect(jump[3]!.getAttribute('aria-current')).toBe('true')
    expect(tableCards(container)[3]!.className).toContain('v2-dinner-focused')
    expect(container.querySelector('.v2-dinner-focus-strip')).toBeTruthy()

    const lock = within(tableCards(container)[1]!).getByRole('button', { name: 'Lock table' })
    fireEvent.click(lock)
    expect(within(tableCards(container)[1]!).getByRole('button', { name: 'Unlock table' }).getAttribute('aria-pressed')).toBe('true')
    expect(liveText()).toBe('Table 02 locked')
    fireEvent.click(screen.getByRole('button', { name: 'Re-optimize Remaining' }))
    await screen.findByText(/Re-optimized 4 unlocked tables/)
    const request = optimize.mock.calls.at(-1)![0]
    expect(new Set(request.locks!.map((lock) => lock.tableIndex))).toEqual(new Set([1]))
    expect(request.locks).toHaveLength(8)
  })

  it('renders a compact 01–20 jump grid and twenty two-column table cards', async () => {
    const { container } = renderDinner()
    await generateTables('Full dinner', '20 × 8')
    const buttons = [...container.querySelectorAll('.v2-dinner-index-button')]
    expect(buttons.map((button) => button.textContent)).toEqual(Array.from({ length: 20 }, (_, index) => String(index + 1).padStart(2, '0')))
    expect(container.querySelector<HTMLElement>('.v2-dinner-index-grid')!.style.getPropertyValue('--v2-index-columns')).toBe('10')
    expect(buttons.filter((button) => button.className.includes('v2-dinner-row-end'))).toHaveLength(2)
    expect(buttons.filter((button) => button.className.includes('v2-dinner-last-row'))).toHaveLength(10)
    expect(tableCards(container)).toHaveLength(20)
    expect(screen.getByLabelText('Table index').tagName).toBe('ASIDE')
  })

  it('edits matching criteria and explicitly adds a selected dimension while reviewing results', async () => {
    renderDinner()
    await generateTables('Fixture cohort', '3 × 8')

    fireEvent.click(screen.getByRole('button', { name: 'Edit setup' }))
    const rail = screen.getByRole('complementary', { name: 'Edit setup' })
    const role = within(rail).getByText('Role', { selector: 'strong' }).closest('.v2-setup-interpretation-row') as HTMLElement
    fireEvent.click(within(role).getByRole('button', { name: 'Diverse' }))
    expect(await within(role).findByRole('button', { name: 'Similar' })).toBeTruthy()

    const weights = within(role).getByRole('group', { name: 'Role weight' })
    fireEvent.click(within(weights).getByRole('button', { name: 'L' }))
    expect(await within(weights).findByRole('button', { name: 'L', pressed: true })).toBeTruthy()
    expect(within(weights).getByRole('button', { name: 'H' }).getAttribute('aria-pressed')).toBe('false')

    fireEvent.click(within(role).getByRole('button', { name: 'Remove Role' }))
    await waitFor(() => expect(within(rail).queryByRole('button', { name: 'Remove Role' })).toBeNull())

    fireEvent.click(within(rail).getByRole('button', { name: '+ Add dimension' }))
    const dialog = screen.getByRole('dialog', { name: 'Add matching dimension' })
    expect(within(rail).queryByRole('button', { name: 'Remove Role' })).toBeNull()
    fireEvent.change(within(dialog).getByRole('combobox', { name: 'Dimension' }), { target: { value: 'role' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'L' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add dimension' }))

    const restoredRole = await within(rail).findByText('Role', { selector: 'strong' })
    const restoredWeights = within(restoredRole.closest('.v2-setup-interpretation-row') as HTMLElement).getByRole('group', { name: 'Role weight' })
    expect(within(restoredWeights).getByRole('button', { name: 'L' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('switches to Analysis and swaps founders by keyboard or drag', async () => {
    const { container } = renderDinner()
    await generateTables('Fixture cohort', '3 × 8')
    fireEvent.click(screen.getByRole('button', { name: 'Analysis' }))
    expect(screen.getByRole('button', { name: 'Analysis' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByRole('group', { name: 'Table density' })).toBeNull()
    expect(screen.getByLabelText('Match threshold')).toBeTruthy()
    expect(screen.getByLabelText('Match Threshold Color Coding')).toBeTruthy()
    expect(container.querySelector('.v2-dinner-analysis')!.className).toContain('v2-dinner-visible')
    expect((container.querySelector('.v2-dinner-table-workspace') as HTMLElement).hidden).toBe(true)
    expect(screen.getByText('Objective performance')).toBeTruthy()
    expect(screen.getByText('Hard-rule compliance')).toBeTruthy()
    expect(container.querySelector<HTMLElement>('.v2-dinner-heatmap-grid')!.style.getPropertyValue('--v2-heat-columns')).toBe('3')

    const columns = [...container.querySelectorAll<HTMLElement>('.v2-dinner-heat-column')]
    expect(columns).toHaveLength(3)
    const left = columns[0]!.querySelector<HTMLButtonElement>('.v2-dinner-heat-person')!
    const right = columns[2]!.querySelector<HTMLButtonElement>('.v2-dinner-heat-person')!
    const leftName = left.title
    fireEvent.click(left)
    expect(left.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(right)
    await screen.findByText(new RegExp(`^Swapped ${leftName}`))
    const moved = [...container.querySelectorAll<HTMLElement>('.v2-dinner-heat-column')][2]!
    expect([...moved.querySelectorAll<HTMLElement>('.v2-dinner-heat-person')].map((person) => person.title)).toContain(leftName)

    const after = [...container.querySelectorAll<HTMLElement>('.v2-dinner-heat-column')]
    const dragged = after[0]!.querySelectorAll<HTMLElement>('.v2-dinner-heat-person')[1]!
    const target = after[1]!.querySelectorAll<HTMLElement>('.v2-dinner-heat-person')[1]!
    const draggedName = dragged.title
    fireEvent.dragStart(dragged)
    expect(dragged.className).toContain('v2-dinner-dragging')
    fireEvent.dragOver(target)
    expect(target.className).toContain('v2-dinner-drop-target')
    fireEvent.drop(target)
    await screen.findByText(new RegExp(`^Swapped ${draggedName}`))
  })

  it('announces a swap the hard rules or locks reject without changing tables', async () => {
    const evaluate = vi.fn(async (request: DinnerRequest, assignment: readonly (readonly string[])[]) => {
      if (request.locks?.length) throw new DinnerConflictError([{ ruleIds: ['lock'], founderIds: [], message: 'Locked table' }])
      return evaluateDinnerAssignment(request, assignment)
    })
    const { container } = renderDinner({ engine: fastEngine({ evaluate }) })
    await generateTables('Fixture cohort', '3 × 8')
    const before = tableCards(container).map((card) => card.textContent)
    fireEvent.click(within(tableCards(container)[0]!).getByRole('button', { name: 'Lock table' }))
    fireEvent.click(screen.getByRole('button', { name: 'Analysis' }))
    const columns = [...container.querySelectorAll<HTMLElement>('.v2-dinner-heat-column')]
    fireEvent.click(columns[0]!.querySelector('.v2-dinner-heat-person')!)
    fireEvent.click(columns[1]!.querySelector('.v2-dinner-heat-person')!)
    await screen.findByText(/^Swap blocked/)
    expect(tableCards(container).map((card) => card.textContent)).toEqual(before.map((text, index) => (index === 0 ? text!.replace('Lock table', 'Unlock table') : text)))
  })

  it('applies analysis recommendations once', async () => {
    const improveFounder = vi.fn(async (request: DinnerRequest, solution: Parameters<DinnerEngine['improveFounder']>[1]) => roundRobin(request, 1) ?? solution)
    renderDinner({ engine: fastEngine({ improveFounder }) })
    await generateTables('Fixture cohort', '3 × 8')
    fireEvent.click(screen.getByRole('button', { name: 'Analysis' }))
    const recommendation = screen.getByText(/stronger cross-table fit/).closest('.v2-dinner-recommendation') as HTMLElement
    fireEvent.click(within(recommendation).getByRole('button', { name: 'Apply swap' }))
    const applied = await within(recommendation).findByRole('button', { name: 'Applied ✓' })
    expect((applied as HTMLButtonElement).disabled).toBe(true)
    const lockRecommendation = screen.getByText('Lock the strongest table before re-optimizing').closest('.v2-dinner-recommendation') as HTMLElement
    fireEvent.click(within(lockRecommendation).getByRole('button', { name: /^Lock Table \d{2}$/ }))
    expect(within(lockRecommendation).getByRole('button', { name: 'Applied ✓' })).toBeTruthy()
  })

  it('compares generated alternatives and applies the selection', async () => {
    const { container } = renderDinner()
    await generateTables('Fixture cohort', '3 × 8')
    const before = tableCards(container).map((card) => card.textContent)
    fireEvent.click(screen.getByRole('button', { name: 'Generate 2 Alternatives' }))
    expect(await screen.findByRole('heading', { name: 'Choose the strongest arrangement.' })).toBeTruthy()
    const solutions = [...container.querySelectorAll<HTMLElement>('.v2-alt-solution')]
    expect(solutions).toHaveLength(3)
    expect(within(solutions[0]!).getByRole('button', { name: /Selected/ }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(within(solutions[1]!).getByRole('button', { name: /Select this solution/ }))
    expect(solutions[1]!.className).toContain('v2-alt-selected')
    expect(screen.getByText('Alternative 1 selected')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Apply current selection' }))
    expect(screen.getByRole('heading', { name: 'Alternative 1 selected.' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Return to tables →' }))
    await screen.findByRole('heading', { name: 'Founders Dinner · Oct 16', level: 2 })
    expect(tableCards(container).map((card) => card.textContent)).not.toEqual(before)
  })

  it('saves through the injected callback and exports through progress to success or retryable failure', async () => {
    const onSave = vi.fn(async () => ({ version: 4 }))
    const download = vi.fn()
    let fail = true
    const prepareExport = vi.fn(async (input: { filename: string; content: string }) => {
      if (fail) throw new Error('offline')
      return input
    })
    renderDinner({ onSave, download, prepareExport, now: () => new Date('2026-10-16T12:00:00Z') })
    await generateTables('Fixture cohort', '3 × 8')

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText('Saved version 4')
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: 'Founders Dinner · Oct 16', lockedTables: [] }))

    fireEvent.click(screen.getByRole('button', { name: 'Export' }))
    let dialog = screen.getByRole('dialog', { name: 'CONFIRM EXPORT CONTENT' })
    expect(within(dialog).getByText('Seating plan · Founders Dinner · Oct 16')).toBeTruthy()
    fireEvent.click(within(dialog).getByLabelText(/Include founder details/))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Export CSV →' }))
    dialog = await screen.findByRole('dialog', { name: "We couldn't create the file." })
    expect(within(dialog).getByText('24 founders · core identity fields only')).toBeTruthy()
    fail = false
    fireEvent.click(within(dialog).getByRole('button', { name: 'Retry export →' }))
    dialog = await screen.findByRole('dialog', { name: 'Your file is ready.' })
    expect(within(dialog).getByText('founders-dinner-oct-16-2026-10-16.csv')).toBeTruthy()
    expect(prepareExport.mock.calls.at(-1)![0].content.split('\r\n')[0]).not.toContain('Company')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Download CSV ↓' }))
    expect(download).toHaveBeenCalledWith(expect.objectContaining({ filename: 'founders-dinner-oct-16-2026-10-16.csv' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens a docked Edit setup panel with inputs preserved and closes it without leaving results', async () => {
    renderDinner()
    await generateTables('Fixture cohort', '3 × 8')
    const edit = screen.getByRole('button', { name: 'Edit setup' })
    fireEvent.click(edit)
    expect(screen.getByRole('complementary', { name: 'Edit setup' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Founders Dinner · Oct 16', level: 2 })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Edit setup' })).toBeNull()
    expect((screen.getByLabelText(/Seating plan name/) as HTMLInputElement).value).toBe('Founders Dinner · Oct 16')
    expect(within(scopeCard('3 · Table setup')).getByText('3 × 8')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Apply and re-optimize' }) as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByRole('group', { name: 'Role weight' })).toBeTruthy()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('complementary', { name: 'Edit setup' })).toBeNull()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit setup' })).toBe(document.activeElement))
  })
})

describe('Dinner responsive CSS contract', () => {
  const read = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8')

  it('scopes responsive rules to the dinner container and collapses to one column on mobile', () => {
    const glue = read('./dinner.css')
    const results = read('./dinner-results.css')
    expect(glue).toMatch(/\.v2-dinner-main \{[^}]*container: dinner \/ inline-size/)
    expect(glue).toMatch(/@container dinner \(max-width: 900px\) \{[^@]*\.v2-dinner-frame\[data-mode="results"\],[^@]*grid-template-columns: 1fr;/)
    expect(results).toMatch(/@container dinner \(max-width: 560px\) \{[^@]*\.v2-dinner-table-card \{ display: block; \}/)
    expect(results).toMatch(/\.v2-dinner-table-card \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/)
    expect(results).toMatch(/@container dinner \(max-width: 900px\) \{[^@]*\.v2-dinner-table-card \{ display: block; \}/)
    expect(glue).toMatch(/@media \(prefers-reduced-motion: reduce\)/)
  })
})

describe('DinnerPage async safety', () => {
  it('keeps the setup visible while generation is pending', async () => {
    let release: () => void = () => undefined
    const optimize = vi.fn(
      (request: DinnerRequest) =>
        new Promise<ReturnType<typeof roundRobin>>((resolve) => {
          release = () => resolve(roundRobin(request))
        }),
    )
    renderDinner({ engine: fastEngine({ optimize }) })
    nameThePlan()
    chooseCohort('Fixture cohort')
    choosePreset('3 × 8')
    fireEvent.click(screen.getByRole('button', { name: 'Generate tables →' }))
    expect(await screen.findByRole('button', { name: 'Generating…' })).toBeTruthy()
    await act(async () => release())
    await screen.findByRole('heading', { name: 'Founders Dinner · Oct 16', level: 2 })
  })
})

function savedAssignment(founders: readonly Founder[] = THREE, tableCount = 3) {
  return capacities(founders.length, tableCount).map((size, index, sizes) => {
    const start = sizes.slice(0, index).reduce((sum, value) => sum + value, 0)
    return founders.slice(start, start + size).map((founder) => founder.id)
  })
}

function twoGhostPlan(assignment: readonly (readonly string[])[]): NonNullable<DinnerPageProps['initialPlan']> {
  return {
    id: 'plan-2',
    name: 'Two Ghosts Dinner',
    version: 5,
    brief: 'Mix roles.',
    cohort: { id: 'saved', label: '24 founders', hint: 'Saved cohort', source: 'saved', founderIds: assignment.flat() },
    tables: { tableCount: 3, targetSeats: 8 },
    rules: [],
    assignment,
    savedFounders: [
      { id: 'ghost-1', name: 'Edward Frazer', company: 'DryMerge', role: THREE[1]!.role },
      { id: 'ghost-2', name: 'Mara Quill', company: 'Lumen', role: THREE[19]!.role },
    ],
  }
}

function candidateId(button: HTMLElement) {
  return /founder ID (\S+)$/.exec(button.textContent ?? '')![1]!
}

function footerPrimary(container: HTMLElement) {
  return container.querySelector<HTMLButtonElement>('.v2-footer-primary')!
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>((settle) => {
    resolve = settle
  })
  return { promise, resolve }
}

describe('DinnerPage review regressions', () => {
  it('decides each missing seat in turn and opens with only those seats substituted', async () => {
    const evaluate = vi.fn(async (request: DinnerRequest, next: readonly (readonly string[])[]) => evaluateDinnerAssignment(request, next))
    const onSave = vi.fn(async () => ({ version: 6 }))
    const saved = savedAssignment()
    saved[0]![1] = 'ghost-1'
    saved[2]![3] = 'ghost-2'
    const { container } = renderDinner({ engine: fastEngine({ evaluate }), onSave, initialPlan: twoGhostPlan(saved) })

    expect(await screen.findByRole('heading', { name: 'Two saved founders are missing', level: 1 })).toBeTruthy()
    expect(screen.getByText('Edward Frazer · ID ghost-1 is not in the current dataset.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Choose a replacement founder/ }))
    const first = screen.getAllByRole('button', { name: /founder ID/ })[0]!
    const firstId = candidateId(first)
    fireEvent.click(first)
    const stepLabel = footerPrimary(container).textContent
    fireEvent.click(footerPrimary(container))
    await act(async () => undefined)

    expect(evaluate).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'One saved founder is missing', level: 1 }))
    expect(screen.getByText('Mara Quill · ID ghost-2 is not in the current dataset.')).toBeTruthy()
    expect(screen.getByText('✓ 23 of 24 founders restored · 1 of 2 missing seats decided')).toBeTruthy()
    expect(stepLabel).toBe('Next missing seat →')
    expect(footerPrimary(container).textContent).toBe('Open recovered dinner →')
    expect(footerPrimary(container).disabled).toBe(true)
    expect(liveText()).toMatch(/1 missing seat remains/)

    fireEvent.click(screen.getByRole('button', { name: /Choose a replacement founder/ }))
    const secondChoices = screen.getAllByRole('button', { name: /founder ID/ })
    expect(secondChoices.map(candidateId)).not.toContain(firstId)
    const secondId = candidateId(secondChoices[0]!)
    fireEvent.click(secondChoices[0]!)
    fireEvent.click(footerPrimary(container))
    await screen.findByRole('heading', { name: 'Two Ghosts Dinner', level: 2 })

    const expected = saved.map((table) => [...table])
    expected[0]![1] = firstId
    expected[2]![3] = secondId
    expect(evaluate).toHaveBeenCalledOnce()
    expect(evaluate.mock.calls[0]![1]).toEqual(expected)

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText('Saved version 6')
    const swapped = saved.flat().map((founderId) => (founderId === 'ghost-1' ? firstId : founderId === 'ghost-2' ? secondId : founderId))
    expect(onSave.mock.calls[0]![0].cohort.founderIds).toEqual(swapped)
  })

  it('removes one missing seat and replaces another with only the rebalance the removal requires', async () => {
    const evaluate = vi.fn(async (request: DinnerRequest, next: readonly (readonly string[])[]) => evaluateDinnerAssignment(request, next))
    const saved = savedAssignment()
    saved[0]![1] = 'ghost-1'
    saved[2]![3] = 'ghost-2'
    const { container } = renderDinner({ engine: fastEngine({ evaluate }), initialPlan: twoGhostPlan(saved) })

    await screen.findByRole('heading', { name: 'Two saved founders are missing', level: 1 })
    fireEvent.click(screen.getByRole('button', { name: /Remove this seat/ }))
    fireEvent.click(footerPrimary(container))
    await act(async () => undefined)
    expect(evaluate).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'One saved founder is missing', level: 1 })).toBeTruthy()
    expect(screen.getByText('Mara Quill · ID ghost-2 is not in the current dataset.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Choose a replacement founder/ }))
    const replacement = screen.getAllByRole('button', { name: /founder ID/ })[0]!
    const replacementId = candidateId(replacement)
    fireEvent.click(replacement)
    fireEvent.click(footerPrimary(container))
    await screen.findByRole('heading', { name: 'Two Ghosts Dinner', level: 2 })

    const tableZero = saved[0]!.filter((founderId) => founderId !== 'ghost-1')
    const tableTwo = [...saved[2]!]
    tableTwo[3] = replacementId
    const moved = tableTwo.pop()!
    expect(evaluate).toHaveBeenCalledOnce()
    expect(evaluate.mock.calls[0]![1]).toEqual([[...tableZero, moved], saved[1], tableTwo])
  })

  it('freezes recovery choices while the recovered dinner opens', async () => {
    const pending = deferred<ReturnType<typeof roundRobin>>()
    const evaluate = vi.fn(async () => pending.promise)
    const saved = savedAssignment()
    saved[1]![2] = 'ghost-1'
    const { container } = renderDinner({ engine: fastEngine({ evaluate }), initialPlan: twoGhostPlan(saved) })
    await screen.findByRole('heading', { name: 'One saved founder is missing', level: 1 })
    fireEvent.click(screen.getByRole('button', { name: /Choose a replacement founder/ }))
    const candidates = screen.getAllByRole('button', { name: /founder ID/ })
    fireEvent.click(candidates[0]!)
    fireEvent.click(footerPrimary(container))
    expect(footerPrimary(container).textContent).toBe('Generating…')

    fireEvent.click(candidates[1]!)
    fireEvent.click(screen.getByRole('button', { name: /Open with 23 founders/ }))
    expect(candidates[0]!.getAttribute('aria-pressed')).toBe('true')
    expect(candidates[1]!.getAttribute('aria-pressed')).toBe('false')
    expect(container.querySelector('.v2-recovery-state-panel')!.getAttribute('aria-busy')).toBe('true')

    const request = evaluate.mock.calls[0] as unknown as [DinnerRequest, string[][]]
    await act(async () => pending.resolve(evaluateDinnerAssignment(request[0], request[1])))
    await screen.findByRole('heading', { name: 'Two Ghosts Dinner', level: 2 })
  })

  it('freezes every setup control while generation is pending', async () => {
    const pending = deferred<ReturnType<typeof roundRobin>>()
    const optimize = vi.fn(async (request: DinnerRequest) => {
      const solution = roundRobin(request)
      await pending.promise
      return solution
    })
    renderDinner({ engine: fastEngine({ optimize }) })
    nameThePlan()
    chooseCohort('Fixture cohort')
    choosePreset('3 × 8')
    fireEvent.click(screen.getByRole('button', { name: '+ Add custom rule' }))
    const ruleDialog = screen.getByRole('dialog', { name: 'Add custom rule' })
    fireEvent.click(within(ruleDialog).getByRole('button', { name: 'Separate same-company founders' }))
    fireEvent.click(within(ruleDialog).getByRole('button', { name: 'Add hard rule' }))
    fireEvent.click(screen.getByRole('button', { name: /Advanced criteria/ }))
    const brief = screen.getByLabelText(/Your instructions/) as HTMLTextAreaElement
    const originalBrief = brief.value

    fireEvent.click(screen.getByRole('button', { name: 'Generate tables →' }))
    expect(await screen.findByRole('button', { name: 'Generating…' })).toBeTruthy()

    const name = screen.getByLabelText(/Seating plan name/) as HTMLInputElement
    const disabled = (element: Element) => (element as HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement).disabled
    expect(disabled(name)).toBe(true)
    expect(disabled(brief)).toBe(true)
    expect(disabled(within(scopeCard('2 · Founder cohort')).getByRole('button'))).toBe(true)
    expect(disabled(within(scopeCard('3 · Table setup')).getByRole('button'))).toBe(true)
    const starters = [...document.querySelectorAll('.v2-setup-starters button:not(.v2-setup-advanced-trigger)')]
    expect(starters.length).toBeGreaterThan(0)
    starters.forEach((button) => expect(disabled(button)).toBe(true))
    const criteriaControls = [...document.querySelectorAll('.v2-setup-advanced-body button')]
    expect(criteriaControls.length).toBeGreaterThan(0)
    criteriaControls.forEach((button) => expect(disabled(button)).toBe(true))
    expect(disabled(screen.getByRole('button', { name: '+ Add another rule' }))).toBe(true)
    expect(disabled(screen.getByRole('button', { name: 'Remove hard rule' }))).toBe(true)

    fireEvent.change(name, { target: { value: 'Renamed mid-run' } })
    fireEvent.change(brief, { target: { value: 'Seat investors together.' } })
    expect(name.value).toBe('Founders Dinner · Oct 16')
    expect(brief.value).toBe(originalBrief)

    await act(async () => pending.resolve())
    await screen.findByRole('heading', { name: 'Founders Dinner · Oct 16', level: 2 })
    expect(optimize).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Edit setup' }))
    expect(screen.getByText('Separate founders from the same company')).toBeTruthy()
  })

  it('freezes table locks while a re-optimize is pending', async () => {
    const pending = deferred<void>()
    let deferNext = false
    const optimize = vi.fn(async (request: DinnerRequest) => {
      if (deferNext) await pending.promise
      return roundRobin(request)
    })
    const { container } = renderDinner({ engine: fastEngine({ optimize }) })
    await generateTables('Fixture cohort', '3 × 8')
    fireEvent.click(within(tableCards(container)[0]!).getByRole('button', { name: 'Lock table' }))
    deferNext = true
    fireEvent.click(screen.getByRole('button', { name: 'Re-optimize Remaining' }))

    const unlockZero = within(tableCards(container)[0]!).getByRole('button', { name: 'Unlock table' }) as HTMLButtonElement
    const lockOne = within(tableCards(container)[1]!).getByRole('button', { name: 'Lock table' }) as HTMLButtonElement
    expect(unlockZero.disabled).toBe(true)
    expect(lockOne.disabled).toBe(true)
    fireEvent.click(unlockZero)
    fireEvent.click(lockOne)

    await act(async () => pending.resolve())
    await screen.findByText('Re-optimized 2 unlocked tables · 1 locked')
    const locks = optimize.mock.calls[1]![0].locks ?? []
    expect(new Set(locks.map((lock) => lock.tableIndex))).toEqual(new Set([0]))
    const pressed = tableCards(container).map((card) => card.querySelector('.v2-dinner-lock')!.getAttribute('aria-pressed'))
    expect(pressed).toEqual(['true', 'false', 'false'])
  })

  it('freezes plan edits while a save is pending so the saved label matches the submitted plan', async () => {
    const pendingSaves: ((value: { version: number; id: string }) => void)[] = []
    const onSave = vi.fn(
      (_plan: Parameters<NonNullable<DinnerPageProps['onSave']>>[0]) =>
        new Promise<{ version: number; id: string }>((resolve) => {
          pendingSaves.push(resolve)
        }),
    )
    const evaluate = vi.fn(async (request: DinnerRequest, next: readonly (readonly string[])[]) => evaluateDinnerAssignment(request, next))
    const optimize = vi.fn(async (request: DinnerRequest) => roundRobin(request))
    const { container } = renderDinner({ engine: fastEngine({ evaluate, optimize }), onSave })
    await generateTables('Fixture cohort', '3 × 8')
    fireEvent.click(within(tableCards(container)[1]!).getByRole('button', { name: 'Lock table' }))

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeTruthy()

    const threshold = screen.getByLabelText('Match threshold') as HTMLInputElement
    expect(threshold.disabled).toBe(true)
    fireEvent.change(threshold, { target: { value: '55' } })
    tableCards(container).forEach((card) => expect((card.querySelector('.v2-dinner-lock') as HTMLButtonElement).disabled).toBe(true))
    screen.getAllByRole('button', { name: 'Edit setup' }).forEach((button) => expect((button as HTMLButtonElement).disabled).toBe(true))
    for (const label of ['Re-optimize Remaining', 'Generate 2 Alternatives', 'Export']) {
      expect((screen.getByRole('button', { name: label }) as HTMLButtonElement).disabled).toBe(true)
    }

    fireEvent.click(screen.getByRole('button', { name: 'Analysis' }))
    const columns = [...container.querySelectorAll<HTMLElement>('.v2-dinner-heat-column')]
    const dragged = columns[0]!.querySelector<HTMLElement>('.v2-dinner-heat-person')!
    const target = columns[2]!.querySelector<HTMLElement>('.v2-dinner-heat-person')!
    expect(dragged.getAttribute('draggable')).toBe('false')
    fireEvent.dragStart(dragged)
    fireEvent.dragOver(target)
    fireEvent.drop(target)
    fireEvent.click(dragged)
    fireEvent.click(target)
    const recommendations = [...container.querySelectorAll<HTMLButtonElement>('.v2-dinner-recommendation button')]
    expect(recommendations.length).toBeGreaterThan(0)
    recommendations.forEach((button) => expect(button.disabled).toBe(true))
    expect(evaluate).not.toHaveBeenCalled()

    await act(async () => pendingSaves[0]!({ version: 7, id: 'plan-7' }))
    await screen.findByText('Saved version 7')
    const submitted = onSave.mock.calls[0]![0]
    expect(submitted.lockedTables).toEqual([1])
    expect(submitted.threshold).toBe(Number(threshold.value))

    fireEvent.click(screen.getByRole('button', { name: 'Tables' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await act(async () => pendingSaves[1]!({ version: 8, id: 'plan-7' }))
    await screen.findByText('Saved version 8')
    const { id, ...current } = onSave.mock.calls[1]![0]
    expect(id).toBe('plan-7')
    expect(current).toEqual(submitted)
    expect(optimize).toHaveBeenCalledOnce()
  })
})
