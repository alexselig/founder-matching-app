# Founder Search and Dinner Matching V2 Architecture Design

## Purpose

Build V2 against the approved product specification while preserving the
verified V1 application unchanged. V2 adds schema-wide search, optional
multi-provider AI interpretation, cited web enrichment, a globally optimized
dinner workbench, persistence, and an executive screenshot package.

## Approved UX references

The approved Search zero-query, Search list, Dinner setup, Dinner Tables, and
Dinner Analysis mocks are the interaction and visual hierarchy source of truth
for V2. This document translates those mocks into production behavior; the
implementation must not reinterpret a mock-only placeholder as real data or
ship a control without the corresponding behavior described here.

The approved Dinner reference is the interactive
`.superpowers/brainstorm/57405-1790890899/content/v2-standalone-dinner-v1.html`
prototype. The approved Search references are the zero-query comparison and
list-view captures retained in the project design archive. Production uses
real founder, search, score, rule, and optimization data while preserving the
approved information architecture, control placement, visual hierarchy, and
state transitions.

## Version isolation

- The verified V1 baseline is commit `43ef662`, branch `v1`, tag `v1.0.0`.
- V1 remains available at `/v1`.
- V2 is independently available at `/v2`.
- The root route redirects to the last selected version, defaulting to V2.
- The persistent footer starts with the V1/V2 switch on the far left.
- AI status is a separate control immediately to the right of the version
  switch and never doubles as version state.
- V2 code must not alter V1 search, grouping, documentation, or styling.

## Deployment architecture

Use one deployable Node service:

- React 19 and Vite for the client.
- A frozen V1 bundle and a separate V2 bundle.
- Node 22+ with Fastify for `/api/v2/*`.
- SQLite with FTS5 and JSON columns.
- Static assets and the API served by the same process.
- `/healthz` reports application version and database readiness.

This preserves the current investment, adds the server boundary required for
secrets and persistence, and avoids a framework rewrite.

## Shared contracts

All parallel workstreams depend on a small shared package containing:

- Founder schema registry.
- Search query and result DTOs.
- Dinner criteria, rule, lock, solution, and metric DTOs.
- Provider capability and status DTOs.
- Runtime validation schemas.
- Versioned API error envelopes.

The shared package contains types, validation, and pure helpers only. It does
not contain React components, database access, provider SDK calls, or optimizer
state.

## Schema registry

Each field declares:

- path and label
- scalar, number, boolean, enum, array, object, or text type
- searchable
- filterable
- groupable
- sortable
- displayable
- matchable
- aliases and normalizer
- source provenance

The immutable reference fixture contains 574 founders, 255 companies, and 40
distinct company-vertical paths. Its expected SHA-256 is
`243e9f403a989549d37b798cf33751863ef0234d3211d87b5bdcf002d4bf7771`.
Acceptance tests fail when the fixture fingerprint changes unexpectedly. The
live GitLab URL is a reference source, not a runtime dependency.

Ingestion retains the original source object and maps the nine required source
fields to canonical keys:

| Source | Canonical |
|---|---|
| `Id` | `id` |
| `Name` | `name` |
| `Group` | `cohort_group` |
| `Group Section` | `cohort_section` |
| `Company vertical` | `company_vertical` |
| `Company` | `company` |
| `Age` | `age` |
| `Education` | `education` |
| `Role` | `role` |

Founder IDs remain opaque strings. Unicode names remain unchanged for display
and gain a separate accent-insensitive search form. Company vertical retains
its full source path and derived hierarchy levels split on ` -> `. Cohort group
and section are never named or modeled as generated dinner tables.

The reference fixture contains no batch, interests, location, biography, or
employment-history fields. V2 supports those future schema shapes without
fabricating values absent from the source.

## Search architecture

Basic Search is the canonical execution engine.

1. Normalize text, aliases, enums, booleans, and numeric expressions.
2. Compile input into a `StructuredSearchQuery`.
3. Retrieve candidates with SQLite FTS5 and typed field filters.
4. Run deterministic field matchers.
5. Return field-level match metadata and grounded explanations.
6. Derive primary dimension, default grouping, prominent columns, and
   highlighting from actual matched fields.

Intent-derived grouping and sorting are defaults, not locked presentation.
In the control band immediately above the first result group, organizers can
change Group by and Sort by through explicit dropdown controls populated from
the schema registry. The Grid/List icon switch sits in the same band. No
unrelated action row separates these controls from the results. These choices
persist with the search state until the query or user changes them.

