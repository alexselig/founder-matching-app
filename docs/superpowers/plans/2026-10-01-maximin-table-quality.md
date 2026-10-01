# Maximin Table Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace placement-only grouping with a parameter-selective lexicographic maximin optimizer that protects the worst-served founder and weakest table before improving the average.

**Architecture:** Extract grouping quality into pure exported functions in `src/domain.ts`, then use a deterministic cross-table swap optimizer over the existing seeded balanced arrangement. Return founder/table diagnostics with the groups so the admin and algorithm pages can explain the result.

**Tech Stack:** TypeScript 6, React 19, Vitest 5

## Global Constraints

- Disabled parameters contribute nothing to quality.
- Missing pair values are ignored rather than treated as similar or different.
- Similar quality is `1 - distance`.
- Diverse quality is `distance`.
- Balanced quality is `1 - abs(distance - 0.55) / 0.55`, clamped to `0–1`.
- A same-company pair has quality `0`.
- Maximize sorted founder qualities lexicographically before sorted table qualities and mean quality.
- Preserve deterministic results for identical inputs and seed.
- Preserve table capacities and exactly-once founder assignment.
- Report whether the optimizer converged or hit its comparison limit.

---

### Task 1: Define pair, founder, and table quality

**Files:**
- Modify: `src/domain.ts`
- Modify: `src/domain.test.ts`

**Interfaces:**
- Consumes: `Founder`, `GroupingStrategy`, `GroupingAttribute[]`
- Produces: `pairQuality(a, b, strategy, attributes): number`
- Produces: `scoreGroup(group, qualityById): GroupQuality`

- [ ] **Step 1: Write failing quality tests**

Add tests that assert:

```ts
expect(pairQuality(a, b, 'similar', ['role'])).toBe(1)
expect(pairQuality(a, b, 'diverse', ['role'])).toBe(0)
expect(pairQuality(a, colleague, 'diverse', ['role'])).toBe(0)
expect(pairQuality(founderWithoutBatch, b, 'similar', ['batch'])).toBe(0.5)
```

Add a group test:

```ts
const quality = scoreGroup([a, b, c], qualityMatrix)
expect(quality.founders.map((entry) => entry.quality)).toHaveLength(3)
expect(quality.quality).toBe(Math.min(...quality.founders.map((entry) => entry.quality)))
```

- [ ] **Step 2: Run the targeted tests**

Run: `npm test -- src/domain.test.ts`

Expected: FAIL because the exported quality functions and result types do not exist.

- [ ] **Step 3: Implement quality conversion**

Export:

```ts
export interface FounderQuality {
  founderId: string
  quality: number
}

export interface GroupQuality {
  quality: number
  meanQuality: number
  founders: FounderQuality[]
}

export function pairQuality(
  a: Founder,
  b: Founder,
  strategy: GroupingStrategy,
  attributes: GroupingAttribute[],
): number
```

Average only computable attribute distances. Use neutral distance `0.5` when no
selected attribute compares the pair. Return `0` immediately for same-company
pairs. For Random, return deterministic neutral quality `0.5` for non-colleagues.

- [ ] **Step 4: Implement group scoring**

Export:

```ts
export function scoreGroup(
  group: Founder[],
  qualityById: Map<string, Map<string, number>>,
): GroupQuality
```

Each founder quality is the mean pair quality to their peers. A single-person
table has neutral quality `0.5`. Table quality is the minimum founder quality.

- [ ] **Step 5: Run tests and commit**

Run: `npm test -- src/domain.test.ts`

Expected: all tests PASS.

```bash
git add src/domain.ts src/domain.test.ts
git commit -m "feat: define founder and table quality"
```

### Task 2: Implement lexicographic maximin swaps

**Files:**
- Modify: `src/domain.ts`
- Modify: `src/domain.test.ts`

**Interfaces:**
- Consumes: initial groups and pair-quality matrix
- Produces: `optimizeGroups(groups, qualityById, limit): OptimizationResult`
- Changes: `generateGroups` returns `GroupingResult`

- [ ] **Step 1: Write failing maximin tests**

Add a deliberately poor two-table arrangement where one cross-table swap raises
the worst founder quality. Assert:

