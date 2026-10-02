# Founder App V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete V2 Founder Search and Dinner Matching application while preserving V1, using the approved Search and Dinner mocks as the UX source of truth.

**Architecture:** Keep the frozen V1 client isolated and add a V2 React client, shared runtime contracts, a Fastify API, SQLite persistence, deterministic search and optimization engines, provider adapters, and append-only web enrichment. Pure domain modules remain independent from React and Fastify so the 3-, 5-, and 20-table fixtures can be tested without browser or network dependencies.

**Tech Stack:** Node 22+, React 19, TypeScript 6, Vite 8, Fastify, SQLite, Zod, Vitest, Testing Library, Playwright, native `fetch`, Node `crypto`

## Global Constraints

- Preserve verified V1 at `/v1`; V2 is independently available at `/v2`.
- Use only the YC design system in `DESIGN.md`: League Spartan, Figtree, square controls, hairline rules, one loud orange area per view, blue active states, no gradients, and no shadows.
- Treat founder IDs as opaque strings and preserve Unicode names.
- Never fabricate fields absent from `src/founders.json`.
- Basic Search and the deterministic dinner engine must work without AI.
- Provider output is advisory and must validate through shared Zod contracts.
- Raw provider keys never enter browser storage, logs, analytics, URLs, or API responses.
- Web evidence remains separate from authoritative founder data.
- Production UI may implement only approved mock states. Add an undesigned surface to the Design Gap Register and stop that UI task for organizer review.
- Every domain or API task uses TDD: failing test, observed failure, minimal implementation, passing test, commit.
- All commits include the repository-required Copilot trailers.

## Design Gap Register

Do not invent these surfaces during implementation. Add the first reached item to the active review queue:

1. Search Grid result layout.
2. Add-dimension field/operator/value picker.
3. Cohort selector and table-count selector overlays.
4. Custom hard-rule authoring and ambiguous-founder resolution.
5. Generate 2 Alternatives comparison.
6. Saved Dinners/Dinner Plans index, reopen, version, and delete behavior.
7. Export options, progress, success, and failure states.
8. Web Search evidence expansion and stale/unsupported states.
9. AI provider configuration and credential validation.
10. Unsatisfiable-rule, incomplete-table, missing-saved-founder, and provider-failure screens.
11. Twenty-table desktop and responsive visual treatment.

## Parallel Execution Model

### Roles

- **Coordinator:** owns `main`, shared contracts, dependency sequencing,
  design-gap review, integration, and complete-suite verification.
- **Foundation worker:** owns Task 1 and the initial shared-contract boundary.
- **Data worker:** owns Task 2 after Task 1.
- **Persistence worker:** owns Task 3 after Task 2 publishes founder contracts.
- **Search worker:** owns Task 4.
- **Enrichment worker:** owns Task 5.
- **Dinner engine worker:** owns Task 6.
- **Dinner UI worker:** owns Task 7 after the engine contract is integrated.
- **Security/persistence worker:** owns Task 8.
- **Release worker:** owns Task 9 only after all approved features integrate.

Workers never spawn their own subagents. The coordinator dispatches a fresh
worker for each task and retains integration ownership.

### Worktree and branch convention

Each worker uses a dedicated worktree created from the latest integration
commit:

```text
.worktrees/v2-task-<number>-<slug>
v2/task-<number>-<slug>
```

Workers commit only their scoped files. They do not merge, rebase another
worker, alter another worktree, or edit the coordinator-owned status file.

### Ownership boundaries

| Area | Exclusive owner while active |
|---|---|
| `src/shared/**`, `src/app/**`, root build config | Foundation/Data coordinator |
| `server/database.ts`, `server/migrations/**`, `server/repositories/**` | Persistence worker |
| `src/v2/search/**` | Search worker |
| `server/providers/**`, `server/services/enrichment.ts`, enrichment routes | Enrichment worker |
| Dinner domain files excluding React components and CSS | Dinner engine worker |
| Dinner React components, state adapter, and CSS | Dinner UI worker |
| Credential, dinner persistence, and export services/routes | Security/persistence worker |
| `e2e/**`, release scripts, screenshot package | Release worker |

Only the coordinator changes `src/shared/contracts.ts` after Task 1. A worker
that needs a contract change records the exact requested type/signature in its
handoff report and waits for the coordinator to integrate it.

### Shared communication artifacts

