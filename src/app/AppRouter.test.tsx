import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AppRouter } from './AppRouter'

describe('AppRouter', () => {
  it('renders V1 without V2 navigation', () => {
    history.replaceState({}, '', '/v1')

    render(<AppRouter />)

    expect(screen.getByText('Admin grouping')).toBeInTheDocument()
    expect(screen.queryByText('Dinner Matching')).not.toBeInTheDocument()
  })

  it('renders V2 at /v2', () => {
    history.replaceState({}, '', '/v2')

    render(<AppRouter />)

    expect(screen.getByText('Founder Search')).toBeInTheDocument()
  })
})
