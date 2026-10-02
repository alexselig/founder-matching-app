import type { Founder } from '../../shared/founder'
import { founderAttributes, initials } from './founderDisplay'

export function FounderAvatar({ name, className = '' }: { name: string; className?: string }) {
  return (
    <span className={`v2-avatar ${className}`.trim()} aria-hidden="true">
      {initials(name)}
    </span>
  )
}

export function FounderAttributes({
  founder,
  id,
  hidden,
  onViewWebResults,
}: {
  founder: Founder
  id: string
  hidden?: boolean
  onViewWebResults?: (founder: Founder) => void
}) {
  return (
    <div className="v2-details" id={id} hidden={hidden}>
      <dl className="v2-details-grid">
        {founderAttributes(founder).map(({ label, value, wide }) => (
          <div className={wide ? 'v2-attribute v2-attribute-wide' : 'v2-attribute'} key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {onViewWebResults ? (
        <button type="button" className="v2-evidence-link" onClick={() => onViewWebResults(founder)}>
          View top web results →
        </button>
      ) : (
        <a className="v2-evidence-link" href={`/v2/founders/${encodeURIComponent(founder.id)}/evidence`}>
          View top web results →
        </a>
      )}
    </div>
  )
}
