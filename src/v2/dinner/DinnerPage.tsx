import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import type { Founder } from '../../shared/founder'
import { V2Footer } from '../layout/V2Footer'
import { V2Header } from '../layout/V2Header'
import {
  browserLocalStorage,
  browserSessionStorage,
  readAccountRole,
  readCurrentFounderId,
  writeAccountRole,
  type AccountRole,
} from '../search/accountState'
import { parseDinnerHandoff, readSearchCohort } from '../search/searchHandoff'
import { DinnerAlternatives } from './DinnerAlternatives'
import { DinnerAnalysis, type RecommendationKind, type RecommendationState } from './DinnerAnalysis'
import { defaultDinnerEngine, type DinnerAssignment, type DinnerEngine } from './dinnerEngine'
import { buildDinnerCsv, dinnerExportFilename, downloadDinnerCsv, type DinnerExportFile } from './dinnerExport'
import { DinnerExportDialog, type ExportStage } from './DinnerExportDialog'
import {
  DinnerRecovery,
  type RecoveryAction,
  type RecoveryContext,
  type RecoveryState,
  type SavedFounderRecord,
} from './DinnerRecovery'
import { DinnerSetup, type SetupDialog } from './DinnerSetup'
import { pendingMissingSeats, recoveredAssignment, recoveredCohortIds, recoveryResolved } from './recoveryRules'
import {
  assignmentOf,
  buildDinnerRequest,
  buildDinnerView,
  capacityResolutions,
  DEFAULT_BRIEF,
  DEFAULT_CRITERIA,
  DEFAULT_THRESHOLD,
  founderCountLabel,
  locksForTables,
  objectivePerformance,
  seatShape,
  swapAssignment,
  tableNumber,
  type CriterionDraft,
  type DinnerCohort,
  type DinnerCohortOption,
  type RuleDraft,
  type TableSetup,
} from './dinnerState'
import { DinnerSetupRail, DinnerTables, type Density, type WorkspaceView } from './DinnerTables'
import { DinnerConflictError, type DinnerRequest, type DinnerSolution } from './optimizer'
import type { RuleConflict } from './rules'
import './dinner-setup.css'
import './dinner-results.css'
import './dinner-recovery.css'
import './dinner-alternatives.css'
import './dinner-export.css'
import './dinner.css'
import './dinner-header.css'

/** Setup inputs the coordinator can persist as an unfinished draft. */
export interface DinnerDraft {
  readonly id?: string
  readonly name: string
  readonly brief: string
  readonly cohort: DinnerCohort | null
  readonly tables: TableSetup | null
  readonly criteria: readonly CriterionDraft[]
  readonly rules: readonly RuleDraft[]
}

/** A complete seating plan handed to the coordinator for versioned persistence (Task 8). */
export interface DinnerPlanSnapshot {
  readonly id?: string
  readonly name: string
  readonly brief: string
  readonly cohort: DinnerCohort
  readonly tables: TableSetup
  readonly criteria: readonly CriterionDraft[]
  readonly rules: readonly RuleDraft[]
  readonly assignment: readonly (readonly string[])[]
  readonly lockedTables: readonly number[]
  readonly threshold: number
}

/** A saved plan reopened from Seating Plans; unknown founder IDs route through missing-founder recovery. */
export interface DinnerInitialPlan {
  readonly id: string
  readonly name: string
  readonly version: number
  readonly brief: string
  readonly cohort: DinnerCohort
  readonly tables: TableSetup
  readonly rules: readonly RuleDraft[]
  readonly assignment: readonly (readonly string[])[]
  readonly criteria?: readonly CriterionDraft[]
  readonly lockedTables?: readonly number[]
  readonly threshold?: number
  readonly savedFounders?: readonly SavedFounderRecord[]
}

export interface DinnerBriefRequest {
  readonly brief: string
  readonly criteria: readonly CriterionDraft[]
  readonly provider: string
}

/** Provider failures reject with this shape; the UI never retries automatically. */
export interface DinnerProviderFailure {
  readonly status?: number | string
  readonly retryAfter?: string
}

/** Injected AI boundary. Credentials and provider calls stay with the coordinator/server. */
export interface DinnerAiBridge {
  readonly provider: string
  readonly alternateProvider?: string
  readonly interpretBrief: (request: DinnerBriefRequest) => Promise<readonly CriterionDraft[] | null | undefined | void>
  readonly openProviderSettings?: () => void
}

export interface DinnerPageProps {
  readonly founders: readonly Founder[]
  /** `window.location.search`; carries the Founder Search cohort handoff. */
  readonly search?: string
  readonly sessionStore?: Pick<Storage, 'getItem'>
  readonly engine?: DinnerEngine
  readonly savedCohorts?: readonly DinnerCohortOption[]
  readonly ai?: DinnerAiBridge
  readonly navigate?: (path: string) => void
  readonly initialPlan?: DinnerInitialPlan
  readonly onSave?: (plan: DinnerPlanSnapshot) => Promise<{ readonly version: number; readonly id?: string }>
  readonly onSaveDraft?: (draft: DinnerDraft) => Promise<void> | void
  readonly download?: (file: DinnerExportFile) => void
  /** Hook for server-side export preparation; resolves with the file to download. */
  readonly prepareExport?: (file: DinnerExportFile) => Promise<DinnerExportFile | void>
  readonly now?: () => Date
}

