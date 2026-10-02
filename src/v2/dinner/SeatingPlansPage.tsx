import { useEffect, useMemo, useRef, useState } from 'react'

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
import { useDialogFocus } from './useDialogFocus'
import './seating-plans.css'
import './dinner-header.css'

export type SeatingPlanStatus = 'ready' | 'draft' | 'warning'

/** One saved version of a plan, as listed by the coordinator's dinner version API (Task 8). */
export interface SeatingPlanVersion {
  readonly version: number
  readonly title: string
  readonly detail: string
  /** ISO timestamp. */
  readonly savedAt: string
  readonly savedBy: string
}

/** Index row for one saved seating plan. Persistence and loading stay with the coordinator. */
export interface SeatingPlanSummary {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly status: SeatingPlanStatus
  readonly founderCount: number
  readonly tableCount: number
  readonly seatsPerTable: number
  /** Saved founder IDs that no longer resolve; drives the "Needs attention" note. */
  readonly needsReview?: number
  /** Latest saved version number. */
  readonly version: number
  /** ISO timestamp of the latest version. */
  readonly updatedAt: string
  readonly updatedBy: string
  /** Optional detailed history; a compact history is derived from `version` when omitted. */
  readonly versions?: readonly SeatingPlanVersion[]
}

export interface SeatingPlansPageProps {
  readonly plans?: readonly SeatingPlanSummary[]
  readonly founders: readonly Founder[]
  /** Reopen a plan at a version. Defaults to navigating to `/v2/dinner?plan=…&version=…`. */
  readonly onOpenPlan?: (planId: string, version: number) => void
  /** Permanently delete a plan and all versions. Delete controls are disabled when omitted. */
  readonly onDeletePlan?: (planId: string) => Promise<void> | void
  readonly navigate?: (path: string) => void
  readonly now?: () => Date
  readonly aiStatus?: string
  readonly aiTone?: 'enabled' | 'issue' | 'off'
}

type StatusFilter = 'all' | SeatingPlanStatus

interface VersionRow {
  readonly version: number
  readonly current: boolean
  readonly title: string
  readonly detail: string
  readonly when: string
  readonly by: string
}

interface PendingDelete {
  readonly plan: SeatingPlanSummary
  readonly busy: boolean
}

const STATUS_LABELS: Readonly<Record<SeatingPlanStatus, string>> = {
  ready: 'Ready',
  draft: 'Draft',
  warning: 'Needs attention',
}

const HERO_COPY = {
  archive: {
    title: 'Pick up where you left off.',
    body: 'Reopen an arrangement, inspect prior versions, or remove seating plans you no longer need.',
  },
  zero: {
    title: 'Build your first dinner.',
    body: 'Start with a cohort and table count, then shape the introductions with matching criteria.',
  },
} as const

function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

function spaces(text: string) {
  return text.replace(/[\u202f\u00a0]/g, ' ')
}

function formatPlanTimestamp(iso: string, now: Date) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const time = spaces(date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }))
  const sameDay =
    date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate()
  const day = sameDay ? 'Today' : spaces(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))
  return `${day} · ${time}`
}

function founderNote(plan: SeatingPlanSummary) {
  if (plan.status === 'warning' && plan.needsReview) return `${plan.needsReview} needs review`
  return plan.founderCount === 0 ? 'Cohort not selected' : 'Complete cohort'
}

function tableNote(plan: SeatingPlanSummary) {
  return plan.founderCount === 0 ? 'Setup only' : `${plan.seatsPerTable} seats each`
}

function versionRows(plan: SeatingPlanSummary, now: Date): VersionRow[] {
  if (plan.versions?.length) {
    return [...plan.versions]
      .sort((a, b) => b.version - a.version)
      .map((item) => ({
        version: item.version,
        current: item.version === plan.version,
        title: item.title,
        detail: item.detail,
        when: formatPlanTimestamp(item.savedAt, now),
        by: item.savedBy,
      }))
  }
  return Array.from({ length: plan.version }, (_, index) => ({
    version: plan.version - index,
    current: index === 0,
    title: index === 0 ? 'Latest saved configuration' : 'Earlier saved configuration',
    detail: 'Complete cohort, criteria, rules, locks, and assignments',
    when: index === 0 ? 'Most recent' : `${plural(index, 'save')} earlier`,
    by: plan.updatedBy,
  }))
}

