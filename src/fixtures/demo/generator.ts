import type {
  Criterion,
  DinnerAlternative,
  DinnerLock,
  DinnerMetrics,
  DinnerNote,
  DinnerState,
  DinnerTable,
  HardRule,
} from '../../shared/dinnerContracts.js'
import type { RawFounder } from '../../shared/founder.js'

const FIXTURE_VERSION = 1
const FIXTURE_SEED = 'founder-demo-fixtures-v1'
const GENERATED_AT = '2026-10-01T20:00:00.000Z'
const FRESH_EVIDENCE_STALE_AFTER = '2099-12-31T00:00:00.000Z'

export const DEMO_FIXTURE_FILE_NAMES = [
  'manifest.json',
  'founders.json',
  'web-evidence.json',
  'seating-plans.json',
] as const

type DemoFixtureFileName = (typeof DEMO_FIXTURE_FILE_NAMES)[number]

export type DemoEvidenceState =
  | 'fresh'
  | 'stale'
  | 'no_results'
  | 'unsupported'
  | 'provider_failure'

interface DemoWebResult {
  rank: number
  classification: 'founder' | 'company' | 'both'
  title: string
  url: string
  domain: string
  snippet: string
  provider: 'demo-fixture'
  providerResultId: string
  retrievedAt: string
  confidence: number
  entityMatch: Readonly<{
    founder?: boolean
    company?: boolean
  }>
  staleAfter: string
}

interface DemoWebEvidenceRecord {
  founderId: string
  state: DemoEvidenceState
  run: {
    id: string
    founderId: string
    queryFingerprint: string
    provider: 'demo-fixture'
    retrievedAt: string
    queryContext: {
      source: 'demo-fixture'
      synthetic: true
      fixtureVersion: number
      demoReferenceTime: string
      demoEvidence: {
        state: DemoEvidenceState
        unsupportedReason?: 'provider_response_without_citations'
        summary?: string
        error?: {
          code: 'demo_provider_unavailable'
          message: string
          retryable: true
        }
      }
    }
    rawProviderMetadata?: never
    results: DemoWebResult[]
  }
  unsupportedReason?: 'provider_response_without_citations'
  summary?: string
  error?: {
    code: 'demo_provider_unavailable'
    message: string
    retryable: true
  }
}

type DemoScaleScenario =
  | 'three-tables'
  | 'five-tables'
  | 'uneven-five-tables'
  | 'twenty-tables'

interface DemoDinnerConfigurationSeed {
  id: string
  name: string
  founderIds: string[]
  configuration: {
    formatVersion: 1
    summary: {
      founderCount: number
      tableCount: number
      assigned: true
    }
  }
  createdAt: string
  updatedAt: string
}

