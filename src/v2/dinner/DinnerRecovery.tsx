import { useEffect, useRef, type ReactNode } from 'react'

import type { Founder } from '../../shared/founder'
import { balanceLabel, describeConflict, numberWord } from './dinnerInsights'
import { capacities } from './optimizer'
import type { RuleConflict } from './rules'
import { capacityResolutions, MAX_SEATS, tableNumber, type CriterionDraft, type RuleDraft, type TableSetup } from './dinnerState'
import { recoveryResolved, replacedAssignment } from './recoveryRules'

export interface SavedFounderRecord {
  readonly id: string
  readonly name: string
  readonly company?: string
  readonly role?: string
  readonly companyVertical?: string
  readonly cohortGroup?: string
}

export interface MissingSeat {
  readonly founderId: string
  readonly tableIndex: number
  readonly seatIndex: number
}

export type CapacityChoice = 'exact' | 'balanced'
export type ProviderChoice = 'basic' | 'switch' | 'review'
export type MissingChoice = { readonly kind: 'replace'; readonly founderId: string } | { readonly kind: 'short' }

export interface MissingDecision extends MissingSeat {
  readonly choice: MissingChoice
}

export type RecoveryState =
  | { readonly kind: 'capacity'; readonly founderCount: number; readonly setup: TableSetup; readonly choice: CapacityChoice | null }
  | {
      readonly kind: 'conflict'
      readonly conflict: RuleConflict
      readonly rules: readonly RuleDraft[]
      readonly removedRuleId: string | null
      readonly editing: boolean
    }
  | {
      readonly kind: 'provider'
      readonly provider: string
      readonly alternateProvider: string | null
      readonly status: string | null
      readonly retryAfter: string | null
      readonly choice: ProviderChoice | null
    }
  | {
      readonly kind: 'missing'
      readonly planName: string
      readonly version: number
      /** The assignment exactly as saved; decisions are applied on top of it. */
      readonly assignment: readonly (readonly string[])[]
      /** Undecided missing seats in table order; the first one is the seat being decided. */
      readonly missing: readonly MissingSeat[]
      readonly decisions: readonly MissingDecision[]
      readonly lockedTables: readonly number[]
      readonly savedFounders: readonly SavedFounderRecord[]
      readonly candidatesShown: boolean
      readonly choice: MissingChoice | null
    }

export type RecoveryAction =
  | { readonly type: 'capacity'; readonly choice: CapacityChoice | 'edit' }
  | { readonly type: 'remove-rule'; readonly ruleId: string }
  | { readonly type: 'edit-rule'; readonly ruleId: string }
  | { readonly type: 'provider'; readonly choice: ProviderChoice }
  | { readonly type: 'show-candidates' }
  | { readonly type: 'replace'; readonly founderId: string }
  | { readonly type: 'open-short' }
  | { readonly type: 'leave' }

export interface RecoveryContext {
  readonly founders: readonly Founder[]
  readonly foundersById: ReadonlyMap<string, Founder>
  readonly cohortFounders: readonly Founder[]
  readonly tables: TableSetup | null
  readonly brief: string
  readonly criteria: readonly CriterionDraft[]
  readonly rules: readonly RuleDraft[]
  readonly canReviewProvider: boolean
}

