import type { Founder } from '../../shared/founder'
import { founderAttributes, initials } from './founderDisplay'

export function FounderAvatar({ name, className = '' }: { name: string; className?: string }) {
  return (
    <span className={`v2-avatar ${className}`.trim()} aria-hidden="true">
      {initials(name)}
    </span>
  )
}

export function FounderAttributes({ founder, id, hidden }: { founder: Founder; id: string; hidden?: boolean }) {
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
      <a
        className="v2-evidence-link"
        href={`/v2/founders/${encodeURIComponent(founder.id)}/evidence`}
      >
        Review Web Search evidence →
      </a>
    </div>
  )
}