Create these files at execution start:

```text
docs/superpowers/execution/v2-status.md
docs/superpowers/execution/design-gaps.md
docs/superpowers/execution/reports/task-1.md
...
docs/superpowers/execution/reports/task-9.md
```

The coordinator alone updates `v2-status.md` and `design-gaps.md`. Each worker
owns only its numbered report. Every report uses:

```markdown
# Task N Handoff

**Branch:** v2/task-N-slug
**Commit:** <full hash>
**Status:** complete | blocked
**Tests:** <exact commands and pass/fail counts>
**Files changed:** <paths>
**Contracts consumed:** <exact type/function names>
**Contract changes requested:** none | <exact signatures>
**Design gaps reached:** none | <numbered gap and stopping point>
**Integration notes:** <migration order, environment variables, fixtures>
```

Workers send the coordinator the same summary in their final response. “Done”
without commit hash and fresh test output is not an acceptable handoff.

### Parallel waves

**Wave 0 — coordinator only**

1. Create execution artifacts and clean worktrees.
2. Run the existing test/lint/build baseline.
3. Execute and integrate Task 1.
4. Freeze `src/shared/contracts.ts` v1 for parallel consumers.

**Wave 1 — narrow sequential foundation**

1. Data worker executes Task 2.
2. Coordinator reviews and integrates Task 2.
3. Persistence worker executes Task 3.
4. Coordinator reviews migrations, API envelopes, and contract compatibility.

These tasks are not parallel because they establish shared data and persistence
contracts used by every later stream.

**Wave 2 — three independent workers in parallel**

- Search worker executes Task 4.
- Enrichment worker executes Task 5.
- Dinner engine worker executes Task 6.

They work in disjoint directories against the same integrated Task 3 commit.
The coordinator reviews each result independently, applies requested shared
contract changes once, reruns the affected worker tests, and integrates commits.

**Wave 3 — two workers plus organizer design reviews**

- Dinner UI worker executes approved portions of Task 7.
- Security/persistence worker executes approved non-UI portions of Task 8.
- Coordinator presents accumulated Design Gap Register items to the organizer
  one screen at a time.

The Dinner UI worker stops at the 20-table visual treatment. The
Security/persistence worker stops before provider setup, Saved Dinners,
alternatives comparison, and export dialogs. Domain, API, and persistence work
continues where it does not require an unapproved screen.

**Wave 4 — coordinator integration**

1. Integrate Wave 3 commits.
2. Resolve only genuine cross-stream conflicts.
3. Run all unit and integration tests.
4. Dispatch focused follow-up workers only for independently scoped failures.

**Wave 5 — release worker**

Execute Task 9 after every required design gap is approved and integrated.

### Agent dispatch brief

Every worker brief contains:

1. exact task number and plan path
2. spec path and relevant section names
3. worktree path and branch
4. exclusive file ownership
5. consumed contracts and prohibited shared-file edits
6. required red-green test commands
7. required commit message and trailers
8. required numbered handoff report
9. explicit instruction: **do not spawn subagents**
10. stop condition for any Design Gap Register surface

### Integration gate after every task

The coordinator must:

1. read the worker report and commit diff
2. confirm files stayed within ownership
3. run the task's exact tests from the integration worktree
4. run shared contract tests when applicable
5. update `v2-status.md`
6. integrate only after fresh passing evidence
7. dispatch a new worker for the next independent task instead of reusing an
   old worker context

---

### Task 1: Isolate V1 and scaffold V2 packages

**Files:**
- Modify: `package.json`
- Modify: `vite.config.ts`
- Modify: `tsconfig.json`
- Create: `tsconfig.server.json`
- Create: `src/v1/V1App.tsx`
- Create: `src/v2/V2App.tsx`
- Create: `src/app/AppRouter.tsx`
- Create: `src/shared/contracts.ts`
- Create: `src/test/setup.ts`
- Create: `server/app.ts`
- Create: `server/index.ts`
- Test: `src/app/AppRouter.test.tsx`
- Test: `server/app.test.ts`

**Interfaces:**
- Produces: `createServer(options: ServerOptions): FastifyInstance`
- Produces: `AppRouter(): JSX.Element`
- Produces: versioned `/api/v2/health` response.

- [ ] **Step 1: Add runtime and test dependencies**

```bash
npm install fastify @fastify/static better-sqlite3 zod
npm install -D @types/better-sqlite3 @playwright/test tsx
```

