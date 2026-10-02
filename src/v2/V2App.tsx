import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'

import {
  DinnerCriteriaSetSchema,
} from '../shared/contracts'
import {
  DinnerStateSchema,
  type DinnerState,
  type DinnerSummary,
  type DinnerVersionSummary,
  type SavedDinner,
} from '../shared/dinnerContracts'
import { normalizeFounders, type Founder } from '../shared/founder'
import { FOUNDER_SCHEMA } from '../shared/schemaRegistry'
import type { ProviderCredentialList } from '../shared/providerContracts'
import {
  fetchDinner,
  fetchDinnerSummaries,
  fetchDinnerVersions,
  fetchFounderEvidence,
  fetchFounders,
  fetchProviderCredentials,
  interpretDinnerCriteria,
  saveDinner,
} from './api'
import { readDemoMode } from './demoMode'
import {
  defaultDinnerEngine,
  type DinnerAssignment,
} from './dinner/dinnerEngine'
import {
  readPlanRequest,
  matchDinnerRoute,
} from './dinner/dinnerRoutes'
import {
  buildDinnerRequest,
  locksForTables,
  type CriterionDraft,
  type RuleDraft,
} from './dinner/dinnerState'
import type {
  DinnerInitialPlan,
  DinnerPlanSnapshot,
} from './dinner/DinnerPage'
import type {
  SeatingPlanSummary,
  SeatingPlanVersion,
} from './dinner/SeatingPlansPage'
import type { HardRule, HardRuleInput } from './dinner/rules'
import type { FounderEvidenceData } from './evidence/FounderEvidencePage'
import { SearchPage } from './search/SearchPage'

const DinnerPage = lazy(() =>
  import('./dinner/DinnerPage').then((module) => ({
    default: module.DinnerPage,
  })),
)
const SeatingPlansPage = lazy(() =>
  import('./dinner/SeatingPlansPage').then((module) => ({
    default: module.SeatingPlansPage,
  })),
)
const AiProviderPage = lazy(() =>
  import('./settings/AiProviderPage').then((module) => ({
    default: module.AiProviderPage,
  })),
)
const FounderEvidencePage = lazy(() =>
  import('./evidence/FounderEvidencePage').then((module) => ({
    default: module.FounderEvidencePage,
  })),
)

interface DemoSnapshot {
  formatVersion: 1
  name: string
  note: string
  state: DinnerState
  founderDirectory: Array<{
    id: string
    name: string
    company: string
    role: string
  }>
}

interface DemoVersion {
  id: string
  configurationId: string
  version: number
  snapshot: DemoSnapshot
  createdAt: string
}

interface DemoConfiguration {
  id: string
  name: string
  founderIds: string[]
  createdAt: string
  updatedAt: string
}

interface DemoPlans {
  configurations: DemoConfiguration[]
  versions: DemoVersion[]
}

interface DemoEvidenceRecord {
  founderId: string
  state: FounderEvidenceData['status']
  run: {
    results: FounderEvidenceData['items']
  }
}

interface DemoEvidenceFile {
  records: DemoEvidenceRecord[]
}

const fieldLabels = new Map(
  FOUNDER_SCHEMA.map((field) => [field.key, field.label]),
)

function ruleInput(rule: HardRule): HardRuleInput {
  switch (rule.type) {
    case 'must-sit-together':
    case 'cannot-sit-together':
      return {
        id: rule.id,
        type: rule.type,
        founders: rule.founderIds.map((id) => ({ id })),
      }
    case 'pinned-table':
      return {
        id: rule.id,
        type: rule.type,
        founder: { id: rule.founderId },
        tableIndex: rule.tableIndex,
      }
    case 'pinned-seat':
      return {
        id: rule.id,
        type: rule.type,
        founder: { id: rule.founderId },
        tableIndex: rule.tableIndex,
        seatIndex: rule.seatIndex,
      }
    default:
      return { ...rule }
  }
}

function ruleText(rule: HardRule) {
  switch (rule.type) {
    case 'same-company-separation':
      return 'Separate founders from the same company'
    case 'must-sit-together':
      return 'Keep selected founders together'
    case 'cannot-sit-together':
      return 'Keep selected founders at different tables'
    case 'field-count':
      return `${fieldLabels.get(rule.field) ?? rule.field} count per table`
    case 'fixed-table-size':
      return `${rule.size} founders per table`
    case 'pinned-table':
      return `Keep selected founder at Table ${rule.tableIndex + 1}`
    case 'pinned-seat':
      return `Keep selected founder in a fixed seat`
  }
}

