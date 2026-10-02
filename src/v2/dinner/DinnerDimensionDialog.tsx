import { useId, useRef, useState, type RefObject } from 'react'

import type { FounderFieldKey } from '../../shared/schemaRegistry'
import type { CriterionWeightLevel } from './criteria'
import { availableDimensions, type CriterionDraft } from './dinnerState'
import { useDialogFocus } from './useDialogFocus'

const WEIGHTS: readonly CriterionWeightLevel[] = ['L', 'M', 'H']

export function DinnerDimensionDialog({
  criteria,
  onAdd,
  onClose,
  returnFocusRef,
}: {
  readonly criteria: readonly CriterionDraft[]
  readonly onAdd: (field: FounderFieldKey, weight: CriterionWeightLevel) => void
  readonly onClose: () => void
  readonly returnFocusRef?: RefObject<HTMLElement | null>
}) {
  const options = availableDimensions(criteria)
  const [field, setField] = useState<FounderFieldKey>(() => options[0]?.field ?? 'education')
  const [weight, setWeight] = useState<CriterionWeightLevel>(() => options[0]?.weight ?? 'M')
  const selectRef = useRef<HTMLSelectElement>(null)
  const dialogRef = useDialogFocus<HTMLElement>(true, onClose, selectRef, returnFocusRef)
  const titleId = useId()
  const selectId = useId()
  const weightId = useId()

  function changeField(nextField: FounderFieldKey) {
    setField(nextField)
    const option = options.find((candidate) => candidate.field === nextField)
    if (option) setWeight(option.weight)
  }

  return (
    <section
      ref={dialogRef}
      className="v2-setup-overlay v2-dimension-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="v2-setup-overlay-head">
        <div>
          <span className="v2-setup-eyebrow">Matching criteria</span>
          <h2 id={titleId}>Add matching dimension</h2>
          <p>Choose what to optimize and how strongly it should influence the seating plan.</p>
        </div>
        <button type="button" className="v2-setup-close" aria-label="Close dimension dialog" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="v2-dimension-dialog-body">
        <label htmlFor={selectId}>Dimension</label>
        <select
          ref={selectRef}
          id={selectId}
          value={field}
          onChange={(event) => changeField(event.target.value as FounderFieldKey)}
        >
          {options.map((option) => (
            <option key={option.field} value={option.field}>
              {option.label}
            </option>
          ))}
        </select>
        <span id={weightId}>Initial weight</span>
        <div className="v2-dimension-weight" role="group" aria-labelledby={weightId}>
          {WEIGHTS.map((option) => (
            <button
              key={option}
              type="button"
              className={weight === option ? 'v2-dimension-weight-active' : undefined}
              aria-pressed={weight === option}
              onClick={() => setWeight(option)}
            >
              {option}
            </button>
          ))}
        </div>
        <p>L keeps the dimension secondary. M balances it with other criteria. H makes it a primary optimization goal.</p>
      </div>
      <div className="v2-dimension-dialog-actions">
        <button type="button" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="v2-dimension-dialog-confirm" disabled={!options.length} onClick={() => onAdd(field, weight)}>
          Add dimension
        </button>
      </div>
    </section>
  )
}