Add scripts:

```json
{
  "dev": "vite",
  "dev:server": "tsx server/index.ts",
  "build:client": "tsc -b && vite build",
  "build:server": "tsc -p tsconfig.server.json",
  "build": "npm run build:client && npm run build:server",
  "test": "vitest run",
  "test:e2e": "playwright test",
  "lint": "oxlint",
  "start": "node dist-server/server/index.js"
}
```

`tsconfig.server.json` uses `rootDir: "."`, `outDir: "dist-server"`,
`module: "NodeNext"`, and includes `server/**/*.ts` plus `src/shared/**/*.ts`.

- [ ] **Step 2: Write failing route-isolation tests**

```tsx
it('renders V1 without V2 navigation', () => {
  history.replaceState({}, '', '/v1')
  render(<AppRouter />)
  expect(screen.getByText('Admin grouping')).toBeInTheDocument()
  expect(screen.queryByText('Dinner Matching')).not.toBeInTheDocument()
})

it('renders V2 at /v2', () => {
  history.replaceState({}, '', '/v2')
  render(<AppRouter />)
  expect(screen.getByText('Founder Search')).toBeInTheDocument()
})
```

Run: `npm test -- src/app/AppRouter.test.tsx`

Expected: FAIL because `AppRouter` does not exist.

- [ ] **Step 3: Move the current application behind `V1App` and add the V2 shell**

```tsx
export function AppRouter() {
  const path = window.location.pathname
  if (path.startsWith('/v1')) return <V1App />
  if (path.startsWith('/v2')) return <V2App />
  window.location.replace(localStorage.getItem('founder-app-version') === 'v1' ? '/v1' : '/v2')
  return null
}
```

Do not alter V1 copy, behavior, or CSS while moving it.

- [ ] **Step 4: Write and implement the health contract**

```ts
it('reports V2 and database readiness', async () => {
  const response = await createServer({
    databaseStatus: () => 'ready',
  }).inject({
    method: 'GET',
    url: '/api/v2/health',
  })
  expect(response.json()).toEqual({ version: 'v2', database: 'ready' })
})
```

Run: `npm test -- server/app.test.ts`

Expected before implementation: FAIL. Expected after implementation: PASS.

- [ ] **Step 5: Run isolation checks and commit**

Run: `npm test -- src/app/AppRouter.test.tsx server/app.test.ts && npm run build`

Expected: all selected tests pass and build exits 0.

Commit: `feat: isolate v1 and scaffold v2`

### Task 2: Build schema registry and deterministic scale fixtures

**Files:**
- Create: `src/shared/founder.ts`
- Create: `src/shared/schemaRegistry.ts`
- Create: `src/shared/fixtures.ts`
- Create: `src/fixtures/web-results.sample.json`
- Test: `src/shared/founder.test.ts`
- Test: `src/shared/fixtures.test.ts`

**Interfaces:**
- Produces: `Founder`, `FounderFieldDefinition`, `FOUNDER_SCHEMA`
- Produces: `buildScaleFixture(founders, scenario): Founder[]`
- Produces scenarios: `three-tables`, `five-tables`, `twenty-tables`, `uneven-five-tables`

- [ ] **Step 1: Write failing normalization and fixture tests**

```ts
expect(normalizeFounders(rawFounders)).toHaveLength(574)
expect(buildScaleFixture(founders, 'three-tables')).toHaveLength(24)
expect(buildScaleFixture(founders, 'five-tables')).toHaveLength(40)
expect(buildScaleFixture(founders, 'twenty-tables')).toHaveLength(160)
expect(buildScaleFixture(founders, 'uneven-five-tables')).toHaveLength(48)
```

Also assert the source fixture SHA-256 equals
`243e9f403a989549d37b798cf33751863ef0234d3211d87b5bdcf002d4bf7771`.

Run: `npm test -- src/shared/founder.test.ts src/shared/fixtures.test.ts`

Expected: FAIL because the modules do not exist.

- [ ] **Step 2: Implement normalization and the registry**

```ts
export interface Founder {
  id: string
  name: string
  cohortGroup: string
  cohortSection: string
  companyVertical: string
  companyVerticalLevels: string[]
  company: string
  age: number
  education: string
  role: string
  searchName: string
  raw: Readonly<Record<string, unknown>>
}
```

