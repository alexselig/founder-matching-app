import type { ReactNode } from 'react'

import type { AccountRole } from '../search/accountState'
import { readDemoMode, setDemoMode } from '../demoMode'
import '../search/v2-chrome.css'
import './v2-footer-actions.css'

export interface V2FooterProps {
  aiStatus?: string
  role?: AccountRole
  onExport?: () => void
  onCreateDinner?: () => void
  /** Page-specific command group rendered at the right edge instead of the Search export/create buttons. */
  actions?: ReactNode
  aiTone?: 'enabled' | 'issue' | 'off'
}

export function V2Footer({ aiStatus = '+ AI Disabled', role = 'admin', onExport, onCreateDinner, actions, aiTone }: V2FooterProps) {
  const showCreate = role === 'admin' && onCreateDinner !== undefined
  const hasActions = actions !== undefined
  const footerClass = [
    'v2-footer',
    role === 'admin' ? '' : 'v2-footer-founder',
    hasActions ? 'v2-footer-with-actions' : '',
  ]
    .filter(Boolean)
    .join(' ')
  const demoMode = readDemoMode()

  function toggleDemoMode() {
    setDemoMode(!demoMode)
    window.location.assign('/v2')
  }

  return (
    <footer className={footerClass}>
      <a className="v2-version-link" href="/v1">
        V1
      </a>
      <a className="v2-version-link v2-active-version" href="/v2" aria-current="page">
        V2
      </a>
      <a
        className={aiTone ? `v2-footer-ai v2-footer-ai-${aiTone}` : 'v2-footer-ai'}
        href="/v2/settings/ai"
      >
        {aiStatus}
      </a>
      <button
        type="button"
        role="switch"
        className="v2-footer-demo"
        aria-label="Demo mode"
        aria-checked={demoMode}
        onClick={toggleDemoMode}
      >
        <span>Demo mode</span>
        <span className="v2-footer-demo-track" aria-hidden="true">
          <span className="v2-footer-demo-thumb" />
        </span>
        <strong>{demoMode ? 'On' : 'Off'}</strong>
      </button>
      {hasActions && <div className="v2-footer-actions">{actions}</div>}
      {!hasActions && onExport && (
        <button type="button" className="v2-footer-export" onClick={onExport}>
          Export Results
        </button>
      )}
      {!hasActions && showCreate && (
        <button type="button" className="v2-footer-create" onClick={onCreateDinner}>
          Create Dinner Matching →
        </button>
      )}
    </footer>
  )
}
