import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AppRouter } from './AppRouter'

describe('AppRouter', () => {
  it('renders V1 without V2 navigation and rebases links under /v1', () => {
    history.replaceState({}, '', '/v1')

    render(<AppRouter />)

    expect(screen.getByText('Admin grouping')).toBeInTheDocument()
    expect(screen.queryByText('Dinner Matching')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Founder Table' })).toHaveAttribute('href', '/v1')
    expect(screen.getByRole('link', { name: 'Plan review' })).toHaveAttribute('href', '/v1/plan')
    expect(screen.getByRole('link', { name: 'Directory' })).toHaveAttribute('href', '/v1/directory')
    expect(screen.getByRole('link', { name: 'Algorithm' })).toHaveAttribute('href', '/v1/algorithm')
    expect(screen.getByRole('link', { name: 'Admin grouping' })).toHaveAttribute('href', '/v1/admin')
  })

  it('matches V1 plan routes beneath /v1', () => {
    history.replaceState({}, '', '/v1/plan')

    render(<AppRouter />)

    expect(screen.getByText('Search first, discovery underneath')).toBeInTheDocument()
  })

  it('matches V1 admin routes beneath /v1', () => {
    history.replaceState({}, '', '/v1/admin')

    render(<AppRouter />)

    expect(screen.getByRole('button', { name: 'Export groups as CSV' })).toBeInTheDocument()
  })

  it('renders V2 at /v2', () => {
    history.replaceState({}, '', '/v2')

    render(<AppRouter />)

    expect(screen.getByText('Founder Search')).toBeInTheDocument()
  })
})
