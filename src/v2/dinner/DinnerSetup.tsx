import { useId, useMemo, useRef, useState } from 'react'

import type { Founder } from '../../shared/founder'
import { initials } from '../search/founderDisplay'
import { DinnerDimensionDialog } from './DinnerDimensionDialog'
import {
  addDimension,
  BRIEF_STARTERS,
  canAddDimension,
  capacityNote,
  clampTableSetup,
  cohortCard,
  defaultTableSetup,
  founderCountLabel,
  objectiveLabel,
  parseRuleText,
  removeDimension,
  RULE_SUGGESTIONS,
  setupStage,
  setWeight,
  summaryCopy,
  tablePresets,
  tablesCard,
  toggleObjective,
  type CriterionDraft,
  type DinnerCohort,
  type DinnerCohortOption,
  type RuleDraft,
  type TableSetup,
} from './dinnerState'
import { useDialogFocus } from './useDialogFocus'

export type SetupDialog = 'cohort' | 'tables' | 'rule' | 'dimension'

export interface DinnerSetupProps {
  readonly founders: readonly Founder[]
  readonly foundersById: ReadonlyMap<string, Founder>
  readonly planName: string
  readonly onPlanNameChange: (name: string) => void
  readonly cohort: DinnerCohort | null
  readonly onCohortChange: (cohort: DinnerCohort) => void
  readonly tables: TableSetup | null
  readonly onTablesChange: (tables: TableSetup) => void
  readonly brief: string
  readonly onBriefChange: (brief: string) => void
  readonly criteria: readonly CriterionDraft[]
  readonly onCriteriaChange: (criteria: readonly CriterionDraft[]) => void
  readonly rules: readonly RuleDraft[]
  readonly onRulesChange: (rules: readonly RuleDraft[]) => void
  readonly handoff: DinnerCohort | null
  readonly savedCohorts: readonly DinnerCohortOption[]
  readonly generating: boolean
  readonly onGenerate: () => void
  readonly initialDialog?: SetupDialog | null
  readonly initialRuleText?: string
  /** When set, the rule dialog replaces this rule in place instead of appending a new one. */
  readonly editingRuleId?: string
}

const WEIGHTS = ['L', 'M', 'H'] as const

let ruleCounter = 0