```ts
const optimized = optimizeGroups(initialGroups, matrix, 10_000)
expect(optimized.minimumFounderQuality).toBeGreaterThan(before.minimumFounderQuality)
expect(optimized.meanFounderQuality).toBeGreaterThanOrEqual(before.meanFounderQuality)
```

Add invariants:

```ts
expect(flattenIds(optimized.groups).sort()).toEqual(flattenIds(initialGroups).sort())
expect(optimized.groups.map((group) => group.length)).toEqual(initialGroups.map((group) => group.length))
expect(findImprovingSwap(optimized.groups, matrix)).toBeNull()
```

Add a regression proving that raising only the mean while lowering the worst
founder is rejected.

- [ ] **Step 2: Run the targeted tests**

Run: `npm test -- src/domain.test.ts`

Expected: FAIL because optimizer functions do not exist.

- [ ] **Step 3: Implement objective comparison**

Export:

```ts
export interface QualitySummary {
  founderQualities: number[]
  tableQualities: number[]
  minimumFounderQuality: number
  minimumTableQuality: number
  meanFounderQuality: number
}

export function compareQuality(a: QualitySummary, b: QualitySummary): number
```

Sort founder and table vectors ascending. Compare founder values first, then
table values, then mean. Return a positive number only when `a` is better.

- [ ] **Step 4: Implement deterministic swap search**

Export:

```ts
export interface OptimizationResult extends QualitySummary {
  groups: Founder[][]
  acceptedSwaps: number
  evaluatedSwaps: number
  converged: boolean
}

export function optimizeGroups(
  groups: Founder[][],
  qualityById: Map<string, Map<string, number>>,
  comparisonLimit?: number,
): OptimizationResult
```

Evaluate one-for-one swaps only across different tables. Accept the first
lexicographic improvement, restart the scan, and stop after a full pass with no
improvement. Default the comparison limit to `250_000`. Keep group sizes fixed.

- [ ] **Step 5: Integrate with group generation**

Return:

```ts
export interface GroupingResult extends OptimizationResult {
  disabledAttributes: GroupingAttribute[]
}
```

Build the pair-quality matrix once, run the existing seeded assignment, then
optimize it. Reject an empty attribute list for non-Random strategies.

- [ ] **Step 6: Run tests and commit**

Run: `npm test -- src/domain.test.ts`

Expected: all quality, optimization, conservation, sizing, and determinism tests PASS.

```bash
git add src/domain.ts src/domain.test.ts
git commit -m "feat: optimize groups with maximin fairness"
```

### Task 3: Surface quality and document the optimizer

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/index.css`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-10-01-founder-discovery-search-design.md`

**Interfaces:**
- Consumes: `GroupingResult`
- Produces: visible run diagnostics and maximin documentation

- [ ] **Step 1: Update admin output**

Add a summary bar with:

```tsx
<strong>{percent(result.minimumFounderQuality)} weakest founder</strong>
<strong>{percent(result.minimumTableQuality)} weakest table</strong>
<strong>{percent(result.meanFounderQuality)} mean quality</strong>
```

Mark the weakest table, show each table's quality, and show:

```tsx
{result.converged
  ? `Local optimum after ${result.acceptedSwaps} swaps`
  : `Stopped after ${result.evaluatedSwaps} comparisons`}
```

- [ ] **Step 2: Update algorithm documentation**

Replace the greedy-only explanation with:

- Organizer-selected parameters
- Pair quality conversion
- Founder quality as mean peer quality
- Table quality as its weakest founder
- Lexicographic maximin comparison
- Deterministic one-for-one swap optimization
- Explicit local-optimum and comparison-limit caveats

- [ ] **Step 3: Add styling**

Use YC tokens from `DESIGN.md`. Quality metrics occupy hairline-separated cells.
The weakest table uses an orange 4px side bar, not a shadow or rounded warning.

- [ ] **Step 4: Verify**

Run:

```bash
npm test
npm run lint
npm run build
```

Expected: all commands exit 0.

Use browser QA on `/algorithm` and `/admin` at 375px, 768px, and 1280px.
Expected: no overflow, no console errors, quality diagnostics readable.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/index.css README.md \
  docs/superpowers/specs/2026-10-01-founder-discovery-search-design.md
git commit -m "feat: explain maximin table quality"
```

