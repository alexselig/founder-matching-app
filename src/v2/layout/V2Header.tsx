import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

import type { Founder } from '../../shared/founder'
import {
  browserLocalStorage,
  readAccountTipDismissed,
  writeAccountTipDismissed,
  type AccountRole,
} from '../search/accountState'
import { founderAccountLabel, initials } from '../search/founderDisplay'
import '../search/v2-chrome.css'

export type V2NavItem = 'founder-index' | 'seating-plans'

export interface V2HeaderProps {
  active?: V2NavItem
  role: AccountRole
  currentFounder: Founder | null
  onRoleChange: (role: AccountRole) => void
}

const NAV_ITEMS: readonly { key: V2NavItem; label: string; href: string }[] = [
  { key: 'founder-index', label: 'Founder Index', href: '/v2/search' },
  { key: 'seating-plans', label: 'Seating Plans', href: '/v2/seating-plans' },
]

const ROLE_MESSAGES: Readonly<Record<AccountRole, string>> = {
  admin: 'YC Admin selected. Seating Plans and dinner matching controls are available.',
  founder: 'Founder account selected. Export Results is the primary action.',
}

export function V2Header({ active, role, currentFounder, onRoleChange }: V2HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [tipVisible, setTipVisible] = useState(() => !readAccountTipDismissed(browserLocalStorage()))
  const [message, setMessage] = useState('')
  const profileRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const founderLabel = currentFounder ? founderAccountLabel(currentFounder) : 'No founder selected'
  const founderInitials = currentFounder ? initials(currentFounder.name) : '—'

  useEffect(() => {
    if (!menuOpen) return
    menuRef.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus()
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== 'Escape') return
      setMenuOpen(false)
      triggerRef.current?.focus()
    }
    function handlePointerDown(event: MouseEvent) {
      if (!profileRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handlePointerDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handlePointerDown)
    }
  }, [menuOpen])

  function dismissTip() {
    setTipVisible(false)
    writeAccountTipDismissed(browserLocalStorage())
  }

  function toggleMenu() {
    if (tipVisible) dismissTip()
    setMenuOpen((open) => !open)
  }

  function chooseRole(next: AccountRole) {
    setMenuOpen(false)
    triggerRef.current?.focus()
    setMessage(ROLE_MESSAGES[next])
    if (next !== role) onRoleChange(next)
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const items = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? [])]
    const index = items.indexOf(document.activeElement as HTMLElement)
    const moves: Record<string, number> = {
      ArrowDown: (index + 1) % items.length,
      ArrowUp: (index - 1 + items.length) % items.length,
      Home: 0,
      End: items.length - 1,
    }
    if (!(event.key in moves)) return
    event.preventDefault()
    items[moves[event.key]]?.focus()
  }

  return (
    <header className={role === 'admin' ? 'v2-topbar' : 'v2-topbar v2-topbar-founder'}>
      <div className="v2-brand">
        <span>
          Founder
          <br />
          Index
        </span>
        <span className="v2-version">V2</span>
      </div>
      {role === 'admin' ? (
        <nav className="v2-nav" aria-label="Primary">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.key}
              className={item.key === active ? 'v2-nav-item v2-active' : 'v2-nav-item'}
              href={item.href}
              aria-current={item.key === active ? 'page' : undefined}
            >
              {item.label}
            </a>
          ))}
        </nav>
      ) : (
        <div />
      )}
      <div className="v2-profile" ref={profileRef}>
        <button
          ref={triggerRef}
          type="button"
          className="v2-profile-trigger"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-controls={menuOpen ? 'v2-profile-menu' : undefined}
          onClick={toggleMenu}
        >
          <span className="v2-profile-avatar" aria-hidden="true">
            {role === 'admin' ? 'YC' : founderInitials}
          </span>
          <span>
            <small>{role === 'admin' ? 'Current organizer' : 'Current founder'}</small>
            <strong>{role === 'admin' ? 'YC Admin' : founderLabel}</strong>
          </span>
          <span className="v2-chevron" aria-hidden="true">
            ⌄
          </span>
        </button>
        {menuOpen && (
          <div
            ref={menuRef}
            className="v2-profile-menu"
            id="v2-profile-menu"
            role="menu"
            aria-label="Account view"
            onKeyDown={handleMenuKeyDown}
          >
            <button
              type="button"
              className="v2-profile-option"
              role="menuitemradio"
              aria-checked={role === 'founder'}
              tabIndex={role === 'founder' ? 0 : -1}
              onClick={() => chooseRole('founder')}
            >
              <span className="v2-option-avatar v2-option-avatar-founder" aria-hidden="true">
                {founderInitials}
              </span>
              <span>
                <small>Founder account</small> <strong>{founderLabel}</strong>
              </span>
              <span className="v2-selected-mark" aria-hidden="true">
                {role === 'founder' ? '✓' : ''}
              </span>
            </button>
            <button
              type="button"
              className="v2-profile-option"
              role="menuitemradio"
              aria-checked={role === 'admin'}
              tabIndex={role === 'admin' ? 0 : -1}
              onClick={() => chooseRole('admin')}
            >
              <span className="v2-option-avatar" aria-hidden="true">
                YC
              </span>
              <span>
                <small>Organizer account</small> <strong>YC Admin</strong>
              </span>
              <span className="v2-selected-mark" aria-hidden="true">
                {role === 'admin' ? '✓' : ''}
              </span>
            </button>
          </div>
        )}
        {tipVisible && !menuOpen && (
          <aside className="v2-account-callout" aria-labelledby="v2-account-callout-title">
            <strong id="v2-account-callout-title">Switch account views</strong>
            <p>Toggle between Founder and YC Admin here.</p>
            <button
              type="button"
              aria-label="Dismiss account switcher tip"
              onClick={() => {
                dismissTip()
                triggerRef.current?.focus()
              }}
            >
              ×
            </button>
          </aside>
        )}
      </div>
      <div className="v2-visually-hidden" role="status" aria-live="polite" data-testid="account-live-region">
        {message}
      </div>
    </header>
  )
}