The leading area of that same row combines result count and matched dimensions.
The bold result count is the primary read on the far left, followed by the
editable search-dimension chips. The count and dimensions are not repeated in a
separate band.

Matched dimensions reuse the structured-criteria chip pattern. Each active
dimension shows its field and value, exposes an inline remove action, and can
be keyboard focused. An Add dimension control opens a schema-derived field,
operator, and value picker. Adding or removing a dimension updates the
structured query, reruns Basic Search, and refreshes highlights, grouping
defaults, sorting options, and result count without losing unrelated state.
The chip group label is `Search dimensions used`.

With no query or active dimensions, the same workspace preserves V1's
explainable zero-query discovery model. It renders three parallel collections:
`Same sector, different seat`, `Operators who round you out`, and
`People likely to get it quickly`. Each collection shows four ranked founders,
a plain-language description of the collection objective, and a
schema-grounded reason for every recommendation. Candidates exclude the current
founder and people from the same company. A founder appears at most once across
the three visible collections so every slot adds breadth. The three collections
update whenever the Current Founder changes. No separate zero-query introduction row appears
between search and the collections; the collection headings provide sufficient
orientation. Recommendation reasons use muted ink rather than orange, preserving
orange for the Search action. Collection metadata and reasons render at 14px,
and collection headings step down from the hero rather than competing with it.

The Search hero does not repeat interpreted dimensions in a separate panel.
The editable chip row immediately above results is the single visible source of
truth for query interpretation.

The Search hero places a Bauhaus blue statement block on the left and the
functional search workspace on the right. The product title and primary value
statement live in the blue block. The white right-hand area contains the
visible search label, query field, and YC orange Search action. It contains no
duplicate query interpretation or instructional panel. The blue title block
occupies no more than 20% of the desktop hero width; search receives the
remaining space. Within that white workspace, the search control leaves a
right-side inset equal to the blue title block's width so the field does not
span the entire hero. The approved zero-query statement is `Find the right
founders.` The compressed hero exposes recommendation content earlier in the
first viewport.

Group by and Sort by use compact field formatting rather than inline label and
control pairs. Each label sits above its dropdown, and the dropdowns share
consistent padding, border, type, and chevron treatment. Their columns size to
the selected option plus chevron and padding rather than clipping text inside a
fixed narrow width.

Supported Basic Search behavior includes exact, case-insensitive, prefix,
substring, accent-insensitive, nested-field, array, enum, boolean, and numeric
range matching. Initial grounded interpretations include role, age,
company-vertical hierarchy, company, education, cohort group, and cohort
section.

AI-assisted search may improve interpretation and rerank database candidates.
It must compile to the same `StructuredSearchQuery`, pass schema validation,
and execute through Basic Search. Unknown fields and unsupported operators are
rejected. AI failure automatically falls back without resubmission.

Grid and List views share query, filters, sort, grouping, results, current
founder, and selection state. The view switch is an icon-only segmented
control, using recognizable grid and list icons with accessible names,
tooltips, active state, and keyboard focus. Search export uses the current
ordered result set. Create Dinner Matching hands the same cohort IDs to the
dinner workflow.

In List view, the founder identity column remains compact so Matched dimensions
begins directly beside the name and company rather than after a wide empty gap.
Visible attribute columns stay grouped with the match explanation, followed by
a flexible white-space expander that anchors `More` at the far-right edge.

`Export Results` and `Create Dinner Matching` are result-dependent actions.
They remain hidden during zero-query discovery and appear only when a search
has produced a result set.

Every founder result retains a circular initials avatar in both Grid and List
views. The avatar is an identity cue that makes the record immediately read as
a person; it accompanies rather than replaces the founder name. In Grid view,
its height aligns with the combined founder-name and company-name identity
block. List view uses a smaller circle aligned to its more compact two-line
identity block rather than reusing the Grid size.

Within Grid cards, founder name, company, matched dimensions, and attribute
details share one text alignment axis to the right of the avatar. Cards show
every available source attribute for that founder: opaque ID, company,
company-vertical full path, age, education, role, cohort group, and cohort
section. Identity and matched dimensions remain visible by default. The full
attribute set sits behind an independently controlled chevron disclosure that
is collapsed by default. Its `More` label and chevron are left-aligned directly
below the company name in the identity column. The Matched dimensions block
starts at the same vertical position as the founder-name text rather than
centering against the combined identity block. Long values wrap when expanded;
source attributes are not silently truncated. The Match dimensions area
retains its orange-accented background, while the separate `More` control stays
on the white identity surface so it does not read as part of the matching
criterion.

