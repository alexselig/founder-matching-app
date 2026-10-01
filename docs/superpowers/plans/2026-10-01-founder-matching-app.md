# Founder Matching App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local founder directory with zero-query discovery, faceted search, and a separate admin workspace for deterministic configurable dinner grouping.

**Architecture:** A Vite React TypeScript app loads a checked-in JSON dataset through a strict normalization boundary. Pure TypeScript modules own search, discovery scoring, URL state, and grouping so they can be tested independently from React. The founder and admin views share the normalized data model but keep their presentation and state separate.

**Tech Stack:** React 19, TypeScript 5, Vite 7, Vitest, Testing Library, CSS, static JSON

## Global Constraints

- Use the Alex Tools design system: paper `#fbfaf7`, ink `#111111`, Instrument Sans, square corners, and one-pixel rules.
- Do not fabricate missing batch or interest values.
- Age and education must not affect default search relevance.
- Search uses AND semantics across query tokens.
- Filters use AND semantics across categories and OR semantics within a category.
- Serendipity and grouping must be deterministic for the same seed and inputs.
- Group sizes must differ by no more than one.
- Invalid data and unsatisfied grouping constraints must be shown explicitly.
- The local `/admin` route is labeled as an unprotected prototype preview.

---

### Task 1: Scaffold and normalize the dataset

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/data/founders.json`
- Create: `src/domain/founder.ts`
- Create: `src/domain/founder.test.ts`

**Interfaces:**
- Produces: `Founder`, `RawFounder`, `normalizeFounders(input: unknown): Founder[]`
- Produces: normalized properties `id`, `name`, `company`, `vertical`, `topLevelVertical`, `age`, `education`, `role`, `group`, `groupSection`, `batch?`, `interests`

- [ ] **Step 1: Scaffold the Vite React TypeScript project and install test dependencies**

Run:

```bash
npm create vite@latest . -- --template react-ts
npm install
npm install -D vitest jsdom @testing-library/react @testing-library/jest-dom
```

Expected: `npm install` exits 0 and Vite source files exist.

- [ ] **Step 2: Add the test configuration**

Set `package.json` scripts to:

```json
{
  "dev": "vite",
  "build": "tsc -b && vite build",
  "test": "vitest run",
  "test:watch": "vitest",
  "lint": "eslint ."
}
```

Set `vite.config.ts` to:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
})
```

- [ ] **Step 3: Write failing normalization tests**

Create `src/domain/founder.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { normalizeFounders } from './founder'

describe('normalizeFounders', () => {
  it('normalizes source keys and derives the top-level vertical', () => {
    const [founder] = normalizeFounders([{
      Id: '1',
      Name: 'Ada Founder',
      Company: 'Analytical Engines',
      'Company vertical': 'B2B Software and Services -> Analytics',
      Age: 31,
      Education: 'Math',
      Role: 'Engineering',
      Group: '2',
      'Group Section': '2A',
    }])

    expect(founder).toMatchObject({
      id: '1',
      name: 'Ada Founder',
      topLevelVertical: 'B2B Software and Services',
      interests: [],
    })
  })

  it('rejects malformed records instead of inventing data', () => {
    expect(() => normalizeFounders([{ Id: '1' }])).toThrow(
      'Founder record 1 is missing Name',
    )
  })
})
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm test -- src/domain/founder.test.ts`

Expected: FAIL because `normalizeFounders` does not exist.

- [ ] **Step 5: Implement the typed normalization boundary**

Create `src/domain/founder.ts` with exported `RawFounder` and `Founder`
interfaces, a required string-field helper, numeric age validation, derived
`topLevelVertical`, optional `batch`, and string-array `interests`. The exported
function must have this signature:

```ts
export function normalizeFounders(input: unknown): Founder[]
```

It must reject a non-array input, missing required values, duplicate IDs, and
non-integer ages outside 18–120.

- [ ] **Step 6: Download the supplied dataset and verify normalization**

Run:

```bash
curl -fsSL \
  'https://gitlab.com/-/snippets/5976927/raw/main/founder-dinner-matching.json' \
  -o src/data/founders.json
npm test -- src/domain/founder.test.ts
```