export function SeatingPlansPage({
  plans = [],
  founders,
  onOpenPlan,
  onDeletePlan,
  navigate = (path) => window.location.assign(path),
  now = () => new Date(),
  aiStatus,
  aiTone,
}: SeatingPlansPageProps) {
  const [role, setRole] = useState<AccountRole>(() => readAccountRole(browserLocalStorage()))
  const [currentFounderId] = useState(() => readCurrentFounderId(browserLocalStorage(), founders))
  const currentFounder = founders.find((founder) => founder.id === currentFounderId) ?? null
  const [deleted, setDeleted] = useState<ReadonlySet<string>>(() => new Set())
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [historyId, setHistoryId] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingDelete | null>(null)
  const [message, setMessage] = useState('')
  const historyTriggers = useRef(new Map<string, HTMLButtonElement>())
  const refocusRef = useRef(false)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const createRef = useRef<HTMLButtonElement>(null)
  const today = now()

  const saved = useMemo(() => plans.filter((plan) => !deleted.has(plan.id)), [plans, deleted])
  const zero = saved.length === 0
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return saved.filter(
      (plan) => plan.name.toLowerCase().includes(needle) && (statusFilter === 'all' || plan.status === statusFilter),
    )
  }, [saved, query, statusFilter])
  const stats = [
    { value: saved.length, label: 'Saved plans' },
    { value: saved.reduce((sum, plan) => sum + plan.founderCount, 0), label: 'Founders placed' },
    { value: saved.reduce((sum, plan) => sum + plan.tableCount, 0), label: 'Total tables' },
  ]
  const hero = zero ? HERO_COPY.zero : HERO_COPY.archive

  const dialogRef = useDialogFocus<HTMLElement>(pending !== null, closeDelete, confirmRef)

  useEffect(() => {
    if (!refocusRef.current) return
    refocusRef.current = false
    ;(searchRef.current ?? createRef.current)?.focus()
  })

  function changeRole(next: AccountRole) {
    setRole(next)
    writeAccountRole(browserLocalStorage(), next)
  }

  function open(plan: SeatingPlanSummary, version: number) {
    if (onOpenPlan) onOpenPlan(plan.id, version)
    else navigate(`/v2/dinner?plan=${encodeURIComponent(plan.id)}&version=${version}`)
  }

  function reopen(plan: SeatingPlanSummary) {
    setMessage(
      plan.status === 'warning'
        ? `${plan.name} opened with a missing-founder recovery warning`
        : `${plan.name} reopened at its latest version`,
    )
    open(plan, plan.version)
  }

  function openVersion(plan: SeatingPlanSummary, row: VersionRow) {
    setMessage(row.current ? `Opening current version ${row.version}` : `Opening version ${row.version} as an editable copy`)
    open(plan, row.version)
  }

  function toggleHistory(plan: SeatingPlanSummary) {
    if (historyId === plan.id) {
      setHistoryId(null)
      return
    }
    setHistoryId(plan.id)
    setMessage(`Showing version history for ${plan.name}`)
  }

  function closeHistory(planId: string) {
    setHistoryId(null)
    historyTriggers.current.get(planId)?.focus()
  }

  function changeQuery(value: string) {
    setHistoryId(null)
    setQuery(value)
  }

  function changeStatus(value: StatusFilter) {
    setHistoryId(null)
    setStatusFilter(value)
  }

  function requestDelete(plan: SeatingPlanSummary) {
    setHistoryId(null)
    setPending({ plan, busy: false })
  }

  function closeDelete() {
    setPending((current) => (current?.busy ? current : null))
  }

  async function confirmDelete() {
    if (!pending || pending.busy || !onDeletePlan) return
    const { plan } = pending
    setPending({ plan, busy: true })
    try {
      await onDeletePlan(plan.id)
    } catch {
      setPending({ plan, busy: false })
      setMessage(`${plan.name} could not be deleted. Try again.`)
      return
    }
    setDeleted((current) => new Set(current).add(plan.id))
    setPending(null)
    refocusRef.current = true
    setMessage(`${plan.name} permanently deleted`)
  }

  const restricted = role !== 'admin'

  return (
    <div className="v2-shell v2-plans-shell">
      <V2Header active="seating-plans" role={role} currentFounder={currentFounder} onRoleChange={changeRole} />
      <main className="v2-plans-main">
        {restricted ? (
          <section className="v2-plans-restricted" aria-labelledby="plans-restricted-title">
            <span className="v2-plans-eyebrow">Seating plans</span>
            <h1 id="plans-restricted-title">Seating plans are for YC admins.</h1>
            <p>Founder accounts can search the Founder Index and export results. Switch to a YC Admin account to review saved seating plans.</p>
            <a href="/v2/search">Open Founder Index →</a>
          </section>
        ) : (
          <>
            <section className="v2-plans-hero">
              <div className="v2-plans-hero-title">
                <div className="v2-plans-eyebrow">
                  Saved table
                  <br />
                  arrangements
                </div>
                <h1>Seating plans.</h1>
              </div>
              <div className={zero ? 'v2-plans-hero-summary v2-plans-zero-state' : 'v2-plans-hero-summary'}>
                <div className="v2-plans-hero-copy">
                  <h2>{hero.title}</h2>
                  <p>{hero.body}</p>
                </div>
                {stats.map((stat) => (
                  <div key={stat.label} className="v2-plans-hero-stat">
                    <strong>{stat.value}</strong>
                    <span>{stat.label}</span>
                  </div>
                ))}
              </div>
            </section>

            {zero ? (
              <section className="v2-plans-empty-state">
                <div className="v2-plans-empty-copy">
                  <span className="v2-plans-eyebrow">No seating plans yet</span>
                  <h2>Your first dinner starts here.</h2>
                  <p>Choose a founder cohort, set the number of tables, and add the matching criteria that will shape every introduction.</p>
                  <button ref={createRef} type="button" className="v2-plans-empty-cta" onClick={() => navigate('/v2/dinner')}>
                    <span>Create your first seating plan</span>
                    <span aria-hidden="true">→</span>
                  </button>
                </div>
                <div className="v2-plans-empty-visual" aria-hidden="true">
                  <div className="v2-plans-empty-table">
                    {Array.from({ length: 8 }, (_, index) => (
                      <span key={index} className="v2-plans-empty-chair" />
                    ))}
                    Table 01
                  </div>
                </div>
              </section>
            ) : (
              <>
                <section className="v2-plans-toolbar" aria-label="Find seating plans">
                  <div className="v2-plans-search-box">
                    <label htmlFor="plans-search">Find a plan</label>
                    <input
                      ref={searchRef}
                      id="plans-search"
                      type="search"
                      placeholder="Search seating plan names"
                      value={query}
                      onChange={(event) => changeQuery(event.target.value)}
                    />
                  </div>
                  <div className="v2-plans-filter-cell">
                    <label htmlFor="plans-status">Status</label>
                    <select id="plans-status" value={statusFilter} onChange={(event) => changeStatus(event.target.value as StatusFilter)}>
                      <option value="all">All statuses</option>
                      <option value="ready">Ready</option>
                      <option value="draft">Draft</option>
                      <option value="warning">Needs attention</option>
                    </select>
                  </div>
                  <div className="v2-plans-plan-count">{plural(visible.length, 'seating plan')}</div>
                </section>

                <div className="v2-plans-table-head" aria-hidden="true">
                  <span>Seating plan</span>
                  <span>Status</span>
                  <span>Founders</span>
                  <span>Tables</span>
                  <span>Last modified</span>
                  <span>Actions</span>
                </div>

                <section aria-label="Saved seating plans">
                  {visible.map((plan) => {
                    const historyOpen = historyId === plan.id
                    const panelId = `plans-history-${plan.id}`
                    return (
                      <article key={plan.id} className={historyOpen ? 'v2-plans-plan-group v2-plans-history-open' : 'v2-plans-plan-group'}>
                        <div className="v2-plans-plan-row">
                          <div className="v2-plans-plan-name">
                            <h2>{plan.name}</h2>
                            <p>{plan.description}</p>
                          </div>
                          <span className={`v2-plans-status v2-plans-${plan.status}`}>{STATUS_LABELS[plan.status]}</span>
                          <div className="v2-plans-count">
                            <strong>{plural(plan.founderCount, 'founder')}</strong>
                            <span>{founderNote(plan)}</span>
                          </div>
                          <div className="v2-plans-count">
                            <strong>{plural(plan.tableCount, 'table')}</strong>
                            <span>{tableNote(plan)}</span>
                          </div>
                          <div className="v2-plans-modified">
                            <strong>{formatPlanTimestamp(plan.updatedAt, today)}</strong>
                            <span>
                              Version {plan.version} · {plan.updatedBy}
                            </span>
                          </div>
                          <div className="v2-plans-row-actions">
                            <button type="button" className="v2-plans-reopen" onClick={() => reopen(plan)}>
                              {plan.status === 'warning' ? 'Review' : 'Reopen'}
                            </button>
                            <button
                              ref={(node) => {
                                if (node) historyTriggers.current.set(plan.id, node)
                                else historyTriggers.current.delete(plan.id)
                              }}
                              type="button"
                              aria-expanded={historyOpen}
                              aria-controls={historyOpen ? panelId : undefined}
                              onClick={() => toggleHistory(plan)}
                            >
                              Versions · {plan.version}
                            </button>
                            <button
                              type="button"
                              className="v2-plans-delete"
                              aria-label={`Delete ${plan.name}`}
                              title="Delete plan"
                              disabled={!onDeletePlan}
                              onClick={() => requestDelete(plan)}
                            >
                              ×
                            </button>
                          </div>
                        </div>
                        {historyOpen && (
                          <section id={panelId} className="v2-plans-history-panel" aria-label={`Version history · ${plan.name}`}>
                            <div className="v2-plans-history-intro">
                              <span className="v2-plans-eyebrow">Version history</span>
                              <h3>{plan.name}</h3>
                              <p>Opening an earlier version keeps the latest intact. Saving it creates the next version.</p>
                              <button type="button" onClick={() => closeHistory(plan.id)}>
                                Close version history ↑
                              </button>
                            </div>
                            <div className="v2-plans-version-list">
                              {versionRows(plan, today).map((item) => (
                                <div key={item.version} className="v2-plans-version-row">
                                  <div className="v2-plans-version-number">
                                    V{item.version}
                                    {item.current && <small>Current</small>}
                                  </div>
                                  <div className="v2-plans-version-detail">
                                    <strong>{item.title}</strong>
                                    <span>{item.detail}</span>
                                  </div>
                                  <div className="v2-plans-version-meta">
                                    <strong>{item.when}</strong>
                                    <span>{item.by}</span>
                                  </div>
                                  <button type="button" onClick={() => openVersion(plan, item)}>
                                    {item.current ? 'Open current' : 'Open version'}
                                  </button>
                                </div>
                              ))}
                            </div>
                          </section>
                        )}
                      </article>
                    )
                  })}
                </section>
              </>
            )}
          </>
        )}
      </main>
      <V2Footer
        role={role}
        aiStatus={aiStatus}
        aiTone={aiTone}
        actions={
          restricted ? undefined : (
            <button type="button" className="v2-plans-footer-create" aria-label="New seating plan" onClick={() => navigate('/v2/dinner')}>
              <span aria-hidden="true">+</span>
              New seating plan
            </button>
          )
        }
      />
      <div data-testid="plans-live-region" className="v2-visually-hidden" role="status" aria-live="polite">
        {message}
      </div>
      {pending && (
        <>
          <div className="v2-plans-scrim" aria-hidden="true" onClick={closeDelete} />
          <section
            ref={dialogRef}
            className="v2-plans-delete-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="plans-delete-title"
          >
            <div className="v2-plans-danger-rule" />
            <div className="v2-plans-dialog-head">
              <div>
                <span className="v2-plans-eyebrow">Permanent action</span>
                <h2 id="plans-delete-title">Delete seating plan?</h2>
              </div>
              <button type="button" className="v2-plans-dialog-close" aria-label="Close delete confirmation" disabled={pending.busy} onClick={closeDelete}>
                ×
              </button>
            </div>
            <div className="v2-plans-dialog-body">
              <p>
                This cannot be undone. The saved configuration, assignments, rules, locks, alternatives, and every prior version will be
                permanently removed.
              </p>
              <div className="v2-plans-delete-summary">
                <strong>{pending.plan.name}</strong>
                <span>
                  {plural(pending.plan.version, 'version')} · {plural(pending.plan.founderCount, 'founder')} ·{' '}
                  {plural(pending.plan.tableCount, 'table')}
                </span>
              </div>
            </div>
            <div className="v2-plans-dialog-actions">
              <button type="button" disabled={pending.busy} onClick={closeDelete}>
                Cancel
              </button>
              <button
                ref={confirmRef}
                type="button"
                className="v2-plans-confirm-delete"
                aria-disabled={pending.busy}
                onClick={() => void confirmDelete()}
              >
                {pending.busy ? 'Deleting…' : 'Delete seating plan'}
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