function criterionDrafts(state: DinnerState): CriterionDraft[] {
  return state.criteria.criteria.map((criterion) => ({
    field: criterion.field,
    label: fieldLabels.get(criterion.field) ?? criterion.field,
    description:
      criterion.objective === 'similarity'
        ? 'Shared context'
        : 'Broader mix',
    objective: criterion.objective,
    weight: criterion.weightLevel,
  }))
}

function interpretedCriteria(
  value: unknown,
): CriterionDraft[] | null {
  const parsed = DinnerCriteriaSetSchema.safeParse(value)
  if (!parsed.success) return null
  return parsed.data.criteria
    .filter((criterion) => criterion.enabled)
    .map((criterion) => ({
      field: criterion.field,
      label: fieldLabels.get(criterion.field) ?? criterion.field,
      description:
        criterion.objective === 'similar'
          ? 'Shared context'
          : 'Broader mix',
      objective:
        criterion.objective === 'similar'
          ? 'similarity' as const
          : 'diversity' as const,
      weight:
        criterion.weight === 'low'
          ? 'L' as const
          : criterion.weight === 'medium'
            ? 'M' as const
            : 'H' as const,
    }))
}

function ruleDrafts(state: DinnerState): RuleDraft[] {
  return state.rules.map((rule) => ({
    id: rule.id,
    text: ruleText(rule),
    input: ruleInput(rule),
  }))
}

function toInitialPlan(dinner: SavedDinner): DinnerInitialPlan {
  const state = DinnerStateSchema.parse(dinner.state)
  const capacities = state.assignments.map((table) => table.capacity)
  return {
    id: dinner.id,
    name: dinner.name,
    version: dinner.version,
    brief: state.brief ?? '',
    cohort: {
      id: `saved-${dinner.id}`,
      label: `${state.cohort.founderIds.length} founders`,
      hint: `Saved plan · version ${dinner.version}`,
      source: 'saved',
      founderIds: state.cohort.founderIds,
    },
    tables: {
      tableCount: state.tableCount ?? state.assignments.length,
      targetSeats: capacities.length ? Math.max(...capacities) : 8,
    },
    criteria: criterionDrafts(state),
    rules: ruleDrafts(state),
    assignment: state.assignments.map((table) => table.founderIds),
    lockedTables: [...new Set(state.locks.map((lock) => lock.tableIndex))],
    threshold: state.threshold,
    savedFounders: dinner.recovery.missingFounders.map((founder) => ({
      id: founder.founderId,
      name: founder.name ?? 'Missing founder',
      company: founder.company ?? '',
      role: founder.role ?? '',
    })),
  }
}

async function dinnerState(
  plan: DinnerPlanSnapshot,
  founders: readonly Founder[],
): Promise<DinnerState> {
  const byId = new Map(founders.map((founder) => [founder.id, founder]))
  const cohortFounders = plan.cohort.founderIds
    .map((id) => byId.get(id))
    .filter((founder): founder is Founder => founder !== undefined)
  const built = buildDinnerRequest({
    founders: cohortFounders,
    tableCount: plan.tables.tableCount,
    criteria: plan.criteria,
    rules: plan.rules,
  })
  if ('conflicts' in built) {
    throw new Error('The current plan contains conflicting rules')
  }
  const evaluated = await defaultDinnerEngine.evaluate(
    built.request,
    plan.assignment as DinnerAssignment,
  )
  return DinnerStateSchema.parse({
    cohort: {
      source: plan.cohort.source === 'search' ? 'search' : 'direct',
      founderIds: plan.cohort.founderIds,
    },
    brief: plan.brief,
    tableCount: plan.tables.tableCount,
    criteria: evaluated.criteria,
    rules: evaluated.rules,
    locks: locksForTables(evaluated, new Set(plan.lockedTables)),
    assignments: evaluated.tables,
    metrics: evaluated.metrics,
    alternatives: [],
    chosenAlternativeId: null,
    threshold: plan.threshold,
    notes: [],
  })
}

function summaryStatus(status: DinnerSummary['status']) {
  if (status === 'needs_attention') return 'warning' as const
  return status
}

