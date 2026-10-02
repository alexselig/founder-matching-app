import { useId, useState } from 'react'

import type { SearchResult } from './searchEngine'
import { matchedDisplays } from './searchExport'
import type { ResultGroup } from './searchState'
import { FounderAttributes, FounderAvatar } from './FounderAttributes'
import { ResultGroups } from './GridResults'

function ListRow({ result }: { result: SearchResult }) {
  const [open, setOpen] = useState(false)
  const detailsId = useId()
  const { founder } = result
  const matched = matchedDisplays(result).join(' · ')

  return (
    <article
      className={open ? 'v2-founder-row v2-open' : 'v2-founder-row'}
      data-founder-id={founder.id}
      data-age={founder.age}
    >
      <div className="v2-identity">
        <FounderAvatar name={founder.name} />
        <div>
          <h3>{founder.name}</h3>
          <p>{founder.company}</p>
        </div>
      </div>
      <div className="v2-list-matched" title={matched || undefined}>
        <span className="v2-visually-hidden">Matched dimensions: </span>
        {matched || '—'}
      </div>
      <span>
        <span className="v2-visually-hidden">Role: </span>
        {founder.role}
      </span>
      <span>
        <span className="v2-visually-hidden">Age: </span>
        {founder.age}
      </span>
      <span className="v2-muted">
        <span className="v2-visually-hidden">Education: </span>
        {founder.education}
      </span>
      <span className="v2-muted">
        <span className="v2-visually-hidden">Cohort: </span>
        {founder.cohortGroup} · {founder.cohortSection}
      </span>
      <span aria-hidden="true" />
      <button
        type="button"
        className="v2-more"
        aria-expanded={open}
        aria-controls={detailsId}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? 'Less ⌃' : 'More ❯'}
      </button>
      <FounderAttributes founder={founder} id={detailsId} hidden={!open} />
    </article>
  )
}

export function ListResults({ groups }: { groups: readonly ResultGroup[] }) {
  return (
    <ResultGroups
      groups={groups}
      renderGroup={(results) => (
        <>
          <div className="v2-table-head" aria-hidden="true">
            <span>Founder</span>
            <span>Matched dimensions</span>
            <span>Role</span>
            <span>Age</span>
            <span>Education</span>
            <span>Cohort</span>
            <span />
            <span />
          </div>
          <div className="v2-founder-list">
            {results.map((result) => (
              <ListRow key={result.founder.id} result={result} />
            ))}
          </div>
        </>
      )}
    />
  )
}