On Search routes, the persistent footer places Export Results and Create Dinner
Matching on the far right. These contextual actions remain visually separate
from the left-aligned V1/V2 and AI controls.

## Current founder

The upper-right Current Founder control is vertically centered within the
header and behaves as one profile-button hit target. It shows initials, name,
company, cohort group and section, future batch when available, and a downward
chevron that clearly communicates dropdown behavior. The button exposes
expanded state, keyboard operation, focus styling, and an accessible name. Its
resting background is the same white surface as the header; hover, focus, and
open states provide the interaction contrast.

The account-switcher callout uses a 4px Bauhaus-blue highlight across its top
edge. Both exposed diagonal edges of its pointer use the same 4px blue stroke,
so the pointer reads as a continuous extension of that highlighted edge rather
than reverting to the standard ink outline.

Activating it opens an anchored searchable founder selector containing every
founder in the loaded cohort. Selecting a founder closes the dropdown and
updates the simulated current-user context. The selection is persisted as
non-secret UI state and shared between V2 Search and Dinner Matching.

## Provider architecture

Support OpenAI, Anthropic, and xAI behind provider adapters with capability
flags for:

- search intent parsing
- dinner criteria parsing
- hard-rule parsing
- candidate reranking
- web search
- citations and raw source metadata

Provider output is advisory. Core services validate and normalize every output
before execution.

Credentials are submitted over HTTPS to the server, validated, encrypted with
AES-256-GCM using an environment or managed-secret master key, and stored as
ciphertext in SQLite. The browser receives status, label, last four characters,
and validation time only. Raw keys never enter browser storage, logs,
analytics, URLs, or API responses.

Footer states are:

- `+ AI Disabled`
- `AI Connecting / Validating`
- `✓ AI Enabled · [Provider]`
- `⚠ AI Connection Issue`

## Web Search enrichment

Expanded founder cards request enrichment from the active provider using known
identity fields only.

Enrichment is persisted in an append-only `web_results` dataset rather than
being merged into the authoritative founder record. Each row is keyed by
founder ID and enrichment-run ID. A completed run retains at most the top five
ranked, deduplicated results for that founder.

The enrichment query may use every non-secret identity and company field in the
founder dataset, including name, company, company vertical, role, education,
cohort group, and cohort section. Those fields are query context only; they do
not become unsupported factual claims. Ranking favors results that jointly
match the founder and company over generic company-only or same-name results.

Web Search content:

- is clearly labeled `Web Search`
- is separate from database fields
- never overwrites authoritative data
- includes provider, URL, title, snippet or cited text, retrieval date, rank,
  and confidence when available
- is capped at five evidence items

Adapters may emit evidence only from provider-returned citations or source
metadata. If usable provenance is unavailable, the result is unsupported or
summary-only with an explicit warning. The system never invents sources.

Each `web_results` row stores:

- founder ID
- enrichment-run ID and query fingerprint
- rank from 1 through 5
- result classification: founder, company, or both
- title, canonical URL, domain, snippet or cited text
- provider and provider result ID when available
- retrieval timestamp
- confidence and entity-match signals
- stale-after timestamp
- raw provider metadata after credential and personal-data redaction

Bulk enrichment covers every founder in the loaded dataset through a bounded
concurrency queue with retry and rate-limit handling. Existing non-stale query
fingerprints are reused. A failed founder search does not fail the batch; its
run records an explicit error state. Refreshes append a new run and preserve
prior evidence for auditability. The UI reads the latest successful run by
default and can distinguish no results, stale results, unsupported evidence,
and provider failure.

## Dinner criteria

AI text and manual controls compile into the same `CriteriaSet`.

Each criterion contains:

- schema field
- similarity or diversity objective
- organizer-facing Low, Medium, or High weight
- normalized engine weight derived from the selected level
- enabled state
- scoring operator
- missing-value policy
- manual, AI, or hybrid provenance

Manual schema-driven controls remain available when AI is disabled or fails.
For the reference fixture, they expose company vertical, age, education, role,
company, cohort group, and cohort section.

The setup UI uses the same `L | M | H` segmented control before and after
generation. The initial interpreted criteria are company vertical Similar/High,
role Diverse/High, and age Diverse/Medium. Organizers may remove those
dimensions, add another schema-derived dimension, change Similar/Diverse, and
change its weight. Natural-language and advanced edits always compile into the
same `CriteriaSet`.

