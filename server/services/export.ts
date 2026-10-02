import { z } from 'zod'

import {
  DinnerExportQuerySchema,
  FounderExportRequestSchema,
  type DinnerState,
  type HardRule,
  type SavedDinner,
} from '../../src/shared/dinnerContracts.js'
import type { Founder } from '../../src/shared/founder.js'
import { FOUNDER_SCHEMA } from '../../src/shared/schemaRegistry.js'
import type { FounderRepository } from '../repositories/founders.js'
import type {
  WebResult,
  WebResultsRepository,
} from '../repositories/webResults.js'
import type { DinnerService } from './dinners.js'

export const MAX_EXPORTED_WEB_RESULTS = 5

export type ExportErrorCode = 'invalid_export' | 'unknown_founders'

export class ExportError extends Error {
  constructor(
    message: string,
    readonly code: ExportErrorCode,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'ExportError'
  }
}

export interface ExportFile {
  filename: string
  contentType: string
  body: string
}

export interface ExportServiceOptions {
  dinners: DinnerService
  founders: FounderRepository
  webResults: WebResultsRepository
  now?: () => Date
}

type CsvValue = string | number

const CSV_CONTENT_TYPE = 'text/csv; charset=utf-8'
const JSON_CONTENT_TYPE = 'application/json; charset=utf-8'

const FIELD_LABELS = new Map<string, string>(
  FOUNDER_SCHEMA.map((field) => [field.key, field.label]),
)

const FOUNDER_DETAIL_COLUMNS: readonly [string, (founder: Founder) => CsvValue][] = [
  ['Company', (founder) => founder.company],
  ['Company vertical', (founder) => founder.companyVertical],
  ['Role', (founder) => founder.role],
  ['Age', (founder) => founder.age],
  ['Education', (founder) => founder.education],
  ['Cohort group', (founder) => founder.cohortGroup],
  ['Cohort section', (founder) => founder.cohortSection],
]

const DINNER_COLUMNS = [
  'Table',
  'Seat',
  'Founder ID',
  'Founder',
  'Company',
  'Role',
  'Fit',
  'Below threshold',
  'Criteria',
  'Rules',
  'Notes',
] as const

// Matches the Search CSV convention: neutralize formulas, quote delimiters.
function csvCell(value: CsvValue) {
  const raw = String(value)
  const text =
    typeof value === 'string' && /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function toCsv(rows: readonly (readonly CsvValue[])[]) {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n')
}

function exportDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

function slugify(value: string) {
  const slug = value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '')
  return slug || 'dinner'
}

function fieldLabel(field: string) {
  return FIELD_LABELS.get(field) ?? field
}

function invalidExport(error: z.ZodError) {
  return new ExportError(
    'Export request is invalid',
    'invalid_export',
    error.issues.map(({ path, message }) => ({ path, message })),
  )
}

function exportedWebResult(result: WebResult) {
  return {
    runId: result.runId,
    rank: result.rank,
    classification: result.classification,
    title: result.title,
    url: result.url,
    domain: result.domain,
    snippet: result.snippet,
    provider: result.provider,
    ...(result.providerResultId === undefined
      ? {}
      : { providerResultId: result.providerResultId }),
    retrievedAt: result.retrievedAt,
    ...(result.confidence === undefined ? {} : { confidence: result.confidence }),
    ...(result.entityMatch === undefined
      ? {}
      : { entityMatch: { ...result.entityMatch } }),
    ...(result.staleAfter === undefined ? {} : { staleAfter: result.staleAfter }),
  }
}

interface FounderPlacement {
  tableIndex: number | null
  seatIndex: number | null
  fit: number | null
}

function placements(state: DinnerState) {
  const byFounder = new Map<string, FounderPlacement>()
  for (const table of state.assignments) {
    table.seats.forEach((founderId, seatIndex) => {
      if (founderId !== null) {
        byFounder.set(founderId, {
          tableIndex: table.index,
          seatIndex,
          fit: table.founderFits[founderId] ?? null,
        })
      }
    })
  }
  return byFounder
}

function orderedFounderIds(state: DinnerState) {
  if (state.assignments.length === 0) {
    return [...state.cohort.founderIds]
  }
  return state.assignments.flatMap((table) =>
    table.seats.filter((seat): seat is string => seat !== null),
  )
}

function belowThreshold(fit: number | null, threshold: number) {
  return fit === null ? null : Math.round(fit * 100) < threshold
}

function boundsText(min: number | undefined, max: number | undefined) {
  if (min !== undefined && max !== undefined) {
    return `at least ${min} and at most ${max} per table`
  }
  return min !== undefined
    ? `at least ${min} per table`
    : `at most ${max} per table`
}

