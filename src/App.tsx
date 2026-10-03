import { useEffect, useMemo, useState } from 'react'
import { v2DestinationFor } from './app/versionLinks'
import rawFounders from './founders.json'
import {
  buildDiscovery,
  exportGroupsCsv,
  generateGroups,
  normalizeFounders,
  type Founder,
  type GroupingAttribute,
  type GroupingStrategy,
} from './domain'
import './index.css'

const founders = normalizeFounders(rawFounders)

const planSections = [
  {
    id: 'experience',
    label: 'Founder experience',
    title: 'Search first, discovery underneath',
    body: 'Search is the first visual action. The rest of the page remains dedicated to explainable discovery: same sector, different role; complementary operators; shared context; and outside your usual circle.',
    decision: 'Give search top hierarchy while reserving roughly 75% of the page below it for discovery.',
  },
  {
    id: 'search',
    label: 'Directory',
    title: 'Search that narrows without trapping',
    body: 'Search covers names, companies, industries, roles, and education. Founders can combine role, industry, education, age, company, and historical dinner filters. Every active constraint stays visible and removable.',
    decision: 'Treat age and education as optional filters, never default ranking signals.',
  },
  {
    id: 'profiles',
    label: 'Data model',
    title: 'Capture intent, not just biography',
    body: 'The current data is complete but shallow. Future profiles should add company stage, location, expertise, current needs, ways the founder can help, meeting intent, interests, batch, and contact preferences.',
    decision: 'Keep founder-supplied, inferred, and behavioral data visibly separate.',
  },
  {
    id: 'grouping',
    label: 'Organizer workspace',
    title: 'Arbitrary groups with explicit objectives',
    body: 'Admins choose attendee scope, target size, a Similar, Diverse, Balanced, or Custom strategy, and weighted parameters such as age, batch, industry, interests, role, education, company, and prior group.',
    decision: 'Generate deterministic, explainable arrangements and report constraints the heuristic could not satisfy.',
  },
  {
    id: 'delivery',
    label: 'First release',
    title: 'A local prototype with real data',
    body: 'The prototype ships as a static React app using the 574-founder source dataset. Founder discovery and admin grouping work locally. Authentication, messaging, profile editing, and server persistence remain outside the first release.',
    decision: 'Validate the workflows before introducing account and infrastructure complexity.',
  },
]

type Decision = 'open' | 'approve' | 'change'
type FeedbackState = {
  decisions: Record<string, Decision>
  comments: Record<string, string>
  overall: string
  savedAt?: string
}

const emptyFeedback: FeedbackState = {
  decisions: {},
  comments: {},
  overall: '',
}

const v1BasePath = '/v1'

function v1Href(path = '') {
  return `${v1BasePath}${path}`
}

function V1VersionFooter() {
  return (
    <footer className="v1-version-footer" aria-label="Version switcher">
      <a className="active" href="/v1" aria-current="page">V1</a>
      <a href={v2DestinationFor(window.location.pathname)}>V2</a>
    </footer>
  )
}

function normalizeV1Pathname(pathname: string) {
  if (!pathname.startsWith(v1BasePath)) {
    return pathname
  }

  const normalized = pathname.slice(v1BasePath.length)
  return normalized || '/'
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
}

function Header({ active }: { active: 'plan' | 'directory' | 'algorithm' | 'admin' }) {
  return (
    <header className="masthead">
      <a className="wordmark" href={v1Href()}>
        Founder Table
      </a>
      <nav aria-label="Primary navigation">
        <a className={active === 'directory' ? 'active' : ''} href={v1Href('/directory')}>
          Directory
        </a>
        <a className={active === 'admin' ? 'active' : ''} href={v1Href('/admin')}>
          Admin grouping
        </a>
        <a
          className={['nav-secondary-start', active === 'plan' ? 'active' : ''].filter(Boolean).join(' ')}
          href={v1Href('/plan')}
        >
          Plan review
        </a>
        <a className={active === 'algorithm' ? 'active' : ''} href={v1Href('/algorithm')}>
          Algorithm
        </a>
      </nav>
      <span className="dataset-count">{founders.length} founders</span>
    </header>
  )
}