## Compatibility scoring

Store component scores per founder pair and criterion:

- categorical exact match
- set overlap with Jaccard distance
- normalized numeric distance
- hierarchical company-vertical similarity with partial credit for a shared
  parent path
- geographic distance when coordinates exist
- bounded text similarity

Similarity converts distance to `1 - distance`; diversity uses distance.
Final compatibility is a weighted mean over enabled comparable criteria.
Explanations use these real component values.

Age normalization uses the observed or configured age range. Cohort section
may receive partial similarity credit when founders share a cohort group.
Missing or newly introduced values never count as positive matches.

## Hard rules

Hard rules are visibly distinct from weighted preferences. Supported canonical
rules include:

- founders must sit together
- founders cannot sit together
- same-company separation
- at least or at most N founders matching a field value per table
- fixed table size
- pinned table membership
- pinned seat

Reference-fixture rules may target stable founder ID, user-entered founder name
resolved to ID, company, company vertical, age or age range, education, role,
cohort group, and cohort section. Ambiguous founder names require resolution
before activation. Table-level rules support minimums, maximums, inclusion,
exclusion, and together/apart relationships.

AI may parse one human-readable rule at a time, but the organizer confirms the
canonical rule before it becomes active. Conflicting or unsatisfiable rules
stop generation and identify the conflicting rules and founders. Rules are
never silently violated.

## Global optimization

Scoring and optimization are separate.

1. Build balanced capacities.
2. Apply must-link components and manual locks.
3. Construct a hard-rule-compliant deterministic initial solution.
4. Improve it through constrained swaps and moves.
5. Compare solutions lexicographically:
   - sorted founder-fit vector, weakest first
   - sorted table-quality vector, weakest first
   - mean founder fit
   - mean table quality
6. Stop on convergence or a documented comparison/time limit.

Table quality is the minimum individual fit at the table, so a strong average
cannot hide one poor placement.

Generate 2 Alternatives uses the same cohort, table size, criteria, weights,
rules, and locks. Each accepted alternative must meet a structural-difference
threshold from prior solutions while preserving constraint status.

## Dinner workbench

Dinner Matching has a pre-generation setup state and two result views:
`Tables | Analysis`. There is no separate Simple view.

### Pre-generation setup

Before a solution exists, the setup rail expands from the result-state width of
340 pixels to 600 pixels. The right workspace remains intentionally empty so
the organizer focuses on the setup sequence. The expanded rail contains:

1. the matching brief and prompt starters
2. founder cohort selection
3. table-count and seat-count selection
4. a quiet `Advanced criteria` text button with a chevron
5. optional hard rules
6. the generation summary and full-height `Generate tables` action

Direct Dinner Matching entry starts with `Select cohort`. The entire table
setup block is disabled and grey until a cohort is selected. Entry from a
Founder Search result prepopulates that ordered result cohort and immediately
enables table setup. Generate remains disabled until both cohort and table
configuration exist.

The matching brief is the primary input. Prompt starters replace its text but
do not submit it. Cohort and table setup sit directly below the text entry and
prompt starters. Advanced criteria are collapsed by default and appear as a
low-prominence text button with a chevron. Expanding them reveals the schema
dimensions, Similar/Diverse objective, editable `L | M | H` weight, remove
action, and Add dimension control.

Hard rules start empty. `Add custom rule` replaces empty-state copy in the
active-rule area. Suggested-rule tiles use a leading plus and include
same-company separation, an Engineering founder at every table, keep selected
founders together, and keep selected founders apart. Selecting a suggestion
creates an active, removable hard rule. No suggested rule is silently active.

Submitting contracts the rail to 340 pixels, preserves the brief, criteria,
weights, cohort, table configuration, and rules, and opens Tables.
`Generate tables` occupies the full height of its grey summary bar. In its
disabled state, the full table-setup half is greyed rather than only muting the
Select control.

### Shared result frame

Tables and Analysis keep the same dinner title, top KPIs, toggle location,
threshold control, compact setup rail, and bottom action bar. The shared action
bar contains:

- Re-optimize Remaining
- Generate 2 Alternatives
- Export
- a blue Save primary action

There is no Review all tables action because both result views already present
all tables.

### Tables

Tables is the editable assignment view. Each table shows its name, quality,
founders, company and role, individual fit, below-threshold count, drag handle,
and lock action. Founder initials circles use the same fit-quality colors as
Analysis:

- green: 90+
- blue: 80-89
- amber: 70-79
- red: below 70

