import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import rawFounders from '../../founders.json'
import { normalizeFounders } from '../../shared/founder'
import { FounderEvidencePage } from './FounderEvidencePage'

const founder = normalizeFounders(rawFounders)[0]!

beforeEach(() => {
  window.localStorage.clear()
  window.localStorage.setItem('founder-v2-account-tip-dismissed', 'true')
})

describe('FounderEvidencePage', () => {
  it('keeps authoritative data separate from cited evidence', () => {
    render(
      <FounderEvidencePage
        founder={founder}
        evidence={{
          status: 'fresh',
          items: [{
            rank: 1,
            classification: 'both',
            title: 'Founder and company directory',
            url: 'https://profiles.demo.example/founder',
            domain: 'profiles.demo.example',
            snippet: 'A cited synthetic result.',
            provider: 'demo-fixture',
            retrievedAt: '2026-10-01T20:00:00.000Z',
            confidence: 0.97,
          }],
        }}
      />,
    )

    expect(screen.getByText('Authoritative founder data')).toBeInTheDocument()
    expect(screen.getByText('Supported by cited Web Search evidence')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /profiles\.demo\.example/ })).toHaveAttribute(
      'href',
      'https://profiles.demo.example/founder',
    )
  })
})
