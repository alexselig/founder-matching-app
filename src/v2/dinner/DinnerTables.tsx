import { useId, type ReactNode } from 'react'

import { type DinnerView } from './dinnerState'

export type WorkspaceView = 'tables' | 'analysis'

export const MIN_THRESHOLD = 60
export const MAX_THRESHOLD = 85

function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts.at(-1)![0] : '')).toUpperCase()
}

/** Ten jump buttons per row on desktop keeps 20 tables to two rows; fewer tables use one row. */
function indexColumns(tableCount: number) {
  return Math.max(1, Math.min(tableCount, 10))
}

export interface DinnerTablesProps {
  readonly planName: string
  readonly view: DinnerView
  readonly threshold: number
  readonly onThresholdChange: (value: number) => void
  readonly workspace: WorkspaceView
  readonly onWorkspaceChange: (view: WorkspaceView) => void
  readonly setupOpen: boolean
  readonly editSetupDisabled?: boolean
  readonly onEditSetup: () => void
  readonly focusIndex: number
  readonly onFocusTable: (index: number) => void
  readonly locked: ReadonlySet<number>
  /** Freezes plan edits (threshold and locks) while an engine action or save is in flight. */
  readonly busy: boolean
  readonly onToggleLock: (index: number) => void
  readonly analysis: ReactNode
}

function scrollToCard(index: number) {
  const card = document.getElementById(`dinner-table-${index}`)
  if (!card || typeof card.scrollIntoView !== 'function') return
  const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  card.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
}

