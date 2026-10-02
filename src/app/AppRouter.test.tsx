import '@testing-library/jest-dom/vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { AppRouter } from './AppRouter'

afterEach(cleanup)

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
    expect(screen.getByRole('link', { name: 'V2' })).toHaveAttribute('href', '/v2/search')

    const navLinks = within(screen.getByRole('navigation', { name: 'Primary navigation' }))
      .getAllByRole('link')
    expect(navLinks.map((link) => link.textContent?.trim())).toEqual([
      'Directory',
      'Admin grouping',
      'Plan review',
      'Algorithm',
    ])
    expect(navLinks[2]).toHaveClass('nav-secondary-start')
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
    expect(screen.getByRole('link', { name: 'V2' })).toHaveAttribute('href', '/v2/dinner')
  })

  it('renders V2 at /v2', () => {
    history.replaceState({}, '', '/v2')

    render(<AppRouter />)

    expect(screen.getByText('Loading founder workspace…')).toBeInTheDocument()
  })

  it('positions the compact V1 switcher bottom-left with a solid active tab', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')
    const footerRule = css.match(/\.v1-version-footer\s*\{([^}]*)\}/)?.[1] ?? ''
    const activeRule = css.match(/\.v1-version-footer a\.active\s*\{([^}]*)\}/)?.[1] ?? ''
    const secondaryRule = css.match(/\.masthead nav a\.nav-secondary-start\s*\{([^}]*)\}/)?.[1] ?? ''

    expect(footerRule).toContain('left: 0')
    expect(footerRule).not.toContain('right: 0')
    expect(activeRule).toContain('background: var(--bauhaus-blue)')
    expect(activeRule).toContain('color: white')
    expect(secondaryRule).toContain('margin-left: auto')
    expect(css).toContain('@media (max-width: 900px)')
    expect(css).toContain('.masthead nav a.nav-secondary-start { margin-left: 0; }')
  })
})
