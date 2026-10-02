import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import rawFounders from '../../founders.json'
import { normalizeFounders } from '../../shared/founder'
import { AiProviderPage } from './AiProviderPage'

const founders = normalizeFounders(rawFounders)
const credentials = {
  masterKeyConfigured: true,
  providers: [
    { provider: 'openai' as const, label: 'OpenAI', status: 'not_configured' as const, lastFour: null, validatedAt: null },
    { provider: 'anthropic' as const, label: 'Anthropic', status: 'not_configured' as const, lastFour: null, validatedAt: null },
    { provider: 'xai' as const, label: 'xAI', status: 'not_configured' as const, lastFour: null, validatedAt: null },
  ],
}

beforeEach(() => {
  window.localStorage.clear()
  window.localStorage.setItem('founder-v2-account-tip-dismissed', 'true')
})

afterEach(cleanup)

describe('AiProviderPage', () => {
  it('matches the approved provider setup and validates a safe demo state', async () => {
    render(
      <AiProviderPage
        founders={founders}
        credentials={credentials}
        demoMode
      />,
    )

    expect(screen.getByRole('heading', { name: 'AI Provider' })).toBeInTheDocument()
    expect(screen.getByText('Bring your own credential')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Validate credential/ }))
    expect(await screen.findByText('Credential is valid')).toBeInTheDocument()
    expect(screen.getByText(/Ending in ···· DEMO/)).toBeInTheDocument()
  })

  it('allows founder accounts to configure and validate an AI provider', async () => {
    window.localStorage.setItem('founder-v2-account-role', 'founder')

    render(
      <AiProviderPage
        founders={founders}
        credentials={credentials}
        demoMode
      />,
    )

    expect(screen.getByRole('heading', { name: 'AI Provider' })).toBeInTheDocument()
    expect(screen.queryByText('AI configuration is for YC admins.')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Validate credential/ }))
    expect(await screen.findByText('Credential is valid')).toBeInTheDocument()
  })
})