Expected: both normalization tests PASS.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig*.json vite.config.ts index.html \
  src/main.tsx src/App.tsx src/data/founders.json src/domain
git commit -m "feat: scaffold typed founder dataset"
```

### Task 2: Implement search, filters, sorting, and URL state

**Files:**
- Create: `src/search/search.ts`
- Create: `src/search/search.test.ts`
- Create: `src/search/urlState.ts`
- Create: `src/search/urlState.test.ts`

**Interfaces:**
- Consumes: `Founder`
- Produces: `DirectoryFilters`, `DirectorySort`, `DirectoryState`
- Produces: `searchFounders(founders, state): FounderSearchResult[]`
- Produces: `parseDirectoryState(params): DirectoryState`
- Produces: `serializeDirectoryState(state): URLSearchParams`

- [ ] **Step 1: Write failing search and filter tests**

Cover these exact cases in `src/search/search.test.ts`:

```ts
it('requires every query token to match indexed text', () => {
  expect(names(searchFounders(founders, state({ query: 'analytics engineer' }))))
    .toEqual(['Ada Founder'])
})

it('uses OR within roles and AND across filter categories', () => {
  const result = searchFounders(founders, state({
    filters: { roles: ['Design', 'Engineering'], topLevelVerticals: ['Consumer'] },
  }))
  expect(names(result)).toEqual(['Grace Builder'])
})

it('ranks exact name matches before prefix and substring matches', () => {
  expect(names(searchFounders(founders, state({ query: 'Ada' }))))
    .toEqual(['Ada', 'Ada Founder', 'Notada Labs'])
})
```

- [ ] **Step 2: Run the search tests to verify failure**

Run: `npm test -- src/search/search.test.ts`

Expected: FAIL because the search module does not exist.

- [ ] **Step 3: Implement pure search and filter logic**

Implement:

```ts
export type DirectorySort =
  | 'relevance'
  | 'name'
  | 'similar'
  | 'complementary'
  | 'serendipity'

export interface DirectoryFilters {
  topLevelVerticals: string[]
  verticals: string[]
  roles: string[]
  education: string[]
  companies: string[]
  groups: string[]
  groupSections: string[]
  ageMin?: number
  ageMax?: number
}

export function searchFounders(
  founders: Founder[],
  state: DirectoryState,
): FounderSearchResult[]
```

Normalize indexed text once per call, apply filters before scoring, and use a
stable ID hash for serendipity.

- [ ] **Step 4: Write URL round-trip tests**

Test that query, repeated multi-select values, numeric ages, sort, and selected
founder survive `serializeDirectoryState` then `parseDirectoryState`. Test that
an unknown sort and invalid ages are ignored individually.

- [ ] **Step 5: Implement URL state**

Use repeated query parameters such as `role=Design&role=Engineering`. Export:

```ts
export function parseDirectoryState(params: URLSearchParams): DirectoryState
export function serializeDirectoryState(state: DirectoryState): URLSearchParams
```

- [ ] **Step 6: Run targeted tests and commit**

Run: `npm test -- src/search`

Expected: all search and URL tests PASS.

```bash
git add src/search
git commit -m "feat: add founder search and filter engine"
```

### Task 3: Implement explainable discovery scoring

**Files:**
- Create: `src/discovery/discovery.ts`
- Create: `src/discovery/discovery.test.ts`

**Interfaces:**
- Consumes: `Founder[]`, selected `Founder`
- Produces: `DiscoveryCollection`, `DiscoveryCandidate`
- Produces: `buildDiscoveryCollections(founders, selected, limit): DiscoveryCollection[]`
- Produces: reusable `similarityScore` and `complementarityScore`

- [ ] **Step 1: Write failing collection tests**

Test that the selected founder and same-company colleagues are excluded, the
same-sector collection requires a different role, every recommendation has a
non-empty reason, and repeated calls return the same order.

- [ ] **Step 2: Run the tests to verify failure**

Run: `npm test -- src/discovery/discovery.test.ts`

Expected: FAIL because the discovery module does not exist.

- [ ] **Step 3: Implement the four collections**

Export:

```ts
export interface DiscoveryCandidate {
  founder: Founder
  score: number
  reason: string
}

export interface DiscoveryCollection {
  id: 'sector' | 'complementary' | 'outside-circle' | 'shared-context'
  title: string
  description: string
  candidates: DiscoveryCandidate[]
}

