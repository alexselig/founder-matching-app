import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'

import rawFounders from '../../founders.json'
import { normalizeFounders, type Founder } from '../../shared/founder'
import { V2Footer } from '../layout/V2Footer'
import { V2Header } from '../layout/V2Header'
import {
  browserLocalStorage,
  browserSessionStorage,
  readAccountRole,
  readCurrentFounderId,
  writeAccountRole,
  type AccountRole,
} from './accountState'
import { DimensionPicker } from './DimensionPicker'
import { buildDiscoveryCollections } from './discovery'
import { GridResults } from './GridResults'
import { ListResults } from './ListResults'
import { NoResults } from './NoResults'
import {
  compileSearchText,
  executeSearch,
  formatDimensionValue,
  getSearchField,
  validateStructuredQuery,
  type SearchDimension,
  type SearchResult,
  type StructuredSearchQuery,
} from './searchEngine'
import { downloadSearchResultsCsv } from './searchExport'
import { createSearchCohortHandoff } from './searchHandoff'
import {
  EMPTY_QUERY,
  INITIAL_SEARCH_SESSION,
  deriveDefaultGroupBy,
  groupResults,
  readSearchSession,
  sortResults,
  writeSearchSession,
  type SearchSession,
} from './searchState'
import { SearchToolbar } from './SearchToolbar'
import { ZeroQueryDiscovery } from './ZeroQueryDiscovery'
import './search.css'

const DEFAULT_FOUNDERS: readonly Founder[] = normalizeFounders(rawFounders)

export interface SearchPageProps {
  founders?: readonly Founder[]
  navigate?: (url: string) => void
  exportResults?: (results: readonly SearchResult[]) => void
}

function defaultNavigate(url: string) {
  window.location.assign(url)
}

function runSearch(founders: readonly Founder[], query: StructuredSearchQuery) {
  try {
    return executeSearch(founders, query)
  } catch {
    return []
  }
}

function matchedMessage(count: number) {
  return `${count} ${count === 1 ? 'founder' : 'founders'} matched`
}

function fieldLabel(field: string) {
  return getSearchField(field)?.label ?? field
}

function describeDimensions(query: StructuredSearchQuery) {
  return [
    ...query.dimensions.map((dimension) => `${fieldLabel(dimension.field)} ${formatDimensionValue(dimension)}`),
    ...(query.text.trim() ? [query.text] : []),
  ].join(' · ')
}