function versionRows(
  versions: readonly DinnerVersionSummary[],
): SeatingPlanVersion[] {
  return versions.map((version) => ({
    version: version.version,
    title: version.name,
    detail:
      version.note ??
      `${version.founderCount} founders · ${version.tableCount ?? 0} tables`,
    savedAt: version.savedAt,
    savedBy: 'YC Admin',
  }))
}

function planSummary(
  summary: DinnerSummary,
  versions: readonly DinnerVersionSummary[],
): SeatingPlanSummary {
  const latest = versions.find(
    (version) => version.version === summary.latestVersion,
  )
  return {
    id: summary.id,
    name: summary.name,
    description:
      latest?.note ??
      `${summary.founderCount} founders across ${summary.tableCount ?? 0} tables`,
    status: summaryStatus(summary.status),
    founderCount: summary.founderCount,
    tableCount: summary.tableCount ?? 0,
    seatsPerTable:
      summary.tableCount && summary.founderCount
        ? Math.ceil(summary.founderCount / summary.tableCount)
        : 0,
    needsReview: summary.missingFounderCount || undefined,
    version: summary.latestVersion,
    updatedAt: summary.updatedAt,
    updatedBy: 'YC Admin',
    versions: versionRows(versions),
  }
}

function demoSavedDinner(
  demoPlans: DemoPlans,
  planId: string,
  version: number | null,
) {
  const configuration = demoPlans.configurations.find(
    (item) => item.id === planId,
  )
  const candidates = demoPlans.versions.filter(
    (item) => item.configurationId === planId,
  )
  const selected = version
    ? candidates.find((item) => item.version === version)
    : candidates.at(-1)
  if (!configuration || !selected) throw new Error('Demo plan not found')
  const state = DinnerStateSchema.parse(selected.snapshot.state)
  return {
    id: configuration.id,
    name: selected.snapshot.name,
    note: selected.snapshot.note,
    version: selected.version,
    versionId: selected.id,
    latestVersion: candidates.length,
    status: 'ready',
    createdAt: configuration.createdAt,
    updatedAt: configuration.updatedAt,
    savedAt: selected.createdAt,
    state,
    recovery: {
      status: 'complete',
      savedFounderCount: state.cohort.founderIds.length,
      restoredFounderCount: state.cohort.founderIds.length,
      missingFounders: [],
    },
  } satisfies SavedDinner
}

function demoSummaries(demoPlans: DemoPlans): SeatingPlanSummary[] {
  return demoPlans.configurations.map((configuration) => {
    const versions = demoPlans.versions.filter(
      (item) => item.configurationId === configuration.id,
    )
    const latest = versions.at(-1)!
    return {
      id: configuration.id,
      name: configuration.name,
      description:
        latest.snapshot.note ||
        `${configuration.founderIds.length} synthetic founders`,
      status: 'ready',
      founderCount: configuration.founderIds.length,
      tableCount: latest.snapshot.state.tableCount ?? 0,
      seatsPerTable: Math.max(
        ...latest.snapshot.state.assignments.map((table) => table.capacity),
      ),
      version: latest.version,
      updatedAt: configuration.updatedAt,
      updatedBy: 'Demo mode',
      versions: versions.map((item) => ({
        version: item.version,
        title: item.snapshot.name,
        detail: item.snapshot.note,
        savedAt: item.createdAt,
        savedBy: 'Demo mode',
      })),
    }
  })
}

export interface V2AppProps {
  readonly pathname?: string
  readonly search?: string
  readonly initialFounders?: readonly Founder[]
  readonly initialPlans?: readonly SeatingPlanSummary[]
  readonly initialCredentials?: ProviderCredentialList
  readonly initialEvidence?: FounderEvidenceData
}