type Mode = 'setup' | 'recovery' | 'results' | 'alternatives'

interface SetupSeed {
  readonly key: number
  readonly dialog: SetupDialog | null
  readonly ruleText?: string
  readonly editingRuleId?: string
}

interface AlternativesState {
  readonly list: readonly DinnerSolution[]
  readonly selected: number
  readonly confirmed: boolean
}

interface ExportState {
  readonly stage: ExportStage
  readonly includeDetails: boolean
  readonly file: DinnerExportFile | null
}

interface GenerateInput {
  readonly tables: TableSetup
  readonly rules: readonly RuleDraft[]
  readonly aiOn: boolean
  readonly provider: string
}

const NO_RECOMMENDATIONS: Partial<Record<RecommendationKind, RecommendationState>> = {}

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message
  return 'The engine could not complete this request.'
}

function readHandoff(search: string, store: Pick<Storage, 'getItem'> | undefined, byId: ReadonlyMap<string, Founder>): DinnerCohort | null {
  const parsed = parseDinnerHandoff(search)
  if (!parsed) return null
  const payload = readSearchCohort(store, parsed.cohortId)
  if (!payload) return null
  const founderIds = payload.founderIds.filter((founderId) => byId.has(founderId))
  if (!founderIds.length) return null
  return {
    id: payload.id,
    label: founderCountLabel(founderIds.length),
    hint: 'Founder Search · current result order',
    source: 'search',
    founderIds,
  }
}