A legend sits beside the threshold control in Tables only.

### Analysis

Analysis puts Objective performance, Weakest placements, and Recommended
improvements directly below the shared toggle row. Recommendation buttons apply
the indicated swap, rebalance, or lock action.

Below the diagnostics, Analysis shows:

- hard-rule compliance, above-threshold count, 90+ count, and roles represented
- match-score distribution
- role makeup by table
- Founder match by table at the bottom

Founder match by table represents each table as eight founder circles. Each
circle shows fit percentage, founder name, and the shared quality color. Dragging
one founder circle onto another swaps the two founders, including across
tables. The swap preserves table capacity and recalculates both founder scores,
affected table averages, header metrics, analysis KPIs, color bands, and score
distribution.

The threshold changes interpretation only. It immediately updates founder and
table flags, warning colors, outlier counts, and metrics without changing the
grouping.

Drag and drop supports moves to open seats and founder swaps. Every edit
recalculates affected founder, table, and overall scores. Organizers can lock
table membership or exact seats. Re-optimize Remaining preserves hard locks
and optimizes unlocked founders only.

## Persistence and exports

SQLite stores:

- normalized founder documents
- append-only founder `web_results` and enrichment-run metadata
- provider credential ciphertext and metadata
- saved dinner configurations and versions
- criteria, rules, locks, assignments, alternatives, and selected solution
- optional enrichment cache with provenance and expiry

The authoritative founder object and `web_results` remain separate in storage,
APIs, exports, and type contracts. Founder exports may optionally include the
latest five web results under a clearly labeled nested `web_results` field.
They never flatten enrichment into source columns.

## Scale fixtures

Development and automated tests include deterministic founder subsets derived
from the 574-founder reference fixture:

- `three-tables`: 24 founders, 3 tables, 8 seats per table
- `five-tables`: 40 founders, 5 tables, 8 seats per table
- `twenty-tables`: 160 founders, 20 tables, 8 seats per table

Each subset preserves stable founder IDs and includes enough variation across
company vertical, company, age, education, role, cohort group, and cohort
section to exercise similarity, diversity, and hard rules. Each fixture also
has a matching `web_results` sample dataset containing up to five deterministic
provider-shaped results per founder.

An additional uneven-capacity fixture uses 48 founders and 5 tables to verify
balanced capacities of 10, 10, 10, 9, and 9 without dropping or duplicating
founders.

Saved configurations support name, save, save as, reopen, edit, and rerun.
Missing founder data produces a recovery warning instead of silent deletion.

Search and dinner exports support CSV. Dinner also supports a JSON export of
the complete configuration and scoring metadata.

## Metrics and explainability

Global metrics include:

- overall match quality
- average table match
- minimum founder fit
- strongest and weakest tables
- per-table bar chart
- parameter-level performance
- previous versus current score after manual edits

Search answers why a founder matched using matched-field metadata. Dinner
answers why a founder was placed, what helped or hurt the table, and why a
person is below threshold using component scores and rule state.

## Failure behavior

V2 defines explicit states for:

- no search results
- AI disabled, unavailable, invalid, or rate-limited
- provider without usable web provenance
- enrichment with no results
- unsatisfiable hard rules
- uneven cohorts and incomplete final tables
- optimizer comparison/time limit
- saved configuration with missing data
- duplicate or missing founder IDs during ingestion
- unknown enum values introduced by a future fixture
- ambiguous founder names in a rule
- malformed company-vertical hierarchy delimiters

Every AI failure degrades to database-only behavior where the requested
operation has a non-AI implementation.

## Visual system

V2 uses `DESIGN.md` as its sole visual language:

- YC orange primary blocks
- Bauhaus blue focus and active states
- square controls and hairline grids
- League Spartan display type and Figtree body type
- no gradients or shadows
- weak-fit states use bars, borders, icons, and text rather than color alone

## Parallel implementation workstreams

### Stream A: Platform foundation

- V1/V2 bundling and routing
- footer version and AI controls
- Fastify server and health endpoint
- SQLite migrations and repositories
- shared contracts and validation
- encrypted provider credential storage

This stream owns shared interfaces and lands first.

### Stream B: Search

- schema registry
- Basic Search parser and engine
- FTS5 indexing
- provider-assisted query compilation
- field-level match metadata
- presentation planner
- grid/list UI
- export and dinner cohort handoff
- expanded founder and web enrichment

It begins after shared contracts stabilize and can run independently of dinner
UI and optimization.

### Stream C: Dinner engine