export function V2App({
  pathname = window.location.pathname,
  search = window.location.search,
  initialFounders,
  initialPlans,
  initialCredentials,
  initialEvidence,
}: V2AppProps = {}) {
  const dinnerRoute = matchDinnerRoute(pathname)
  const settingsRoute =
    pathname.replace(/\/+$/, '') === '/v2/settings/ai'
  const evidenceMatch = pathname.match(/^\/v2\/founders\/([^/]+)\/evidence\/?$/)
  const evidenceFounderId = evidenceMatch
    ? decodeURIComponent(evidenceMatch[1]!)
    : null
  const demoMode = readDemoMode()
  const [founders, setFounders] = useState<readonly Founder[] | null>(
    initialFounders ?? null,
  )
  const [plans, setPlans] = useState<readonly SeatingPlanSummary[] | null>(
    initialPlans ?? null,
  )
  const [demoPlans, setDemoPlans] = useState<DemoPlans | null>(null)
  const [credentials, setCredentials] =
    useState<ProviderCredentialList | null>(
      initialCredentials ??
      (demoMode
        ? {
            masterKeyConfigured: true,
            providers: (['openai', 'anthropic', 'xai'] as const).map(
              (provider) => ({
                provider,
                label:
                  provider === 'openai'
                    ? 'OpenAI'
                    : provider === 'anthropic'
                      ? 'Anthropic'
                      : 'xAI',
                status:
                  provider === 'anthropic'
                    ? 'valid' as const
                    : 'not_configured' as const,
                lastFour: provider === 'anthropic' ? 'DEMO' : null,
                validatedAt:
                  provider === 'anthropic'
                    ? '2026-10-01T20:00:00.000Z'
                    : null,
              }),
            ),
          }
        : null),
    )
  const [initialPlan, setInitialPlan] = useState<DinnerInitialPlan | null>(null)
  const [evidence, setEvidence] = useState<FounderEvidenceData | null>(
    initialEvidence ?? null,
  )
  const [credentialStatusError, setCredentialStatusError] = useState(false)
  const [error, setError] = useState('')
  const savedPlanId = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (initialFounders) return
    let active = true
    const request = demoMode
      ? Promise.all([
          import('../fixtures/demo/founders.json'),
          import('../fixtures/demo/seating-plans.json'),
        ]).then(([founderModule, planModule]) => {
          const loadedPlans = planModule.default as unknown as DemoPlans
          return {
            founders: normalizeFounders(founderModule.default),
            plans: loadedPlans,
          }
        })
      : fetchFounders().then((items) => ({
          founders: items,
          plans: null,
        }))
    void request
      .then((loaded) => {
        if (!active) return
        setFounders(loaded.founders)
        if (loaded.plans) {
          setDemoPlans(loaded.plans)
          setPlans(demoSummaries(loaded.plans))
        }
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : 'Founder data failed to load')
      })
    return () => {
      active = false
    }
  }, [demoMode, initialFounders])

  useEffect(() => {
    if (
      dinnerRoute !== 'seating-plans' ||
      demoMode ||
      initialPlans
    ) return
    let active = true
    void fetchDinnerSummaries()
      .then(async (summaries) => {
        const rows = await Promise.all(
          summaries.map(async (summary) =>
            planSummary(summary, await fetchDinnerVersions(summary.id)),
          ),
        )
        if (active) setPlans(rows)
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : 'Seating plans failed to load')
      })
    return () => {
      active = false
    }
  }, [demoMode, dinnerRoute, initialPlans])

  useEffect(() => {
    if (demoMode || initialCredentials) return
    let active = true
    void fetchProviderCredentials()
      .then((result) => {
        if (active) {
          setCredentials(result)
          setCredentialStatusError(false)
        }
      })
      .catch((caught: unknown) => {
        if (active) {
          setCredentialStatusError(true)
          if (settingsRoute) {
            setError(
              caught instanceof Error
                ? caught.message
                : 'AI provider status failed to load',
            )
          }
        }
      })
    return () => {
      active = false
    }
  }, [demoMode, initialCredentials, settingsRoute])

  const configuredProvider = credentials?.providers.find(
    (provider) => provider.status === 'valid',
  )
  const aiStatus = credentialStatusError
    ? '⚠ AI Connection Issue'
    : configuredProvider
      ? `✓ AI Enabled · ${configuredProvider.label}`
      : '+ AI Disabled'
  const aiTone = credentialStatusError
    ? 'issue' as const
    : configuredProvider
      ? 'enabled' as const
      : 'off' as const
  const dinnerAi = configuredProvider
    ? {
        provider: configuredProvider.label,
        interpretBrief: async (request: {
          brief: string
          criteria: readonly CriterionDraft[]
        }) => {
          if (demoMode) return request.criteria
          const result = await interpretDinnerCriteria(
            configuredProvider.provider,
            request.brief,
          )
          return result.status === 'interpreted'
            ? interpretedCriteria(result.value)
            : null
        },
        openProviderSettings: () =>
          window.location.assign('/v2/settings/ai'),
      }
    : undefined

  useEffect(() => {
    if (!evidenceFounderId || initialEvidence) return
    let active = true
    const request = demoMode
      ? import('../fixtures/demo/web-evidence.json').then((module) => {
          const file = module.default as unknown as DemoEvidenceFile
          const record = file.records.find(
            (item) => item.founderId === evidenceFounderId,
          )
          if (!record) throw new Error('Founder evidence was not found')
          return {
            status: record.state,
            items: record.run.results,
          } satisfies FounderEvidenceData
        })
      : fetchFounderEvidence(evidenceFounderId)
    void request
      .then((result) => {
        if (active) setEvidence(result)
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(
            caught instanceof Error
              ? caught.message
              : 'Founder evidence failed to load',
          )
        }
      })
    return () => {
      active = false
    }
  }, [demoMode, evidenceFounderId, initialEvidence])

  const planRequest = useMemo(() => readPlanRequest(search), [search])
  useEffect(() => {
    if (
      dinnerRoute !== 'dinner' ||
      !planRequest ||
      (demoMode && !demoPlans)
    ) return
    let active = true
    const request = demoMode && demoPlans
      ? Promise.resolve(
          demoSavedDinner(
            demoPlans,
            planRequest.planId,
            planRequest.version,
          ),
        )
      : fetchDinner(planRequest.planId, planRequest.version)
    void request
      .then((dinner) => {
        if (!active) return
        savedPlanId.current = dinner.id
        setInitialPlan(toInitialPlan(dinner))
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : 'Saved plan failed to load')
      })
    return () => {
      active = false
    }
  }, [demoMode, demoPlans, dinnerRoute, planRequest])

  if (error) {
    return (
      <main className="v2-runtime-state">
        <h1>Founder app could not load.</h1>
        <p>{error}</p>
      </main>
    )
  }
  if (
    !founders ||
    (dinnerRoute === 'seating-plans' && !plans) ||
    (settingsRoute && !credentials) ||
    (evidenceFounderId && !evidence)
  ) {
    return (
      <main className="v2-runtime-state" aria-busy="true">
        <h1>Loading founder workspace…</h1>
      </main>
    )
  }

  if (dinnerRoute === 'dinner') {
    if (planRequest && !initialPlan) {
      return (
        <main className="v2-runtime-state" aria-busy="true">
          <h1>Opening seating plan…</h1>
        </main>
      )
    }
    return (
      <Suspense fallback={null}>
        <DinnerPage
          founders={founders}
          search={search}
          ai={dinnerAi}
          initialPlan={initialPlan ?? undefined}
          onSave={async (plan) => {
            if (demoMode) {
              return {
                id: plan.id ?? savedPlanId.current ?? 'demo-session-plan',
                version: (initialPlan?.version ?? 0) + 1,
              }
            }
            const state = await dinnerState(plan, founders)
            const saved = await saveDinner(plan.id, {
              name: plan.name,
              note: plan.brief,
              state,
            })
            savedPlanId.current = saved.id
            return { id: saved.id, version: saved.version }
          }}
        />
      </Suspense>
    )
  }

  if (dinnerRoute === 'seating-plans') {
    return (
      <Suspense fallback={null}>
        <SeatingPlansPage
          plans={plans ?? []}
          founders={founders}
          aiStatus={aiStatus}
          aiTone={aiTone}
        />
      </Suspense>
    )
  }

  if (settingsRoute) {
    return (
      <Suspense fallback={null}>
        <AiProviderPage
          founders={founders}
          credentials={credentials!}
          demoMode={demoMode}
        />
      </Suspense>
    )
  }

  if (evidenceFounderId) {
    const founder = founders.find((item) => item.id === evidenceFounderId)
    if (!founder) {
      return (
        <main className="v2-runtime-state">
          <h1>Founder evidence was not found.</h1>
        </main>
      )
    }
    return (
      <Suspense fallback={null}>
        <FounderEvidencePage
          founder={founder}
          evidence={evidence!}
          aiStatus={aiStatus}
          aiTone={aiTone}
        />
      </Suspense>
    )
  }

  return (
    <SearchPage
      founders={founders}
      aiStatus={aiStatus}
      aiTone={aiTone}
    />
  )
}