interface DemoDinnerVersionSeed {
  id: string
  configurationId: string
  version: number
  snapshot: {
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
  createdAt: string
}

interface DemoSeatingScenario {
  configurationId: string
  scenario: DemoScaleScenario
  name: string
  description: string
  founderCount: number
  tableCount: number
  capacities: number[]
  latestVersion: number
  screenshotUses: string[]
}

interface DemoManifestScenario {
  id: 'founder-cohort' | 'web-evidence' | 'saved-seating-plans'
  description: string
  screenshotUses: string[]
}

interface DemoFixtureBundle {
  manifest: {
    fixtureVersion: number
    seed: string
    generatedAt: string
    demoReferenceTime: string
    freshEvidenceStaleAfter: string
    synthetic: true
    networkCallsRequired: false
    authoritativeRecordsUsed: false
    files: Record<DemoFixtureFileName, string>
    counts: {
      founders: number
      evidenceRecords: number
      evidenceResults: number
      seatingPlans: number
      seatingPlanVersions: number
    }
    scenarios: DemoManifestScenario[]
    safety: {
      idPrefix: 'demo-'
      reservedDomainSuffix: '.example'
      containsSecrets: false
      containsRealProviderPayloads: false
      containsRealFounderRecords: false
    }
  }
  founders: RawFounder[]
  webEvidence: {
    fixtureVersion: number
    generatedAt: string
    records: DemoWebEvidenceRecord[]
  }
  seatingPlans: {
    fixtureVersion: number
    generatedAt: string
    scenarios: DemoSeatingScenario[]
    configurations: DemoDinnerConfigurationSeed[]
    versions: DemoDinnerVersionSeed[]
  }
}

interface PlanDefinition {
  id: string
  scenario: DemoScaleScenario
  name: string
  description: string
  founderStart: number
  founderCount: number
  capacities: number[]
  versionCount: number
  firstSavedAt: string
  searchText: string
}

const FIRST_NAMES = [
  'Ari',
  'Mira',
  'Noel',
  'Zuri',
  'Kian',
  'Leona',
  'Oren',
  'Sana',
  'Tavi',
  'Inez',
  'Emil',
  'Rhea',
  'Juno',
  'Niko',
  'Aya',
  'Cleo',
  'Remy',
  'Veda',
  'Lio',
  'Mara',
] as const

const LAST_NAMES = [
  'Quill',
  'Vale',
  'North',
  'Marrow',
  'Solace',
  'Kestrel',
  'Fable',
  'Cinder',
] as const

const COMPANY_ROOTS = [
  'Aster',
  'Brindle',
  'Cinder',
  'Drift',
  'Ember',
  'Fable',
  'Glimmer',
  'Harbor',
  'Juniper',
  'Kite',
  'Lattice',
  'Mosaic',
  'Nimbus',
  'Orbit',
  'Pollen',
  'Quarry',
] as const

const COMPANY_SUFFIXES = [
  'Works',
  'Forge',
  'Stack',
  'Signal',
  'Loop',
  'Field',
] as const

const VERTICALS = [
  'B2B Software and Services->Workflow Software',
  'B2B Software and Services->Developer Tools',
  'B2B Software and Services->Sales Technology',
  'B2B Software and Services->Data Infrastructure',
  'Consumer->Personal Productivity',
  'Consumer->Marketplace',
  'Consumer->Community',
  'Consumer->Education',
  'Fintech->Payments',
  'Fintech->Risk and Compliance',
  'Fintech->Financial Operations',
  'Healthcare->Care Delivery',
  'Healthcare->Clinical Workflow',
  'Healthcare->Diagnostics',
  'Industrials->Climate Operations',
  'Industrials->Manufacturing Software',
  'Industrials->Logistics',
  'Frontier Technology->Robotics',
  'Frontier Technology->Applied AI',
  'Frontier Technology->Research Tools',
] as const

const EDUCATION = [
  'Northbridge Institute',
  'Crescent Technical College',
  'Redwood School of Design',
  'Mosaic State University',
  'Harbor City College',
  'Lumen Polytechnic',
  'Westmere University',
  'Juniper Business School',
  'Orchard Institute of Science',
  'Fable Arts College',
  'Summit Computing Academy',
  'Independent study',
] as const

const ROLES = [
  'Engineering',
  'Sales',
  'Product',
  'Design',
  'Operations',
  'Research',
] as const

const EVIDENCE_DOMAINS = [
  'profiles.demo.example',
  'companies.demo.example',
  'markets.demo.example',
  'news.demo.example',
  'community.demo.example',
] as const

const PLAN_DEFINITIONS: PlanDefinition[] = [
  {
    id: 'demo-plan-three-table-roundtable',
    scenario: 'three-tables',
    name: 'Demo · AI Infrastructure Roundtable',
    description: 'Three complete tables for setup, Tables, and Analysis captures.',
    founderStart: 0,
    founderCount: 24,
    capacities: [8, 8, 8],
    versionCount: 3,
    firstSavedAt: '2026-09-27T16:00:00.000Z',
    searchText: 'synthetic infrastructure founders with mixed roles',
  },
  {
    id: 'demo-plan-five-table-operator-mix',
    scenario: 'five-tables',
    name: 'Demo · Fintech Operator Mix',
    description: 'Five even tables with several revisions and alternatives.',
    founderStart: 24,
    founderCount: 40,
    capacities: [8, 8, 8, 8, 8],
    versionCount: 4,
    firstSavedAt: '2026-09-28T15:00:00.000Z',
    searchText: 'synthetic fintech operators across product and go-to-market',
  },
  {
    id: 'demo-plan-uneven-five-table-dinner',
    scenario: 'uneven-five-tables',
    name: 'Demo · Balanced Founder Dinner',
    description: 'Uneven 10, 10, 10, 9, and 9 capacity coverage.',
    founderStart: 64,
    founderCount: 48,
    capacities: [10, 10, 10, 9, 9],
    versionCount: 3,
    firstSavedAt: '2026-09-29T14:00:00.000Z',
    searchText: 'synthetic cross-sector dinner with balanced uneven capacities',
  },
  {
    id: 'demo-plan-twenty-table-showcase',
    scenario: 'twenty-tables',
    name: 'Demo · All Cohort Showcase',
    description: 'The complete 160-founder, twenty-table responsive scenario.',
    founderStart: 0,
    founderCount: 160,
    capacities: Array.from({ length: 20 }, () => 8),
    versionCount: 5,
    firstSavedAt: '2026-09-30T12:00:00.000Z',
    searchText: 'all synthetic demo founders for the twenty-table showcase',
  },
]

const VERSION_NOTES = [
  'Initial synthetic generation',
  'Added company separation and role-balance rules',
  'Selected a structural alternative and locked key seats',
  'Raised the review threshold after inspecting weakest placements',
  'Final synthetic screenshot arrangement',
] as const

function stableHash(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function opaqueId(kind: string, value: string | number) {
  const source = `${FIXTURE_SEED}:${kind}:${value}`
  const first = stableHash(source).toString(16).padStart(8, '0')
  const second = stableHash([...source].reverse().join(''))
    .toString(16)
    .padStart(8, '0')
  return `demo-${kind}-${first}${second.slice(0, 4)}`
}

function buildFounders(): RawFounder[] {
  return Array.from({ length: 160 }, (_, index) => {
    const group = (index % 5) + 1
    const section = String.fromCharCode(65 + (Math.floor(index / 5) % 8))
    const companyIndex = index % (COMPANY_ROOTS.length * COMPANY_SUFFIXES.length)
    const companyRoot =
      COMPANY_ROOTS[companyIndex % COMPANY_ROOTS.length]!
    const companySuffix =
      COMPANY_SUFFIXES[
        Math.floor(companyIndex / COMPANY_ROOTS.length) %
          COMPANY_SUFFIXES.length
      ]!

    return {
      Id: opaqueId('founder', index + 1),
      Name: `${FIRST_NAMES[index % FIRST_NAMES.length]} ${
        LAST_NAMES[Math.floor(index / FIRST_NAMES.length)]!
      }`,
      Group: String(group),
      'Group Section': `${group}${section}`,
      'Company vertical': VERTICALS[index % VERTICALS.length]!,
      Company: `${companyRoot} ${companySuffix}`,
      Age: 22 + ((index * 7) % 31),
      Education: EDUCATION[index % EDUCATION.length]!,
      Role: ROLES[index % ROLES.length]!,
    }
  })
}

function evidenceState(index: number): DemoEvidenceState {
  if (index < 64) return 'fresh'
  if (index < 96) return 'stale'
  if (index < 120) return 'no_results'
  if (index < 144) return 'unsupported'
  return 'provider_failure'
}

function evidenceResultCount(state: DemoEvidenceState) {
  if (state === 'fresh') return 5
  if (state === 'stale') return 3
  return 0
}

function buildEvidenceResults(
  founder: RawFounder,
  state: DemoEvidenceState,
): DemoWebResult[] {
  const count = evidenceResultCount(state)
  const retrievedAt =
    state === 'stale'
      ? '2026-05-12T15:30:00.000Z'
      : '2026-09-30T15:30:00.000Z'
  const staleAfter =
    state === 'stale'
      ? '2026-08-10T00:00:00.000Z'
      : FRESH_EVIDENCE_STALE_AFTER
  const market = founder['Company vertical'].replaceAll('->', ' / ')
  const evidence = [
    {
      classification: 'both' as const,
      title: `${founder.Name} — Co-founder at ${founder.Company}`,
      snippet: `${founder.Name} leads ${founder.Role.toLowerCase()} at ${founder.Company}, a ${market} startup. The founder profile highlights a ${founder.Education} background and a focus on building an early customer base.`,
    },
    {
      classification: 'company' as const,
      title: `${founder.Company} | Company profile`,
      snippet: `${founder.Company} is developing products for the ${market} market. The company profile describes a small founding team working with design partners to refine the product and validate repeatable customer demand.`,
    },
    {
      classification: 'company' as const,
      title: `${founder.Company} enters the ${market} market`,
      snippet: `A market brief places ${founder.Company} among emerging ${market} companies serving operational teams. It notes the startup's emphasis on practical workflows, measurable adoption, and a focused initial segment.`,
    },
    {
      classification: 'founder' as const,
      title: `${founder.Name} on building ${founder.Company}`,
      snippet: `In a founder interview, ${founder.Name} discusses early product decisions at ${founder.Company}, including customer discovery, hiring for a lean team, and choosing which requests to prioritize before expanding the platform.`,
    },
    {
      classification: 'both' as const,
      title: `Founder notes: lessons from ${founder.Company}`,
      snippet: `${founder.Name} shares lessons from the first stage of ${founder.Company}: stay close to customers, test assumptions with working prototypes, and build a team whose experience matches the needs of the ${market} market.`,
    },
  ]

  return Array.from({ length: count }, (_, resultIndex) => {
    const rank = resultIndex + 1
    const item = evidence[resultIndex]!
    const domain = EVIDENCE_DOMAINS[resultIndex % EVIDENCE_DOMAINS.length]!

    return {
      rank,
      classification: item.classification,
      title: item.title,
      url: `https://${domain}/founders/${founder.Id}/evidence-${rank}`,
      domain,
      snippet: item.snippet,
      provider: 'demo-fixture',
      providerResultId: opaqueId('web-result', `${founder.Id}:${rank}`),
      retrievedAt,
      confidence: Number((0.97 - resultIndex * 0.08).toFixed(2)),
      entityMatch: {
        ...(item.classification !== 'company' ? { founder: true } : {}),
        ...(item.classification !== 'founder' ? { company: true } : {}),
      },
      staleAfter,
    }
  })
}

function buildWebEvidence(founders: RawFounder[]) {
  const records: DemoWebEvidenceRecord[] = founders.map((founder, index) => {
    const state = evidenceState(index)
    const retrievedAt =
      state === 'stale'
        ? '2026-05-12T15:30:00.000Z'
        : '2026-09-30T15:30:00.000Z'
    const unsupportedReason =
      state === 'unsupported'
        ? 'provider_response_without_citations'
        : undefined
    const summary =
      state === 'unsupported'
        ? 'A provider summary was available, but no citable source URLs were returned.'
        : undefined
    const error =
      state === 'provider_failure'
        ? {
            code: 'demo_provider_unavailable' as const,
            message: 'The demo search provider did not respond. Try the search again.',
            retryable: true as const,
          }
        : undefined
    const record: DemoWebEvidenceRecord = {
      founderId: founder.Id,
      state,
      run: {
        id: opaqueId('web-run', founder.Id),
        founderId: founder.Id,
        queryFingerprint: opaqueId('query', founder.Id),
        provider: 'demo-fixture',
        retrievedAt,
        queryContext: {
          source: 'demo-fixture',
          synthetic: true,
          fixtureVersion: FIXTURE_VERSION,
          demoReferenceTime: GENERATED_AT,
          demoEvidence: {
            state,
            ...(unsupportedReason === undefined
              ? {}
              : { unsupportedReason, summary }),
            ...(error === undefined ? {} : { error }),
          },
        },
        results: buildEvidenceResults(founder, state),
      },
      ...(unsupportedReason === undefined
        ? {}
        : { unsupportedReason, summary }),
      ...(error === undefined ? {} : { error }),
    }

    return record
  })

  return {
    fixtureVersion: FIXTURE_VERSION,
    generatedAt: GENERATED_AT,
    records,
  }
}

function buildCriteria(planId: string, version: number): Criterion[] {
  return [
    {
      id: `${planId}-criterion-role-v${version}`,
      field: 'role',
      objective: 'diversity',
      weightLevel: 'H',
      weight: 3,
      operator: 'categorical',
      missingValuePolicy: 'exclude',
      enabled: true,
      provenance: 'manual',
    },
    {
      id: `${planId}-criterion-vertical-v${version}`,
      field: 'companyVertical',
      objective: 'similarity',
      weightLevel: 'H',
      weight: 3,
      operator: 'hierarchical',
      missingValuePolicy: 'exclude',
      enabled: true,
      provenance: 'ai',
    },
    {
      id: `${planId}-criterion-age-v${version}`,
      field: 'age',
      objective: 'diversity',
      weightLevel: 'M',
      weight: 2,
      operator: 'numeric',
      missingValuePolicy: 'zero',
      enabled: true,
      provenance: 'hybrid',
    },
    {
      id: `${planId}-criterion-education-v${version}`,
      field: 'education',
      objective: version % 2 === 0 ? 'similarity' : 'diversity',
      weightLevel: 'L',
      weight: 1,
      operator: 'categorical',
      missingValuePolicy: 'exclude',
      enabled: true,
      provenance: 'manual',
    },
  ]
}

function gcd(left: number, right: number): number {
  return right === 0 ? Math.abs(left) : gcd(right, left % right)
}

function permutation(ids: readonly string[], shift: number) {
  const stride = [7, 11, 13].find(
    (candidate) => gcd(candidate, ids.length) === 1,
  )!
  return ids.map(
    (_id, index) => ids[(index * stride + shift) % ids.length]!,
  )
}

function assignmentSeats(
  founders: readonly RawFounder[],
  capacities: readonly number[],
  shift: number,
) {
  const founderIds = founders.map((founder) => founder.Id)
  const foundersById = new Map(
    founders.map((founder) => [founder.Id, founder]),
  )
  const order = permutation(founderIds, shift)
  const seats = capacities.map((capacity) =>
    Array.from<string | null>({ length: capacity }).fill(null),
  )
  const used = new Set<string>()

  const companiesAt = (tableIndex: number) =>
    new Set(
      seats[tableIndex]!
        .filter((founderId): founderId is string => founderId !== null)
        .map((founderId) => foundersById.get(founderId)!.Company),
    )
  const canPlace = (founderId: string, tableIndex: number) =>
    seats[tableIndex]!.includes(null) &&
    !companiesAt(tableIndex).has(foundersById.get(founderId)!.Company)
  const place = (
    founderId: string,
    tableIndex: number,
    seatIndex?: number,
  ) => {
    const target =
      seatIndex ?? seats[tableIndex]!.findIndex((seat) => seat === null)
    if (
      used.has(founderId) ||
      target < 0 ||
      seats[tableIndex]![target] !== null ||
      !canPlace(founderId, tableIndex)
    ) {
      throw new Error(`Could not place synthetic founder ${founderId}`)
    }
    seats[tableIndex]![target] = founderId
    used.add(founderId)
  }

  place(founderIds[0]!, 0, 0)
  place(founderIds[1]!, 0, 1)
  place(founderIds[2]!, 1, 0)

  for (let tableIndex = 0; tableIndex < seats.length; tableIndex += 1) {
    const hasEngineer = seats[tableIndex]!.some(
      (founderId) =>
        founderId !== null &&
        foundersById.get(founderId)!.Role === 'Engineering',
    )
    if (hasEngineer) continue

    const engineer = order.find(
      (founderId) =>
        !used.has(founderId) &&
        foundersById.get(founderId)!.Role === 'Engineering' &&
        canPlace(founderId, tableIndex),
    )
    if (!engineer) {
      throw new Error(`Could not place an Engineering founder at table ${tableIndex}`)
    }
    place(engineer, tableIndex)
  }

  let tableCursor = shift % seats.length
  for (const founderId of order) {
    if (used.has(founderId)) continue

    let placed = false
    for (let offset = 0; offset < seats.length; offset += 1) {
      const tableIndex = (tableCursor + offset) % seats.length
      if (!canPlace(founderId, tableIndex)) continue
      place(founderId, tableIndex)
      tableCursor = (tableIndex + 1) % seats.length
      placed = true
      break
    }
    if (!placed) {
      throw new Error(`Could not distribute synthetic founder ${founderId}`)
    }
  }

  return seats.map((tableSeats) =>
    tableSeats.map((founderId) => {
      if (founderId === null) {
        throw new Error('Synthetic assignment left an empty seat')
      }
      return founderId
    }),
  )
}

function roundFit(value: number) {
  return Number(Math.max(0, Math.min(1, value)).toFixed(2))
}

function buildTables(
  founders: readonly RawFounder[],
  capacities: readonly number[],
  version: number,
  variant: number,
) {
  const founderIds = founders.map((founder) => founder.Id)
  const seatsByTable = assignmentSeats(
    founders,
    capacities,
    version * 3 + variant * 5,
  )
  const founderPosition = new Map(
    founderIds.map((founderId, index) => [founderId, index]),
  )
  const tables: DinnerTable[] = []

  capacities.forEach((capacity, tableIndex) => {
    const seats = seatsByTable[tableIndex]!
    const founderFits = Object.fromEntries(
      seats.map((founderId, seatIndex) => {
        const position = founderPosition.get(founderId)!
        const percent =
          96 -
          ((position * 7 + tableIndex * 5 + seatIndex * 3 + version * 2) %
            29)
        return [
          founderId,
          roundFit(percent / 100 - variant * 0.015),
        ]
      }),
    )
    const fits = Object.values(founderFits)

    tables.push({
      index: tableIndex,
      capacity,
      founderIds: [...seats],
      seats: [...seats],
      founderFits,
      quality: Math.min(...fits),
    })
  })

  return tables
}

function metricsFor(tables: readonly DinnerTable[]): DinnerMetrics {
  const founderFitVector = tables.flatMap((table) =>
    table.founderIds.map((founderId) => table.founderFits[founderId]!),
  )
  const tableQualityVector = tables.map((table) => table.quality)

  return {
    founderFitVector,
    tableQualityVector,
    meanFounderFit: roundFit(
      founderFitVector.reduce((sum, fit) => sum + fit, 0) /
        founderFitVector.length,
    ),
    meanTableQuality: roundFit(
      tableQualityVector.reduce((sum, quality) => sum + quality, 0) /
        tableQualityVector.length,
    ),
  }
}

function buildAlternatives(
  planId: string,
  founders: readonly RawFounder[],
  capacities: readonly number[],
  version: number,
): DinnerAlternative[] {
  return [0, 1, 2].map((variant) => {
    const tables = buildTables(founders, capacities, version, variant)
    return {
      id: `${planId}-v${version}-solution-${variant + 1}`,
      kind: variant === 0 ? 'recommended' : 'alternative',
      tables,
      metrics: metricsFor(tables),
    }
  })
}

function buildRules(
  planId: string,
  version: number,
  founderIds: readonly string[],
): HardRule[] {
  return [
    {
      id: `${planId}-rule-company-v${version}`,
      type: 'same-company-separation',
    },
    {
      id: `${planId}-rule-together-v${version}`,
      type: 'must-sit-together',
      founderIds: [founderIds[0]!, founderIds[1]!],
    },
    {
      id: `${planId}-rule-apart-v${version}`,
      type: 'cannot-sit-together',
      founderIds: [founderIds[0]!, founderIds[2]!],
    },
    {
      id: `${planId}-rule-engineering-v${version}`,
      type: 'field-count',
      field: 'role',
      value: 'Engineering',
      min: 1,
    },
    {
      id: `${planId}-rule-seat-v${version}`,
      type: 'pinned-seat',
      founderId: founderIds[0]!,
      tableIndex: 0,
      seatIndex: 0,
    },
    {
      id: `${planId}-rule-table-v${version}`,
      type: 'pinned-table',
      founderId: founderIds[2]!,
      tableIndex: 1,
    },
  ]
}

function buildLocks(founderIds: readonly string[]): DinnerLock[] {
  return [
    { founderId: founderIds[0]!, tableIndex: 0, seatIndex: 0 },
    { founderId: founderIds[1]!, tableIndex: 0, seatIndex: 1 },
    { founderId: founderIds[2]!, tableIndex: 1 },
  ]
}

function buildNotes(
  planId: string,
  version: number,
  founderIds: readonly string[],
): DinnerNote[] {
  return [
    {
      id: `${planId}-note-plan-v${version}`,
      text: `Synthetic demo revision ${version}; no real attendee logistics apply.`,
    },
    {
      id: `${planId}-note-table-v${version}`,
      text: 'Use this table for the Analysis and threshold screenshots.',
      tableIndex: 0,
    },
    {
      id: `${planId}-note-founder-v${version}`,
      text: 'Synthetic seat note for lock and export coverage.',
      founderId: founderIds[0]!,
      tableIndex: 0,
    },
  ]
}

function buildDinnerState(
  definition: PlanDefinition,
  founders: readonly RawFounder[],
  version: number,
): DinnerState {
  const founderIds = founders.map((founder) => founder.Id)
  const alternatives = buildAlternatives(
    definition.id,
    founders,
    definition.capacities,
    version,
  )
  const recommended = alternatives[0]!

  return {
    cohort: {
      source: 'search',
      founderIds: [...founderIds],
      searchText: definition.searchText,
    },
    brief:
      'Keep synthetic founders in adjacent markets while mixing roles, ages, and educational backgrounds.',
    tableCount: definition.capacities.length,
    criteria: { criteria: buildCriteria(definition.id, version) },
    rules: buildRules(definition.id, version, founderIds),
    locks: buildLocks(founderIds),
    assignments: recommended.tables,
    metrics: recommended.metrics,
    alternatives,
    chosenAlternativeId: recommended.id,
    threshold: Math.min(78, 68 + version * 2),
    notes: buildNotes(definition.id, version, founderIds),
  }
}

function savedAt(firstSavedAt: string, version: number) {
  const timestamp = Date.parse(firstSavedAt)
  return new Date(timestamp + (version - 1) * 2 * 60 * 60 * 1000).toISOString()
}

function buildSeatingPlans(founders: readonly RawFounder[]) {
  const scenarios: DemoSeatingScenario[] = []
  const configurations: DemoDinnerConfigurationSeed[] = []
  const versions: DemoDinnerVersionSeed[] = []

  for (const definition of PLAN_DEFINITIONS) {
    const cohortFounders = founders.slice(
      definition.founderStart,
      definition.founderStart + definition.founderCount,
    )
    const founderIds = cohortFounders.map((founder) => founder.Id)
    const planVersions: DemoDinnerVersionSeed[] = Array.from(
      { length: definition.versionCount },
      (_, index) => {
        const version = index + 1
        const state = buildDinnerState(definition, cohortFounders, version)
        return {
          id: `${definition.id}-version-${version}`,
          configurationId: definition.id,
          version,
          snapshot: {
            formatVersion: 1,
            name: definition.name,
            note: VERSION_NOTES[index]!,
            state,
            founderDirectory: cohortFounders.map((founder) => ({
              id: founder.Id,
              name: founder.Name,
              company: founder.Company,
              role: founder.Role,
            })),
          },
          createdAt: savedAt(definition.firstSavedAt, version),
        }
      },
    )
    const createdAt = planVersions[0]!.createdAt
    const updatedAt = planVersions.at(-1)!.createdAt

    scenarios.push({
      configurationId: definition.id,
      scenario: definition.scenario,
      name: definition.name,
      description: definition.description,
      founderCount: definition.founderCount,
      tableCount: definition.capacities.length,
      capacities: [...definition.capacities],
      latestVersion: definition.versionCount,
      screenshotUses: [
        'Seating Plans populated index',
        'Saved plan version history/reopen',
        definition.scenario === 'twenty-tables'
          ? 'Responsive mobile Tables view'
          : 'Table view',
        'Analysis view',
        'Generate 2 Alternatives comparison',
        'Export options/success',
      ],
    })
    configurations.push({
      id: definition.id,
      name: definition.name,
      founderIds,
      configuration: {
        formatVersion: 1,
        summary: {
          founderCount: founderIds.length,
          tableCount: definition.capacities.length,
          assigned: true,
        },
      },
      createdAt,
      updatedAt,
    })
    versions.push(...planVersions)
  }

  return {
    fixtureVersion: FIXTURE_VERSION,
    generatedAt: GENERATED_AT,
    scenarios,
    configurations,
    versions,
  }
}

function buildManifest(
  founders: readonly RawFounder[],
  webEvidence: DemoFixtureBundle['webEvidence'],
  seatingPlans: DemoFixtureBundle['seatingPlans'],
): DemoFixtureBundle['manifest'] {
  const evidenceResults = webEvidence.records.reduce(
    (count, record) => count + record.run.results.length,
    0,
  )
  const seatingPlanVersions = seatingPlans.versions.length

  return {
    fixtureVersion: FIXTURE_VERSION,
    seed: FIXTURE_SEED,
    generatedAt: GENERATED_AT,
    demoReferenceTime: GENERATED_AT,
    freshEvidenceStaleAfter: FRESH_EVIDENCE_STALE_AFTER,
    synthetic: true,
    networkCallsRequired: false,
    authoritativeRecordsUsed: false,
    files: {
      'manifest.json': 'Scenario catalog, counts, screenshot uses, and safety declarations.',
      'founders.json': '160 synthetic raw founder records compatible with normalizeFounders().',
      'web-evidence.json': 'Source-local provider-shaped evidence and explicit demo states.',
      'seating-plans.json': 'Versioned Task 8-compatible seating-plan states.',
    },
    counts: {
      founders: founders.length,
      evidenceRecords: webEvidence.records.length,
      evidenceResults,
      seatingPlans: seatingPlans.configurations.length,
      seatingPlanVersions,
    },
    scenarios: [
      {
        id: 'founder-cohort',
        description:
          'A 160-founder synthetic cohort with varied schema fields and opaque demo IDs.',
        screenshotUses: [
          'Search zero state',
          'Search results — Grid view',
          'Search results — List view',
          'Search no-results recovery',
          'Seating Plan configuration',
        ],
      },
      {
        id: 'web-evidence',
        description:
          'Fresh, stale, no-results, unsupported, and provider-failure evidence without network calls.',
        screenshotUses: [
          'Founder web evidence',
          'AI integration — API key setup and validated provider state',
          'Rules conflict/recovery',
        ],
      },
      {
        id: 'saved-seating-plans',
        description:
          'Three-, five-, uneven-five-, and twenty-table histories with complete assignments.',
        screenshotUses: [
          'Seating Plans populated index',
          'Table view',
          'Analysis view',
          'Generate 2 Alternatives comparison',
          'Saved plan version history/reopen',
          'Export options/success',
          'Responsive mobile Tables view',
        ],
      },
    ],
    safety: {
      idPrefix: 'demo-',
      reservedDomainSuffix: '.example',
      containsSecrets: false,
      containsRealProviderPayloads: false,
      containsRealFounderRecords: false,
    },
  }
}

export function buildDemoFixtureBundle(): DemoFixtureBundle {
  const founders = buildFounders()
  const webEvidence = buildWebEvidence(founders)
  const seatingPlans = buildSeatingPlans(founders)
  const manifest = buildManifest(founders, webEvidence, seatingPlans)

  return { manifest, founders, webEvidence, seatingPlans }
}

function json(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`
}

export function renderDemoFixtureFiles(
  bundle = buildDemoFixtureBundle(),
): Record<DemoFixtureFileName, string> {
  return {
    'manifest.json': json(bundle.manifest),
    'founders.json': json(bundle.founders),
    'web-evidence.json': json(bundle.webEvidence),
    'seating-plans.json': json(bundle.seatingPlans),
  }
}
