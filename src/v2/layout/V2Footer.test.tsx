import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { V2Footer } from './V2Footer'

afterEach(cleanup)

describe('V2Footer', () => {
  it('keeps the Search export and create buttons when no page actions are supplied', () => {
    const onExport = vi.fn()
    const { container } = render(<V2Footer role="admin" onExport={onExport} onCreateDinner={() => undefined} />)
    const footer = container.querySelector('footer')!
    expect(footer.className).toBe('v2-footer')
    expect(container.querySelector('.v2-footer-ai')!.className).toBe('v2-footer-ai')
    expect(screen.getByRole('link', { name: '+ AI Disabled' }).getAttribute('href')).toBe('/v2/settings/ai')
    expect(container.querySelector('.v2-footer-actions')).toBeNull()
    const demoToggle = screen.getByRole('switch', { name: 'Demo mode' })
    expect(demoToggle.getAttribute('aria-checked')).toBe('false')
    expect(demoToggle.querySelector('.v2-footer-demo-track')).toBeTruthy()
    expect(demoToggle.textContent).toContain('Off')
    expect(container.querySelector('.v2-footer-ai')!.nextElementSibling).toBe(demoToggle)
    fireEvent.click(screen.getByRole('button', { name: 'Export Results' }))
    expect(onExport).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Create Dinner Matching →' })).toBeTruthy()
  })

  it('renders a page-specific action group and AI tone instead of the Search buttons', () => {
    const { container } = render(
      <V2Footer
        role="admin"
        aiStatus="⚠ AI Connection Issue · Anthropic"
        aiTone="issue"
        onExport={() => undefined}
        actions={<button type="button">Save</button>}
      />,
    )
    expect(container.querySelector('footer')!.className).toBe('v2-footer v2-footer-with-actions')
    expect(container.querySelector('.v2-footer-ai')!.className).toBe('v2-footer-ai v2-footer-ai-issue')
    expect(container.querySelector('.v2-footer-actions')!.textContent).toBe('Save')
    expect(screen.queryByRole('button', { name: 'Export Results' })).toBeNull()
    expect(screen.getByRole('link', { name: 'V2' }).getAttribute('aria-current')).toBe('page')
  })

  it('links founder accounts to AI settings and exposes Demo mode', () => {
    render(<V2Footer role="founder" />)
    expect(screen.getByRole('link', { name: '+ AI Disabled' }).getAttribute('href')).toBe('/v2/settings/ai')
    expect(screen.getByRole('switch', { name: 'Demo mode' }).getAttribute('aria-checked')).toBe('false')
  })
})