export function SearchPage({
  founders = DEFAULT_FOUNDERS,
  navigate = defaultNavigate,
  exportResults = downloadSearchResultsCsv,
}: SearchPageProps) {
  const [role, setRole] = useState<AccountRole>(() => readAccountRole(browserLocalStorage()))
  const [currentFounderId] = useState(() => readCurrentFounderId(browserLocalStorage(), founders))
  const [session, setSession] = useState<SearchSession>(() => readSearchSession(browserSessionStorage()))
  const [pickerOpen, setPickerOpen] = useState(false)
  const [message, setMessage] = useState('')
  const addButtonRef = useRef<HTMLButtonElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const pendingFocusRef = useRef<HTMLElement | null>(null)
  const queryInputId = useId()

  const currentFounder = founders.find((founder) => founder.id === currentFounderId) ?? null
  const { active, query, view } = session
  const groupBy = session.groupBy ?? deriveDefaultGroupBy(query)
  const sortBy = session.sortBy ?? 'relevance'

  const results = useMemo(() => (active ? runSearch(founders, query) : []), [active, founders, query])
  const groups = useMemo(() => groupResults(sortResults(results, sortBy), groupBy), [results, sortBy, groupBy])
  const ordered = useMemo(() => groups.flatMap((group) => group.results), [groups])
  const collections = useMemo(() => buildDiscoveryCollections(founders, currentFounder), [founders, currentFounder])
  const failedQuery = useMemo(() => {
    const submitted = session.submittedText
    const unchanged = submitted && JSON.stringify(compileSearchText(submitted, founders)) === JSON.stringify(query)
    return unchanged ? submitted : describeDimensions(query)
  }, [founders, query, session.submittedText])

  useEffect(() => {
    writeSearchSession(browserSessionStorage(), session)
  }, [session])

  function updateSession(patch: Partial<SearchSession>) {
    setSession((previous) => ({ ...previous, ...patch }))
  }

  function applyQuery(next: StructuredSearchQuery, announcement: string) {
    updateSession({ active: true, query: next })
    setMessage(`${announcement}. ${matchedMessage(runSearch(founders, next).length)}`)
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = session.input.trim()
    setPickerOpen(false)
    if (!text) {
      returnToDiscovery()
      return
    }
    const compiled = compileSearchText(text, founders)
    setSession((previous) => ({
      ...previous,
      active: true,
      input: session.input,
      submittedText: text,
      query: compiled,
      groupBy: null,
      sortBy: null,
    }))
    setMessage(matchedMessage(runSearch(founders, compiled).length))
  }

  function removeDimension(field: string) {
    applyQuery(
      { ...query, dimensions: query.dimensions.filter((dimension) => dimension.field !== field) },
      `${fieldLabel(field)} dimension removed`,
    )
  }

  function addDimension(dimension: SearchDimension) {
    const next = {
      ...query,
      dimensions: [...query.dimensions.filter((item) => item.field !== dimension.field), dimension],
    }
    try {
      validateStructuredQuery(next)
    } catch (error) {
      return error instanceof Error ? error.message : 'That dimension could not be added'
    }
    applyQuery(next, `${fieldLabel(dimension.field)} dimension added`)
    closePicker()
    return null
  }

  const closePicker = useCallback(() => {
    pendingFocusRef.current = returnFocusRef.current ?? addButtonRef.current
    returnFocusRef.current = null
    setPickerOpen(false)
  }, [])

  useEffect(() => {
    const target = pendingFocusRef.current
    if (pickerOpen || !target) return
    pendingFocusRef.current = null
    ;(target.isConnected ? target : addButtonRef.current)?.focus()
  })

  function openPicker(trigger: HTMLElement | null) {
    returnFocusRef.current = trigger
    setPickerOpen(true)
  }

  function togglePicker() {
    if (pickerOpen) closePicker()
    else openPicker(addButtonRef.current)
  }

  function clearAllDimensions() {
    applyQuery(EMPTY_QUERY, 'All dimensions cleared')
  }

  function returnToDiscovery() {
    setPickerOpen(false)
    setSession((previous) => ({ ...INITIAL_SEARCH_SESSION, view: previous.view }))
    setMessage('Founder discovery shown')
  }

  function changeRole(next: AccountRole) {
    setRole(next)
    writeAccountRole(browserLocalStorage(), next)
  }

  function handleExport() {
    exportResults(ordered)
    setMessage(`Exported ${ordered.length} ${ordered.length === 1 ? 'founder' : 'founders'}`)
  }

  function handleCreateDinner() {
    const handoff = createSearchCohortHandoff(browserSessionStorage(), {
      founderIds: ordered.map((result) => result.founder.id),
      query,
      submittedText: session.submittedText,
    })
    navigate(handoff.url)
  }

  const hasResults = active && results.length > 0

  return (
    <div className="v2-shell v2-search">
      <V2Header active="founder-index" role={role} currentFounder={currentFounder} onRoleChange={changeRole} />
      <main className="v2-search-main">
        <section className="v2-hero" aria-labelledby="v2-search-title">
          <div className="v2-hero-title">
            <div className="v2-eyebrow">
              Schema-wide founder
              <br />
              search
            </div>
            <h1 id="v2-search-title">Find the right founders.</h1>
          </div>
          <form className="v2-search-area" role="search" onSubmit={submit}>
            <label htmlFor={queryInputId}>Describe the founders you want to meet</label>
            <div className="v2-query">
              <input
                id={queryInputId}
                type="text"
                placeholder="Try “Sales founders in fintech”"
                autoComplete="off"
                value={session.input}
                onChange={(event) => updateSession({ input: event.target.value })}
              />
              <button type="submit">Search</button>
            </div>
          </form>
        </section>
        {active ? (
          <>
            <SearchToolbar
              count={results.length}
              query={query}
              groupBy={groupBy}
              sortBy={sortBy}
              view={view}
              pickerOpen={pickerOpen}
              addButtonRef={addButtonRef}
              picker={
                pickerOpen ? (
                  <DimensionPicker
                    query={query}
                    anchorRef={addButtonRef}
                    onAdd={addDimension}
                    onRemove={removeDimension}
                    onClose={closePicker}
                    onAnnounce={setMessage}
                  />
                ) : null
              }
              onRemoveDimension={removeDimension}
              onRemoveKeywords={() => applyQuery({ ...query, text: '' }, 'Keywords dimension removed')}
              onTogglePicker={togglePicker}
              onGroupByChange={(value) => updateSession({ groupBy: value })}
              onSortByChange={(value) => updateSession({ sortBy: value })}
              onViewChange={(value) => updateSession({ view: value })}
            />
            {results.length === 0 ? (
              <NoResults
                dimensionCount={query.dimensions.length}
                failedQuery={failedQuery}
                onEditDimensions={openPicker}
                onClearDimensions={clearAllDimensions}
                onReturnToDiscovery={returnToDiscovery}
              />
            ) : view === 'grid' ? (
              <GridResults groups={groups} />
            ) : (
              <ListResults groups={groups} />
            )}
          </>
        ) : (
          <ZeroQueryDiscovery collections={collections} />
        )}
      </main>
      <V2Footer
        role={role}
        onExport={hasResults ? handleExport : undefined}
        onCreateDinner={hasResults ? handleCreateDinner : undefined}
      />
      <div className="v2-visually-hidden" role="status" aria-live="polite" data-testid="search-live-region">
        {message}
      </div>
    </div>
  )
}