function plural(count: number, singular: string, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

export interface ReplacementCandidate {
  readonly founder: Founder
  readonly reason: string
  readonly detail: string
}

function replacementCandidates(
  founders: readonly Founder[],
  assigned: ReadonlySet<string>,
  saved: SavedFounderRecord | undefined,
): ReplacementCandidate[] {
  const pool = founders.filter((founder) => !assigned.has(founder.id))
  const picks: ReplacementCandidate[] = []
  const used = new Set<string>()
  const pick = (reason: string, matches: (founder: Founder) => boolean, detail: (founder: Founder) => string) => {
    const founder = pool.find((item) => !used.has(item.id) && matches(item))
    if (!founder) return
    used.add(founder.id)
    picks.push({ founder, reason, detail: detail(founder) })
  }
  if (saved?.role) pick('Same role', (founder) => founder.role === saved.role, (founder) => founder.role)
  if (saved?.companyVertical) pick('Same vertical', (founder) => founder.companyVertical === saved.companyVertical, (founder) => founder.companyVertical)
  if (saved?.cohortGroup) pick('Same cohort group', (founder) => founder.cohortGroup === saved.cohortGroup, (founder) => `Group ${founder.cohortGroup}`)
  while (picks.length < 3 && used.size < pool.length) pick('Available founder', () => true, (founder) => founder.role)
  return picks.slice(0, 3)
}

function Outcome({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="v2-recovery-outcome">
      <strong>{title}</strong>
      {children}
    </div>
  )
}

function Hero({ eyebrow, title, cause, detail, preserved }: { eyebrow: string; title: string; cause: string; detail: string; preserved: [string, string] }) {
  return (
    <div className="v2-recovery-state-hero">
      <div className="v2-recovery-hero-block">
        <span className="v2-recovery-eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
      </div>
      <div className="v2-recovery-failure-copy">
        <div>
          <span className="v2-recovery-eyebrow">Exact cause</span>
          <h2>{cause}</h2>
          <p>{detail}</p>
        </div>
        <div className="v2-recovery-preserved">
          <strong>{preserved[0]}</strong>
          <span>{preserved[1]}</span>
        </div>
      </div>
    </div>
  )
}

function Blocker({ index, label, subject, detail, status }: { index: string; label: string; subject: string; detail: string; status: string }) {
  return (
    <div className="v2-recovery-blocker">
      <span className="v2-recovery-blocker-index">{index}</span>
      <div>
        <small>{label}</small>
        <strong>{subject}</strong>
        <p>{detail}</p>
      </div>
      <span className="v2-recovery-blocker-status">{status}</span>
    </div>
  )
}

function WorkLabel({ title, note }: { title: string; note: string }) {
  return (
    <div className="v2-recovery-work-label">
      <strong>{title}</strong>
      <span>{note}</span>
    </div>
  )
}

function RecoveryHead({ kicker, title, text }: { kicker: string; title: string; text: string }) {
  return (
    <div className="v2-recovery-recovery-head">
      <span className="v2-recovery-section-kicker">{kicker}</span>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  )
}

function Action({
  label,
  note,
  primary,
  pressed,
  disabled,
  onClick,
  buttonRef,
}: {
  label: string
  note: string
  primary: boolean
  pressed?: boolean
  disabled?: boolean
  onClick: () => void
  buttonRef?: React.Ref<HTMLButtonElement>
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className={primary ? 'v2-recovery-action v2-recovery-primary' : 'v2-recovery-action'}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
    >
      {label}
      <small>{note}</small>
    </button>
  )
}

export interface DinnerRecoveryProps {
  readonly state: RecoveryState
  readonly context: RecoveryContext
  readonly onAction: (action: RecoveryAction) => void
  /** While the recovered dinner is generating, every staged choice is frozen. */
  readonly busy?: boolean
}

export function DinnerRecovery({ state, context, onAction, busy = false }: DinnerRecoveryProps) {
  const resolved = recoveryResolved(state)
  const workspaceClass = resolved ? 'v2-recovery-workspace v2-recovery-resolved' : 'v2-recovery-workspace'
  return (
    <section className="v2-recovery-state-panel" aria-label="Dinner recovery" aria-busy={busy || undefined} inert={busy || undefined}>
      {state.kind === 'capacity' && <CapacityPanel state={state} context={context} onAction={onAction} workspaceClass={workspaceClass} />}
      {state.kind === 'conflict' && <ConflictPanel state={state} context={context} onAction={onAction} workspaceClass={workspaceClass} />}
      {state.kind === 'provider' && <ProviderPanel state={state} context={context} onAction={onAction} workspaceClass={workspaceClass} />}
      {state.kind === 'missing' && <MissingPanel state={state} context={context} onAction={onAction} workspaceClass={workspaceClass} />}
    </section>
  )
}

interface PanelProps<K extends RecoveryState['kind']> {
  readonly state: Extract<RecoveryState, { kind: K }>
  readonly context: RecoveryContext
  readonly onAction: (action: RecoveryAction) => void
  readonly workspaceClass: string
}

function CapacityPanel({ state, context, onAction, workspaceClass }: PanelProps<'capacity'>) {
  const { founderCount: n, setup, choice } = state
  const configured = setup.tableCount * setup.targetSeats
  const over = Math.max(0, n - configured)
  const options = capacityResolutions(n, setup)
  const exactValid = options.exact.tableCount * options.exact.targetSeats >= n
  const balancedValid = options.balanced.targetSeats <= MAX_SEATS && options.balanced.tableCount * options.balanced.targetSeats >= n
  const exactCapacities = capacities(n, options.exact.tableCount)
  const exactIsExact = options.exact.tableCount * options.exact.targetSeats === n
  const chosen = choice === 'exact' ? options.exact : choice === 'balanced' ? options.balanced : null
  const chosenCapacity = chosen ? (choice === 'exact' ? options.exact.tableCount * options.exact.targetSeats : n) : configured
  const seated = Math.min(n, chosen ? n : configured)
  const shape = choice === 'balanced' ? options.balanced.capacities : []
  const seatRange = (sizes: readonly number[]) => {
    const min = Math.min(...sizes)
    const max = Math.max(...sizes)
    return min === max ? String(max) : `${min}–${max}`
  }
  const recommended: CapacityChoice = exactValid ? 'exact' : 'balanced'

  return (
    <>
      <Hero
        eyebrow="Setup blocked"
        title={`${numberWord(over)} ${over === 1 ? 'founder has' : 'founders have'} no seat`}
        cause={`${n} founders cannot fit into ${plural(setup.tableCount, 'table')} of ${setup.targetSeats}.`}
        detail={`The current setup provides ${configured} seats. Nothing was generated, and nobody was dropped. Choose an exact-fit or balanced uneven arrangement to continue.`}
        preserved={['✓ Your work is preserved', `Founder order · criteria · ${plural(context.rules.length, 'hard rule')} · manual cohort edits`]}
      />
      <div className={workspaceClass}>
        <div className="v2-recovery-diagnosis">
          <span className="v2-recovery-section-kicker">Blocking item</span>
          <h3>Selected capacity is smaller than the cohort</h3>
          <p>
            Capacity is validated before optimization, so the app cannot produce partial tables or silently exclude the final{' '}
            {numberWord(over, false)} {over === 1 ? 'founder' : 'founders'}.
          </p>
          <Blocker
            index={`−${over}`}
            label="Capacity mismatch"
            subject={`${n} founders selected · ${configured} seats configured`}
            detail={`${plural(setup.tableCount, 'table')} × ${plural(setup.targetSeats, 'seat')}`}
            status={chosen ? 'Capacity valid' : `${over} unseated`}
          />
          <WorkLabel title="Current setup" note="Founder selection unchanged" />
          <div className="v2-recovery-stat-grid">
            <div className="v2-recovery-stat">
              <small>Founders</small>
              <strong>{n}</strong>
            </div>
            <div className="v2-recovery-stat">
              <small>Tables</small>
              <strong>{chosen ? chosen.tableCount : setup.tableCount}</strong>
            </div>
            <div className="v2-recovery-stat">
              <small>Target seats</small>
              <strong>
                {choice === 'balanced' ? seatRange(options.balanced.capacities) : choice === 'exact' ? options.exact.targetSeats : setup.targetSeats}
              </strong>
            </div>
            <div className="v2-recovery-stat">
              <small>Total capacity</small>
              <strong>{chosenCapacity}</strong>
            </div>
          </div>
          <div className="v2-recovery-capacity-bar" role="img" aria-label={`${seated} of ${n} founders have configured seats`}>
            <span style={{ width: `${(seated / n) * 100}%` }} />
            {!chosen && <i />}
          </div>
          <div className="v2-recovery-capacity-legend">
            <span>{chosenCapacity} configured seats</span>
            <span>{chosen ? 'Every founder seated' : `${plural(over, 'founder')} over capacity`}</span>
          </div>
          {shape.length > 0 && (
            <div className="v2-recovery-table-shape" style={{ ['--v2-shape-columns' as string]: String(Math.min(shape.length, 5)) }}>
              {shape.map((count, index) => (
                <div key={index}>
                  <strong>{count}</strong>
                  <span>Table {index + 1}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <aside className="v2-recovery-recovery" aria-label="Recovery options">
          <RecoveryHead
            kicker="Choose a valid shape"
            title={`Seat all ${n} founders`}
            text="Both options preserve founder order, criteria, and hard rules."
          />
          <div className="v2-recovery-actions">
            {exactValid && (
              <Action
                label={`Use ${options.exact.tableCount} tables × ${options.exact.targetSeats} seats`}
                note={
                  exactIsExact
                    ? `Exact fit · every table has ${numberWord(options.exact.targetSeats, false)} founders.`
                    : `Fits all ${n} founders · tables seat ${balanceLabel(exactCapacities)}.`
                }
                primary={(choice ?? recommended) === 'exact'}
                pressed={choice === 'exact'}
                onClick={() => onAction({ type: 'capacity', choice: 'exact' })}
              />
            )}
            {balancedValid && (
              <Action
                label={`Keep ${options.balanced.tableCount} tables · balance ${balanceLabel(options.balanced.capacities)}`}
                note="Uneven final capacities, with no empty seats or excluded founders."
                primary={(choice ?? recommended) === 'balanced'}
                pressed={choice === 'balanced'}
                onClick={() => onAction({ type: 'capacity', choice: 'balanced' })}
              />
            )}
            <Action
              label="Edit tables and seats"
              note={`Return to the selector with ${setup.tableCount} × ${setup.targetSeats} still entered.`}
              primary={false}
              onClick={() => onAction({ type: 'capacity', choice: 'edit' })}
            />
          </div>
          {choice === 'exact' ? (
            <Outcome title="Exact fit selected">
              {options.exact.tableCount} tables × {options.exact.targetSeats} seats. All {n} founders are included and the rest of the setup is
              unchanged.
            </Outcome>
          ) : choice === 'balanced' ? (
            <Outcome title="Balanced uneven capacities selected">
              Tables will seat {balanceLabel(options.balanced.capacities)} founders, with no loss or duplication.
            </Outcome>
          ) : (
            <Outcome title="Why generation stopped">A partial assignment would hide missing founders. V2 requires a complete, capacity-safe plan.</Outcome>
          )}
        </aside>
      </div>
    </>
  )
}

function ConflictPanel({ state, context, onAction, workspaceClass }: PanelProps<'conflict'>) {
  const view = describeConflict(state.conflict, state.rules, context.cohortFounders)
  const removed = state.removedRuleId
  const known = new Set(state.rules.map((rule) => rule.id))
  const options = view.options.filter((option) => known.has(option.removeRuleId))
  const count = view.ruleIds.length
  const others = state.rules.length - count
  const remaining = state.rules.length - (removed ? 1 : 0)
  const tables = context.tables
  const scope = view.numbers.join(' and ')

  return (
    <>
      <Hero
        eyebrow="Generation stopped"
        title={count === 1 ? 'A rule cannot be satisfied' : 'Rules cannot all be true'}
        cause={view.headline}
        detail={`No table assignment was created. The conflict is limited to ${count === 1 ? 'rule' : 'rules'} ${scope}; your cohort, criteria, weights, ${
          others > 0 ? `and the other ${numberWord(others, false)} ${others === 1 ? 'rule' : 'rules'}` : 'and table setup'
        } remain unchanged.`}
        preserved={[
          '✓ Your work is preserved',
          `${context.cohortFounders.length} founders · ${context.criteria.length} criteria · ${plural(state.rules.length, 'hard rule')}${
            tables ? ` · table setup ${tables.tableCount} × ${tables.targetSeats}` : ''
          }`,
        ]}
      />
      <div className={workspaceClass}>
        <div className="v2-recovery-diagnosis">
          <span className="v2-recovery-section-kicker">Blocking item</span>
          <h3>{count === 1 ? 'One rule cannot be satisfied' : `${numberWord(count)} active rules conflict`}</h3>
          <p>
            The optimizer will never silently break a hard rule. Resolve {count === 2 ? 'one of the two' : 'one of the'} highlighted requirements,
            then generate from the same setup.
          </p>
          <Blocker
            index={view.index}
            label={count === 1 ? 'Blocked rule' : 'Conflict pair'}
            subject={view.subject}
            detail={view.detail}
            status={removed ? 'Conflict resolved' : 'Blocks generation'}
          />
          <WorkLabel title="Active rules" note="All other setup preserved" />
          <div className="v2-recovery-rule-stack">
            {view.rows.map((row) => {
              const isRemoved = row.id === removed
              const className = ['v2-recovery-rule-row', isRemoved ? 'v2-recovery-removed' : row.conflict && !removed ? 'v2-recovery-conflict' : '']
                .filter(Boolean)
                .join(' ')
              return (
                <div key={row.id} className={className}>
                  <b>{row.number}</b>
                  <span>{row.text}</span>
                  <em>{isRemoved ? 'Removed' : removed && row.conflict ? 'Active' : row.status}</em>
                </div>
              )
            })}
          </div>
        </div>
        <aside className="v2-recovery-recovery" aria-label="Recovery options">
          <RecoveryHead
            kicker="Resolve conflict"
            title={count === 2 ? 'Choose the rule to keep' : 'Choose the rule to remove'}
            text="Only the selected conflicting rule changes. No search, criterion, weight, or table setting will reset."
          />
          <div className="v2-recovery-actions">
            {options.map((option, index) => (
              <Action
                key={option.label}
                label={option.label}
                note={option.note}
                primary={removed ? removed === option.removeRuleId : index === 0}
                pressed={removed === option.removeRuleId}
                onClick={() => onAction({ type: 'remove-rule', ruleId: option.removeRuleId })}
              />
            ))}
            {view.edit && (
              <Action
                label={view.edit.label}
                note="Return to the rule editor with this rule prefilled."
                primary={false}
                onClick={() => onAction({ type: 'edit-rule', ruleId: view.edit!.ruleId })}
              />
            )}
          </div>
          {removed ? (
            <Outcome title="Ready to generate">
              {numberWord(remaining)} compatible hard {remaining === 1 ? 'rule remains' : 'rules remain'}. The cohort, criteria, weights, and table
              setup are unchanged.
            </Outcome>
          ) : (
            <Outcome title="Next">Select one resolution. Generate Tables will become available without rebuilding the brief.</Outcome>
          )}
        </aside>
      </div>
    </>
  )
}

function ProviderPanel({ state, context, onAction, workspaceClass }: PanelProps<'provider'>) {
  const { provider, alternateProvider: alternate, status, retryAfter, choice } = state
  const rateLimited = status === '429'
  const criteriaCount = context.criteria.length
  const ruleCount = context.rules.length
  const switched = choice === 'switch'
  const statusLabel = choice === 'basic' ? 'Fallback active' : switched ? 'Provider switched' : 'AI paused'

  return (
    <>
      <Hero
        eyebrow="AI unavailable"
        title={`${provider} did not process this request`}
        cause={rateLimited ? 'Provider rate limit reached before criteria interpretation.' : 'The provider request failed before criteria interpretation.'}
        detail="Your brief has not been submitted again, and no partial provider output was applied. The same dinner can continue with database-only controls or another configured provider."
        preserved={['✓ Your work is preserved', `Brief · cohort · manual criteria · table setup · ${ruleCount} confirmed hard ${ruleCount === 1 ? 'rule' : 'rules'}`]}
      />
      <div className={workspaceClass}>
        <div className="v2-recovery-diagnosis">
          <span className="v2-recovery-section-kicker">Blocking item</span>
          <h3>
            {status ? `${provider} returned HTTP ${status}` : `${provider} request failed`}
            {retryAfter ? ` · retry after ${retryAfter}` : ''}
          </h3>
          <p>AI assistance is optional. Database search, manual criteria, hard-rule enforcement, optimization, saving, and export remain available.</p>
          <Blocker
            index={status ?? '!'}
            label="Failed operation"
            subject={`Interpret dinner brief · ${provider}`}
            detail="Attempt 1 of 1 · no automatic resubmission"
            status={statusLabel}
          />
          <WorkLabel title="Configured providers" note="Credentials remain server-side" />
          <div className="v2-recovery-provider-grid">
            <div className={switched ? 'v2-recovery-provider v2-recovery-failed' : 'v2-recovery-provider v2-recovery-failed v2-recovery-selected'}>
              <strong>{provider}</strong>
              <span>Selected for brief interpretation</span>
              <b>{rateLimited ? 'Rate limited' : 'Request failed'}</b>
            </div>
            {alternate && (
              <div className={switched ? 'v2-recovery-provider v2-recovery-selected' : 'v2-recovery-provider'}>
                <strong>{alternate}</strong>
                <span>Configured · interpretation available</span>
                <b>Ready</b>
              </div>
            )}
          </div>
          <WorkLabel title="Preserved brief" note="Not resubmitted" />
          <div className="v2-recovery-work-grid">
            <div className="v2-recovery-work-card">
              <small>Dinner brief</small>
              <strong>{context.brief.trim() || 'No brief entered'}</strong>
            </div>
            <div className="v2-recovery-work-card">
              <small>Manual criteria</small>
              <strong>{plural(criteriaCount, 'dimension')} confirmed</strong>
              <span>{context.criteria.map((criterion) => criterion.label).join(' · ')}</span>
            </div>
            <div className="v2-recovery-work-card">
              <small>Hard rules</small>
              <strong>{plural(ruleCount, 'rule')} confirmed</strong>
              <span>All remain enforceable without AI</span>
            </div>
          </div>
        </div>
        <aside className="v2-recovery-recovery" aria-label="Recovery options">
          <RecoveryHead kicker="Continue safely" title="Choose how to proceed" text="No generic retry: each action has a distinct, predictable result." />
          <div className="v2-recovery-actions">
            <Action
              label="Continue without AI"
              note={`Keep the ${numberWord(criteriaCount, false)} manual criteria and generate with the deterministic optimizer.`}
              primary={choice === 'basic' || choice === null}
              pressed={choice === 'basic'}
              onClick={() => onAction({ type: 'provider', choice: 'basic' })}
            />
            {alternate && (
              <Action
                label={`Use ${alternate} for this brief`}
                note="Submit the preserved brief once to the validated provider."
                primary={switched}
                pressed={switched}
                onClick={() => onAction({ type: 'provider', choice: 'switch' })}
              />
            )}
            <Action
              label={`Review ${provider} connection`}
              note={`Open provider settings with the ${status ? `HTTP ${status}` : 'failure'} diagnosis attached.`}
              primary={false}
              disabled={!context.canReviewProvider}
              onClick={() => onAction({ type: 'provider', choice: 'review' })}
            />
          </div>
          {choice === 'basic' ? (
            <Outcome title="Database-only mode active">
              The {numberWord(criteriaCount, false)} confirmed manual criteria and hard rules will drive deterministic optimization. No provider call
              is required.
            </Outcome>
          ) : switched ? (
            <Outcome title={`${alternate} selected for this brief`}>
              The preserved brief is ready for one submission. {provider} remains configured but paused.
            </Outcome>
          ) : choice === 'review' ? (
            <Outcome title="Provider settings opened">
              {provider} is selected with the {status ? `HTTP ${status} event` : 'failure'}
              {retryAfter ? ', retry-after time,' : ''} and credential status attached. The dinner is unchanged.
            </Outcome>
          ) : (
            <Outcome title="Database-only fallback is ready">Core matching does not depend on AI. You can finish this dinner without losing work.</Outcome>
          )}
        </aside>
      </div>
    </>
  )
}

function MissingPanel({ state, context, onAction, workspaceClass }: PanelProps<'missing'>) {
  const firstCandidateRef = useRef<HTMLButtonElement>(null)
  const working = replacedAssignment(state.assignment, state.decisions)
  const total = state.assignment.reduce((sum, table) => sum + table.length, 0)
  const tableCount = state.assignment.length
  const remaining = state.missing.length
  const decided = state.decisions.length
  const totalMissing = remaining + decided
  const removedCount = state.decisions.filter((decision) => decision.choice.kind === 'short').length
  const restored = total - remaining - removedCount
  const lastSeat = remaining === 1
  const target = state.missing[0]!
  const saved = state.savedFounders.find((founder) => founder.id === target.founderId)
  const name = saved?.name ?? 'Unknown founder'
  const savedLabel = saved?.company ? `${name} · ${saved.company}` : name
  const tableLabel = tableNumber(target.tableIndex)
  const seatLabel = pad(target.seatIndex + 1)
  const onTargetTable = (seats: readonly { readonly tableIndex: number }[]) => seats.filter((seat) => seat.tableIndex === target.tableIndex).length
  const loaded = (working[target.tableIndex]?.length ?? 0) - onTargetTable(state.missing) - onTargetTable(state.decisions.filter((decision) => decision.choice.kind === 'short'))
  const assigned = new Set(working.flat())
  const candidates = replacementCandidates(context.founders, assigned, saved)
  const choice = state.choice
  const staged = choice?.kind === 'replace' ? context.foundersById.get(choice.founderId) ?? null : null
  const stagedLabel = staged ? `${staged.name} · ${staged.company}` : ''
  const afterRemoval = total - removedCount - 1
  const canRemove = afterRemoval > 0 && afterRemoval >= tableCount
  const shortLabel = canRemove ? balanceLabel(capacities(afterRemoval, tableCount)) : ''
  const othersPending = remaining - 1
  const locked = state.lockedTables.includes(target.tableIndex)
  const progress = decided ? ` · ${decided} of ${totalMissing} missing seats decided` : ''

  useEffect(() => {
    if (state.candidatesShown && !choice) firstCandidateRef.current?.focus()
  }, [state.candidatesShown, choice])

  let recordName = savedLabel
  let recordDetail = `Saved seat ${seatLabel} · founder ID ${target.founderId} unavailable`
  let recordTag = 'Missing'
  let status = 'Needs decision'
  if (staged && choice?.kind === 'replace') {
    recordName = stagedLabel
    recordDetail = `Replacement staged · founder ID ${staged.id} · Table ${tableLabel} seat ${seatLabel}`
    recordTag = 'Staged'
    status = 'Replacement staged'
  } else if (choice?.kind === 'short') {
    recordName = `Seat removed · Table ${tableLabel}`
    recordDetail = lastSeat ? `${afterRemoval} founders rebalance to ${shortLabel}` : 'Removal staged · tables rebalance once every missing seat is decided'
    recordTag = lastSeat ? `${afterRemoval} founders` : 'Removed'
    status = 'Removal accepted'
  }

  return (
    <>
      <Hero
        eyebrow="Saved dinner warning"
        title={remaining === 1 ? 'One saved founder is missing' : `${numberWord(remaining)} saved founders are missing`}
        cause={`${name} · ID ${target.founderId} is not in the current dataset.`}
        detail={`“${state.planName}” was saved with ${total} founders. The other ${total - totalMissing} founders, all assignments, criteria, rules, locks, and notes loaded successfully.`}
        preserved={[`✓ ${restored} of ${total} founders restored${progress}`, `Saved version ${state.version} remains unchanged until you explicitly save a recovery.`]}
      />
      <div className={workspaceClass}>
        <div className="v2-recovery-diagnosis">
          <span className="v2-recovery-section-kicker">Blocking item</span>
          <h3>Saved assignment references an unavailable founder ID</h3>
          <p>
            The app will not silently delete or guess a replacement. Select a known founder, open the dinner without this seat, or leave the saved
            version untouched.
          </p>
          <Blocker
            index={pad(remaining)}
            label={totalMissing > 1 ? `Missing record · ${decided + 1} of ${totalMissing}` : 'Missing record'}
            subject={`Founder ID ${target.founderId}`}
            detail={`Previously: ${savedLabel} · Table ${tableLabel} · seat ${seatLabel}${locked ? ' · table locked' : ''}`}
            status={status}
          />
          <WorkLabel title={`Recovered table ${tableLabel}`} note={`${plural(loaded, 'assignment')} loaded`} />
          <div className="v2-recovery-missing-record">
            <span className="v2-recovery-missing-avatar" aria-hidden="true">
              ?
            </span>
            <span>
              <strong>{recordName}</strong>
              <span>{recordDetail}</span>
            </span>
            <em>{recordTag}</em>
          </div>
          {state.candidatesShown && (
            <div className="v2-recovery-candidate-list" role="group" aria-label="Eligible replacement founders">
              {candidates.map((candidate, index) => {
                const selected = choice?.kind === 'replace' && choice.founderId === candidate.founder.id
                return (
                  <button
                    key={candidate.founder.id}
                    ref={index === 0 ? firstCandidateRef : undefined}
                    type="button"
                    className={selected ? 'v2-recovery-candidate v2-recovery-selected' : 'v2-recovery-candidate'}
                    aria-pressed={selected}
                    onClick={() => onAction({ type: 'replace', founderId: candidate.founder.id })}
                  >
                    <small>{candidate.reason}</small>
                    <strong>
                      {candidate.founder.name} · {candidate.founder.company}
                    </strong>
                    <span>
                      {candidate.detail} · founder ID {candidate.founder.id}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
        <aside className="v2-recovery-recovery" aria-label="Recovery options">
          <RecoveryHead
            kicker="Recover saved dinner"
            title="Decide this seat only"
            text="The original saved version remains available. A changed recovery can be saved as a new version."
          />
          <div className="v2-recovery-actions">
            <Action
              label="Choose a replacement founder"
              note={`Show eligible founders without changing the other ${total - 1} seats.`}
              primary={choice?.kind !== 'short'}
              pressed={state.candidatesShown}
              disabled={candidates.length === 0}
              onClick={() => onAction({ type: 'show-candidates' })}
            />
            <Action
              label={lastSeat ? `Open with ${afterRemoval} founders` : 'Remove this seat'}
              note={
                lastSeat
                  ? `Remove the missing seat; tables rebalance to ${shortLabel}.`
                  : `Drop Table ${tableLabel} · seat ${seatLabel}; tables rebalance after the other ${plural(othersPending, 'missing seat')} ${othersPending === 1 ? 'is' : 'are'} decided.`
              }
              primary={choice?.kind === 'short'}
              pressed={choice?.kind === 'short'}
              disabled={!canRemove}
              onClick={() => onAction({ type: 'open-short' })}
            />
            <Action
              label="Return to Saved Dinners"
              note={`Make no change to saved version ${state.version}.`}
              primary={false}
              onClick={() => onAction({ type: 'leave' })}
            />
          </div>
          {staged ? (
            <Outcome title="Replacement staged, not saved">
              {stagedLabel} will fill the missing seat. Save as new version keeps version {state.version} intact.
            </Outcome>
          ) : choice?.kind === 'short' ? (
            lastSeat ? (
              <Outcome title={`${afterRemoval}-founder recovery staged`}>No founder was substituted. Tables rebalance to {shortLabel}.</Outcome>
            ) : (
              <Outcome title="Seat removal staged">No founder was substituted. Confirm to decide the next missing seat.</Outcome>
            )
          ) : state.candidatesShown ? (
            <Outcome title="Choose one eligible founder">
              The replacement will occupy Table {tableLabel} · seat {seatLabel}. The other {total - 1} assignments remain locked.
            </Outcome>
          ) : (
            <Outcome title="Original is protected">
              Recovery choices are staged locally. Nothing overwrites the saved dinner until Save as new version.
            </Outcome>
          )}
        </aside>
      </div>
    </>
  )
}