export function buildDiscoveryCollections(
  founders: Founder[],
  selected: Founder,
  limit?: number,
): DiscoveryCollection[]
```

Implement the scoring rules from the design specification and derive reasons
from the strongest non-zero scoring signals.

- [ ] **Step 4: Run tests and commit**

Run: `npm test -- src/discovery`

Expected: all discovery tests PASS.

```bash
git add src/discovery
git commit -m "feat: add explainable founder discovery"
```

### Task 4: Build the founder directory interface

**Files:**
- Create: `src/styles.css`
- Create: `src/components/Masthead.tsx`
- Create: `src/components/ProfileSelector.tsx`
- Create: `src/components/SearchControls.tsx`
- Create: `src/components/DiscoverySection.tsx`
- Create: `src/components/FounderCard.tsx`
- Create: `src/components/FounderDrawer.tsx`
- Create: `src/components/FutureProfileFields.tsx`
- Create: `src/pages/DirectoryPage.tsx`
- Create: `src/pages/DirectoryPage.test.tsx`
- Create: `src/test/setup.ts`
- Modify: `src/App.tsx`
- Modify: `src/main.tsx`

**Interfaces:**
- Consumes: normalized founders, search engine, discovery collections, URL state
- Produces: accessible founder directory at `/`

- [ ] **Step 1: Write failing component tests**

Test:

```tsx
it('shows discovery collections before a query is entered')
it('shows a result summary after entering a query')
it('removes an active filter from its chip')
it('shows a useful empty state and clears all controls')
it('opens and closes founder details')
it('changes discovery results when browsing-as changes')
```

Use accessible roles and labels rather than CSS selectors.

- [ ] **Step 2: Run the page tests to verify failure**

Run: `npm test -- src/pages/DirectoryPage.test.tsx`

Expected: FAIL because `DirectoryPage` does not exist.

- [ ] **Step 3: Implement the page and components**

Keep state in `DirectoryPage`. Initialize from `window.location.search`, update
the URL with `history.replaceState`, and render discovery only when query and all
filters are empty. Use native controls and semantic buttons.

- [ ] **Step 4: Implement the house visual system**

Define CSS custom properties matching the design tokens. Use square bordered
cards, compact uppercase micro-labels, responsive grids, visible focus states,
and no decorative shadows. Load Instrument Sans from Google Fonts with a system
font fallback.

- [ ] **Step 5: Run component tests, lint, and build**

Run:

```bash
npm test -- src/pages/DirectoryPage.test.tsx
npm run lint
npm run build
```

Expected: tests PASS, lint exits 0, and Vite writes `dist/`.

- [ ] **Step 6: Commit**

```bash
git add src
git commit -m "feat: build founder discovery directory"
```

### Task 5: Implement deterministic arbitrary grouping

**Files:**
- Create: `src/grouping/grouping.ts`
- Create: `src/grouping/grouping.test.ts`

**Interfaces:**
- Consumes: `Founder[]`, `GroupingConfig`
- Produces: `GroupingResult`
- Produces: `generateGroups(founders, config): GroupingResult`

- [ ] **Step 1: Write failing grouping tests**

Cover:

```ts
it('creates groups whose sizes differ by no more than one')
it('returns identical assignments for the same seed')
it('changes equivalent assignments when the seed changes')
it('separates founders from the same company when feasible')
it('honors locked, together, apart, and excluded constraints')
it('reports an impossible hard constraint without hiding the assignment')
it('disables batch and interest objectives when the data is absent')
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- src/grouping/grouping.test.ts`

Expected: FAIL because the grouping module does not exist.

- [ ] **Step 3: Define grouping types**

```ts
export type GroupingAttribute =
  | 'age'
  | 'batch'
  | 'industry'
  | 'interests'
  | 'role'
  | 'education'
  | 'company'
  | 'historicalGroup'
  | 'historicalSection'

export type GroupingObjective = 'similar' | 'diverse' | 'ignore'

export interface AttributeRule {
  attribute: GroupingAttribute
  objective: GroupingObjective
  weight: number
}