function nextRuleId() {
  ruleCounter += 1
  return `rule-${Date.now().toString(36)}-${ruleCounter}`
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

interface CohortChoice {
  readonly key: string
  readonly icon: string
  readonly name: string
  readonly description: string
  readonly primary: boolean
  readonly cohort: DinnerCohort
}

export function DinnerSetup(props: DinnerSetupProps) {
  const {
    founders,
    foundersById,
    planName,
    onPlanNameChange,
    cohort,
    onCohortChange,
    tables,
    onTablesChange,
    brief,
    onBriefChange,
    criteria,
    onCriteriaChange,
    rules,
    onRulesChange,
    handoff,
    savedCohorts,
    generating,
    onGenerate,
  } = props
  const [dialog, setDialog] = useState<SetupDialog | null>(props.initialDialog ?? null)
  // A prefilled rule edit applies to the first rule dialog only; later "+ Add" clicks start blank.
  const [ruleSeed, setRuleSeed] = useState({ text: props.initialRuleText ?? '', editingRuleId: props.editingRuleId ?? null })
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const planId = useId()
  const briefId = useId()
  const advancedId = useId()
  const advancedTriggerRef = useRef<HTMLButtonElement>(null)

  const snapshot = { planName, cohort, tables, rules }
  const stage = setupStage(snapshot)
  const ready = stage === 'ready'
  const cohortCopy = cohortCard(snapshot)
  const tablesCopy = tablesCard(snapshot)
  const summary = summaryCopy(snapshot)
  const cohortFounders = useMemo(
    () => (cohort ? cohort.founderIds.map((id) => foundersById.get(id)).filter((founder): founder is Founder => !!founder) : []),
    [cohort, foundersById],
  )

  const choices = useMemo<CohortChoice[]>(() => {
    const known = (ids: readonly string[]) => ids.filter((id) => foundersById.has(id))
    const list: CohortChoice[] = []
    if (handoff) {
      list.push({
        key: 'search',
        icon: '↗',
        name: 'Current Founder Search results',
        description: 'Preserves ranking and manual selection order',
        primary: true,
        cohort: handoff,
      })
    }
    for (const option of savedCohorts) {
      const founderIds = known(option.founderIds)
      if (!founderIds.length) continue
      list.push({
        key: option.id,
        icon: initials(option.name).toUpperCase(),
        name: option.name,
        description: option.description,
        primary: false,
        cohort: { id: option.id, label: founderCountLabel(founderIds.length), hint: `Saved cohort · ${option.name}`, source: 'saved', founderIds },
      })
    }
    list.push({
      key: 'all',
      icon: 'ALL',
      name: 'All loaded founders',
      description: 'Complete reference dataset',
      primary: false,
      cohort: {
        id: 'all',
        label: founderCountLabel(founders.length),
        hint: 'All loaded founders',
        source: 'all',
        founderIds: founders.map((founder) => founder.id),
      },
    })
    return list
  }, [founders, foundersById, handoff, savedCohorts])

  function chooseCohort(choice: CohortChoice) {
    onCohortChange(choice.cohort)
    setDialog('tables')
  }

  function addRule(rule: RuleDraft) {
    const editing = ruleSeed.editingRuleId
    onRulesChange(
      editing && rules.some((item) => item.id === editing) ? rules.map((item) => (item.id === editing ? rule : item)) : [...rules, rule],
    )
    close()
  }

  function close() {
    setDialog(null)
    if (ruleSeed.text || ruleSeed.editingRuleId) setRuleSeed({ text: '', editingRuleId: null })
  }

  return (
    <>
      <aside className="v2-setup-setup">
        <div className="v2-setup-setup-title">
          <span className="v2-setup-eyebrow">Dinner matching</span>
          <h1>Build the room.</h1>
        </div>
        <div className={handoff ? 'v2-setup-handoff-badge v2-setup-handoff-visible' : 'v2-setup-handoff-badge'}>
          {handoff ? `Search handoff · Ordered ${handoff.founderIds.length}-founder result cohort is already attached.` : ''}
        </div>
        <section className="v2-setup-brief">
          <div className="v2-setup-scope-intro">
            <span className="v2-setup-eyebrow">Seating setup</span>
            <h2>Pick your people.</h2>
            <p>Name the seating plan, choose the founder cohort, then set the number of tables and seats for the dinner.</p>
          </div>
          <div className="v2-setup-plan-name-field">
            <label className="v2-setup-field-label" htmlFor={planId}>
              <span>1 · Seating plan name</span>
              <small>Required</small>
            </label>
            <input
              id={planId}
              className="v2-setup-plan-name-input"
              type="text"
              placeholder="e.g. Demo Day Founder Dinner"
              value={planName}
              disabled={generating}
              onChange={(event) => onPlanNameChange(event.target.value)}
            />
          </div>
          <div className="v2-setup-scope">
            <section className={cohortCopy.disabled ? 'v2-setup-scope-card v2-setup-disabled' : 'v2-setup-scope-card'}>
              <span className="v2-setup-step">2 · Founder cohort</span>
              <strong className="v2-setup-scope-value">{cohortCopy.value}</strong>
              <span className="v2-setup-scope-hint">{cohortCopy.hint}</span>
              <button type="button" className="v2-setup-select-link" disabled={cohortCopy.disabled || generating} onClick={() => setDialog('cohort')}>
                {cohortCopy.action}
              </button>
            </section>
            <section className={tablesCopy.disabled ? 'v2-setup-scope-card v2-setup-disabled' : 'v2-setup-scope-card'}>
              <span className="v2-setup-step">3 · Table setup</span>
              <strong className="v2-setup-scope-value">{tablesCopy.value}</strong>
              <span className="v2-setup-scope-hint">{tablesCopy.hint}</span>
              <button type="button" className="v2-setup-select-link" disabled={tablesCopy.disabled || generating} onClick={() => setDialog('tables')}>
                {tablesCopy.action}
              </button>
            </section>
          </div>
          <div className="v2-setup-matching-intro">
            <span className="v2-setup-eyebrow">Matching brief</span>
            <h2>How should we assign seats?</h2>
            <p>Describe the conversations and mix you want at each table. We’ll translate the brief into editable matching criteria.</p>
          </div>
          <label className="v2-setup-field-label" htmlFor={briefId}>
            <span>Your instructions</span>
            <small>Use plain language</small>
          </label>
          <textarea
            id={briefId}
            className="v2-setup-brief-input"
            value={brief}
            disabled={generating}
            onChange={(event) => onBriefChange(event.target.value)}
          />
          <div className="v2-setup-starters">
            {BRIEF_STARTERS.map((starter) => (
              <button key={starter.label} type="button" disabled={generating} onClick={() => onBriefChange(starter.text)}>
                {starter.label}
              </button>
            ))}
            <button
              ref={advancedTriggerRef}
              type="button"
              className="v2-setup-advanced-trigger"
              aria-expanded={advancedOpen}
              aria-controls={advancedId}
              onClick={() => setAdvancedOpen((open) => !open)}
            >
              Advanced criteria ⌄
            </button>
          </div>
          <div className="v2-setup-interpretation">
            <div id={advancedId} className="v2-setup-advanced-body" hidden={!advancedOpen}>
              <div className="v2-setup-advanced-note">{criteria.length} dimensions · AI-assisted and fully editable</div>
              {criteria.map((criterion) => (
                <div key={criterion.field} className="v2-setup-interpretation-row">
                  <span>
                    <strong>{criterion.label}</strong>
                    <small>{criterion.description}</small>
                  </span>
                  <button
                    type="button"
                    className="v2-setup-interpretation-pill"
                    disabled={generating}
                    onClick={() => onCriteriaChange(toggleObjective(criteria, criterion.field))}
                  >
                    {objectiveLabel(criterion.objective)}
                  </button>
                  <span className="v2-setup-weight-toggle" role="group" aria-label={`${criterion.label} weight`}>
                    {WEIGHTS.map((weight) => (
                      <button
                        key={weight}
                        type="button"
                        className={criterion.weight === weight ? 'v2-setup-active' : undefined}
                        aria-pressed={criterion.weight === weight}
                        disabled={generating}
                        onClick={() => onCriteriaChange(setWeight(criteria, criterion.field, weight))}
                      >
                        {weight}
                      </button>
                    ))}
                  </span>
                  <button
                    type="button"
                    className="v2-setup-remove-dimension"
                    aria-label={`Remove ${criterion.label}`}
                    disabled={criteria.length <= 1 || generating}
                    onClick={() => onCriteriaChange(removeDimension(criteria, criterion.field))}
                  >
                    ×
                  </button>
                </div>
              ))}
              {canAddDimension(criteria) && (
                <button
                  type="button"
                  className="v2-setup-add-dimension-control"
                  disabled={generating}
                  onClick={() => setDialog('dimension')}
                >
                  + Add dimension
                </button>
              )}
            </div>
          </div>
        </section>
        <section className="v2-setup-rules">
          <h3>Hard rules</h3>
          <p>Optional constraints that generated tables must never violate.</p>
          <button type="button" className="v2-setup-rule-button" disabled={generating} onClick={() => setDialog('rule')}>
            {rules.length ? '+ Add another rule' : '+ Add custom rule'}
          </button>
          {rules.map((rule) => (
            <div key={rule.id} className="v2-setup-active-rule">
              <span>{rule.text}</span>
              <button
                type="button"
                aria-label="Remove hard rule"
                disabled={generating}
                onClick={() => onRulesChange(rules.filter((item) => item.id !== rule.id))}
              >
                ×
              </button>
            </div>
          ))}
        </section>
        <section className="v2-setup-summary">
          <div className="v2-setup-summary-copy">
            {summary.primary}
            <br />
            <span>{summary.secondary}</span>
          </div>
          <button
            type="button"
            className={ready ? 'v2-setup-generate v2-setup-ready' : 'v2-setup-generate'}
            disabled={!ready || generating}
            onClick={onGenerate}
          >
            {generating ? 'Generating…' : 'Generate tables →'}
          </button>
        </section>
      </aside>
      <section className="v2-setup-workspace" aria-label="Empty setup workspace" />
      {dialog && !generating && <div className="v2-setup-scrim" onClick={close} />}
      {dialog === 'cohort' && !generating && <CohortDialog choices={choices} onChoose={chooseCohort} onClose={close} />}
      {dialog === 'tables' && cohort && !generating && (
        <TablesDialog founderCount={cohort.founderIds.length} tables={tables} onApply={(next) => {
          onTablesChange(next)
          close()
        }} onClose={close} />
      )}
      {dialog === 'rule' && !generating && (
        <RuleDialog
          founders={cohort ? cohortFounders : founders}
          initialText={ruleSeed.text}
          onAdd={addRule}
          onClose={close}
        />
      )}
      {dialog === 'dimension' && !generating && (
        <DinnerDimensionDialog
          criteria={criteria}
          onAdd={(field, weight) => {
            onCriteriaChange(addDimension(criteria, field, weight))
            close()
          }}
          onClose={close}
          returnFocusRef={advancedTriggerRef}
        />
      )}
    </>
  )
}

function CohortDialog({
  choices,
  onChoose,
  onClose,
}: {
  choices: readonly CohortChoice[]
  onChoose: (choice: CohortChoice) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const dialogRef = useDialogFocus<HTMLElement>(true, onClose, searchRef)
  const titleId = useId()
  const needle = query.trim().toLowerCase()
  const visible = needle ? choices.filter((choice) => choice.name.toLowerCase().includes(needle)) : choices

  return (
    <section ref={dialogRef} className="v2-setup-overlay v2-setup-cohort" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="v2-setup-overlay-head">
        <div>
          <span className="v2-setup-eyebrow">Step 2 of 3</span>
          <h2 id={titleId}>Select founder cohort</h2>
          <p>Choose the ordered group that will be seated.</p>
        </div>
        <button type="button" className="v2-setup-close" aria-label="Close cohort selector" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="v2-setup-search">
        <input
          ref={searchRef}
          type="search"
          placeholder="Search saved cohorts"
          aria-label="Search saved cohorts"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="v2-setup-section-label">Available cohorts</div>
      <div className="v2-setup-option-list">
        {visible.map((choice) => (
          <button
            key={choice.key}
            type="button"
            className={choice.primary ? 'v2-setup-option v2-setup-primary' : 'v2-setup-option'}
            onClick={() => onChoose(choice)}
          >
            <span className="v2-setup-option-icon" aria-hidden="true">
              {choice.icon}
            </span>
            <span>
              <strong>{choice.name}</strong>
              <small>{choice.description}</small>
            </span>
            <span className="v2-setup-option-meta">{choice.cohort.founderIds.length}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

function TablesDialog({
  founderCount,
  tables,
  onApply,
  onClose,
}: {
  founderCount: number
  tables: TableSetup | null
  onApply: (tables: TableSetup) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState<TableSetup>(() => tables ?? defaultTableSetup(founderCount))
  const firstPresetRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useDialogFocus<HTMLElement>(true, onClose, firstPresetRef)
  const titleId = useId()
  const presets = tablePresets(founderCount)
  const note = capacityNote(founderCount, draft)

  function adjust(field: keyof TableSetup, delta: number) {
    setDraft((current) => clampTableSetup(founderCount, { ...current, [field]: current[field] + delta }))
  }

  return (
    <section ref={dialogRef} className="v2-setup-overlay v2-setup-tables" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="v2-setup-overlay-head">
        <div>
          <span className="v2-setup-eyebrow">Step 3 of 3</span>
          <h2 id={titleId}>Set tables and seats</h2>
          <p>{founderCountLabel(founderCount)} selected · choose a seating shape.</p>
        </div>
        <button type="button" className="v2-setup-close" aria-label="Close table selector" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="v2-setup-table-body">
        <div className="v2-setup-section-label" style={{ padding: '0 0 8px' }}>
          Recommended presets
        </div>
        <div className="v2-setup-preset-grid">
          {presets.map((preset, index) => {
            const selected = preset.tableCount === draft.tableCount && preset.targetSeats === draft.targetSeats
            return (
              <button
                key={preset.title}
                ref={index === 0 ? firstPresetRef : undefined}
                type="button"
                className={selected ? 'v2-setup-preset v2-setup-selected' : 'v2-setup-preset'}
                aria-pressed={selected}
                onClick={() => setDraft({ tableCount: preset.tableCount, targetSeats: preset.targetSeats })}
              >
                <strong>{preset.title}</strong>
                <span>
                  {preset.primary}
                  <br />
                  {preset.secondary}
                </span>
              </button>
            )
          })}
        </div>
        <div className="v2-setup-custom-grid">
          <Stepper label="Table count" value={draft.tableCount} field="table count" onAdjust={(delta) => adjust('tableCount', delta)} />
          <Stepper label="Target seats" value={draft.targetSeats} field="target seats" onAdjust={(delta) => adjust('targetSeats', delta)} />
        </div>
        <p className="v2-setup-capacity-note">
          <strong>{note.lead}</strong> {note.text}
        </p>
      </div>
      <div className="v2-setup-overlay-actions">
        <span>
          {founderCountLabel(founderCount)} · {note.capacity} seats
        </span>
        <button type="button" onClick={() => onApply(draft)}>
          Use this setup →
        </button>
      </div>
    </section>
  )
}

function Stepper({ label, value, field, onAdjust }: { label: string; value: number; field: string; onAdjust: (delta: number) => void }) {
  const id = useId()
  return (
    <div className="v2-setup-number-field">
      <label id={id}>{label}</label>
      <div className="v2-setup-stepper" role="group" aria-labelledby={id}>
        <button type="button" aria-label={`Decrease ${field}`} onClick={() => onAdjust(-1)}>
          −
        </button>
        <output aria-live="polite">{value}</output>
        <button type="button" aria-label={`Increase ${field}`} onClick={() => onAdjust(1)}>
          +
        </button>
      </div>
    </div>
  )
}

function RuleDialog({
  founders,
  initialText,
  onAdd,
  onClose,
}: {
  founders: readonly Founder[]
  initialText: string
  onAdd: (rule: RuleDraft) => void
  onClose: () => void
}) {
  const [text, setText] = useState(initialText)
  const [resolutions, setResolutions] = useState<Record<string, string>>({})
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useDialogFocus<HTMLElement>(true, onClose, inputRef)
  const titleId = useId()
  const inputId = useId()

  const parsed = parseRuleText(text, founders, resolutions)
  const unresolved = parsed.status === 'ambiguous' ? parsed : null
  const baseline = !unresolved && Object.keys(resolutions).length ? parseRuleText(text, founders, {}) : null
  const ambiguity = unresolved ?? (baseline?.status === 'ambiguous' ? baseline : null)
  const ambiguityKey = ambiguity ? normalizeName(ambiguity.name) : ''
  const resolvedId = ambiguity ? resolutions[ambiguityKey] : undefined

  let state: string
  if (parsed.status === 'empty') state = 'Draft · rule required'
  else if (parsed.status === 'ambiguous') state = 'Resolve 1 founder to continue'
  else if (parsed.status === 'unsupported') state = 'Draft · rule not recognized'
  else state = ambiguity && resolvedId ? 'Resolved · confirmation required' : 'Draft · confirmation required'

  const preview = parsed.status === 'ready' || parsed.status === 'ambiguous' ? parsed.description : 'Enter a rule to preview it.'

  function confirm() {
    if (parsed.status !== 'ready') return
    const id = nextRuleId()
    onAdd({ id, text: parsed.description, input: { ...parsed.input, id } as RuleDraft['input'] })
  }

  return (
    <section
      ref={dialogRef}
      className="v2-setup-overlay v2-setup-rule-dialog v2-setup-rule-editor"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="v2-setup-overlay-head">
        <div>
          <span className="v2-setup-eyebrow">Hard rule</span>
          <h2 id={titleId}>Add custom rule</h2>
          <p>Describe a constraint generated tables must never violate.</p>
        </div>
        <button type="button" className="v2-setup-close" aria-label="Close custom rule dialog" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="v2-setup-rule-dialog-body">
        <div className="v2-setup-rule-entry">
          <div>
            <label htmlFor={inputId}>Custom rule · plain language</label>
            <input
              ref={inputRef}
              id={inputId}
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') confirm()
              }}
            />
          </div>
        </div>
        <div className="v2-setup-rule-suggestions">
          <span>Suggested rules</span>
          <div>
            {RULE_SUGGESTIONS.map((suggestion) => (
              <button key={suggestion.label} type="button" onClick={() => setText(suggestion.text)}>
                {suggestion.label}
              </button>
            ))}
          </div>
        </div>
        <div className="v2-setup-rule-preview">
          <small>Parsed rule preview</small>
          <strong>{preview}</strong>
        </div>
        {parsed.status === 'unsupported' && (
          <p className="v2-setup-rule-error" role="alert">
            {parsed.message}
          </p>
        )}
        {ambiguity && (
          <div className="v2-setup-resolution-panel">
            <div className="v2-setup-resolution-heading">
              <span className="v2-setup-resolution-warning" aria-hidden="true">
                !
              </span>
              <div>
                <strong>Which {ambiguity.name}?</strong>
                <p>Two founders in this cohort match that name. Choose one before this hard rule can become active.</p>
              </div>
            </div>
            <div className="v2-setup-identity-options" role="group" aria-label={`Which ${ambiguity.name}?`}>
              {ambiguity.candidates.map((candidate) => {
                const selected = resolvedId === candidate.id
                return (
                  <button
                    key={candidate.id}
                    type="button"
                    aria-pressed={selected}
                    className={selected ? 'v2-setup-identity-option v2-setup-selected' : 'v2-setup-identity-option'}
                    onClick={() => setResolutions((current) => ({ ...current, [ambiguityKey]: candidate.id }))}
                  >
                    <span className="v2-setup-identity-radio" aria-hidden="true" />
                    <span className="v2-setup-identity-avatar" aria-hidden="true">
                      {initials(candidate.name)}
                    </span>
                    <span>
                      <strong>{candidate.name}</strong>
                      <small>
                        {candidate.company} · {candidate.role}
                        <br />
                        Cohort {candidate.cohortGroup} · Section {candidate.cohortSection}
                      </small>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
      <div className="v2-setup-rule-actions">
        <span>{state}</span>
        <div>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="v2-setup-confirm-rule" disabled={parsed.status !== 'ready'} onClick={confirm}>
            Add hard rule
          </button>
        </div>
      </div>
    </section>
  )
}
