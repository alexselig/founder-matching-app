import { useId, useState, type DragEvent } from 'react'

import { roleClass, type DinnerView, type TableView } from './dinnerState'

export type RecommendationKind = 'swap' | 'rebalance' | 'lock'
export type RecommendationState = 'applied' | 'unavailable'

export interface DinnerAnalysisProps {
  readonly view: DinnerView
  readonly objectives: readonly { label: string; score: number }[]
  readonly locked: ReadonlySet<number>
  readonly busy: boolean
  readonly recommendations: Partial<Record<RecommendationKind, RecommendationState>>
  readonly onRecommendation: (kind: RecommendationKind, target: { founderId?: string; tableIndex?: number }) => void
  readonly onSwap: (left: string, right: string) => void
}

function strongestUnlocked(tables: readonly TableView[], locked: ReadonlySet<number>) {
  return [...tables].filter((table) => !locked.has(table.index)).sort((left, right) => right.quality - left.quality || left.index - right.index)[0]
}

export function DinnerAnalysis({ view, objectives, locked, busy, recommendations, onRecommendation, onSwap }: DinnerAnalysisProps) {
  const [selected, setSelected] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropId, setDropId] = useState<string | null>(null)
  const hintId = useId()
  const tableOf = new Map(view.tables.flatMap((table) => table.seats.map((seat) => [seat.founderId, table.index] as const)))

  const weakest = view.weakest[0]
  const rebalanceSource = view.weakest[1] ?? view.weakest[0]
  const rebalanceTable = rebalanceSource ? view.tables.find((table) => table.number === rebalanceSource.tableNumber) : undefined
  const strongest = strongestUnlocked(view.tables, locked)
  const largestBand = Math.max(1, ...view.distribution.map((band) => band.count))

  function choose(founderId: string) {
    if (busy) return
    if (!selected || selected === founderId) {
      setSelected(selected === founderId ? null : founderId)
      return
    }
    if (tableOf.get(selected) === tableOf.get(founderId)) {
      setSelected(founderId)
      return
    }
    const left = selected
    setSelected(null)
    onSwap(left, founderId)
  }

  function endDrag() {
    setDragId(null)
    setDropId(null)
  }

  function drop(event: DragEvent, founderId: string) {
    event.preventDefault()
    const source = dragId
    endDrag()
    if (busy || !source || source === founderId || tableOf.get(source) === tableOf.get(founderId)) return
    setSelected(null)
    onSwap(source, founderId)
  }

  const recommendationButton = (kind: RecommendationKind, label: string, target: { founderId?: string; tableIndex?: number } | null) => {
    const state = recommendations[kind]
    return (
      <button type="button" disabled={busy || !target || state !== undefined} onClick={() => target && onRecommendation(kind, target)}>
        {state === 'applied' ? 'Applied ✓' : state === 'unavailable' ? 'No change found' : label}
      </button>
    )
  }

  return (
    <section className="v2-dinner-analysis v2-dinner-visible" aria-label="Seating analysis">
      <div className="v2-dinner-table-insights">
        <section className="v2-dinner-insight-card">
          <h3>Objective performance</h3>
          {objectives.map((objective) => (
            <div key={objective.label} className="v2-dinner-objective-row">
              <span>{objective.label}</span>
              <span className="v2-dinner-objective-bar" aria-hidden="true">
                <i style={{ width: `${objective.score}%` }} />
              </span>
              <b>{objective.score}</b>
            </div>
          ))}
        </section>
        <section className="v2-dinner-insight-card">
          <h3>Weakest placements</h3>
          <div>
            {view.weakest.map((item) => (
              <div key={item.founder.id} className="v2-dinner-watch-row">
                <span>
                  <strong>{item.founder.name}</strong>
                  <small>{item.note}</small>
                </span>
                <b className={item.score < 70 ? 'v2-dinner-fit v2-dinner-risk' : item.score < 80 ? 'v2-dinner-fit v2-dinner-watch' : 'v2-dinner-fit'}>
                  {item.score}
                </b>
              </div>
            ))}
          </div>
        </section>
        <section className="v2-dinner-insight-card">
          <h3>Recommended improvements</h3>
          <div>
            <div className="v2-dinner-recommendation">
              <span>
                <b>{weakest ? `Swap ${weakest.founder.name} with a stronger cross-table fit` : 'Every placement is already balanced'}</b>
              </span>
              {recommendationButton('swap', 'Apply swap', weakest ? { founderId: weakest.founder.id } : null)}
            </div>
            <div className="v2-dinner-recommendation">
              <span>
                <b>{rebalanceTable ? `Increase role diversity at Table ${rebalanceTable.number}` : 'Role diversity is balanced'}</b>
              </span>
              {recommendationButton('rebalance', 'Rebalance', rebalanceTable ? { tableIndex: rebalanceTable.index } : null)}
            </div>
            <div className="v2-dinner-recommendation">
              <span>
                <b>Lock the strongest table before re-optimizing</b>
              </span>
              {recommendationButton(
                'lock',
                strongest ? `Lock Table ${strongest.number}` : 'All tables locked',
                strongest ? { tableIndex: strongest.index } : null,
              )}
            </div>
          </div>
        </section>
      </div>

      <div className="v2-dinner-analysis-summary">
        <div className="v2-dinner-analysis-stat">
          <strong>100%</strong>
          <span>Hard-rule compliance</span>
        </div>
        <div className="v2-dinner-analysis-stat">
          <strong>
            {view.aboveCount} / {view.total}
          </strong>
          <span>Above match threshold</span>
        </div>
        <div className="v2-dinner-analysis-stat">
          <strong>{view.strongCount}</strong>
          <span>Founder matches at 90+</span>
        </div>
        <div className="v2-dinner-analysis-stat">
          <strong>{view.roles.length}</strong>
          <span>Roles represented</span>
        </div>
      </div>

      <div className="v2-dinner-analysis-visuals">
        <section className="v2-dinner-visual-card">
          <h3>Match-score distribution</h3>
          <div className="v2-dinner-distribution">
            {view.distribution.map((band) => (
              <div key={band.label} className="v2-dinner-distribution-item">
                <i
                  className={`v2-dinner-${band.band}-bg`}
                  style={{ height: `${Math.max(18, Math.round((band.count / largestBand) * 105))}px` }}
                  aria-hidden="true"
                />
                <b>{band.count}</b>
                <span>{band.label}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="v2-dinner-visual-card">
          <h3>Role makeup by table</h3>
          <div className="v2-dinner-role-legend">
            {view.roles.map((role) => (
              <span key={role}>
                <i className={`v2-dinner-role-${roleClass(role)}`} />
                {role}
              </span>
            ))}
          </div>
          <div className="v2-dinner-role-makeup-grid">
            {view.roleMakeup.map((row) => (
              <div key={row.number} className="v2-dinner-makeup-row">
                <span>Table {row.number}</span>
                <span
                  className="v2-dinner-role-bar"
                  role="img"
                  aria-label={`Table ${row.number}: ${row.segments
                    .filter((segment) => segment.count)
                    .map((segment) => `${segment.count} ${segment.role}`)
                    .join(', ')}`}
                >
                  {row.segments.map((segment) => (
                    <i key={segment.role} className={`v2-dinner-role-${roleClass(segment.role)}`} style={{ width: `${segment.share * 100}%` }} />
                  ))}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="v2-dinner-analysis-tables">
        <div className="v2-dinner-heatmap-heading">
          <h3>Founder match by table</h3>
          <span className="v2-dinner-heat-instruction">Drag one founder onto another to swap tables</span>
          <div className="v2-dinner-heat-legend">
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
        <p id={hintId} className="v2-visually-hidden">
          Select a founder, then select a founder at another table to swap their seats.
        </p>
        <div className="v2-dinner-heatmap-grid" style={{ ['--v2-heat-columns' as string]: String(view.tables.length) }}>
          {view.tables.map((table) => (
            <section key={table.index} className="v2-dinner-heat-column" aria-label={`Table ${table.number}`}>
              <div className="v2-dinner-heat-column-head">
                <span>Table {table.number}</span>
                <b>Avg {table.average}</b>
              </div>
              <div className="v2-dinner-heat-column-body">
                {table.seats.map((seat) => {
                  const name = seat.founder!.name
                  const className = [
                    'v2-dinner-heat-person',
                    dragId === seat.founderId ? 'v2-dinner-dragging' : '',
                    dropId === seat.founderId ? 'v2-dinner-drop-target' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')
                  return (
                    <button
                      key={seat.founderId}
                      type="button"
                      className={className}
                      title={name}
                      draggable={!busy}
                      aria-pressed={selected === seat.founderId}
                      aria-describedby={hintId}
                      onClick={() => choose(seat.founderId)}
                      onDragStart={(event) => {
                        event.dataTransfer?.setData('text/plain', seat.founderId)
                        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
                        setDragId(seat.founderId)
                      }}
                      onDragEnd={endDrag}
                      onDragOver={(event) => {
                        event.preventDefault()
                        if (dragId && dragId !== seat.founderId && dropId !== seat.founderId) setDropId(seat.founderId)
                      }}
                      onDragLeave={() => {
                        if (dropId === seat.founderId) setDropId(null)
                      }}
                      onDrop={(event) => drop(event, seat.founderId)}
                    >
                      <span className={`v2-dinner-heat-dot v2-dinner-${seat.band}-bg`}>{seat.score}%</span>
                      <span>{name}</span>
                    </button>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </section>
  )
}
