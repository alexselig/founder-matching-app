import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react'

import {
  OPERATORS_BY_KIND,
  OPERATOR_LABELS,
  SEARCH_FIELDS,
  type SearchDimension,
  type SearchDimensionValue,
  type SearchFieldDefinition,
  type SearchOperator,
  type StructuredSearchQuery,
} from './searchEngine'

const FIELD_HELP: Readonly<Record<string, string>> = {
  role: 'Match founders by their operating role.',
  companyVertical: 'Match the full company-vertical hierarchy.',
  age: 'Match an exact age or numeric range.',
  company: 'Match founders by company name.',
  education: 'Match founders by education.',
  cohortGroup: 'Match founders by cohort group.',
  cohortSection: 'Match founders by cohort section.',
}

const PICKER_FIELDS = SEARCH_FIELDS.filter((field) => field.filter)

function fieldHelp(field: SearchFieldDefinition) {
  return FIELD_HELP[field.key] ?? `Match founders by ${field.label.toLowerCase()}.`
}

function parseValue(field: SearchFieldDefinition, operator: SearchOperator, raw: string): SearchDimensionValue {
  const value = raw.trim()
  if (field.kind !== 'number') return value
  if (operator === 'between') {
    const range = /^(\d+(?:\.\d+)?)\s*(?:-|–|—|to|and)\s*(\d+(?:\.\d+)?)$/i.exec(value)
    if (range) return { min: Number(range[1]), max: Number(range[2]) }
    if (/^\d+(?:\.\d+)?$/.test(value)) return { min: Number(value), max: Number(value) }
    return value
  }
  return /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : value
}

export interface DimensionPickerProps {
  query: StructuredSearchQuery
  anchorRef: RefObject<HTMLButtonElement | null>
  onAdd: (dimension: SearchDimension) => string | null
  onRemove: (field: string) => void
  onClose: () => void
  onAnnounce: (message: string) => void
}

