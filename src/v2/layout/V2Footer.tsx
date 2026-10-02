import type { AccountRole } from '../search/accountState'
import '../search/v2-chrome.css'

export interface V2FooterProps {
  aiStatus?: string
  role?: AccountRole
  onExport?: () => void
  onCreateDinner?: () => void
}

export function V2Footer({ aiStatus = '+ AI Disabled', role = 'admin', onExport, onCreateDinner }: V2FooterProps) {
  const showCreate = role === 'admin' && onCreateDinner !== undefined

  return (
    <footer className={role === 'admin' ? 'v2-footer' : 'v2-footer v2-footer-founder'}>
      <a className="v2-version-link" href="/v1">
        V1
      </a>
      <a className="v2-version-link v2-active-version" href="/v2" aria-current="page">
        V2
      </a>
      <div className="v2-footer-ai">{aiStatus}</div>
      <div aria-hidden="true" />
      {onExport && (
        <button type="button" className="v2-footer-export" onClick={onExport}>
          Export Results
        </button>
      )}
      {showCreate && (
        <button type="button" className="v2-footer-create" onClick={onCreateDinner}>
          Create Dinner Matching →
        </button>
      )}
    </footer>
  )
}