`FOUNDER_SCHEMA` must expose search, filter, sort, display, match, aliases, and
normalizer metadata for all nine source fields.

- [ ] **Step 3: Implement stable fixture selection**

Select founders by stable ID hash, then verify required categorical variation.
Never copy or modify founder objects.

```ts
export type ScaleScenario =
  | 'three-tables'
  | 'five-tables'
  | 'twenty-tables'
  | 'uneven-five-tables'
```

- [ ] **Step 4: Add deterministic provider-shaped web samples**

`web-results.sample.json` contains records shaped as:

```json
{
  "founderId": "opaque-id",
  "runId": "fixture-run-1",
  "rank": 1,
  "classification": "both",
  "title": "Example founder and company result",
  "url": "https://example.test/founder",
  "domain": "example.test",
  "snippet": "Recorded deterministic test evidence.",
  "provider": "fixture",
  "retrievedAt": "2026-10-01T00:00:00.000Z",
  "confidence": 0.9
}
```

Generate up to five records for every founder in each scale fixture.

- [ ] **Step 5: Verify and commit**

Run: `npm test -- src/shared && npm run lint`

Expected: all selected tests pass and lint exits 0.

Commit: `feat: add v2 founder schema and scale fixtures`

### Task 3: Add SQLite repositories and V2 API contracts

**Files:**
- Create: `server/database.ts`
- Create: `server/migrations/001-v2.sql`
- Create: `server/repositories/founders.ts`
- Create: `server/repositories/webResults.ts`
- Create: `server/repositories/dinners.ts`
- Create: `server/routes/founders.ts`
- Test: `server/repositories/repositories.test.ts`
- Test: `server/routes/founders.test.ts`

**Interfaces:**
- Produces: `FounderRepository`, `WebResultsRepository`, `DinnerRepository`
- Produces: `GET /api/v2/founders`, `GET /api/v2/founders/:id`
- Consumes shared Zod contracts only.

- [ ] **Step 1: Write failing migration and repository tests**

```ts
expect(repository.list()).toHaveLength(574)
expect(webResults.latest(founderId)).toHaveLength(5)
webResults.appendRun(firstRun)
webResults.appendRun(secondRun)
expect(webResults.listRuns(founderId).map((run) => run.id)).toEqual([
  secondRun.id,
  firstRun.id,
])
```

Run: `npm test -- server/repositories/repositories.test.ts`

Expected: FAIL because repositories do not exist.

- [ ] **Step 2: Create normalized tables and indexes**

`001-v2.sql` creates `founders`, `founders_fts`, `web_enrichment_runs`,
`web_results`, `dinner_configurations`, and `dinner_versions`. Use foreign keys,
unique `(run_id, rank)`, and indexes on founder ID, query fingerprint, and
retrieval timestamp.

- [ ] **Step 3: Implement explicit repository errors**

```ts
export class RepositoryError extends Error {
  constructor(
    message: string,
    readonly code: 'not_found' | 'conflict' | 'invalid_data' | 'storage_failure',
  ) {
    super(message)
  }
}
```

Do not return empty success-shaped values for storage failures.

- [ ] **Step 4: Add founder API routes**

Validate query parameters with Zod and return:

```ts
type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; details?: unknown } }
```

- [ ] **Step 5: Verify and commit**

Run: `npm test -- server/repositories server/routes/founders.test.ts`

Expected: all selected tests pass.

Commit: `feat: add v2 persistence repositories`

### Task 4: Implement Basic Search and approved Search UI

**Files:**
- Create: `src/v2/search/searchEngine.ts`
- Create: `src/v2/search/searchState.ts`
- Create: `src/v2/search/SearchPage.tsx`
- Create: `src/v2/search/ZeroQueryDiscovery.tsx`
- Create: `src/v2/search/ListResults.tsx`
- Create: `src/v2/layout/V2Header.tsx`
- Create: `src/v2/layout/V2Footer.tsx`
- Test: `src/v2/search/searchEngine.test.ts`
- Test: `src/v2/search/SearchPage.test.tsx`

**Interfaces:**
- Produces: `executeSearch(founders, query): SearchResult[]`
- Produces: `StructuredSearchQuery`, `MatchedDimension`
- Produces Search handoff URL `/v2/dinner?from=search&cohort=<id>`.

- [ ] **Step 1: Write failing schema-wide search tests**

