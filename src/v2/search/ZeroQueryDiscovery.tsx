import { useId, useState } from 'react'

import type { Founder } from '../../shared/founder'
import type { DiscoveryCollection, DiscoveryRecommendation } from './discovery'
import { FounderAttributes, FounderAvatar } from './FounderAttributes'

function RecommendationRow({
  recommendation,
  onViewWebResults,
}: {
  recommendation: DiscoveryRecommendation
  onViewWebResults?: (founder: Founder) => void
}) {
  const [open, setOpen] = useState(false)
  const detailsId = useId()
  const { founder, reason } = recommendation

  return (
    <div className={open ? 'v2-recommendation v2-open' : 'v2-recommendation'}>
      <button
        type="button"
        className="v2-recommendation-founder"
        aria-expanded={open}
        aria-controls={detailsId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="v2-recommendation-identity">
          <FounderAvatar name={founder.name} />
          <span>
            <strong>{founder.name}</strong>
            <span className="v2-recommendation-company">{founder.company}</span>
            <span className="v2-recommendation-more">{open ? 'Less ⌃' : 'More ⌄'}</span>
          </span>
        </span>
        <span className="v2-recommendation-match">
          <span className="v2-visually-hidden">Reason recommended: </span>
          <em className="v2-recommendation-reason">{reason}</em>
        </span>
      </button>
      <FounderAttributes founder={founder} id={detailsId} hidden={!open} onViewWebResults={onViewWebResults} />
    </div>
  )
}

function CollectionColumn({
  collection,
  onViewWebResults,
}: {
  collection: DiscoveryCollection
  onViewWebResults?: (founder: Founder) => void
}) {
  const headingId = useId()

  return (
    <section className="v2-recommendation-column" aria-labelledby={headingId}>
      <span className="v2-column-kicker">{collection.kicker}</span>
      <h2 id={headingId}>{collection.title}</h2>
      <p className="v2-recommendation-description">{collection.description}</p>
      <div className="v2-recommendation-list-head" aria-hidden="true">
        <span />
        <span>Reason recommended</span>
      </div>
      <div className="v2-recommendation-list">
        {collection.founders.map((recommendation) => (
          <RecommendationRow
            key={recommendation.founder.id}
            recommendation={recommendation}
            onViewWebResults={onViewWebResults}
          />
        ))}
      </div>
    </section>
  )
}

export function ZeroQueryDiscovery({
  collections,
  onViewWebResults,
}: {
  collections: readonly DiscoveryCollection[]
  onViewWebResults?: (founder: Founder) => void
}) {
  return (
    <section className="v2-zero-discovery" aria-label="Founder discovery">
      <div className="v2-recommendation-columns">
        {collections.map((collection) => (
          <CollectionColumn key={collection.title} collection={collection} onViewWebResults={onViewWebResults} />
        ))}
      </div>
    </section>
  )
}