export class ExportService {
  private readonly now: () => Date

  constructor(private readonly options: ExportServiceOptions) {
    this.now = options.now ?? (() => new Date())
  }

  exportDinner(id: string, query: unknown): ExportFile {
    const parsed = DinnerExportQuerySchema.safeParse(query ?? {})
    if (!parsed.success) {
      throw invalidExport(parsed.error)
    }

    const { format, version, includeWebResults } = parsed.data
    const dinner = this.options.dinners.get(id, version)
    const exportedAt = this.now()
    const filename = `${slugify(dinner.name)}-v${dinner.version}-${exportDate(exportedAt)}.${format}`

    return format === 'csv'
      ? {
          filename,
          contentType: CSV_CONTENT_TYPE,
          body: this.dinnerCsv(dinner),
        }
      : {
          filename,
          contentType: JSON_CONTENT_TYPE,
          body: JSON.stringify(
            this.dinnerJson(dinner, exportedAt, includeWebResults),
            null,
            2,
          ),
        }
  }

  exportFounders(request: unknown): ExportFile {
    const parsed = FounderExportRequestSchema.safeParse(request)
    if (!parsed.success) {
      throw invalidExport(parsed.error)
    }

    const { founderIds, format, includeDetails, includeWebResults } =
      parsed.data
    const found = this.options.founders.getMany(founderIds)
    const unknown = founderIds.filter((founderId) => !found.has(founderId))
    if (unknown.length > 0) {
      throw new ExportError(
        `${unknown.length} founder${unknown.length === 1 ? ' is' : 's are'} not in the current dataset`,
        'unknown_founders',
        { founderIds: unknown },
      )
    }

    const exportedAt = this.now()
    const founders = founderIds.map((founderId) => found.get(founderId)!)
    const filename = `founder-search-results-${exportDate(exportedAt)}.${format}`

    if (format === 'csv') {
      const columns: [string, (founder: Founder) => CsvValue][] = [
        ['Founder ID', (founder) => founder.id],
        ['Founder name', (founder) => founder.name],
        ...(includeDetails ? FOUNDER_DETAIL_COLUMNS : []),
      ]
      return {
        filename,
        contentType: CSV_CONTENT_TYPE,
        body: toCsv([
          columns.map(([label]) => label),
          ...founders.map((founder) => columns.map(([, read]) => read(founder))),
        ]),
      }
    }

    return {
      filename,
      contentType: JSON_CONTENT_TYPE,
      body: JSON.stringify(
        {
          format: 'founder-app/founder-export',
          formatVersion: 1,
          exportedAt: exportedAt.toISOString(),
          founders: founders.map((founder) => ({
            founder: includeDetails
              ? founder
              : { id: founder.id, name: founder.name },
            ...(includeWebResults
              ? { web_results: this.latestWebResults(founder.id) }
              : {}),
          })),
        },
        null,
        2,
      ),
    }
  }

  private latestWebResults(founderId: string) {
    return this.options.webResults
      .latest(founderId)
      .toSorted((left, right) => left.rank - right.rank)
      .slice(0, MAX_EXPORTED_WEB_RESULTS)
      .map(exportedWebResult)
  }

