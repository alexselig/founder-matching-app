import { useEffect, useMemo, useState } from 'react'
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
    title: 'Discovery before search',
    body: 'The founder view opens with useful people rather than an empty search box. A selected “you” profile powers explainable collections: same sector, different role; complementary operators; shared context; and outside your usual circle.',
    decision: 'Use explainable, deterministic recommendations rather than opaque compatibility scores.',
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

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
}

function Header({ active }: { active: 'plan' | 'directory' | 'admin' }) {
  return (
    <header className="masthead">
      <a className="wordmark" href="/">
        Founder Table
      </a>
      <nav aria-label="Primary navigation">
        <a className={active === 'plan' ? 'active' : ''} href="/">
          Plan review
        </a>
        <a className={active === 'directory' ? 'active' : ''} href="/directory">
          Directory
        </a>
        <a className={active === 'admin' ? 'active' : ''} href="/admin">
          Admin grouping
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
                      onClick={() => updateDecision(section.id, 'approve')}
                    >
                      Approve
                    </button>
                    <button
                      className={decision === 'change' ? 'selected change' : ''}
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

  return (
    <>
      <Header active="directory" />
      <main>
        <section className="directory-intro">
          <div>
            <p className="eyebrow">Founder directory</p>
            <h1>Who should you meet next?</h1>
          </div>
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
        </section>
        <section className="search-bar">
          <label className="search-input">
            <span>Search</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name, company, industry, role…"
            />
          </label>
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
          {searching && (
            <button className="clear" onClick={() => { setQuery(''); setRole(''); setVertical('') }}>
              Clear
            </button>
          )}
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
              <h2>{results.length} founders</h2>
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
          <aside className="drawer" onClick={(event) => event.stopPropagation()}>
            <button className="drawer-close" onClick={() => setOpenFounder(null)}>Close</button>
            <span className="avatar large">{initials(openFounder.name)}</span>
            <p className="eyebrow">{openFounder.role}</p>
            <h2>{openFounder.name}</h2>
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
  const pool = founders.filter((founder) => !industry || founder.topLevelVertical === industry)
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
          <div className="admin-stat"><strong>{result.groups.length}</strong><span>tables from {pool.length} attendees</span></div>
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
                  <button className={strategy === value ? 'selected' : ''} key={value} onClick={() => setStrategy(value)}>{value}</button>
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
  const path = window.location.pathname
  if (path.startsWith('/admin')) return <Admin />
  if (path.startsWith('/directory')) return <Directory />
  return <PlanReview />
}