function PlanReview() {
  const [feedback, setFeedback] = useState<FeedbackState>(() => {
    try {
      const stored = localStorage.getItem('founder-plan-feedback-v1')
      return stored ? JSON.parse(stored) : emptyFeedback
    } catch {
      return emptyFeedback
    }
  })

  useEffect(() => {
    const next = { ...feedback, savedAt: new Date().toISOString() }
    localStorage.setItem('founder-plan-feedback-v1', JSON.stringify(next))
  }, [feedback])

  const decided = Object.values(feedback.decisions).filter(
    (value) => value !== 'open',
  ).length

  const updateDecision = (id: string, decision: Decision) =>
    setFeedback((current) => ({
      ...current,
      decisions: { ...current.decisions, [id]: decision },
    }))

  const updateComment = (id: string, comment: string) =>
    setFeedback((current) => ({
      ...current,
      comments: { ...current.comments, [id]: comment },
    }))

  const download = () => {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            plan: 'Founder discovery, search, and organizer grouping',
            ...feedback,
          },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    )
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'founder-table-plan-feedback.json'
    link.click()
    URL.revokeObjectURL(link.href)
  }

  return (
    <>
      <Header active="plan" />
      <main>
        <section className="plan-hero">
          <div>
            <p className="eyebrow">Working proposal · October 1, 2026</p>
            <h1>
              Build the room
              <br />
              before the dinner.
            </h1>
          </div>
          <div className="hero-brief">
            <p>
              A founder-first directory for discovering the right people, plus
              an organizer workspace for shaping intentional groups.
            </p>
            <div className="plan-progress">
              <span>{decided} of {planSections.length} decisions reviewed</span>
              <div>
                {planSections.map((section) => (
                  <i
                    key={section.id}
                    className={
                      feedback.decisions[section.id] === 'approve'
                        ? 'approved'
                        : feedback.decisions[section.id] === 'change'
                          ? 'change'
                          : ''
                    }
                  />
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="plan-ledger">
          <div className="ledger-head">
            <span>Proposal</span>
            <span>Your decision margin</span>
          </div>
          {planSections.map((section, index) => {
            const decision = feedback.decisions[section.id] ?? 'open'
            return (
              <article className="plan-row" key={section.id}>
                <div className="proposal">
                  <span className="section-number">{String(index + 1).padStart(2, '0')}</span>
                  <p className="eyebrow">{section.label}</p>
                  <h2>{section.title}</h2>
                  <p className="section-body">{section.body}</p>
                  <p className="decision-copy">
                    <strong>Proposed decision</strong>
                    {section.decision}
                  </p>
                </div>
                <div className="decision-margin">
                  <div className="decision-buttons" aria-label={`${section.title} decision`}>
                    <button
                      className={decision === 'approve' ? 'selected approve' : ''}
                      aria-pressed={decision === 'approve'}
                      onClick={() => updateDecision(section.id, 'approve')}
                    >
                      Approve
                    </button>
                    <button
                      className={decision === 'change' ? 'selected change' : ''}
                      aria-pressed={decision === 'change'}
                      onClick={() => updateDecision(section.id, 'change')}
                    >
                      Needs changes
                    </button>
                  </div>
                  <label>
                    Notes on this decision
                    <textarea
                      value={feedback.comments[section.id] ?? ''}
                      onChange={(event) => updateComment(section.id, event.target.value)}
                      placeholder="What should change, or what should we preserve?"
                    />
                  </label>
                </div>
              </article>
            )
          })}
        </section>

        <section className="overall-feedback">
          <div>
            <p className="eyebrow">Overall feedback</p>
            <h2>What is missing from the room?</h2>
            <p>
              Comment on priorities, risks, data we should collect, or the first
              real event this should support.
            </p>
          </div>
          <label>
            Review notes
            <textarea
              value={feedback.overall}
              onChange={(event) =>
                setFeedback((current) => ({ ...current, overall: event.target.value }))
              }
              placeholder="Add overall feedback…"
            />
          </label>
        </section>
        <footer className="review-footer">
          <span className="save-state">
            Autosaved in this browser
          </span>
          <button className="primary" onClick={download}>
            Export feedback
          </button>
        </footer>
      </main>
    </>
  )
}

const algorithmSteps = [
  {
    number: '01',
    title: 'Choose the pool',
    body: 'The organizer filters the attendee list. Only people in that pool are assigned. Missing batch and interest data stays missing.',
  },
  {
    number: '02',
    title: 'Set table capacity',
    body: 'The engine calculates the number of tables, then distributes extra seats so table sizes differ by no more than one.',
  },
  {
    number: '03',
    title: 'Measure distance',
    body: 'Each enabled parameter produces a normalized 0–1 distance between two founders. Zero means alike; one means different.',
  },
  {
    number: '04',
    title: 'Place each founder',
    body: 'The seeded order places one founder at every table, then evaluates each remaining founder against every table with an open seat.',
  },
]

const distanceRows = [
  ['Age', 'Absolute age difference ÷ 20, capped at 1'],
  ['Industry', '0 for the same top-level vertical; 1 otherwise'],
  ['Role', '0 for the same role; 1 otherwise'],
  ['Education', '0 for the same category; 1 otherwise'],
  ['Company', '0 for the same company; 1 otherwise'],
  ['Prior group', '0 for the same historical group; 1 otherwise'],
  ['Batch', 'Same/different comparison when batch is captured'],
  ['Interests', 'Jaccard distance across the selected interest tags'],
]

function AlgorithmPage() {
  return (
    <>
      <Header active="algorithm" />
      <main className="algorithm-page">
        <section className="algorithm-hero">
          <div>
            <p className="eyebrow">Dinner matching · v1</p>
            <h1>How tables are composed.</h1>
          </div>
          <div className="algorithm-principle">
            <strong>Deterministic, adjustable, explainable.</strong>
            <p>
              The algorithm is a fast grouping heuristic. It helps organizers
              express the kind of room they want without presenting the result
              as a scientifically perfect match.
            </p>
            <a className="bauhaus-link-button" href={v1Href('/admin')}>Try the grouping workspace</a>
          </div>
        </section>

        <section className="algorithm-index">
          {algorithmSteps.map((step) => (
            <article key={step.number}>
              <span>{step.number}</span>
              <h2>{step.title}</h2>
              <p>{step.body}</p>
            </article>
          ))}
        </section>

        <section className="algorithm-section two-column">
          <div className="section-heading">
            <p className="eyebrow">Table sizing</p>
            <h2>Balanced capacity comes first.</h2>
          </div>
          <div className="algorithm-copy">
            <p>
              For <strong>N</strong> attendees and a target size of{' '}
              <strong>T</strong>, v1 creates <code>ceil(N ÷ T)</code> tables.
              It then assigns a base size to every table and gives one extra
              seat to the first remainder tables.
            </p>
            <div className="worked-example">
              <span>Example</span>
              <strong>26 attendees · target 8</strong>
              <p>4 tables: 7, 7, 6, 6. No table differs by more than one seat.</p>
            </div>
          </div>
        </section>

        <section className="algorithm-section">
          <div className="section-heading">
            <p className="eyebrow">Distance model</p>
            <h2>Every parameter speaks the same numeric language.</h2>
            <p>
              The engine converts enabled attributes into distances from zero
              to one, then averages them. Organizers control which attributes
              matter by turning them on or off.
            </p>
          </div>
          <div className="distance-table" role="table" aria-label="Attribute distance rules">
            {distanceRows.map(([attribute, rule]) => (
              <div role="row" key={attribute}>
                <strong role="cell">{attribute}</strong>
                <span role="cell">{rule}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="strategy-section">
          <div className="strategy-intro">
            <p className="eyebrow">Organizer intent</p>
            <h2>One distance model. Four ways to use it.</h2>
          </div>
          <div className="strategy-doc-grid">
            <article>
              <span className="strategy-marker blue" />
              <h3>Similar</h3>
              <p>Choose the table with the lowest average distance. Useful for focused peer conversations.</p>
            </article>
            <article>
              <span className="strategy-marker orange" />
              <h3>Diverse</h3>
              <p>Choose the table with the highest average distance. Useful for cross-pollination and broader rooms.</p>
            </article>
            <article>
              <span className="strategy-marker yellow" />
              <h3>Balanced</h3>
              <p>Choose the table whose average distance is closest to 0.55, a product heuristic for mixing overlap with difference.</p>
            </article>
            <article>
              <span className="strategy-marker ink" />
              <h3>Random</h3>
              <p>Ignore the selected similarity attributes, while retaining seeded ordering and the same-company penalty.</p>
            </article>
          </div>
        </section>

        <section className="algorithm-section two-column">
          <div className="section-heading">
            <p className="eyebrow">Placement cost</p>
            <h2>Same-company pairs receive a strong penalty.</h2>
          </div>
          <div className="algorithm-copy">
            <p>
              For each founder, the engine averages their distance from the
              founders already at a candidate table. It converts that average
              into a strategy cost, then adds a <strong>+3 penalty</strong> if
              the table already contains someone from the same company.
            </p>
            <p>
              That penalty separates colleagues when capacity allows. It is a
              soft constraint in v1, so the engine can still finish when the
              attendee pool makes perfect separation impossible.
            </p>
          </div>
        </section>

        <section className="algorithm-section seed-section">
          <div className="section-heading">
            <p className="eyebrow">Reproducibility</p>
            <h2>The seed changes the arrangement, not the rules.</h2>
          </div>
          <div className="seed-diagram" aria-label="Seeded grouping flow">
            <span>dinner-01</span>
            <i>→</i>
            <span>Stable founder order</span>
            <i>→</i>
            <span>Repeatable tables</span>
          </div>
          <p>
            The seed and founder ID are passed through a stable FNV-1a hash.
            The same pool, settings, and seed always return the same result.
            Change only the seed to explore another capacity-compliant arrangement.
          </p>
        </section>

        <section className="limits-section">
          <div>
            <p className="eyebrow">What v1 does not claim</p>
            <h2>This is a useful heuristic, not a global optimum.</h2>
          </div>
          <ul>
            <li>It assigns greedily and does not yet backtrack through every possible arrangement.</li>
            <li>Company separation is a penalty, not a guaranteed hard constraint.</li>
            <li>Batch and interests remain disabled until organizers collect those values.</li>
            <li>It does not infer interests, compatibility, or sensitive traits.</li>
          </ul>
        </section>

        <section className="roadmap-section">
          <p className="eyebrow">Planned next</p>
          <h2>From fast grouping to constraint-aware optimization.</h2>
          <div className="roadmap-grid">
            <div><span>01</span><strong>Hard constraints</strong><p>Lock seats, keep people together or apart, and exclude attendees.</p></div>
            <div><span>02</span><strong>Pairwise improvement</strong><p>Swap founders after the first pass when the total score improves.</p></div>
            <div><span>03</span><strong>Group diagnostics</strong><p>Show composition summaries, score drivers, and unsatisfied constraints.</p></div>
            <div><span>04</span><strong>Custom weights</strong><p>Let organizers choose similarity, diversity, and importance per parameter.</p></div>
          </div>
        </section>
      </main>
    </>
  )
}

function FounderCard({
  founder,
  reason,
  onOpen,
}: {
  founder: Founder
  reason?: string
  onOpen: () => void
}) {
  return (
    <button className="founder-card" onClick={onOpen}>
      <span className="avatar">{initials(founder.name)}</span>
      <span className="founder-main">
        <strong>{founder.name}</strong>
        <span>{founder.role} · {founder.company}</span>
        <small>{founder.vertical}</small>
        {reason && <em>{reason}</em>}
      </span>
      <span aria-hidden="true">↗</span>
    </button>
  )
}

function Directory() {
  const [selectedId, setSelectedId] = useState(founders[0].id)
  const [query, setQuery] = useState('')
  const [role, setRole] = useState('')
  const [vertical, setVertical] = useState('')
  const [openFounder, setOpenFounder] = useState<Founder | null>(null)
  const selected = founders.find((founder) => founder.id === selectedId) ?? founders[0]
  const verticals = useMemo(
    () => [...new Set(founders.map((founder) => founder.topLevelVertical))].sort(),
    [],
  )
  const results = useMemo(() => {
    const tokens = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
    return founders.filter((founder) => {
      const text = [founder.name, founder.company, founder.vertical, founder.role, founder.education]
        .join(' ')
        .toLowerCase()
      return (
        tokens.every((token) => text.includes(token)) &&
        (!role || founder.role === role) &&
        (!vertical || founder.topLevelVertical === vertical)
      )
    })
  }, [query, role, vertical])
  const discovery = useMemo(() => buildDiscovery(founders, selected), [selected])
  const searching = Boolean(query || role || vertical)

  useEffect(() => {
    if (!openFounder) return
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenFounder(null)
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [openFounder])

  return (
    <>
      <Header active="directory" />
      <main>
        <section className="directory-search-hero">
          <div className="directory-search-copy">
            <p className="eyebrow">Founder directory</p>
            <h1>Find a founder.</h1>
            <label className="search-input hero-search">
              <span>Search</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Name, company, industry, role…"
                autoFocus
              />
            </label>
          </div>
          <div className="directory-search-tools">
            <label className="profile-select">
              Browsing as
              <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
                {founders.map((founder) => (
                  <option key={founder.id} value={founder.id}>
                    {founder.name} · {founder.company}
                  </option>
                ))}
              </select>
            </label>
            <div className="filter-grid">
              <label>
                Role
                <select value={role} onChange={(event) => setRole(event.target.value)}>
                  <option value="">All roles</option>
                  <option>Design</option>
                  <option>Engineering</option>
                  <option>Sales</option>
                </select>
              </label>
              <label>
                Industry
                <select value={vertical} onChange={(event) => setVertical(event.target.value)}>
                  <option value="">All industries</option>
                  {verticals.map((value) => <option key={value}>{value}</option>)}
                </select>
              </label>
            </div>
            {searching && (
              <button className="clear" onClick={() => { setQuery(''); setRole(''); setVertical('') }}>
                Clear search and filters
              </button>
            )}
          </div>
        </section>

        {!searching ? (
          <div className="discovery-grid">
            {discovery.map((collection) => (
              <section className="discovery-column" key={collection.title}>
                <p className="eyebrow">{collection.kicker}</p>
                <h2>{collection.title}</h2>
                <p>{collection.description}</p>
                <div className="founder-list">
                  {collection.founders.map(({ founder, reason }) => (
                    <FounderCard
                      founder={founder}
                      reason={reason}
                      key={founder.id}
                      onOpen={() => setOpenFounder(founder)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <section className="results">
            <div className="results-head">
              <h2 aria-live="polite">{results.length} founders</h2>
              <span>All active filters are combined</span>
            </div>
            {results.length ? (
              <div className="result-grid">
                {results.map((founder) => (
                  <FounderCard founder={founder} key={founder.id} onOpen={() => setOpenFounder(founder)} />
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <h2>No founders match those constraints.</h2>
                <button className="primary" onClick={() => { setQuery(''); setRole(''); setVertical('') }}>
                  Clear search and filters
                </button>
              </div>
            )}
          </section>
        )}
      </main>
      {openFounder && (
        <div className="drawer-scrim" onClick={() => setOpenFounder(null)}>
          <aside
            className="drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="founder-drawer-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button className="drawer-close" autoFocus onClick={() => setOpenFounder(null)}>Close</button>
            <span className="avatar large">{initials(openFounder.name)}</span>
            <p className="eyebrow">{openFounder.role}</p>
            <h2 id="founder-drawer-title">{openFounder.name}</h2>
            <p className="drawer-company">{openFounder.company}</p>
            <dl>
              <div><dt>Industry</dt><dd>{openFounder.vertical}</dd></div>
              <div><dt>Education</dt><dd>{openFounder.education}</dd></div>
              <div><dt>Age</dt><dd>{openFounder.age}</dd></div>
              <div><dt>Prior table</dt><dd>{openFounder.groupSection}</dd></div>
            </dl>
            <div className="data-gap">
              <strong>Profile enrichment</strong>
              <p>Interests, current needs, expertise, batch, location, and meeting intent are not yet captured.</p>
            </div>
          </aside>
        </div>
      )}
    </>
  )
}

const attributeLabels: Record<GroupingAttribute, string> = {
  age: 'Age',
  industry: 'Industry',
  role: 'Role',
  education: 'Education',
  company: 'Company',
  historicalGroup: 'Prior group',
  batch: 'Batch',
  interests: 'Interests',
}

function Admin() {
  const [targetSize, setTargetSize] = useState(8)
  const [strategy, setStrategy] = useState<GroupingStrategy>('balanced')
  const [seed, setSeed] = useState('dinner-01')
  const [attributes, setAttributes] = useState<GroupingAttribute[]>(['industry', 'role', 'age'])
  const [industry, setIndustry] = useState('')
  const verticals = [...new Set(founders.map((founder) => founder.topLevelVertical))].sort()
  const pool = useMemo(
    () => founders.filter((founder) => !industry || founder.topLevelVertical === industry),
    [industry],
  )
  const result = useMemo(
    () => generateGroups(pool, { targetSize, strategy, seed, attributes }),
    [pool, targetSize, strategy, seed, attributes],
  )

  const downloadCsv = () => {
    const link = document.createElement('a')
    const blob = new Blob([exportGroupsCsv(result.groups)], { type: 'text/csv' })
    link.href = URL.createObjectURL(blob)
    link.download = 'founder-dinner-groups.csv'
    link.click()
    URL.revokeObjectURL(link.href)
  }

  const toggleAttribute = (attribute: GroupingAttribute) =>
    setAttributes((current) =>
      current.includes(attribute)
        ? current.filter((value) => value !== attribute)
        : [...current, attribute],
    )

  return (
    <>
      <Header active="admin" />
      <main className="admin-page">
        <section className="admin-title">
          <div>
            <p className="eyebrow warn">Admin preview · access control not enabled</p>
            <h1>Compose the tables.</h1>
            <p>Set the social logic, inspect the arrangement, then export it for the dinner team.</p>
          </div>
          <div className="admin-stat" aria-live="polite"><strong>{result.groups.length}</strong><span>tables from {pool.length} attendees</span></div>
        </section>
        <div className="admin-layout">
          <aside className="control-rail">
            <div className="control-block">
              <p className="eyebrow">Attendee pool</p>
              <label>Industry<select value={industry} onChange={(event) => setIndustry(event.target.value)}><option value="">All industries</option>{verticals.map((value) => <option key={value}>{value}</option>)}</select></label>
              <label>Target table size<input type="number" min="2" max="20" value={targetSize} onChange={(event) => setTargetSize(Math.max(2, Number(event.target.value)))} /></label>
            </div>
            <div className="control-block">
              <p className="eyebrow">Grouping strategy</p>
              <div className="strategy-grid">
                {(['balanced', 'diverse', 'similar', 'random'] as GroupingStrategy[]).map((value) => (
                  <button
                    className={strategy === value ? 'selected' : ''}
                    key={value}
                    aria-pressed={strategy === value}
                    onClick={() => setStrategy(value)}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>
            <div className="control-block">
              <p className="eyebrow">Parameters</p>
              <div className="parameter-list">
                {(Object.keys(attributeLabels) as GroupingAttribute[]).map((attribute) => {
                  const unavailable = attribute === 'batch' || attribute === 'interests'
                  return (
                    <label className={unavailable ? 'disabled' : ''} key={attribute}>
                      <input type="checkbox" checked={attributes.includes(attribute)} disabled={unavailable} onChange={() => toggleAttribute(attribute)} />
                      <span>{attributeLabels[attribute]}</span>
                      {unavailable && <em>Not captured</em>}
                    </label>
                  )
                })}
              </div>
            </div>
            <div className="control-block">
              <label>Arrangement seed<input value={seed} onChange={(event) => setSeed(event.target.value)} /></label>
              <p className="hint">Change the seed for another valid arrangement. The same seed always reproduces the same tables.</p>
            </div>
            <button className="primary full" onClick={downloadCsv}>Export groups as CSV</button>
          </aside>
          <section className="groups-area">
            <div className="groups-note">
              <strong>{strategy[0].toUpperCase() + strategy.slice(1)} arrangement</strong>
              <span>Table sizes differ by no more than one. Same-company founders are separated where possible.</span>
            </div>
            <div className="groups-grid">
              {result.groups.map((group, index) => (
                <article className="group-card" key={index}>
                  <header><span>Table {String(index + 1).padStart(2, '0')}</span><strong>{group.length} seats</strong></header>
                  <div className="group-members">
                    {group.map((founder) => (
                      <div key={founder.id}>
                        <span className="avatar small">{initials(founder.name)}</span>
                        <span><strong>{founder.name}</strong><small>{founder.role} · {founder.company}</small></span>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      </main>
    </>
  )
}

export default function App() {
  const path = normalizeV1Pathname(window.location.pathname)
  const page = path.startsWith('/admin')
    ? <Admin />
    : path.startsWith('/algorithm')
      ? <AlgorithmPage />
      : path.startsWith('/plan')
        ? <PlanReview />
        : <Directory />
  return (
    <>
      {page}
      <V1VersionFooter />
    </>
  )
}
