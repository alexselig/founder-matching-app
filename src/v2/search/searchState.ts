import type { Founder } from '../../shared/founder'
import {
  SEARCH_FIELDS,
  validateStructuredQuery,
  type SearchResult,
  type StructuredSearchQuery,
} from './searchEngine'

export type SearchView = 'grid' | 'list'

export interface SearchSession {
  active: boolean
  input: string
  submittedText: string
  query: StructuredSearchQuery
  view: SearchView
  groupBy: string | null
  sortBy: string | null
}

export interface PresentationOption {
  value: string
  label: string
}

export interface ResultGroup {
  key: string
  label: string | null
  results: SearchResult[]
}

export const SEARCH_SESSION_KEY = 'founder-v2-search-state'

export const EMPTY_QUERY: StructuredSearchQuery = Object.freeze({ text: '', dimensions: [] }) as StructuredSearchQuery

export const INITIAL_SEARCH_SESSION: SearchSession = Object.freeze({
  active: false,
  input: '',
  submittedText: '',
  query: EMPTY_QUERY,
  view: 'grid',
  groupBy: null,
  sortBy: null,
}) as SearchSession

export function isSearchActive(query: StructuredSearchQuery) {
  return query.text.trim() !== '' || query.dimensions.length > 0
}

export function groupOptions(): PresentationOption[] {
  return [
    { value: 'none', label: 'None' },
    ...SEARCH_FIELDS.filter((field) => field.group).map((field) => ({ value: field.key, label: field.label })),
  ]
}

export function sortOptions(): PresentationOption[] {
  return [
    { value: 'relevance', label: 'Relevance' },
    ...SEARCH_FIELDS.filter((field) => field.sort).map((field) => ({ value: field.key, label: field.label })),
  ]
}

export function deriveDefaultGroupBy(query: StructuredSearchQuery) {
  const groupable = new Set(SEARCH_FIELDS.filter((field) => field.group).map((field) => field.key))
  const fields = query.dimensions.map((dimension) => dimension.field)
  if (fields.includes('companyVertical')) return 'companyVertical'
  return fields.find((field) => groupable.has(field)) ?? 'none'
}

function founderValue(founder: Founder, key: string): string | number {
  const value = (founder as unknown as Record<string, unknown>)[key]
  return typeof value === 'number' ? value : String(value ?? '')
}

function groupValue(founder: Founder, key: string) {
  if (key === 'companyVertical') return founder.companyVerticalLevels[0] ?? founder.companyVertical
  return String(founderValue(founder, key))
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

function compareValues(a: string | number, b: string | number) {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return collator.compare(String(a), String(b))
}

export function sortResults(results: readonly SearchResult[], sortBy: string): SearchResult[] {
  if (sortBy === 'relevance' || !SEARCH_FIELDS.some((field) => field.key === sortBy && field.sort)) {
    return [...results]
  }
  return [...results].sort((a, b) => compareValues(founderValue(a.founder, sortBy), founderValue(b.founder, sortBy)))
}

export function groupResults(results: readonly SearchResult[], groupBy: string): ResultGroup[] {
  if (groupBy === 'none' || !SEARCH_FIELDS.some((field) => field.key === groupBy && field.group)) {
    return [{ key: 'all', label: null, results: [...results] }]
  }
  const groups = new Map<string, SearchResult[]>()
  for (const result of results) {
    const label = groupValue(result.founder, groupBy)
    const bucket = groups.get(label)
    if (bucket) bucket.push(result)
    else groups.set(label, [result])
  }
  return [...groups.entries()]
    .sort(([a], [b]) => compareValues(a, b))
    .map(([label, groupResults]) => ({ key: `${groupBy}:${label}`, label, results: groupResults }))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseStructuredQuery(value: unknown): StructuredSearchQuery | null {
  if (!isRecord(value) || typeof value.text !== 'string' || !Array.isArray(value.dimensions)) return null
  const query = value as unknown as StructuredSearchQuery
  try {
    validateStructuredQuery(query)
    return query
  } catch {
    return null
  }
}

export function readSearchSession(storage: Pick<Storage, 'getItem'> | undefined): SearchSession {
  try {
    const raw = storage?.getItem(SEARCH_SESSION_KEY)
    if (!raw) return INITIAL_SEARCH_SESSION
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) return INITIAL_SEARCH_SESSION
    const query = parseStructuredQuery(parsed.query)
    const { active, input, submittedText, view, groupBy, sortBy } = parsed
    const validGroup = groupBy === null || groupOptions().some((option) => option.value === groupBy)
    const validSort = sortBy === null || sortOptions().some((option) => option.value === sortBy)
    if (
      !query ||
      typeof active !== 'boolean' ||
      typeof input !== 'string' ||
      typeof submittedText !== 'string' ||
      (view !== 'grid' && view !== 'list') ||
      !validGroup ||
      !validSort
    ) {
      return INITIAL_SEARCH_SESSION
    }
    return {
      active,
      input,
      submittedText,
      query,
      view,
      groupBy: groupBy as string | null,
      sortBy: sortBy as string | null,
    }
  } catch {
    return INITIAL_SEARCH_SESSION
  }
}

export function writeSearchSession(storage: Pick<Storage, 'setItem'> | undefined, session: SearchSession) {
  try {
    storage?.setItem(SEARCH_SESSION_KEY, JSON.stringify(session))
  } catch {
    // Session persistence is best-effort; the in-memory search still works.
  }
}