export function DinnerPage({
  founders,
  search = '',
  sessionStore,
  engine = defaultDinnerEngine,
  savedCohorts = [],
  ai,
  navigate = (path) => window.location.assign(path),
  initialPlan,
  onSave,
  onSaveDraft,
  download = downloadDinnerCsv,
  prepareExport,
  now = () => new Date(),
}: DinnerPageProps) {
  const foundersById = useMemo(() => new Map(founders.map((founder) => [founder.id, founder])), [founders])
  const [role, setRole] = useState<AccountRole>(() => readAccountRole(browserLocalStorage()))
  const [currentFounderId] = useState(() => readCurrentFounderId(browserLocalStorage(), founders))
  const currentFounder = foundersById.get(currentFounderId ?? '') ?? null
  const [handoff] = useState(() => (initialPlan ? null : readHandoff(search, sessionStore ?? browserSessionStorage(), foundersById)))

  const [planId, setPlanId] = useState<string | undefined>(initialPlan?.id)
  const [savedVersion, setSavedVersion] = useState<number | null>(initialPlan?.version ?? null)
  const [planName, setPlanName] = useState(initialPlan?.name ?? '')
  const [cohort, setCohort] = useState<DinnerCohort | null>(initialPlan?.cohort ?? handoff)
  const [tables, setTables] = useState<TableSetup | null>(initialPlan?.tables ?? null)
  const [brief, setBrief] = useState(initialPlan?.brief ?? DEFAULT_BRIEF)
  const [criteria, setCriteria] = useState<readonly CriterionDraft[]>(initialPlan?.criteria ?? DEFAULT_CRITERIA)
  const [rules, setRules] = useState<readonly RuleDraft[]>(initialPlan?.rules ?? [])
  const [setupSeed, setSetupSeed] = useState<SetupSeed>({ key: 0, dialog: null })

  const [recovery, setRecovery] = useState<RecoveryState | null>(() => {
    if (!initialPlan) return null
    const missing = pendingMissingSeats(initialPlan.assignment, [], foundersById)
    if (!missing.length) return null
    return {
      kind: 'missing',
      planName: initialPlan.name,
      version: initialPlan.version,
      assignment: initialPlan.assignment,
      missing,
      decisions: [],
      lockedTables: initialPlan.lockedTables ?? [],
      savedFounders: initialPlan.savedFounders ?? [],
      candidatesShown: false,
      choice: null,
    }
  })
  const [mode, setMode] = useState<Mode>(recovery ? 'recovery' : 'setup')
  const [generating, setGenerating] = useState(false)
  const [aiOn, setAiOn] = useState(Boolean(ai))
  const [provider, setProvider] = useState(ai?.provider ?? '')
  const [aiIssue, setAiIssue] = useState(false)

  const [solution, setSolution] = useState<DinnerSolution | null>(null)
  const [baseRequest, setBaseRequest] = useState<DinnerRequest | null>(null)
  const [threshold, setThreshold] = useState(initialPlan?.threshold ?? DEFAULT_THRESHOLD)
  const [workspace, setWorkspace] = useState<WorkspaceView>('tables')
  const [density, setDensity] = useState<Density>('compact')
  const [focusIndex, setFocusIndex] = useState(0)
  const [locked, setLocked] = useState<ReadonlySet<number>>(() => new Set())
  const [recommendations, setRecommendations] = useState(NO_RECOMMENDATIONS)
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [alternatives, setAlternatives] = useState<AlternativesState | null>(null)
  const [exportState, setExportState] = useState<ExportState | null>(null)
  const [message, setMessage] = useState('')

  // Engine actions and saves both work from a snapshot of the plan, so plan edits pause until they settle.
  const frozen = busy || saving
  const whileIdle =
    <T,>(apply: (value: T) => void) =>
    (value: T) => {
      if (!generating) apply(value)
    }

  const runRef = useRef(0)
  const actionRef = useRef(0)
  const exportRef = useRef(0)
  const frameRef = useRef<HTMLDivElement>(null)
  const previousModeRef = useRef<Mode>(mode)

  useEffect(
    () => () => {
      runRef.current += 1
      actionRef.current += 1
      exportRef.current += 1
    },
    [],
  )

  const cohortFounders = useMemo(
    () => (cohort?.founderIds ?? []).map((founderId) => foundersById.get(founderId)).filter((founder): founder is Founder => !!founder),
    [cohort, foundersById],
  )

  const view = useMemo(() => (solution ? buildDinnerView(solution, foundersById, threshold) : null), [solution, foundersById, threshold])
  const solutionFounders = useMemo(
    () => (solution ? assignmentOf(solution).flat().map((founderId) => foundersById.get(founderId)).filter((founder): founder is Founder => !!founder) : []),
    [solution, foundersById],
  )
  const objectives = useMemo(() => (solution ? objectivePerformance(solution, solutionFounders) : []), [solution, solutionFounders])
  const seatLabel = view ? seatShape(view.tables.map((table) => table.seats.length)) : ''

  const announce = useCallback((text: string) => setMessage(text), [])

  useEffect(() => {
    if (previousModeRef.current === mode) return
    previousModeRef.current = mode
    const frame = frameRef.current
    if (!frame) return
    const selector =
      mode === 'results'
        ? '.v2-dinner-work-title h2'
        : mode === 'recovery'
          ? '.v2-recovery-state-hero h1'
          : mode === 'setup' && !setupSeed.dialog
            ? '.v2-setup-setup input'
            : null
    const target = selector ? frame.querySelector<HTMLElement>(selector) : null
    if (!target) return
    if (!target.matches('input, button, textarea, select, a[href]')) target.setAttribute('tabindex', '-1')
    target.focus()
  }, [mode, setupSeed.dialog])

  const missingStep = recovery?.kind === 'missing' ? recovery.decisions.length : 0
  useEffect(() => {
    if (!missingStep) return
    const heading = frameRef.current?.querySelector<HTMLElement>('.v2-recovery-state-hero h1')
    if (!heading) return
    heading.setAttribute('tabindex', '-1')
    heading.focus()
  }, [missingStep])

  function openSetup(seed: Omit<SetupSeed, 'key'> = { dialog: null }) {
    runRef.current += 1
    setGenerating(false)
    setSetupSeed((previous) => ({ ...seed, key: previous.key + 1 }))
    setRecovery(null)
    setExportState(null)
    setMode('setup')
  }

  function enterResults(next: DinnerSolution, request: DinnerRequest, lockedTables: Iterable<number> = []) {
    setSolution(next)
    setBaseRequest(request)
    setLocked(new Set(lockedTables))
    setRecommendations(NO_RECOMMENDATIONS)
    setFocusIndex(0)
    setWorkspace('tables')
    setAlternatives(null)
    setRecovery(null)
    setMode('results')
  }

  function showConflict(conflicts: readonly RuleConflict[], ruleSet: readonly RuleDraft[]) {
    setRecovery({ kind: 'conflict', conflict: conflicts[0]!, rules: ruleSet, removedRuleId: null, editing: false })
    setMode('recovery')
  }

  async function generate(input: GenerateInput) {
    if (!cohort || !cohortFounders.length) return
    const founderCount = cohortFounders.length
    if (input.tables.tableCount * input.tables.targetSeats < founderCount) {
      setRecovery({ kind: 'capacity', founderCount, setup: input.tables, choice: null })
      setMode('recovery')
      return
    }
    const checked = buildDinnerRequest({ founders: cohortFounders, tableCount: input.tables.tableCount, criteria, rules: input.rules })
    if ('conflicts' in checked) {
      showConflict(checked.conflicts, input.rules)
      return
    }

    const run = ++runRef.current
    setGenerating(true)
    let nextCriteria = criteria
    if (ai && input.aiOn) {
      try {
        const interpreted = await ai.interpretBrief({ brief, criteria, provider: input.provider })
        if (run !== runRef.current) return
        if (Array.isArray(interpreted) && interpreted.length) {
          nextCriteria = interpreted
          setCriteria(interpreted)
        }
        setAiIssue(false)
      } catch (error) {
        if (run !== runRef.current) return
        const failure = (error ?? {}) as DinnerProviderFailure
        setGenerating(false)
        setAiIssue(true)
        setRecovery({
          kind: 'provider',
          provider: input.provider,
          alternateProvider: ai.alternateProvider && ai.alternateProvider !== input.provider ? ai.alternateProvider : null,
          status: failure.status === undefined ? null : String(failure.status),
          retryAfter: failure.retryAfter ?? null,
          choice: null,
        })
        setMode('recovery')
        return
      }
    }

    const built =
      nextCriteria === criteria
        ? checked
        : buildDinnerRequest({ founders: cohortFounders, tableCount: input.tables.tableCount, criteria: nextCriteria, rules: input.rules })
    if ('conflicts' in built) {
      setGenerating(false)
      showConflict(built.conflicts, input.rules)
      return
    }
    try {
      const next = await engine.optimize(built.request)
      if (run !== runRef.current) return
      enterResults(next, built.request)
      announce(`Generated ${next.tables.length} tables for ${founderCount} founders · overall quality ${buildDinnerView(next, foundersById, threshold).overall}`)
    } catch (error) {
      if (run !== runRef.current) return
      if (error instanceof DinnerConflictError) showConflict(error.conflicts, input.rules)
      else announce(`Generation failed · ${errorMessage(error)}`)
    } finally {
      if (run === runRef.current) setGenerating(false)
    }
  }

  function generateFromSetup() {
    if (!tables) return
    void generate({ tables, rules, aiOn, provider })
  }

  async function openAssignment(assignment: DinnerAssignment, nextCohort: DinnerCohort, lockedTables: readonly number[]) {
    const seated = assignment.flat().map((founderId) => foundersById.get(founderId)).filter((founder): founder is Founder => !!founder)
    const built = buildDinnerRequest({ founders: seated, tableCount: assignment.length, criteria, rules })
    setCohort(nextCohort)
    if ('conflicts' in built) {
      showConflict(built.conflicts, rules)
      return
    }
    const run = ++runRef.current
    setGenerating(true)
    try {
      const next = await engine.evaluate(built.request, assignment)
      if (run !== runRef.current) return
      enterResults(next, built.request, lockedTables)
      announce(`Opened ${planName || 'saved dinner'} · ${next.tables.length} tables for ${seated.length} founders`)
    } catch (error) {
      if (run !== runRef.current) return
      if (error instanceof DinnerConflictError) showConflict(error.conflicts, rules)
      else {
        announce(`Could not open the saved dinner · ${errorMessage(error)}`)
        setMode('setup')
      }
    } finally {
      if (run === runRef.current) setGenerating(false)
    }
  }

  const openedRef = useRef(false)
  useEffect(() => {
    if (openedRef.current) return
    openedRef.current = true
    if (!initialPlan || recovery) return
    void openAssignment(initialPlan.assignment, initialPlan.cohort, initialPlan.lockedTables ?? [])
    // Opening a saved plan is a one-time mount action; missing-founder recovery resumes through its own path.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function resumeFromRecovery() {
    if (!recovery || !recoveryResolved(recovery)) return
    switch (recovery.kind) {
      case 'capacity': {
        const options = capacityResolutions(recovery.founderCount, recovery.setup)
        const nextTables: TableSetup =
          recovery.choice === 'exact'
            ? options.exact
            : { tableCount: options.balanced.tableCount, targetSeats: options.balanced.targetSeats }
        setTables(nextTables)
        void generate({ tables: nextTables, rules, aiOn, provider })
        return
      }
      case 'conflict': {
        const nextRules = recovery.rules.filter((rule) => rule.id !== recovery.removedRuleId)
        setRules(nextRules)
        if (tables) void generate({ tables, rules: nextRules, aiOn, provider })
        return
      }
      case 'provider':
        if (tables) void generate({ tables, rules, aiOn: recovery.choice === 'switch', provider })
        return
      case 'missing': {
        const seat = recovery.missing[0]!
        const decisions = [...recovery.decisions, { ...seat, choice: recovery.choice! }]
        const remaining = pendingMissingSeats(recovery.assignment, decisions, foundersById)
        if (remaining.length) {
          const next = remaining[0]!
          setRecovery({ ...recovery, missing: remaining, decisions, candidatesShown: false, choice: null })
          announce(
            `Table ${tableNumber(seat.tableIndex)} seat ${seat.seatIndex + 1} decided · ${remaining.length} missing ${remaining.length === 1 ? 'seat remains' : 'seats remain'} · next is Table ${tableNumber(next.tableIndex)} seat ${next.seatIndex + 1}`,
          )
          return
        }
        const assignment = recoveredAssignment(recovery.assignment, decisions)
        const founderIds = recoveredCohortIds(cohort?.founderIds ?? recovery.assignment.flat(), decisions, foundersById)
        const nextCohort: DinnerCohort = {
          id: cohort?.id ?? 'recovered',
          label: founderCountLabel(founderIds.length),
          hint: cohort?.hint ?? 'Saved cohort',
          source: cohort?.source ?? 'saved',
          founderIds,
        }
        void openAssignment(assignment, nextCohort, recovery.lockedTables)
        return
      }
    }
  }

  function handleRecoveryAction(action: RecoveryAction) {
    if (!recovery || generating) return
    switch (action.type) {
      case 'capacity':
        if (recovery.kind !== 'capacity') return
        if (action.choice === 'edit') {
          openSetup({ dialog: 'tables' })
          return
        }
        setRecovery({ ...recovery, choice: action.choice })
        announce('Capacity resolved. Every founder now has a seat.')
        return
      case 'remove-rule':
        if (recovery.kind !== 'conflict') return
        setRecovery({ ...recovery, removedRuleId: action.ruleId })
        announce('Rule conflict resolved. Generate Tables is available.')
        return
      case 'edit-rule': {
        const rule = rules.find((item) => item.id === action.ruleId)
        openSetup(rule ? { dialog: 'rule', ruleText: rule.text, editingRuleId: rule.id } : { dialog: null })
        return
      }
      case 'provider':
        if (recovery.kind !== 'provider' || !ai) return
        if (action.choice === 'review') {
          ai.openProviderSettings?.()
          setRecovery({ ...recovery, choice: 'review' })
          announce(`Opening ${recovery.provider} provider settings`)
          return
        }
        if (action.choice === 'basic') {
          setAiOn(false)
          setAiIssue(false)
          setRecovery({ ...recovery, choice: 'basic' })
          announce('AI is off for this dinner. Generate Tables is available.')
          return
        }
        if (!recovery.alternateProvider) return
        setProvider(recovery.alternateProvider)
        setAiOn(true)
        setAiIssue(false)
        setRecovery({ ...recovery, choice: 'switch' })
        announce(`Switched to ${recovery.alternateProvider}. Generate Tables is available.`)
        return
      case 'show-candidates':
        if (recovery.kind !== 'missing') return
        setRecovery({ ...recovery, candidatesShown: true })
        return
      case 'replace': {
        if (recovery.kind !== 'missing') return
        const founder = foundersById.get(action.founderId)
        setRecovery({ ...recovery, choice: { kind: 'replace', founderId: action.founderId } })
        announce(
          `${founder?.name ?? 'Replacement'} staged for the missing seat. ${recovery.missing.length > 1 ? 'Next missing seat' : 'Open recovered dinner'} is available.`,
        )
        return
      }
      case 'open-short':
        if (recovery.kind !== 'missing') return
        setRecovery({ ...recovery, choice: { kind: 'short' } })
        announce(
          recovery.missing.length > 1
            ? 'Missing seat will be removed. Next missing seat is available.'
            : 'Missing seat will be removed and tables rebalanced. Open recovered dinner is available.',
        )
        return
      case 'leave':
        navigate('/v2/seating-plans')
        return
    }
  }

  function requestWithLocks(lockSet: ReadonlySet<number> = locked): DinnerRequest | null {
    if (!baseRequest || !solution) return null
    return { ...baseRequest, locks: locksForTables(solution, lockSet) }
  }

  function updateResultCriteria(nextCriteria: readonly CriterionDraft[]) {
    if (!solution || frozen) return
    const built = buildDinnerRequest({
      founders: solutionFounders,
      tableCount: solution.tables.length,
      criteria: nextCriteria,
      rules,
    })
    if (!('request' in built)) {
      announce('Criteria update blocked · current hard rules are inconsistent')
      return
    }
    const request = {
      ...built.request,
      locks: locksForTables(solution, locked),
    }
    void runAction(
      () => engine.evaluate(request, assignmentOf(solution)),
      (next) => {
        setCriteria(nextCriteria)
        setBaseRequest(built.request)
        setSolution(next)
        setRecommendations(NO_RECOMMENDATIONS)
        announce('Matching criteria updated · current arrangement rescored')
      },
      (error) => announce(`Criteria update blocked · ${errorMessage(error)}`),
    )
  }

  async function runAction<T>(work: () => Promise<T>, onDone: (value: T) => void, onError: (error: unknown) => void) {
    const run = ++actionRef.current
    setBusy(true)
    try {
      const value = await work()
      if (run === actionRef.current) onDone(value)
    } catch (error) {
      if (run === actionRef.current) onError(error)
    } finally {
      if (run === actionRef.current) setBusy(false)
    }
  }

  function tableOf(founderId: string) {
    return solution?.tables.find((table) => table.founderIds.includes(founderId))?.index ?? -1
  }

  function nameOf(founderId: string) {
    return foundersById.get(founderId)?.name ?? founderId
  }

  function swapFounders(left: string, right: string) {
    if (!solution || frozen) return
    const blocked = [tableOf(left), tableOf(right)].find((index) => locked.has(index))
    if (blocked !== undefined) {
      announce(`Swap blocked · Table ${tableNumber(blocked)} is locked`)
      return
    }
    const request = requestWithLocks()
    if (!request) return
    void runAction(
      () => engine.evaluate(request, swapAssignment(assignmentOf(solution), left, right)),
      (next) => {
        setSolution(next)
        announce(`Swapped ${nameOf(left)} with ${nameOf(right)}`)
      },
      (error) => announce(`Swap blocked · ${errorMessage(error)}`),
    )
  }

  function toggleLock(index: number) {
    if (frozen) return
    const next = new Set(locked)
    const isLocked = next.has(index)
    if (isLocked) next.delete(index)
    else next.add(index)
    setLocked(next)
    announce(`Table ${tableNumber(index)} ${isLocked ? 'unlocked' : 'locked'}`)
  }

  function applyRecommendation(kind: RecommendationKind, target: { founderId?: string; tableIndex?: number }) {
    if (!solution || frozen) return
    if (kind === 'lock') {
      if (target.tableIndex === undefined) return
      if (!locked.has(target.tableIndex)) toggleLock(target.tableIndex)
      setRecommendations((previous) => ({ ...previous, lock: 'applied' }))
      return
    }
    const request = requestWithLocks()
    if (!request) return
    const mark = (state: RecommendationState) => setRecommendations((previous) => ({ ...previous, [kind]: state }))
    if (kind === 'swap' && target.founderId) {
      const founderId = target.founderId
      void runAction(
        () => engine.improveFounder(request, solution, founderId),
        (next) => {
          if (!next) {
            mark('unavailable')
            announce(`No improving swap found for ${nameOf(founderId)}`)
            return
          }
          setSolution(next)
          mark('applied')
          const moved = next.tables.find((table) => table.founderIds.includes(founderId))
          announce(`Recommendation applied · ${nameOf(founderId)} now sits at Table ${tableNumber(moved?.index ?? 0)}`)
        },
        (error) => {
          mark('unavailable')
          announce(`Recommendation blocked · ${errorMessage(error)}`)
        },
      )
      return
    }
    if (kind === 'rebalance' && target.tableIndex !== undefined) {
      const tableIndex = target.tableIndex
      void runAction(
        () => engine.rebalanceTable(request, solution, tableIndex),
        (next) => {
          if (!next) {
            mark('unavailable')
            announce(`No rebalancing swap found for Table ${tableNumber(tableIndex)}`)
            return
          }
          setSolution(next)
          mark('applied')
          announce(`Recommendation applied · Table ${tableNumber(tableIndex)} rebalanced`)
        },
        (error) => {
          mark('unavailable')
          announce(`Recommendation blocked · ${errorMessage(error)}`)
        },
      )
    }
  }

  function reoptimize() {
    if (frozen) return
    const request = requestWithLocks()
    if (!request || !solution) return
    const lockedCount = locked.size
    const open = solution.tables.length - lockedCount
    void runAction(
      () => engine.optimize(request),
      (next) => {
        setSolution(next)
        setRecommendations(NO_RECOMMENDATIONS)
        announce(`Re-optimized ${open} unlocked ${open === 1 ? 'table' : 'tables'} · ${lockedCount} locked`)
      },
      (error) => announce(`Re-optimize blocked · ${errorMessage(error)}`),
    )
  }

  function generateAlternatives() {
    if (frozen) return
    const request = requestWithLocks()
    if (!request || !solution) return
    void runAction(
      () => engine.alternatives(request, solution),
      (list) => {
        if (!list.length) {
          announce('No distinct alternatives found for this setup')
          return
        }
        setAlternatives({ list, selected: 0, confirmed: false })
        setMode('alternatives')
        announce(`${list.length} alternatives ready to compare with the current solution`)
      },
      (error) => announce(`Alternatives blocked · ${errorMessage(error)}`),
    )
  }

  function returnFromAlternatives() {
    if (!alternatives) return
    const chosen = alternatives.selected > 0 ? alternatives.list[alternatives.selected - 1] : undefined
    if (chosen) {
      setSolution(chosen)
      setRecommendations(NO_RECOMMENDATIONS)
      announce(`Applied alternative ${alternatives.selected} to the seating plan`)
    } else {
      announce('Kept the current solution')
    }
    setAlternatives(null)
    setMode('results')
  }

  async function save() {
    if (!onSave || !solution || !cohort || !tables || frozen) return
    setSaving(true)
    try {
      const result = await onSave({
        ...(planId ? { id: planId } : {}),
        name: planName,
        brief,
        cohort,
        tables,
        criteria,
        rules,
        assignment: assignmentOf(solution),
        lockedTables: [...locked].sort((left, right) => left - right),
        threshold,
      })
      setSavedVersion(result.version)
      if (result.id) setPlanId(result.id)
      announce(`Saved ${planName} as version ${result.version}`)
    } catch (error) {
      announce(`Save failed · ${errorMessage(error)}`)
    } finally {
      setSaving(false)
    }
  }

  async function saveDraft() {
    if (!onSaveDraft) return
    try {
      await onSaveDraft({ ...(planId ? { id: planId } : {}), name: planName, brief, cohort, tables, criteria, rules })
      announce(`Draft of ${planName || 'this seating plan'} saved`)
    } catch (error) {
      announce(`Draft save failed · ${errorMessage(error)}`)
    }
  }

  async function runExport() {
    if (!solution || !exportState) return
    const run = ++exportRef.current
    const file: DinnerExportFile = {
      filename: dinnerExportFilename(planName, now()),
      content: buildDinnerCsv(solution, foundersById, { includeDetails: exportState.includeDetails }),
    }
    setExportState({ ...exportState, stage: 'progress', file: null })
    try {
      const prepared = prepareExport ? await prepareExport(file) : file
      if (run !== exportRef.current) return
      const ready = prepared ?? file
      setExportState((previous) => (previous ? { ...previous, stage: 'success', file: ready } : previous))
      announce(`CSV export ready · ${ready.filename}`)
    } catch (error) {
      if (run !== exportRef.current) return
      setExportState((previous) => (previous ? { ...previous, stage: 'failure', file: null } : previous))
      announce(`CSV export failed · ${errorMessage(error)}`)
    }
  }

  function cancelExport() {
    exportRef.current += 1
    setExportState((previous) => (previous ? { ...previous, stage: 'options', file: null } : previous))
    announce('Export cancelled. No file was created.')
  }

  function closeExport() {
    exportRef.current += 1
    setExportState(null)
  }

  function changeThreshold(value: number) {
    if (!frozen) setThreshold(value)
  }

  function editSetup() {
    if (!frozen) openSetup()
  }

  function openExport() {
    if (!frozen && solution) setExportState({ stage: 'options', includeDetails: true, file: null })
  }

  function changeRole(next: AccountRole) {
    setRole(next)
    writeAccountRole(browserLocalStorage(), next)
  }

  const restricted = role !== 'admin'
  const frameMode = restricted ? 'restricted' : mode
  const actionsDisabled = frozen || !solution
  const savedLabel = savedVersion !== null ? <span>Saved version {savedVersion}</span> : null

  let footerActions: ReactNode = undefined
  if (!restricted && mode === 'results') {
    footerActions = (
      <>
        {savedLabel}
        <button type="button" className="v2-footer-secondary-dark" disabled={actionsDisabled} onClick={reoptimize}>
          Re-optimize Remaining
        </button>
        <button type="button" disabled={actionsDisabled} onClick={generateAlternatives}>
          Generate 2 Alternatives
        </button>
        <button type="button" disabled={actionsDisabled} onClick={openExport}>
          Export
        </button>
        <button type="button" className="v2-footer-primary" disabled={actionsDisabled || !onSave} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </>
    )
  } else if (!restricted && mode === 'recovery' && recovery) {
    footerActions = (
      <>
        <button type="button" disabled={!onSaveDraft} onClick={() => void saveDraft()}>
          Save draft
        </button>
        <button type="button" onClick={() => openSetup()}>
          Back to setup
        </button>
        <button
          type="button"
          className="v2-footer-primary"
          disabled={!recoveryResolved(recovery) || generating}
          onClick={resumeFromRecovery}
        >
          {generating
            ? 'Generating…'
            : recovery.kind === 'missing'
              ? recovery.missing.length > 1
                ? 'Next missing seat →'
                : 'Open recovered dinner →'
              : 'Generate Tables →'}
        </button>
      </>
    )
  } else if (!restricted && mode === 'alternatives' && savedLabel) {
    footerActions = savedLabel
  }

  const aiStatus = !ai
    ? undefined
    : aiIssue
      ? `⚠ AI Connection Issue · ${provider}`
      : aiOn
        ? `✓ AI Enabled · ${provider}`
        : 'AI Off · Database-only matching'
  const aiTone = !ai ? undefined : aiIssue ? 'issue' : aiOn ? 'enabled' : 'off'

  const recoveryContext: RecoveryContext = {
    founders,
    foundersById,
    cohortFounders,
    tables,
    brief,
    criteria,
    rules,
    canReviewProvider: Boolean(ai?.openProviderSettings),
  }

  return (
    <div className="v2-shell v2-dinner-shell">
      <V2Header active="seating-plans" role={role} currentFounder={currentFounder} onRoleChange={changeRole} />
      <main className="v2-dinner-main">
        <div ref={frameRef} className="v2-dinner-frame" data-mode={frameMode}>
          {restricted && (
            <section className="v2-dinner-restricted" aria-labelledby="dinner-restricted-title">
              <span className="v2-dinner-eyebrow">Seating plans</span>
              <h1 id="dinner-restricted-title">Dinner matching is for YC admins.</h1>
              <p>Founder accounts can search the Founder Index and export results. Switch to a YC Admin account to build seating plans.</p>
              <a href="/v2/search">Open Founder Index →</a>
            </section>
          )}
          {!restricted && mode === 'setup' && (
            <DinnerSetup
              key={setupSeed.key}
              founders={founders}
              foundersById={foundersById}
              planName={planName}
              onPlanNameChange={whileIdle(setPlanName)}
              cohort={cohort}
              onCohortChange={whileIdle(setCohort)}
              tables={tables}
              onTablesChange={whileIdle(setTables)}
              brief={brief}
              onBriefChange={whileIdle(setBrief)}
              criteria={criteria}
              onCriteriaChange={whileIdle(setCriteria)}
              rules={rules}
              onRulesChange={whileIdle(setRules)}
              handoff={handoff}
              savedCohorts={savedCohorts}
              generating={generating}
              onGenerate={generateFromSetup}
              initialDialog={setupSeed.dialog}
              {...(setupSeed.ruleText === undefined ? {} : { initialRuleText: setupSeed.ruleText })}
              {...(setupSeed.editingRuleId === undefined ? {} : { editingRuleId: setupSeed.editingRuleId })}
            />
          )}
          {!restricted && mode === 'recovery' && recovery && (
            <DinnerRecovery state={recovery} context={recoveryContext} onAction={handleRecoveryAction} busy={generating} />
          )}
          {!restricted && mode === 'results' && view && (
            <>
              <DinnerSetupRail
                founderCount={solutionFounders.length}
                tableCount={view.tableCount}
                seatLabel={seatLabel}
                brief={brief}
                criteria={criteria}
                rules={rules}
                editDisabled={frozen}
                onCriteriaChange={updateResultCriteria}
                onEditSetup={editSetup}
              />
              <DinnerTables
                planName={planName}
                view={view}
                threshold={threshold}
                onThresholdChange={changeThreshold}
                workspace={workspace}
                onWorkspaceChange={setWorkspace}
                density={density}
                onDensityChange={setDensity}
                focusIndex={Math.min(focusIndex, view.tables.length - 1)}
                onFocusTable={setFocusIndex}
                locked={locked}
                busy={frozen}
                onToggleLock={toggleLock}
                analysis={
                  workspace === 'analysis' ? (
                    <DinnerAnalysis
                      view={view}
                      objectives={objectives}
                      locked={locked}
                      busy={frozen}
                      recommendations={recommendations}
                      onRecommendation={applyRecommendation}
                      onSwap={swapFounders}
                    />
                  ) : null
                }
              />
            </>
          )}
          {!restricted && mode === 'alternatives' && solution && alternatives && (
            <DinnerAlternatives
              base={solution}
              alternatives={alternatives.list}
              founders={solutionFounders}
              foundersById={foundersById}
              threshold={threshold}
              cohortLabel={founderCountLabel(solutionFounders.length)}
              shapeLabel={`${solution.tables.length} × ${seatLabel}`}
              criteria={criteria}
              rules={rules}
              lockedCount={locked.size}
              selected={alternatives.selected}
              confirmed={alternatives.confirmed}
              onSelect={(selected) => setAlternatives({ ...alternatives, selected })}
              onConfirm={() => setAlternatives({ ...alternatives, confirmed: true })}
              onCompareAgain={() => setAlternatives({ ...alternatives, confirmed: false })}
              onCancel={() => {
                setAlternatives(null)
                setMode('results')
                announce('Alternatives closed · current solution unchanged')
              }}
              onReturn={returnFromAlternatives}
            />
          )}
        </div>
        {!restricted && mode === 'results' && exportState && (
          <DinnerExportDialog
            planName={planName}
            founderCount={solutionFounders.length}
            dimensions={criteria.map((criterion) => criterion.label).join(' · ')}
            includeDetails={exportState.includeDetails}
            stage={exportState.stage}
            file={exportState.file}
            onIncludeDetailsChange={(includeDetails) => setExportState({ ...exportState, includeDetails })}
            onExport={() => void runExport()}
            onCancelExport={cancelExport}
            onReview={() => setExportState({ ...exportState, stage: 'options', file: null })}
            onDownload={() => {
              if (!exportState.file) return
              download(exportState.file)
              announce(`Downloaded ${exportState.file.filename}`)
            }}
            onClose={closeExport}
          />
        )}
      </main>
      <V2Footer role={role} aiStatus={aiStatus} aiTone={aiTone} actions={footerActions} />
      <div data-testid="dinner-live-region" className="v2-visually-hidden" role="status" aria-live="polite">
        {message}
      </div>
    </div>
  )
}
