import { noResultsHeading } from './founderDisplay'

export interface NoResultsProps {
  constraintCount: number
  failedQuery: string
  onEditDimensions: (trigger: HTMLButtonElement) => void
  onClearDimensions: () => void
  onReturnToDiscovery: () => void
}

export function NoResults({
  constraintCount,
  failedQuery,
  onEditDimensions,
  onClearDimensions,
  onReturnToDiscovery,
}: NoResultsProps) {
  return (
    <section className="v2-no-results" aria-labelledby="v2-no-results-heading">
      <div className="v2-empty-summary">
        <div className="v2-empty-zero" aria-hidden="true">
          <strong>0</strong>
          <span>Founders matched</span>
        </div>
        <div className="v2-empty-message">
          <small>No results</small>
          <h2 id="v2-no-results-heading">{noResultsHeading(constraintCount)}</h2>
          <p>Your search and dimensions are still applied. Adjust one constraint rather than starting over.</p>
          {failedQuery && (
            <div className="v2-failed-query" data-testid="failed-query">
              <span className="v2-visually-hidden">Search: </span>
              {failedQuery}
            </div>
          )}
        </div>
        <div className="v2-empty-actions">
          <button
            type="button"
            className="v2-primary-recovery"
            onClick={(event) => onEditDimensions(event.currentTarget)}
          >
            Edit dimensions
          </button>
          <button type="button" onClick={onClearDimensions}>
            Clear all dimensions
          </button>
          <button type="button" onClick={onReturnToDiscovery}>
            Return to discovery
          </button>
        </div>
      </div>
      <p className="v2-recovery-note">Tip: remove or broaden one dimension to preserve the intent of the original search.</p>
    </section>
  )
}
