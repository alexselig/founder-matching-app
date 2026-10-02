import { useEffect, useMemo, useRef } from 'react'

import type { Founder } from '../../shared/founder'
import { baselineTradeoffs, compareAlternative, solutionSummary, type Tradeoff } from './dinnerInsights'
import { buildDinnerView, objectiveLabel, type CriterionDraft, type RuleDraft } from './dinnerState'
import type { DinnerSolution } from './optimizer'

export interface DinnerAlternativesProps {
  readonly base: DinnerSolution
  readonly alternatives: readonly DinnerSolution[]
  readonly founders: readonly Founder[]
  readonly foundersById: ReadonlyMap<string, Founder>
  readonly threshold: number
  readonly cohortLabel: string
  readonly shapeLabel: string
  readonly criteria: readonly CriterionDraft[]
  readonly rules: readonly RuleDraft[]
  readonly lockedCount: number
  /** 0 is the current solution; 1..n are generated alternatives. */
  readonly selected: number
  readonly confirmed: boolean
  readonly onSelect: (index: number) => void
  readonly onConfirm: () => void
  readonly onCompareAgain: () => void
  readonly onCancel: () => void
  readonly onReturn: () => void
}

function plural(count: number, singular: string, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

function TradeoffList({ title, items }: { title: string; items: readonly Tradeoff[] }) {
  return (
    <section className="v2-alt-tradeoffs">
      <h4>{title}</h4>
      <ul>
        {items.map((item) => (
          <li key={item.text} className={item.kind ? `v2-alt-${item.kind}` : undefined}>
            {item.text}
          </li>
        ))}
      </ul>
    </section>
  )
}

export function DinnerAlternatives(props: DinnerAlternativesProps) {
  const { base, alternatives, founders, foundersById, threshold, selected, confirmed } = props
  const confirmRef = useRef<HTMLButtonElement>(null)
  const returnRef = useRef<HTMLButtonElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)

  const baseSummary = useMemo(() => solutionSummary(base, founders, threshold), [base, founders, threshold])
  const baseView = useMemo(() => buildDinnerView(base, foundersById, threshold), [base, foundersById, threshold])
  const baseNotes = useMemo(() => baselineTradeoffs(base, alternatives, founders, threshold), [base, alternatives, founders, threshold])
  const comparisons = useMemo(
    () => alternatives.map((alternative) => compareAlternative(base, alternative, founders, foundersById, threshold)),
    [alternatives, base, founders, foundersById, threshold],
  )

  const options = [
    {
      label: 'Current solution',
      title: 'Current solution kept.',
      description: 'No assignments changed. The existing recommended solution remains active and ready to save or export.',
      summary: baseSummary,
    },
    ...comparisons.map((comparison, index) => ({
      label: `Alternative ${index + 1}`,
      title: `Alternative ${index + 1} selected.`,
      description: `The ${comparison.title.toLowerCase()} arrangement is now active. ${comparison.description} All rules and locks are preserved.`,
      summary: comparison.summary,
    })),
  ]
  const active = options[selected] ?? options[0]!
  const detail = `${active.summary.overall} overall · ${active.summary.minimum} minimum fit · ${plural(active.summary.watchCount, 'watch placement')}`

  useEffect(() => {
    if (confirmed) returnRef.current?.focus()
  }, [confirmed])

  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  return (
    <>
      <aside className="v2-alt-setup" aria-label="Fixed inputs">
        <div className="v2-alt-setup-title">
          <span className="v2-alt-eyebrow">Dinner matching</span>
          <h1>Build the room.</h1>
        </div>
        <section className="v2-alt-setup-section">
          <h2>Fixed inputs</h2>
          <div className="v2-alt-scope-row">
            <div>
              <strong>{founders.length}</strong>
              <span>{props.cohortLabel}</span>
            </div>
            <span>Same cohort</span>
          </div>
          <div className="v2-alt-scope-row">
            <div>
              <strong>{props.shapeLabel}</strong>
              <span>tables × target seats</span>
            </div>
            <span>Same capacity</span>
          </div>
        </section>
        <section className="v2-alt-setup-section">
          <h2>Matching criteria</h2>
          <div className="v2-alt-criteria-list">
            {props.criteria.map((criterion) => (
              <div key={criterion.field} className="v2-alt-criterion">
                <span>
                  <strong>{criterion.label}</strong>
                  <small>{criterion.description}</small>
                </span>
                <b>
                  {objectiveLabel(criterion.objective)} · {criterion.weight}
                </b>
              </div>
            ))}
          </div>
        </section>
        <section className="v2-alt-setup-section">
          <h2>Hard rules</h2>
          {props.rules.length ? (
            props.rules.map((rule) => (
              <div key={rule.id} className="v2-alt-rule">
                {rule.text}
              </div>
            ))
          ) : (
            <div className="v2-alt-rule">No hard rules · criteria only</div>
          )}
          <p className="v2-alt-lock-note">
            <b>{props.lockedCount ? `${plural(props.lockedCount, 'locked table')} preserved.` : 'No tables locked.'}</b>
            <br />
            All {options.length === 3 ? 'three' : options.length} solutions satisfy the same rules and manual locks.
          </p>
        </section>
      </aside>

      <section className="v2-alt-workspace" aria-label="Generated alternatives">
        <div className="v2-alt-workspace-head">
          <div className="v2-alt-headline">
            <span className="v2-alt-eyebrow">Generated alternatives</span>
            <h2 ref={headingRef} tabIndex={-1}>
              Choose the strongest arrangement.
            </h2>
            <p>Alternatives preserve the cohort, criteria, hard rules, locks, and table capacity.</p>
          </div>
        </div>

        {!confirmed && (
          <>
            <div className="v2-alt-comparison" aria-label="Dinner solution comparison">
              <article className={selected === 0 ? 'v2-alt-solution v2-alt-selected' : 'v2-alt-solution'}>
                <SelectButton active={selected === 0} onSelect={() => props.onSelect(0)} />
                <div className="v2-alt-solution-head">
                  <div className="v2-alt-solution-kicker">
                    <span>Existing recommendation</span>
                    <b>{selected === 0 ? 'Selected' : 'Available'}</b>
                  </div>
                  <h3>Current solution</h3>
                  <p>Best overall score from the first optimization pass.</p>
                </div>
                <HeroMetrics overall={baseSummary.overall} minimum={baseSummary.minimum} watch={baseSummary.watchCount} />
                <section className="v2-alt-metric-section">
                  <div className="v2-alt-section-title">
                    <span>Quality profile</span>
                    <span>Baseline</span>
                  </div>
                  {baseSummary.objectives.map((objective) => (
                    <Measure key={objective.label} label={objective.label} score={objective.score} direction="neutral" text="—" />
                  ))}
                </section>
                <TradeoffList title="What this favors" items={baseNotes} />
                <details className="v2-alt-changes">
                  <summary>Table snapshot · {plural(baseSummary.watchCount, 'watch placement')}</summary>
                  <div className="v2-alt-change-list">
                    {baseView.weakest.map((item) => (
                      <div key={item.founder.id} className="v2-alt-change-row">
                        <b>Table {item.tableNumber}</b>
                        <span>
                          {item.founder.name} · {item.score} · {item.founder.role}
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              </article>

              {comparisons.map((comparison, position) => {
                const index = position + 1
                const isSelected = selected === index
                return (
                  <article key={index} className={isSelected ? 'v2-alt-solution v2-alt-selected' : 'v2-alt-solution'}>
                    <SelectButton active={isSelected} onSelect={() => props.onSelect(index)} />
                    <div className="v2-alt-solution-head">
                      <div className="v2-alt-solution-kicker">
                        <span>Generated alternative {index}</span>
                        <b>{isSelected ? 'Selected' : 'Available'}</b>
                      </div>
                      <h3>{comparison.title}</h3>
                      <p>{comparison.description}</p>
                    </div>
                    <HeroMetrics overall={comparison.summary.overall} minimum={comparison.summary.minimum} watch={comparison.summary.watchCount} />
                    <section className="v2-alt-metric-section">
                      <div className="v2-alt-section-title">
                        <span>Quality profile</span>
                        <span>Vs. current</span>
                      </div>
                      {comparison.deltas.map((delta) => (
                        <Measure key={delta.label} label={delta.label} score={delta.score} direction={delta.direction} text={delta.text} />
                      ))}
                    </section>
                    <TradeoffList title="Tradeoff" items={comparison.tradeoffs} />
                    <details className="v2-alt-changes">
                      <summary>Key table changes · {plural(comparison.moved, 'founder')} moved</summary>
                      <div className="v2-alt-change-list">
                        {comparison.changes.length ? (
                          comparison.changes.map((change) => (
                            <div key={change.tables} className="v2-alt-change-row">
                              <b>{change.tables}</b>
                              <span>{change.text}</span>
                            </div>
                          ))
                        ) : (
                          <div className="v2-alt-change-row">
                            <b>—</b>
                            <span>Same tables; seat order only</span>
                          </div>
                        )}
                      </div>
                    </details>
                  </article>
                )
              })}
            </div>

            <div className="v2-alt-comparison-actions">
              <div className="v2-alt-selection-copy">
                <b>{active.label} selected</b>
                <span>{detail}</span>
              </div>
              <div className="v2-alt-action-buttons">
                <button type="button" onClick={props.onCancel}>
                  Cancel
                </button>
                <button ref={confirmRef} type="button" className="v2-alt-primary" onClick={props.onConfirm}>
                  Apply current selection
                </button>
              </div>
            </div>
          </>
        )}

        {confirmed && (
          <section className="v2-alt-confirmed" aria-live="polite">
            <div className="v2-alt-confirmation-card">
              <div className="v2-alt-confirmation-mark" aria-hidden="true">
                ✓
              </div>
              <div className="v2-alt-confirmation-content">
                <span className="v2-alt-eyebrow">Solution selected</span>
                <h2>{active.title}</h2>
                <p>{active.description}</p>
                <div className="v2-alt-confirmation-metrics">
                  <div>
                    <strong>{active.summary.overall}</strong>
                    <span>Overall quality</span>
                  </div>
                  <div>
                    <strong>{active.summary.minimum}</strong>
                    <span>Minimum fit</span>
                  </div>
                  <div>
                    <strong>{active.summary.watchCount}</strong>
                    <span>Watch placements</span>
                  </div>
                  <div>
                    <strong>100%</strong>
                    <span>Rule compliance</span>
                  </div>
                </div>
                <div className="v2-alt-confirmation-actions">
                  <button type="button" onClick={props.onCompareAgain}>
                    Compare again
                  </button>
                  <button ref={returnRef} type="button" onClick={props.onReturn}>
                    Return to tables →
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}
      </section>
    </>
  )
}

function SelectButton({ active, onSelect }: { active: boolean; onSelect: () => void }) {
  return (
    <div className="v2-alt-solution-action">
      <button type="button" className="v2-alt-select-solution" aria-pressed={active} onClick={onSelect}>
        <span className="v2-alt-selection-check" aria-hidden="true">
          ✓
        </span>
        <span>{active ? 'Selected' : 'Select this solution'}</span>
      </button>
    </div>
  )
}

function HeroMetrics({ overall, minimum, watch }: { overall: number; minimum: number; watch: number }) {
  return (
    <div className="v2-alt-hero-metrics">
      <div className="v2-alt-hero-metric">
        <strong>{overall}</strong>
        <span>Overall quality</span>
      </div>
      <div className="v2-alt-hero-metric">
        <strong>{minimum}</strong>
        <span>Minimum fit</span>
      </div>
      <div className="v2-alt-hero-metric v2-alt-watch">
        <strong>{watch}</strong>
        <span>{watch === 1 ? 'Watch placement' : 'Watch placements'}</span>
      </div>
    </div>
  )
}

function Measure({ label, score, direction, text }: { label: string; score: number; direction: 'up' | 'down' | 'neutral'; text: string }) {
  return (
    <div className="v2-alt-measure">
      <span>{label}</span>
      <span className="v2-alt-bar" aria-hidden="true">
        <i style={{ width: `${score}%` }} />
      </span>
      <b>{score}</b>
      <span className={`v2-alt-delta v2-alt-${direction}`}>{text}</span>
    </div>
  )
}
