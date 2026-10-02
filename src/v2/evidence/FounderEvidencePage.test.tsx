import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { vi } from 'vitest'

import rawFounders from '../../founders.json'
import { normalizeFounders } from '../../shared/founder'
import { FounderEvidenceDrawer } from './FounderEvidencePage'

const founder = normalizeFounders(rawFounders)[0]!

beforeEach(() => {
  window.localStorage.clear()
  window.localStorage.setItem('founder-v2-account-tip-dismissed', 'true')
})

afterEach(() => cleanup())

describe('FounderEvidencePage', () => {
  it('shows at most five web results in a dismissible right-side dialog', () => {
    const onClose = vi.fn()
    render(
      <FounderEvidenceDrawer
        founder={founder}
        evidence={{
          status: 'fresh',
          items: Array.from({ length: 7 }, (_, index) => ({
            rank: 1,
            classification: 'both',
            title: `Founder and company directory ${index + 1}`,
            url: `https://profiles.demo.example/founder-${index + 1}`,
            domain: 'profiles.demo.example',
            snippet: 'A cited synthetic result.',
            provider: 'demo-fixture',
            retrievedAt: '2026-10-01T20:00:00.000Z',
            confidence: 0.97,
          })),
        }}
        onClose={onClose}
      />,
    )

    const dialog = screen.getByRole('dialog', { name: 'Top web results' })
    expect(within(dialog).getByText(founder.name)).toBeInTheDocument()
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(5)
    expect(within(dialog).getByRole('link', { name: /founder-1/ })).toHaveAttribute(
      'href',
      'https://profiles.demo.example/founder-1',
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('offers a retry when the web-results request fails', () => {
    const onRetry = vi.fn()
    render(
      <FounderEvidenceDrawer
        founder={founder}
        evidence={{ status: 'provider_failure', items: [] }}
        onClose={vi.fn()}
        onRetry={onRetry}
      />,
    )

    const dialog = screen.getByRole('dialog', { name: 'Top web results' })
    expect(within(dialog).getByText('Web results could not load')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