Cover exact, prefix, substring, accent-insensitive, hierarchy, enum, boolean,
and numeric range matching. Assert matched dimensions and explanations come
from actual matcher output.

Run: `npm test -- src/v2/search/searchEngine.test.ts`

Expected: FAIL because the engine does not exist.

- [ ] **Step 2: Implement deterministic Basic Search**

```ts
export interface SearchResult {
  founder: Founder
  score: number
  matchedDimensions: MatchedDimension[]
  explanation: string
}
```

AI parsing may produce `StructuredSearchQuery`, but execution always uses this
engine.

- [ ] **Step 3: Implement approved zero-query and List states**

Match the approved mocks for hero proportions, discovery columns, result count,
dimension chips, Group by, Sort by, List view, Current Founder, and footer.
Hide Export Results and Create Dinner Matching until results exist.

- [ ] **Step 4: Add the Grid design gate**

When implementation reaches the Grid toggle, add “Search Grid result layout” to
the active design-review list. Do not build an invented Grid card.

- [ ] **Step 5: Verify and commit**

Run: `npm test -- src/v2/search && npm run build`

Expected: all selected tests pass and build exits 0.

Commit: `feat: build v2 founder search`

### Task 5: Implement append-only web enrichment

**Files:**
- Create: `server/providers/types.ts`
- Create: `server/providers/openai.ts`
- Create: `server/providers/anthropic.ts`
- Create: `server/providers/xai.ts`
- Create: `server/services/aiInterpretation.ts`
- Create: `server/services/enrichment.ts`
- Create: `server/routes/ai.ts`
- Create: `server/routes/enrichment.ts`
- Create: `src/v2/search/webResults.ts`
- Test: `server/services/aiInterpretation.test.ts`
- Test: `server/services/enrichment.test.ts`
- Test: `server/routes/enrichment.test.ts`

**Interfaces:**
- Produces: `enrichFounder(founderId, options): Promise<EnrichmentRun>`
- Produces: `enrichAllFounders(options): AsyncIterable<EnrichmentProgress>`
- Produces: validated search, dinner-criteria, and hard-rule interpretation.
- Produces: `GET /api/v2/founders/:id/web-results`
- Produces: `POST /api/v2/enrichment/runs`

- [ ] **Step 1: Write failing ranking, deduplication, and history tests**

```ts
expect(result.items).toHaveLength(5)
expect(new Set(result.items.map((item) => item.url)).size).toBe(5)
expect(result.items[0].entityMatch.founder).toBe(true)
expect(repository.listRuns(founderId)).toHaveLength(2)
```

Test cache reuse, stale refresh, rate-limit retry, one-founder failure within a
batch, and credential redaction.

- [ ] **Step 2: Implement identity-aware queries**

Build query context from name, company, company vertical, role, education,
cohort group, and cohort section. Use bounded concurrency of 4 and exponential
backoff capped at 30 seconds. Never log provider payloads containing keys.

- [ ] **Step 3: Implement the three provider adapters**

```ts
export interface ProviderAdapter {
  id: 'openai' | 'anthropic' | 'xai'
  capabilities: {
    searchIntent: boolean
    dinnerCriteria: boolean
    hardRules: boolean
    reranking: boolean
    webSearch: boolean
    citations: boolean
  }
  validateCredential(secret: string): Promise<void>
  parseSearch(input: string): Promise<unknown>
  parseDinnerCriteria(input: string): Promise<unknown>
  parseHardRule(input: string): Promise<unknown>
  searchWeb(query: WebSearchQuery): Promise<ProviderWebResult[]>
}
```

Validate every advisory response with shared Zod schemas. Invalid, unavailable,
or rate-limited interpretation returns an explicit fallback result instructing
the caller to execute the deterministic manual path without resubmission.

- [ ] **Step 4: Persist the top five append-only results**

Canonicalize URLs, deduplicate, rank founder+company matches first, and append a
new run without deleting history.

- [ ] **Step 5: Add interpretation, progress, and read endpoints**

Return explicit `queued`, `running`, `complete`, `partial`, or `failed` status.
Do not implement the evidence UI until its Design Gap Register item is reviewed.

- [ ] **Step 6: Verify and commit**

Run: `npm test -- server/services/aiInterpretation.test.ts server/services/enrichment.test.ts server/routes/enrichment.test.ts`

Expected: all selected tests pass without live network access.

Commit: `feat: add founder web results dataset`

