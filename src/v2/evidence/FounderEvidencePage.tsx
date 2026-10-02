import type { Founder } from '../../shared/founder'
import { V2Footer } from '../layout/V2Footer'
import { V2Header } from '../layout/V2Header'
import {
  browserLocalStorage,
  readAccountRole,
  readCurrentFounderId,
  writeAccountRole,
  type AccountRole,
} from '../search/accountState'
import { useState } from 'react'
import './founder-evidence.css'

export interface FounderEvidencePageProps {
  founder: Founder
  evidence: FounderEvidenceData
  aiStatus?: string
  aiTone?: 'enabled' | 'issue' | 'off'
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

export function FounderEvidencePage({
  founder,
  evidence,
  aiStatus,
  aiTone,
}: FounderEvidencePageProps) {
  const founders = [founder]
  const [role, setRole] = useState<AccountRole>(() =>
    readAccountRole(browserLocalStorage()),
  )
  const [currentFounderId] = useState(() =>
    readCurrentFounderId(browserLocalStorage(), founders),
  )
  const currentFounder =
    founders.find((item) => item.id === currentFounderId) ?? founder
  const stale = evidence.status === 'stale'
  const unsupported =
    evidence.status === 'unsupported' ||
    evidence.status === 'no_results' ||
    evidence.status === 'provider_failure'

  function changeRole(next: AccountRole) {
    setRole(next)
    writeAccountRole(browserLocalStorage(), next)
  }

  return (
    <div className="v2-shell v2-evidence-shell">
      <V2Header
        active="founder-index"
        role={role}
        currentFounder={currentFounder}
        onRoleChange={changeRole}
      />
      <main>
        <section className="v2-evidence-heading">
          <div>
            <span>Founder detail · Web Search</span>
            <h1>Review the evidence, not just the summary.</h1>
          </div>
          <p>
            Web Search stays separate from the founder record. Every supported
            claim points to a source, retrieval date, provider, and entity
            match.
          </p>
        </section>
        <section className="v2-evidence-workspace">
          <aside className="v2-evidence-founder">
            <div className="v2-evidence-identity">
              <span aria-hidden="true">
                {founder.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2)}
              </span>
              <div><h2>{founder.name}</h2><p>{founder.company}</p></div>
            </div>
            <div className="v2-evidence-separation">
              <strong>Authoritative founder data</strong>
              <p>These values come from the loaded founder dataset. Web Search cannot replace or edit them.</p>
            </div>
            {[
              ['Role', founder.role],
              ['Market', founder.companyVertical],
              ['Cohort', `${founder.cohortGroup} · ${founder.cohortSection}`],
              ['Education', founder.education],
            ].map(([label, value]) => (
              <div className="v2-evidence-fact" key={label}>
                <span>{label}</span><strong>{value}</strong>
              </div>
            ))}
          </aside>
          <section className={`v2-evidence-panel v2-evidence-${evidence.status}`}>
            <div className="v2-evidence-status">
              <div className="v2-evidence-status-icon">
                {unsupported ? '—' : stale ? '!' : '✓'}
              </div>
              <div>
                <strong>
                  {unsupported
                    ? 'No citable evidence returned'
                    : stale
                      ? 'Evidence is available, but it is stale'
                      : 'Supported by cited Web Search evidence'}
                </strong>
                <span>
                  {unsupported
                    ? 'Authoritative founder fields remain unchanged.'
                    : stale
                      ? 'The latest successful run is older than its stale-after date.'
                      : 'Source records support the founder and company claims shown here.'}
                </span>
              </div>
              <div className="v2-evidence-count">
                <strong>{evidence.items.length}</strong><span>Evidence items</span>
              </div>
            </div>
            {unsupported ? (
              <div className="v2-evidence-empty">
                <b>?</b>
                <h2>Nothing here can support a claim yet.</h2>
                <p>Without a source URL and retrievable citation, provider text is not promoted into evidence.</p>
              </div>
            ) : (
              <ol className="v2-evidence-list">
                {evidence.items.map((item) => (
                  <li key={`${item.url}-${item.rank}`}>
                    <div className="v2-evidence-rank">Rank<strong>{String(item.rank).padStart(2, '0')}</strong></div>
                    <article>
                      <span className="v2-evidence-classification">{classification(item)}</span>
                      {stale && <span className="v2-evidence-stale">Stale</span>}
                      <h2>{item.title}</h2>
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
          </section>
        </section>
      </main>
      <V2Footer role={role} aiStatus={aiStatus} aiTone={aiTone} />
    </div>
  )
}
