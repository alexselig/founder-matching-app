import { useEffect, useId, useRef } from 'react'

import type { Founder } from '../../shared/founder'
import './founder-evidence.css'

export interface FounderEvidenceDrawerProps {
  founder: Founder
  evidence: FounderEvidenceData | null
  onClose: () => void
  onRetry?: () => void
}

export interface FounderEvidenceItem {
  rank: number
  classification: 'founder' | 'company' | 'both'
  title: string
  url: string
  domain: string
  snippet: string
  provider: string
  retrievedAt: string
  confidence?: number
}

export interface FounderEvidenceData {
  status: 'fresh' | 'stale' | 'no_results' | 'unsupported' | 'provider_failure'
  items: FounderEvidenceItem[]
}

function classification(result: FounderEvidenceItem) {
  if (result.classification === 'both') return 'Founder + company'
  return result.classification === 'founder' ? 'Founder' : 'Company'
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function FounderEvidenceDrawer({
  founder,
  evidence,
  onClose,
  onRetry,
}: FounderEvidenceDrawerProps) {
  const dialogRef = useRef<HTMLElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const results = evidence?.items.slice(0, 5) ?? []
  const stale = evidence?.status === 'stale'
  const providerFailure = evidence?.status === 'provider_failure'
  const unsupported =
    evidence?.status === 'unsupported' ||
    evidence?.status === 'no_results'

  useEffect(() => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeRef.current?.focus()

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const items = [...dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
      if (!items.length) return
      const first = items[0]!
      const last = items.at(-1)!
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (trigger?.isConnected) trigger.focus()
    }
  }, [onClose])

  return (
    <>
      <div className="v2-evidence-scrim" aria-hidden="true" onClick={onClose} />
      <aside
        ref={dialogRef}
        className={`v2-evidence-drawer v2-evidence-${evidence?.status ?? 'loading'}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={!evidence}
      >
        <header className="v2-evidence-drawer-head">
          <div className="v2-evidence-identity">
            <span aria-hidden="true">
              {founder.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2)}
            </span>
            <div>
              <small>Founder web search</small>
              <strong>{founder.name}</strong>
              <p>{founder.company}</p>
            </div>
          </div>
          <button ref={closeRef} type="button" className="v2-evidence-close" aria-label="Close top web results" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="v2-evidence-title">
          <div>
            <span>Source-backed discovery</span>
            <h2 id={titleId}>Top web results</h2>
          </div>
          <strong>{evidence ? results.length : '—'}</strong>
        </div>
        {!evidence ? (
          <div className="v2-evidence-loading" role="status">Loading top web results…</div>
        ) : (
          <>
            <div className="v2-evidence-status">
              <div className="v2-evidence-status-icon">
                {unsupported ? '—' : stale ? '!' : '✓'}
              </div>
              <div>
                <strong>
                  {providerFailure
                    ? 'Web results could not load'
                    : unsupported
                    ? 'No citable evidence returned'
                    : stale
                      ? 'Results are available, but may be stale'
                      : 'Top web results'}
                </strong>
                <span>
                  {providerFailure
                    ? 'The search workspace and founder record remain unchanged.'
                    : unsupported
                    ? 'The founder record remains unchanged.'
                    : stale
                      ? 'The latest successful search is older than its stale-after date.'
                      : 'Showing the five highest-ranked cited results.'}
                </span>
              </div>
            </div>
            {providerFailure ? (
              <div className="v2-evidence-empty">
                <b>!</b>
                <h3>Web results are temporarily unavailable.</h3>
                <p>Retry the request without leaving your current search.</p>
                {onRetry && (
                  <button type="button" className="v2-evidence-retry" onClick={onRetry}>
                    Try again
                  </button>
                )}
              </div>
            ) : unsupported ? (
              <div className="v2-evidence-empty">
                <b>?</b>
                <h3>Nothing citable found yet.</h3>
                <p>Results appear only when a source URL and retrievable citation are available.</p>
              </div>
            ) : (
              <ol className="v2-evidence-list">
                {results.map((item, index) => (
                  <li key={`${item.url}-${item.rank}`}>
                    <div className="v2-evidence-rank">Rank<strong>{String(index + 1).padStart(2, '0')}</strong></div>
                    <article>
                      <span className="v2-evidence-classification">{classification(item)}</span>
                      {stale && <span className="v2-evidence-stale">Stale</span>}
                      <h3>{item.title}</h3>
                      <a href={item.url} target="_blank" rel="noreferrer">{item.url} ↗</a>
                      <p>{item.snippet}</p>
                      <dl>
                        <div><dt>Domain</dt><dd>{item.domain}</dd></div>
                        <div><dt>Retrieved</dt><dd>{new Date(item.retrievedAt).toLocaleDateString('en-US')}</dd></div>
                        <div><dt>Provider</dt><dd>{item.provider}</dd></div>
                        <div><dt>Confidence</dt><dd>{item.confidence?.toFixed(2) ?? '—'}</dd></div>
                      </dl>
                    </article>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </aside>
    </>
  )
}