### Task 6: Implement criteria, hard rules, compatibility, and optimizer

**Files:**
- Create: `src/v2/dinner/criteria.ts`
- Create: `src/v2/dinner/rules.ts`
- Create: `src/v2/dinner/scoring.ts`
- Create: `src/v2/dinner/optimizer.ts`
- Create: `src/v2/dinner/alternatives.ts`
- Test: `src/v2/dinner/criteria.test.ts`
- Test: `src/v2/dinner/rules.test.ts`
- Test: `src/v2/dinner/optimizer.test.ts`

**Interfaces:**
- Produces: `CriteriaSet`, `HardRule`, `DinnerSolution`, `DinnerMetrics`
- Produces: `compileCriteria(input): CriteriaSet`
- Produces: `optimizeDinner(request): DinnerSolution`
- Produces: `generateAlternatives(request, count): DinnerSolution[]`

- [ ] **Step 1: Write failing criteria and rule tests**

Assert L/M/H map to `1/2/3`, AI and manual criteria normalize identically,
ambiguous names reject activation, and conflicting rules return identified
conflicts.

- [ ] **Step 2: Implement criterion scoring**

Implement categorical, Jaccard, numeric, hierarchical vertical, and missing
value behavior. Store pairwise component scores so reweighting does not repeat
raw comparisons.

- [ ] **Step 3: Write failing scale and maximin tests**

Assert:

```ts
expect(capacities(24, 3)).toEqual([8, 8, 8])
expect(capacities(40, 5)).toEqual([8, 8, 8, 8, 8])
expect(capacities(160, 20)).toEqual(Array(20).fill(8))
expect(capacities(48, 5)).toEqual([10, 10, 10, 9, 9])
```

Also assert no founder loss/duplication, determinism, hard-rule compliance,
lock preservation, and lexicographic weakest-fit improvement.

- [ ] **Step 4: Implement deterministic constrained optimization**

Apply must-link components and locks, build a compliant initial solution, then
evaluate constrained swaps and moves using sorted founder-fit vector, sorted
table-quality vector, mean founder fit, and mean table quality.

- [ ] **Step 5: Implement alternatives**

Return exactly two alternatives that preserve inputs and pass a structural
difference threshold. Do not build comparison UI before its design review.

- [ ] **Step 6: Verify and commit**

Run: `npm test -- src/v2/dinner`

Expected: all dinner domain tests pass for 3, 5, 20, and uneven 5 tables.

Commit: `feat: add v2 dinner optimization engine`

### Task 7: Build approved Dinner setup, Tables, and Analysis

**Files:**
- Create: `src/v2/dinner/DinnerPage.tsx`
- Create: `src/v2/dinner/DinnerSetup.tsx`
- Create: `src/v2/dinner/DinnerTables.tsx`
- Create: `src/v2/dinner/DinnerAnalysis.tsx`
- Create: `src/v2/dinner/dinnerState.ts`
- Create: `src/v2/dinner/dinner.css`
- Test: `src/v2/dinner/DinnerPage.test.tsx`

**Interfaces:**
- Consumes: `DinnerSolution`, `DinnerMetrics`, search cohort handoff.
- Produces: setup request, swaps, locks, threshold state, save/export commands.

- [ ] **Step 1: Write failing setup-state tests**

Test direct entry, Search handoff, disabled full table chunk, disabled Generate,
expanded 600px rail, collapsed Advanced criteria, add/remove dimension, rule
suggestions, and 340px rail after generation.

- [ ] **Step 2: Implement the approved pre-generation rail**

Port behavior from the approved Dinner mock, replacing simulated values with
typed state. Preserve the full-height disabled/enabled Generate action and
cohort-before-table gating.

- [ ] **Step 3: Write failing Tables and Analysis interaction tests**

Test shared header/toggle/action bar, colored initials legend, Analysis-only
diagnostics, recommendation actions, founder-circle swaps, fixed capacities,
and metric refresh.

- [ ] **Step 4: Implement Tables and Analysis**

Use actual optimizer output. The action bar is exactly Re-optimize Remaining,
Generate 2 Alternatives, Export, and blue Save. Do not add Review all tables.

- [ ] **Step 5: Add 3- and 5-table rendering tests**

Render all cards and circle clusters without empty phantom tables. For 20
tables, test data and DOM completeness only, then stop at the registered
twenty-table visual design gate.