  private dinnerCsv(dinner: SavedDinner) {
    const { state } = dinner
    const founders = this.options.founders.getMany(state.cohort.founderIds)
    const missing = new Map(
      dinner.recovery.missingFounders.map((entry) => [entry.founderId, entry]),
    )
    const nameOf = (founderId: string) =>
      founders.get(founderId)?.name ?? missing.get(founderId)?.name ?? founderId
    const seated = placements(state)
    const locks = new Map(state.locks.map((lock) => [lock.founderId, lock]))
    const criteria = state.criteria.criteria
      .filter((criterion) => criterion.enabled)
      .map(
        (criterion) =>
          `${fieldLabel(criterion.field)} · ${criterion.objective === 'similarity' ? 'Similarity' : 'Diversity'} · ${criterion.weightLevel}`,
      )
      .join('; ')

    const describeRule = (rule: HardRule, founderId: string) => {
      switch (rule.type) {
        case 'must-sit-together':
        case 'cannot-sit-together': {
          if (!rule.founderIds.includes(founderId)) {
            return undefined
          }
          const others = rule.founderIds
            .filter((other) => other !== founderId)
            .map(nameOf)
            .join(', ')
          return rule.type === 'must-sit-together'
            ? `Must sit with ${others}`
            : `Cannot sit with ${others}`
        }
        case 'same-company-separation':
          return 'Separate founders from the same company'
        case 'field-count': {
          const label = fieldLabel(rule.field)
          const subject =
            rule.value !== undefined
              ? `${label} = ${rule.value}`
              : rule.minValue !== undefined || rule.maxValue !== undefined
                ? `${label} ${rule.minValue ?? '…'}–${rule.maxValue ?? '…'}`
                : label
          return `${subject}: ${boundsText(rule.min, rule.max)}`
        }
        case 'fixed-table-size':
          return `Tables of ${rule.size}`
        case 'pinned-table':
          return rule.founderId === founderId
            ? `Pinned to table ${rule.tableIndex + 1}`
            : undefined
        case 'pinned-seat':
          return rule.founderId === founderId
            ? `Pinned to table ${rule.tableIndex + 1}, seat ${rule.seatIndex + 1}`
            : undefined
      }
    }

    const rows = orderedFounderIds(state).map((founderId) => {
      const founder = founders.get(founderId)
      const saved = missing.get(founderId)
      const placement = seated.get(founderId)
      const rules = state.rules
        .map((rule) => describeRule(rule, founderId))
        .filter((text): text is string => text !== undefined)
      const lock = locks.get(founderId)
      if (lock) {
        rules.push(
          lock.seatIndex === undefined
            ? `Locked to table ${lock.tableIndex + 1}`
            : `Locked to table ${lock.tableIndex + 1}, seat ${lock.seatIndex + 1}`,
        )
      }
      const notes = [
        ...(saved ? ['Missing from current dataset'] : []),
        ...state.notes
          .filter((note) => note.founderId === founderId)
          .map((note) => note.text),
        ...state.notes
          .filter(
            (note) =>
              note.founderId === undefined &&
              note.tableIndex !== undefined &&
              note.tableIndex === placement?.tableIndex,
          )
          .map((note) => `Table ${note.tableIndex! + 1}: ${note.text}`),
        ...state.notes
          .filter(
            (note) =>
              note.founderId === undefined && note.tableIndex === undefined,
          )
          .map((note) => `Dinner: ${note.text}`),
      ]
      const below = belowThreshold(placement?.fit ?? null, state.threshold)

      return [
        placement?.tableIndex == null ? '' : placement.tableIndex + 1,
        placement?.seatIndex == null ? '' : placement.seatIndex + 1,
        founderId,
        founder?.name ?? saved?.name ?? '',
        founder?.company ?? saved?.company ?? '',
        founder?.role ?? saved?.role ?? '',
        placement?.fit == null ? '' : `${Math.round(placement.fit * 100)}%`,
        below === null ? '' : below ? 'Yes' : 'No',
        criteria,
        rules.join('; '),
        notes.join('; '),
      ]
    })

    return toCsv([[...DINNER_COLUMNS], ...rows])
  }

  private dinnerJson(
    dinner: SavedDinner,
    exportedAt: Date,
    includeWebResults: boolean,
  ) {
    const { state } = dinner
    const founders = this.options.founders.getMany(state.cohort.founderIds)
    const missing = new Map(
      dinner.recovery.missingFounders.map((entry) => [entry.founderId, entry]),
    )
    const seated = placements(state)
    const locked = new Set(state.locks.map((lock) => lock.founderId))

    return {
      format: 'founder-app/dinner-export',
      formatVersion: 1,
      exportedAt: exportedAt.toISOString(),
      dinner: {
        id: dinner.id,
        name: dinner.name,
        note: dinner.note,
        version: dinner.version,
        versionId: dinner.versionId,
        latestVersion: dinner.latestVersion,
        status: dinner.status,
        createdAt: dinner.createdAt,
        updatedAt: dinner.updatedAt,
        savedAt: dinner.savedAt,
      },
      configuration: state,
      recovery: dinner.recovery,
      founders: state.cohort.founderIds.map((founderId) => {
        const founder = founders.get(founderId) ?? null
        const saved = missing.get(founderId)
        const placement = seated.get(founderId)
        const fit = placement?.fit ?? null
        return {
          founderId,
          founder,
          ...(saved
            ? {
                missing: true,
                savedSummary: {
                  name: saved.name,
                  company: saved.company,
                  role: saved.role,
                },
              }
            : {}),
          tableIndex: placement?.tableIndex ?? null,
          seatIndex: placement?.seatIndex ?? null,
          fit,
          belowThreshold: belowThreshold(fit, state.threshold),
          locked: locked.has(founderId),
          ...(includeWebResults
            ? { web_results: founder ? this.latestWebResults(founderId) : [] }
            : {}),
        }
      }),
    }
  }
}