export function DimensionPicker({ query, anchorRef, onAdd, onRemove, onClose, onAnnounce }: DimensionPickerProps) {
  const activeFields = new Set(query.dimensions.map((dimension) => dimension.field))
  const firstInactive = PICKER_FIELDS.find((field) => !activeFields.has(field.key)) ?? PICKER_FIELDS[0]
  const [filter, setFilter] = useState('')
  const [selectedKey, setSelectedKey] = useState(firstInactive.key)
  const [focusKey, setFocusKey] = useState(firstInactive.key)
  const [operator, setOperator] = useState<SearchOperator>(OPERATORS_BY_KIND[firstInactive.kind][0])
  const [value, setValue] = useState('')
  const pickerRef = useRef<HTMLElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const valueRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const titleId = useId()
  const helpId = useId()
  const searchId = useId()
  const operatorId = useId()
  const valueId = useId()

  const selected = PICKER_FIELDS.find((field) => field.key === selectedKey) ?? firstInactive
  const normalizedFilter = filter.trim().toLowerCase()
  const visible = PICKER_FIELDS.filter((field) => field.label.toLowerCase().includes(normalizedFilter)).sort(
    (a, b) => Number(activeFields.has(a.key)) - Number(activeFields.has(b.key)),
  )
  const rovingKey = visible.some((field) => field.key === focusKey) ? focusKey : visible[0]?.key

  useEffect(() => {
    searchRef.current?.focus()
  }, [])

  useLayoutEffect(() => {
    const picker = pickerRef.current
    const anchor = anchorRef.current
    const container = picker?.offsetParent
    if (!picker || !anchor || !(container instanceof HTMLElement)) return
    const anchorRect = anchor.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()
    const pickerRect = picker.getBoundingClientRect()
    if (anchorRect.width === 0) return
    const centered = anchorRect.left + anchorRect.width / 2 - pickerRect.left - 8
    picker.style.setProperty('--v2-pointer-left', `${Math.max(16, Math.min(pickerRect.width - 31, centered))}px`)
    picker.style.top = `${anchorRect.bottom - containerRect.top + 12}px`
  })

  useEffect(() => {
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node
      if (pickerRef.current?.contains(target) || anchorRef.current?.contains(target)) return
      onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handlePointerDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handlePointerDown)
    }
  }, [anchorRef, onClose])

  function selectField(field: SearchFieldDefinition) {
    setSelectedKey(field.key)
    setFocusKey(field.key)
    setOperator(OPERATORS_BY_KIND[field.kind][0])
    setValue('')
    valueRef.current?.focus()
  }

  function activate(field: SearchFieldDefinition) {
    if (activeFields.has(field.key)) {
      onRemove(field.key)
      setFocusKey(field.key)
      if (selectedKey === field.key) {
        const next = PICKER_FIELDS.find((item) => item.key !== field.key && !activeFields.has(item.key))
        if (next) {
          setSelectedKey(next.key)
          setOperator(OPERATORS_BY_KIND[next.kind][0])
          setValue('')
        }
      }
      return
    }
    selectField(field)
  }

  function focusOption(index: number) {
    const options = [...(listRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])]
    const option = options[Math.max(0, Math.min(options.length - 1, index))]
    if (!option) return
    setFocusKey(option.dataset.field ?? '')
    option.focus()
  }

  function handleOptionKeyDown(event: KeyboardEvent<HTMLLIElement>, field: SearchFieldDefinition, index: number) {
    const moves: Record<string, number> = { ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: visible.length - 1 }
    if (event.key in moves) {
      event.preventDefault()
      focusOption(moves[event.key])
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      activate(field)
    }
  }

  function apply() {
    if (!value.trim()) {
      valueRef.current?.focus()
      onAnnounce('Enter a value before adding the dimension')
      return
    }
    const error = onAdd({ field: selected.key, operator, value: parseValue(selected, operator, value) })
    if (error) {
      valueRef.current?.focus()
      onAnnounce(error)
    }
  }

  return (
    <section
      ref={pickerRef}
      className="v2-picker"
      id="v2-dimension-picker"
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
    >
      <div className="v2-picker-head">
        <strong id={titleId}>Add search dimension</strong>
        <span>Choose a field, operator, and value</span>
        <button type="button" className="v2-picker-close" aria-label="Close add dimension picker" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="v2-picker-body">
        <div className="v2-field-panel">
          <label className="v2-form-label" htmlFor={searchId}>
            Search fields
          </label>
          <input
            ref={searchRef}
            className="v2-field-search"
            id={searchId}
            type="search"
            placeholder="Type a field name"
            autoComplete="off"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                focusOption(0)
              }
            }}
          />
          {visible.length > 0 ? (
            <ul
              ref={listRef}
              className="v2-field-list"
              role="listbox"
              aria-label="Searchable and filterable founder fields"
            >
              {visible.map((field, index) => {
                const active = activeFields.has(field.key)
                return (
                  <li
                    key={field.key}
                    className="v2-field-row"
                    role="option"
                    data-field={field.key}
                    aria-selected={field.key === selected.key}
                    tabIndex={field.key === rovingKey ? 0 : -1}
                    onClick={() => activate(field)}
                    onKeyDown={(event) => handleOptionKeyDown(event, field, index)}
                  >
                    <span>{field.label}</span>{' '}
                    <span className={active ? 'v2-field-state v2-field-state-remove' : 'v2-field-state'}>
                      {active ? 'Remove' : '+ Add'}
                    </span>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="v2-field-list v2-empty-state">No matching fields</p>
          )}
        </div>
        <div className="v2-config-panel">
          <div className="v2-config-eyebrow">Configure dimension</div>
          <h3>{selected.label}</h3>
          <p className="v2-config-help" id={helpId}>
            {fieldHelp(selected)}
          </p>
          <div className="v2-config-grid">
            <div>
              <label className="v2-form-label" htmlFor={operatorId}>
                Operator
              </label>
              <select
                id={operatorId}
                value={operator}
                onChange={(event) => setOperator(event.target.value as SearchOperator)}
              >
                {OPERATORS_BY_KIND[selected.kind].map((option) => (
                  <option key={option} value={option}>
                    {OPERATOR_LABELS[option]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="v2-form-label" htmlFor={valueId}>
                Value
              </label>
              <input
                ref={valueRef}
                id={valueId}
                value={value}
                aria-describedby={helpId}
                onChange={(event) => setValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    apply()
                  }
                }}
              />
            </div>
          </div>
          <div className="v2-picker-actions">
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="v2-apply" onClick={apply}>
              Add dimension
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