export function DinnerTables({
  planName,
  view,
  threshold,
  onThresholdChange,
  workspace,
  onWorkspaceChange,
  setupOpen,
  editSetupDisabled = false,
  onEditSetup,
  focusIndex,
  onFocusTable,
  locked,
  busy,
  onToggleLock,
  analysis,
}: DinnerTablesProps) {
  const count = view.tables.length
  const columns = indexColumns(count)
  const rows = Math.ceil(count / columns)
  const focused = view.tables[focusIndex] ?? view.tables[0]
  const analysisOpen = workspace === 'analysis'
  const thresholdId = useId()

  function focusTable(index: number, scroll: boolean) {
    const next = (index + count) % count
    onFocusTable(next)
    if (scroll) scrollToCard(next)
  }

  function updateThreshold(value: number) {
    onThresholdChange(Math.max(MIN_THRESHOLD, Math.min(MAX_THRESHOLD, Math.round(value))))
  }

  return (
    <section className="v2-dinner-workspace" aria-label="Seating plan results" data-setup-open={setupOpen ? 'true' : 'false'}>
      <div className="v2-dinner-work-head">
        {!setupOpen && (
          <button type="button" className="v2-dinner-edit-setup" aria-label="Edit setup" disabled={editSetupDisabled} onClick={onEditSetup}>
            <span>
              Edit
              <br />
              setup
            </span>
            <span className="v2-dinner-edit-chevron" aria-hidden="true">
              ›
            </span>
          </button>
        )}
        <div className="v2-dinner-work-title">
          <span className="v2-dinner-eyebrow">Recommended solution</span>
          <h2>{planName}</h2>
        </div>
        <div className="v2-dinner-metric">
          <strong>{view.overall}</strong>
          <span>Overall quality</span>
        </div>
        <div className="v2-dinner-metric">
          <strong>{view.minimum}</strong>
          <span>Minimum fit</span>
        </div>
        <div className="v2-dinner-metric">
          <strong>{view.tableCount}</strong>
          <span>Tables</span>
        </div>
        <div className="v2-dinner-metric">
          <strong>{view.aboveCount + view.watchCount}</strong>
          <span>Seat placements</span>
        </div>
      </div>

      <div className="v2-dinner-work-tools">
        <div className="v2-dinner-view">
          <span className="v2-dinner-view-label">View</span>
          <div className="v2-dinner-segmented" role="group" aria-label="Workspace view">
            {(['tables', 'analysis'] as const).map((item) => (
              <button
                key={item}
                type="button"
                className={workspace === item ? 'v2-dinner-active' : undefined}
                aria-pressed={workspace === item}
                onClick={() => onWorkspaceChange(item)}
              >
                {item === 'tables' ? 'Tables' : 'Analysis'}
              </button>
            ))}
          </div>
        </div>
        <div className="v2-dinner-threshold">
          <label htmlFor={thresholdId}>Match threshold</label>
          <div className="v2-dinner-threshold-controls">
            <button
              type="button"
              aria-label="Decrease threshold"
              disabled={busy || threshold <= MIN_THRESHOLD}
              onClick={() => updateThreshold(threshold - 1)}
            >
              −
            </button>
            <input
              id={thresholdId}
              type="number"
              min={MIN_THRESHOLD}
              max={MAX_THRESHOLD}
              step={1}
              value={threshold}
              disabled={busy}
              onChange={(event) => updateThreshold(Number(event.target.value))}
            />
            <button
              type="button"
              aria-label="Increase threshold"
              disabled={busy || threshold >= MAX_THRESHOLD}
              onClick={() => updateThreshold(threshold + 1)}
            >
              +
            </button>
          </div>
        </div>
        <div className="v2-dinner-legend" aria-label="Match Threshold Color Coding">
          <strong className="v2-dinner-legend-label">Match Threshold Color Coding</strong>
          <div className="v2-dinner-legend-values">
            <span>
              <i className="v2-dinner-strong-bg" />
              90+
            </span>
            <span>
              <i className="v2-dinner-good-bg" />
              80–89
            </span>
            <span>
              <i className="v2-dinner-watch-bg" />
              70–79
            </span>
            <span>
              <i className="v2-dinner-risk-bg" />
              &lt;70
            </span>
          </div>
        </div>
      </div>

      <div className="v2-dinner-table-workspace" hidden={analysisOpen}>
        <aside className="v2-dinner-table-index" aria-label="Table index">
          <div className="v2-dinner-index-head">
            <strong>Jump to table</strong>
            <span>Amber and red dots flag tables to review.</span>
          </div>
          <div className="v2-dinner-index-grid" style={{ ['--v2-index-columns' as string]: String(columns) }}>
            {view.tables.map((table, position) => {
              const active = position === focusIndex
              const className = [
                'v2-dinner-index-button',
                table.indexClass ? `v2-dinner-${table.indexClass}` : '',
                active ? 'v2-dinner-active' : '',
                (position + 1) % columns === 0 || position === count - 1 ? 'v2-dinner-row-end' : '',
                Math.floor(position / columns) === rows - 1 ? 'v2-dinner-last-row' : '',
              ]
                .filter(Boolean)
                .join(' ')
              return (
                <button
                  key={table.index}
                  type="button"
                  className={className}
                  aria-label={table.indexLabel}
                  aria-current={active ? 'true' : undefined}
                  onClick={() => focusTable(position, true)}
                >
                  <strong>{table.number}</strong>
                </button>
              )
            })}
          </div>
        </aside>
        <section className="v2-dinner-tables-scroll" aria-label="Tables">
          <div className="v2-dinner-focus-strip">
            <button type="button" aria-label="Previous table" onClick={() => focusTable(focusIndex - 1, false)}>
              ← Prev
            </button>
            <div className="v2-dinner-focus-label">
              <strong>
                Table {focused?.number} · {focused?.name}
              </strong>
              <span>
                {focused?.quality} quality · {focused?.below} watch
              </span>
            </div>
            <button type="button" aria-label="Next table" onClick={() => focusTable(focusIndex + 1, false)}>
              Next →
            </button>
          </div>
          <div className="v2-dinner-tables">
            {view.tables.map((table, position) => {
              const isLocked = locked.has(table.index)
              const className = [
                'v2-dinner-table-card',
                position === focusIndex ? 'v2-dinner-focused' : '',
                isLocked ? 'v2-dinner-locked' : '',
              ]
                .filter(Boolean)
                .join(' ')
              return (
                <article key={table.index} id={`dinner-table-${table.index}`} className={className} aria-labelledby={`dinner-table-title-${table.index}`}>
                  <div className="v2-dinner-table-head">
                    <div>
                      <span className="v2-dinner-eyebrow">Table {table.number}</span>
                      <h3 id={`dinner-table-title-${table.index}`}>{table.name}</h3>
                    </div>
                    <div className={table.qualityClass ? `v2-dinner-table-score v2-dinner-${table.qualityClass}` : 'v2-dinner-table-score'}>
                      <strong>{table.quality}</strong>
                      <span>Table quality</span>
                    </div>
                  </div>
                  {table.seats.map((seat) => (
                    <div key={seat.founderId} className="v2-dinner-seat">
                      <span className={`v2-dinner-seat-avatar v2-dinner-${seat.band}-bg`} aria-hidden="true">
                        {initials(seat.founder!.name)}
                      </span>
                      <span className="v2-dinner-seat-copy">
                        <strong>{seat.founder!.name}</strong>
                        <small>
                          {seat.founder!.company} · {seat.founder!.role}
                        </small>
                      </span>
                      <span className={seat.fitClass ? `v2-dinner-fit v2-dinner-${seat.fitClass}` : 'v2-dinner-fit'}>
                        {seat.score}
                      </span>
                    </div>
                  ))}
                  <div className="v2-dinner-table-foot">
                    <span className={table.statusClass ? `v2-dinner-${table.statusClass}` : undefined}>{table.statusLabel}</span>
                    <button type="button" className="v2-dinner-lock" aria-pressed={isLocked} disabled={busy} onClick={() => onToggleLock(table.index)}>
                      {isLocked ? 'Unlock table' : 'Lock table'}
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      </div>

      {analysis}
    </section>
  )
}