- criteria compiler
- attribute scoring
- hard-rule engine
- global optimizer
- alternatives
- metrics and explanation engine

It begins after shared contracts stabilize and can run in parallel with Stream
B without touching search UI.

### Stream D: Dinner workbench and persistence

- context-aware expanded setup rail
- natural-language brief and collapsed advanced criteria
- optional hard-rule suggestions and custom-rule controls
- shared Tables/Analysis result frame
- detailed table assignments and visual analysis
- drag and drop, locks, and re-optimization
- recommendation actions and alternatives
- saved configurations
- dinner exports

It begins when Stream C publishes stable engine contracts. Persistence
repositories come from Stream A.

### Stream E: Verification and screenshot package

- V1 regression suite
- API, search, optimizer, persistence, and UI integration tests
- accessibility and responsive browser QA
- 16 required PNG screenshots
- `screenshot_storyboard.txt`

Screenshots are captured only after the relevant feature passes integration
tests. No screenshot may depict mocked or unimplemented behavior.

## Integration rules

- One integration branch owns shared contracts.
- Parallel agents work in separate worktrees and do not edit the same module.
- Shared-contract changes require an integration review before dependent
  streams rebase.
- Production UI may implement only organizer-facing states approved in the
  design process. When a stream reaches an undesigned screen, dialog, empty
  state, error state, or transition, it records that surface in a design-gap
  list and pauses UI implementation until the organizer reviews it.
- Each stream supplies contract tests and a commit-level report.
- Integration order is A, then B and C in parallel, then D, then E.
- V1 regression tests run at every integration gate.
- Provider adapters use recorded redacted fixtures for deterministic tests.
- Web enrichment uses recorded provider-shaped `web_results` fixtures in tests;
  live search is never required for deterministic CI.
- Final review compares the implementation with every V2 acceptance criterion.

## Screenshot package

The final package contains the exact 16 requested states:

1. V1 baseline.
2. V2 natural-language schema-wide search.
3. V2 grid results.
4. V2 list results.
5. Match highlighting and explanation.
6. Export and Create Dinner Matching actions.
7. Expanded pre-generation rail with natural-language brief.
8. Advanced criteria with Similar/Diverse and `L | M | H`.
9. Optional hard-rule suggestions and custom rule.
10. Tables with quality-colored founder initials.
11. Analysis diagnostics, distribution, and role makeup.
12. Founder-circle table analysis and drag-to-swap.
13. Match threshold control.
14. Shared action bar, alternatives, Save, and export.
15. Expanded founder with labeled Web Search evidence.
16. Footer with V1/V2 toggle and AI status.

`screenshot_storyboard.txt` records filename, demonstrated change, one-line
email caption, and email order.

## Test strategy

- Shared schema and validation contract tests.
- Reference fixture fingerprint, record-count, canonical-mapping, raw-source,
  uniqueness, and ingestion-error tests.
- Unicode display and accent-insensitive name-search tests.
- Full-path and hierarchy-level company-vertical tests.
- Basic Search tests for every data type and match operator.
- AI fallback and invalid-output tests.
- Credential redaction and encrypted-storage tests.
- Web evidence provenance and five-result-cap tests.
- `web_results` append-only history, query-fingerprint reuse, deduplication,
  ranking, stale-result, partial-batch-failure, and redaction tests.
- Criteria parity between AI and manual paths.
- Direct-entry and Search-handoff Dinner setup tests.
- Cohort-before-table gating and disabled-generation tests.
- Expanded-to-compact rail transition tests.
- Advanced-criteria add, remove, objective, and weight tests.
- Suggested and custom hard-rule interaction tests.
- Component score and weight recomputation tests.
- Company-vertical shared-parent, age normalization, and cohort-section partial
  credit tests.
- Rule feasibility and conflict-report tests.
- Optimizer conservation, capacity, determinism, maximin, lock, and alternative
  diversity tests.
- Full engine, persistence, export, and primary UI coverage for the 3-, 5-, and
  20-table scale fixtures.
- Uneven 48-founder/5-table capacity tests proving 10/10/10/9/9 assignment with
  no loss or duplication.
- Save/reopen/export round trips.
- Tables/Analysis shared-frame and action-bar tests.
- Table avatar and Analysis circle color-band tests.
- Analysis drag-to-swap score and metric refresh tests.
- V1 route snapshots and functional regression tests.
- V2 route, responsive, accessibility, and interaction browser tests.
- Screenshot existence, dimensions, and storyboard completeness checks.
