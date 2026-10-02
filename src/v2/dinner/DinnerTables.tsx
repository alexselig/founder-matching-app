import { useId, type ReactNode } from 'react'

import {
  objectiveLabel,
  setWeight,
  toggleObjective,
  type CriterionDraft,
  type DinnerView,
  type RuleDraft,
} from './dinnerState'

export type WorkspaceView = 'tables' | 'analysis'
export type Density = 'compact' | 'comfortable'

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

export interface DinnerSetupRailProps {
  readonly founderCount: number
  readonly tableCount: number
  readonly seatLabel: string
  readonly brief: string
  readonly criteria: readonly CriterionDraft[]
  readonly rules: readonly RuleDraft[]
  /** Pauses Edit setup while a plan snapshot is being saved or worked on by the engine. */
  readonly editDisabled?: boolean
  readonly onCriteriaChange: (criteria: readonly CriterionDraft[]) => void
  readonly onEditSetup: () => void
}

const CRITERION_WEIGHTS = ['L', 'M', 'H'] as const

export function DinnerSetupRail({
  founderCount,
  tableCount,
  seatLabel,
  brief,
  criteria,
  rules,
  editDisabled = false,
  onCriteriaChange,
  onEditSetup,
}: DinnerSetupRailProps) {
  return (
    <aside className="v2-dinner-setup" aria-label="Dinner setup">
      <div className="v2-dinner-setup-title">
        <span className="v2-dinner-eyebrow">Dinner matching</span>
        <h1>Build the room.</h1>
      </div>
      <section className="v2-dinner-setup-section">
        <div className="v2-dinner-scope-pair">
          <div className="v2-dinner-scope-stat">
            <strong>{founderCount}</strong>
            <span>founders</span>
          </div>
          <div className="v2-dinner-scope-stat">
            <strong>
              {tableCount} × {seatLabel}
            </strong>
            <span>tables × seats</span>
          </div>
        </div>
      </section>
      <section className="v2-dinner-setup-section">
        <h2>Matching brief</h2>
        <p className="v2-dinner-brief">{brief.trim() || 'No written brief · criteria drive matching.'}</p>
      </section>
      <section className="v2-dinner-setup-section">
        <h2>Matching criteria</h2>
        {criteria.map((criterion) => (
          <div key={criterion.field} className="v2-dinner-criterion">
            <div className="v2-dinner-criterion-head">
              <span>{criterion.label}</span>
              <button
                type="button"
                className="v2-dinner-objective-toggle"
                disabled={editDisabled}
                onClick={() => onCriteriaChange(toggleObjective(criteria, criterion.field))}
              >
                {objectiveLabel(criterion.objective)}
              </button>
            </div>
            <small>{criterion.description}</small>
            <span className="v2-dinner-weight-toggle" role="group" aria-label={`${criterion.label} weight`}>
              {CRITERION_WEIGHTS.map((weight) => (
                <button
                  key={weight}
                  type="button"
                  className={criterion.weight === weight ? 'v2-dinner-active' : undefined}
                  aria-pressed={criterion.weight === weight}
                  disabled={editDisabled}
                  onClick={() => onCriteriaChange(setWeight(criteria, criterion.field, weight))}
                >
                  {weight}
                </button>
              ))}
            </span>
          </div>
        ))}
        <button type="button" className="v2-dinner-setup-link" disabled={editDisabled} onClick={onEditSetup}>
          Edit setup
        </button>
      </section>
      <section className="v2-dinner-setup-section">
        <h2>Hard rules</h2>
        {rules.length ? (
          rules.map((rule) => (
            <div key={rule.id} className="v2-dinner-rule">
              {rule.text}
            </div>
          ))
        ) : (
          <div className="v2-dinner-rule">No hard rules · criteria only</div>
        )}
      </section>
      <button type="button" className="v2-dinner-setup-link v2-dinner-setup-link-compact" disabled={editDisabled} onClick={onEditSetup}>
        Edit setup
      </button>
    </aside>
  )
}

export interface DinnerTablesProps {
  readonly planName: string
  readonly view: DinnerView
  readonly threshold: number
  readonly onThresholdChange: (value: number) => void
  readonly workspace: WorkspaceView
  readonly onWorkspaceChange: (view: WorkspaceView) => void
  readonly density: Density
  readonly onDensityChange: (density: Density) => void
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
  density,
  onDensityChange,
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

  return (
    <section className="v2-dinner-workspace" aria-label="Seating plan results">
      <div className="v2-dinner-work-head">
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
        <div className="v2-dinner-metric v2-dinner-alert">
          <strong>{view.watchCount}</strong>
          <span>Watch placements</span>
        </div>
      </div>

      <div className="v2-dinner-work-tools">
        <div className="v2-dinner-tool-left">
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
          <div className="v2-dinner-density" role="group" aria-label="Table density">
            <span className="v2-dinner-density-label">Density</span>
            {(['compact', 'comfortable'] as const).map((item) => (
              <button
                key={item}
                type="button"
                className={density === item ? 'v2-dinner-active' : undefined}
                aria-pressed={density === item}
                onClick={() => onDensityChange(item)}
              >
                {item === 'compact' ? 'Compact' : 'Comfortable'}
              </button>
            ))}
          </div>
        </div>
        <div className="v2-dinner-tool-right">
          <div className="v2-dinner-legend" aria-label="Fit score legend">
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
          <div className="v2-dinner-threshold">
            <label htmlFor={thresholdId}>Threshold</label> <output htmlFor={thresholdId}>{threshold}</output>
            <input
              id={thresholdId}
              type="range"
              min={MIN_THRESHOLD}
              max={MAX_THRESHOLD}
              value={threshold}
              disabled={busy}
              onChange={(event) => onThresholdChange(Number(event.target.value))}
            />
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
          <div className={density === 'comfortable' ? 'v2-dinner-tables v2-dinner-comfortable' : 'v2-dinner-tables'}>
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
