import { stableHash } from './discovery'
import type { StructuredSearchQuery } from './searchEngine'
import { isSearchActive, parseStructuredQuery } from './searchState'

export const SEARCH_COHORT_KEY_PREFIX = 'founder-v2-search-cohort:'

export interface SearchCohortHandoff {
  version: 1
  id: string
  source: 'search'
  founderIds: string[]
  count: number
  query: StructuredSearchQuery
  submittedText: string
  createdAt: string
}

export interface CreateSearchCohortInput {
  founderIds: readonly string[]
  query: StructuredSearchQuery
  submittedText: string
  createdAt?: string
}

export function buildDinnerHandoffUrl(cohortId: string) {
  return `/v2/dinner?${new URLSearchParams({ from: 'search', cohort: cohortId }).toString()}`
}

export function parseDinnerHandoff(search: string): { cohortId: string } | null {
  const params = new URLSearchParams(search)
  const cohortId = params.get('cohort')
  if (params.get('from') !== 'search' || !cohortId || !/^s-[0-9a-z-]+$/i.test(cohortId)) return null
  return { cohortId }
}

export function createSearchCohortHandoff(
  storage: Pick<Storage, 'setItem'> | undefined,
  input: CreateSearchCohortInput,
) {
  const founderIds = [...input.founderIds]
  if (!isSearchActive(input.query) || founderIds.length === 0) {
    throw new Error('Dinner handoff needs an active search with results')
  }
  const id = `s-${stableHash(founderIds.join('\u001f')).toString(16).padStart(8, '0')}`
  const payload: SearchCohortHandoff = {
    version: 1,
    id,
    source: 'search',
    founderIds,
    count: founderIds.length,
    query: input.query,
    submittedText: input.submittedText,
    createdAt: input.createdAt ?? new Date().toISOString(),
  }
  try {
    storage?.setItem(`${SEARCH_COHORT_KEY_PREFIX}${id}`, JSON.stringify(payload))
  } catch {
    // Dinner falls back to direct cohort selection when the handoff cannot be stored.
  }
  return { id, url: buildDinnerHandoffUrl(id), payload }
}

export function readSearchCohort(storage: Pick<Storage, 'getItem'> | undefined, cohortId: string) {
  try {
    const raw = storage?.getItem(`${SEARCH_COHORT_KEY_PREFIX}${cohortId}`)
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<SearchCohortHandoff> | null
    if (
      !value ||
      value.version !== 1 ||
      value.id !== cohortId ||
      value.source !== 'search' ||
      !Array.isArray(value.founderIds) ||
      !value.founderIds.every((founderId) => typeof founderId === 'string') ||
      value.count !== value.founderIds.length ||
      typeof value.submittedText !== 'string' ||
      typeof value.createdAt !== 'string'
    ) {
      return null
    }
    const query = parseStructuredQuery(value.query)
    if (!query || !isSearchActive(query) || value.founderIds.length === 0) return null
    return { ...value, query } as SearchCohortHandoff
  } catch {
    return null
  }
}
