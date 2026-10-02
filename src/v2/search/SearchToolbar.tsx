import { useId, type CSSProperties, type ReactNode, type RefObject } from 'react'

import { formatDimensionValue, getSearchField, type StructuredSearchQuery } from './searchEngine'
import { groupOptions, isSearchActive, sortOptions, type SearchView } from './searchState'

const GROUP_OPTIONS = groupOptions()
const SORT_OPTIONS = sortOptions()

function selectWidth(options: readonly { value: string; label: string }[], value: string): CSSProperties {
  const label = options.find((option) => option.value === value)?.label ?? ''
  return { '--v2-select-chars': label.length } as CSSProperties
}

function GridIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" focusable="false">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </svg>
  )
}

function ListIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" focusable="false">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <circle cx="4" cy="6" r="1" />
      <circle cx="4" cy="12" r="1" />
      <circle cx="4" cy="18" r="1" />
    </svg>
  )
}

function DimensionChip({
  field,
  label,
  value,
  onRemove,
}: {
  field: string
  label: string
  value: string
  onRemove: () => void
}) {
  return (
    <li className="v2-dimension" data-testid={`dimension-${field}`}>
      <b>{label}</b> {value}
      <button
        type="button"
        className="v2-chip-remove"
        aria-label={`Remove ${label} dimension`}
        title={`Remove ${label}`}
        onClick={onRemove}
      >
        ×
      </button>
    </li>
  )
}

export interface SearchToolbarProps {
  count: number
  query: StructuredSearchQuery
  groupBy: string
  sortBy: string
  view: SearchView
  pickerOpen: boolean
  addButtonRef: RefObject<HTMLButtonElement | null>
  picker: ReactNode
  onRemoveDimension: (field: string) => void
  onRemoveKeywords: () => void
  onTogglePicker: () => void
  onGroupByChange: (value: string) => void
  onSortByChange: (value: string) => void
  onViewChange: (view: SearchView) => void
}

export function SearchToolbar({
  count,
  query,
  groupBy,
  sortBy,
  view,
  pickerOpen,
  addButtonRef,
  picker,
  onRemoveDimension,
  onRemoveKeywords,
  onTogglePicker,
  onGroupByChange,
  onSortByChange,
  onViewChange,
}: SearchToolbarProps) {
  const groupId = useId()
  const sortId = useId()
  const dimensionsLabelId = useId()
  const hasCriteria = isSearchActive(query)

  return (
    <section className="v2-toolbar" aria-label="Search results controls">
      <div className="v2-result-count">
        <strong data-testid="result-count">{count}</strong>
        <span>
          Founders
          <br />
          matched
        </span>
      </div>
      <div className="v2-dimensions">
        <div className="v2-toolbar-label" id={dimensionsLabelId}>
          Search dimensions used
        </div>
        <div className="v2-dimension-row">
          <ul className="v2-dimension-list" aria-labelledby={dimensionsLabelId}>
            {!hasCriteria && <li className="v2-empty-dimensions">No dimensions yet</li>}
            {query.dimensions.map((dimension) => {
              const label = getSearchField(dimension.field)?.label ?? dimension.field
              return (
                <DimensionChip
                  key={dimension.field}
                  field={dimension.field}
                  label={label}
                  value={formatDimensionValue(dimension)}
                  onRemove={() => onRemoveDimension(dimension.field)}
                />
              )
            })}
            {query.text.trim() !== '' && (
              <DimensionChip field="keywords" label="Keywords" value={query.text} onRemove={onRemoveKeywords} />
            )}
          </ul>
          <button
            ref={addButtonRef}
            type="button"
            className="v2-add-dimension"
            aria-haspopup="dialog"
            aria-expanded={pickerOpen}
            aria-controls={pickerOpen ? 'v2-dimension-picker' : undefined}
            onClick={onTogglePicker}
          >
            + Add dimension
          </button>
        </div>
        {picker}
      </div>
      <div className="v2-select-cell">
        <label className="v2-toolbar-label" htmlFor={groupId}>
          Group by
        </label>
        <select
          id={groupId}
          className="v2-select"
          value={groupBy}
          style={selectWidth(GROUP_OPTIONS, groupBy)}
          onChange={(event) => onGroupByChange(event.target.value)}
        >
          {GROUP_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className="v2-select-cell">
        <label className="v2-toolbar-label" htmlFor={sortId}>
          Sort by
        </label>
        <select
          id={sortId}
          className="v2-select"
          value={sortBy}
          style={selectWidth(SORT_OPTIONS, sortBy)}
          onChange={(event) => onSortByChange(event.target.value)}
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className="v2-view-switch" role="group" aria-label="Results view">
        <button
          type="button"
          aria-label="Grid view"
          title="Grid view"
          aria-pressed={view === 'grid'}
          onClick={() => onViewChange('grid')}
        >
          <GridIcon />
        </button>
        <button
          type="button"
          aria-label="List view"
          title="List view"
          aria-pressed={view === 'list'}
          onClick={() => onViewChange('list')}
        >
          <ListIcon />
        </button>
      </div>
    </section>
  )
}
