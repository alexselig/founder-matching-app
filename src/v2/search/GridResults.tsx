import { useId, useState, type ReactNode } from 'react'

import type { Founder } from '../../shared/founder'
import type { SearchResult } from './searchEngine'
import { matchedDisplays } from './searchExport'
import type { ResultGroup } from './searchState'
import { FounderAttributes, FounderAvatar } from './FounderAttributes'

export function ResultGroups({
  groups,
  renderGroup,
}: {
  groups: readonly ResultGroup[]
  renderGroup: (results: readonly SearchResult[]) => ReactNode
}) {
  return (
    <div className="v2-result-groups">
      {groups.map((group) => (
        <section className="v2-result-group" key={group.key} aria-label={group.label ?? 'Founder results'}>
          {group.label === null ? (
            <h2 className="v2-visually-hidden">Founder results</h2>
          ) : (
            <h2 className="v2-group-heading">
              <span>{group.label}</span>
            </h2>
          )}
          {renderGroup(group.results)}
        </section>
      ))}
    </div>
  )
}

function GridCard({ result, onViewWebResults }: { result: SearchResult; onViewWebResults?: (founder: Founder) => void }) {
  const [open, setOpen] = useState(false)
  const detailsId = useId()
  const { founder } = result
  const displays = matchedDisplays(result)

  return (
    <article
      className={open ? 'v2-founder-card v2-open' : 'v2-founder-card'}
      data-founder-id={founder.id}
      data-age={founder.age}
    >
      <div className="v2-identity">
        <FounderAvatar name={founder.name} />
        <div>
          <h3>{founder.name}</h3>
          <p>{founder.company}</p>
          <button
            type="button"
            className="v2-more"
            aria-expanded={open}
            aria-controls={detailsId}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? 'Less ⌃' : 'More ⌄'}
          </button>
        </div>
      </div>
      {displays.length > 0 && (
        <div className="v2-match-row">
          <div className="v2-matched">
            <small>Matched dimensions</small>
            <ul className="v2-match-chips">
              {displays.map((display) => (
                <li className="v2-match-chip" key={display}>
                  {display}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      <FounderAttributes founder={founder} id={detailsId} hidden={!open} onViewWebResults={onViewWebResults} />
    </article>
  )
}

export function GridResults({ groups, onViewWebResults }: { groups: readonly ResultGroup[]; onViewWebResults?: (founder: Founder) => void }) {
  return (
    <ResultGroups
      groups={groups}
      renderGroup={(results) => (
        <div className="v2-founder-grid">
          {results.map((result) => (
            <GridCard key={result.founder.id} result={result} onViewWebResults={onViewWebResults} />
          ))}
        </div>
      )}
    />
  )
}