- [ ] **Step 6: Verify and commit**

Run: `npm test -- src/v2/dinner/DinnerPage.test.tsx && npm run build`

Expected: approved states pass and build exits 0.

Commit: `feat: build approved dinner workbench`

### Task 8: Add save, reopen, export, and provider security

**Files:**
- Create: `server/services/credentials.ts`
- Create: `server/routes/providers.ts`
- Create: `server/routes/dinners.ts`
- Create: `server/services/export.ts`
- Test: `server/services/credentials.test.ts`
- Test: `server/routes/dinners.test.ts`
- Test: `server/services/export.test.ts`

**Interfaces:**
- Produces encrypted provider credential storage.
- Produces dinner create/version/read APIs.
- Produces CSV and JSON exports with optional nested `web_results`.

- [ ] **Step 1: Write failing credential tests**

Test AES-256-GCM round trip, wrong-key failure, redacted responses, and absence
of raw keys in serialized logs.

- [ ] **Step 2: Implement credential storage**

Use `FOUNDER_APP_MASTER_KEY` containing 32 bytes of base64-decoded key material.
Reject invalid keys at server startup. A missing key disables provider
credential storage when no credentials exist so basic Search and deterministic
dinners still run without AI; if encrypted credentials already exist, reject a
missing or mismatched key at startup.

- [ ] **Step 3: Write and implement dinner persistence tests**

Save complete cohort, criteria, rules, locks, assignments, selected alternative,
threshold, and version. Reopen must reproduce the saved state or return a
recovery warning listing missing founder IDs.

- [ ] **Step 4: Write and implement export tests**

CSV contains table, founder, company, role, fit, criteria, rules, and notes.
JSON optionally nests the latest five `web_results` without flattening them.

- [ ] **Step 5: Stop at undesigned UI surfaces**

Do not implement provider configuration, Saved Dinners, alternatives comparison,
or export dialogs until their Design Gap Register reviews are complete.

- [ ] **Step 6: Verify and commit**

Run: `npm test -- server/services/credentials.test.ts server/routes/dinners.test.ts server/services/export.test.ts`

Expected: all selected tests pass.

Commit: `feat: persist and export v2 dinners`

### Task 9: Complete integration, accessibility, and release verification

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/v1-regression.spec.ts`
- Create: `e2e/v2-search.spec.ts`
- Create: `e2e/v2-dinner.spec.ts`
- Create: `scripts/verify-screenshots.mjs`
- Create: `screenshot_storyboard.txt`
- Modify: `README.md`

**Interfaces:**
- Consumes all prior tasks.
- Produces release evidence and the required screenshot package.

- [ ] **Step 1: Write V1 regression and V2 happy-path tests**

Cover `/v1`, zero-query Search, active Search List, Search-to-Dinner handoff,
3-table generation, 5-table uneven generation, Analysis swap, Save API, export,
and recorded web results.

- [ ] **Step 2: Add accessibility and responsive assertions**

Test keyboard focus, accessible names, disclosure state, contrast-significant
class states, reduced motion, 1280px desktop, and mobile single-column behavior.

- [ ] **Step 3: Run the complete quality gate**

```bash
npm test
npm run lint
npm run build
npm run test:e2e
```

Expected: every command exits 0 with no failing tests.

- [ ] **Step 4: Capture only implemented approved states**

Create the 16 PNGs and `screenshot_storyboard.txt`. Do not capture a Design Gap
Register surface until approved and implemented.

- [ ] **Step 5: Verify screenshot package**

Run: `node scripts/verify-screenshots.mjs`

Expected: exactly 16 correctly sized PNGs and 16 storyboard entries.

- [ ] **Step 6: Update documentation and commit**

Document Node version, environment variables, migrations, fixture scenarios,
web enrichment batch operation, deterministic testing, and design gates.

Commit: `test: verify founder app v2 release`

## Execution Order

1. Wave 0: Task 1.
2. Wave 1: Tasks 2 then 3.
3. Wave 2: Tasks 4, 5, and 6 in parallel.
4. Wave 3: Task 7 and non-UI Task 8 work in parallel while design gaps are
   reviewed.
5. Wave 4: integration and focused independent fixes.
6. Wave 5: Task 9.

At every Design Gap Register boundary, continue non-UI domain work but pause the
unapproved UI surface and present the accumulated design-gap list to the
organizer.