export interface GroupingConfig {
  targetSize: number
  seed: string
  rules: AttributeRule[]
  separateSameCompany: boolean
  excludedIds: string[]
  lockedGroupById: Record<string, number>
  together: string[][]
  apart: Array<[string, string]>
}
```

- [ ] **Step 4: Implement assignment and bounded optimization**

Implement normalized attribute distances, seeded tie-breaking, difficult-first
greedy placement, then pairwise swaps until no improvement is found or 2,000
candidate swaps have been evaluated. Return:

```ts
export interface GroupingResult {
  groups: Array<{ id: number; founders: Founder[]; summary: string[] }>
  score: number
  warnings: string[]
  disabledAttributes: GroupingAttribute[]
}
```

- [ ] **Step 5: Run tests and commit**

Run: `npm test -- src/grouping`

Expected: all grouping tests PASS.

```bash
git add src/grouping
git commit -m "feat: add configurable dinner grouping engine"
```

### Task 6: Build the admin grouping workspace and export

**Files:**
- Create: `src/grouping/exportCsv.ts`
- Create: `src/grouping/exportCsv.test.ts`
- Create: `src/components/admin/AttendeePool.tsx`
- Create: `src/components/admin/GroupingRules.tsx`
- Create: `src/components/admin/ConstraintEditor.tsx`
- Create: `src/components/admin/GeneratedGroups.tsx`
- Create: `src/pages/AdminPage.tsx`
- Create: `src/pages/AdminPage.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: founders and `generateGroups`
- Produces: admin preview at `/admin`
- Produces: `groupsToCsv(result): string`

- [ ] **Step 1: Write CSV tests**

Verify a header row, one row per included founder, CSV escaping for commas and
quotes, and columns for generated group, name, company, vertical, role, batch,
and interests.

- [ ] **Step 2: Implement CSV export**

Export:

```ts
export function groupsToCsv(result: GroupingResult): string
```

Use RFC 4180-style double-quote escaping and `\r\n` line endings.

- [ ] **Step 3: Write failing admin page tests**

Test target-size changes, strategy presets, missing-data disabled controls,
generation, warning display, seed changes, attendee exclusion, and CSV download.

- [ ] **Step 4: Implement the admin route and workspace**

Use `window.location.pathname` for the two-route prototype. Label the page
“Admin preview — access control not enabled.” Provide Similar, Diverse,
Balanced, and Custom presets. Preserve editable custom rules when switching
away and back.

- [ ] **Step 5: Run tests, lint, and build**

Run:

```bash
npm test -- src/grouping src/pages/AdminPage.test.tsx
npm run lint
npm run build
```

Expected: tests PASS, lint exits 0, and production build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src
git commit -m "feat: add admin grouping workspace"
```

### Task 7: Verify the product and publish the private repository

**Files:**
- Create: `README.md`
- Create: `.gitignore`
- Modify: `package.json`

**Interfaces:**
- Produces: documented, tested private GitHub repository

- [ ] **Step 1: Document setup, views, data provenance, and limitations**

README must include:

```md
npm install
npm run dev
npm test
npm run build
```

Document `/`, `/admin`, the GitLab source URL, absence of authentication, the
fact that batch/interests are not present, and that grouping is heuristic rather
than globally optimal.

- [ ] **Step 2: Run the complete validation suite**

Run:

```bash
npm test
npm run lint
npm run build
```

Expected: every command exits 0.

- [ ] **Step 3: Start and probe the production preview**

Run `npm run preview -- --host 127.0.0.1` in an attached background session.
Verify both routes:

```bash
curl -I http://127.0.0.1:4173/
curl -I http://127.0.0.1:4173/admin
```

Expected: both return HTTP 200.

- [ ] **Step 4: Commit documentation**

```bash
git add README.md .gitignore package.json package-lock.json
git commit -m "docs: document founder matching prototype"
```

- [ ] **Step 5: Create and push the private personal repository**

Verify the intended personal account, create `founder-matching-app` as private,
bind the clone to that account using `~/bin/bind-github-accounts`, and push
`main`. Do not switch the global GitHub CLI account.

- [ ] **Step 6: Confirm remote state**

Run:

```bash
git status --short
git remote -v
git log -1 --oneline
```

Expected: clean worktree, GitHub `origin`, and the documentation commit at HEAD.
