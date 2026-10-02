# V1/V2 Version Deep Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve workflow context when switching between V1 and V2, align the compact V1 switcher to the bottom-left with a solid blue active tab, and regroup the V1 top navigation.

**Architecture:** A pure route-mapping module owns all cross-version destinations. Both footer implementations consume it, while CSS controls only the V1 switcher's position and active treatment.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, CSS, Vite.

## Global Constraints

- Unknown routes fall back to the destination version's discovery page.
- Query strings do not cross versions.
- V1 remains a compact 32px footer switcher.
- Active V1 uses `var(--bauhaus-blue)` with white text.
- V1 top navigation orders Directory and Admin grouping on the left, then Plan review and Algorithm right-aligned beside the founder count.
- Do not change unrelated V1 or V2 navigation.

---

### Task 1: Route mapping

**Files:**
- Create: `src/app/versionLinks.ts`
- Create: `src/app/versionLinks.test.ts`

**Interfaces:**
- Produces: `v1DestinationFor(pathname: string): string`
- Produces: `v2DestinationFor(pathname: string): string`

- [ ] **Step 1: Write failing table-driven mapping tests**

Cover discovery, grouping, settings/evidence, and unknown routes using the exact mappings in `docs/superpowers/specs/2026-10-02-version-deep-links-design.md`.

- [ ] **Step 2: Run the tests and confirm failure**

Run: `npx vitest run src/app/versionLinks.test.ts`

Expected: FAIL because `versionLinks.ts` does not exist.

- [ ] **Step 3: Implement pure route mapping**

Use pathname normalization with trailing-slash removal and explicit prefix checks. Return only canonical `/v1/*` or `/v2/*` paths.

- [ ] **Step 4: Run mapping tests**

Run: `npx vitest run src/app/versionLinks.test.ts`

Expected: PASS.

### Task 2: Footer integration and V1 placement

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/v2/layout/V2Footer.tsx`
- Modify: `src/index.css`
- Modify: `src/app/AppRouter.test.tsx`
- Modify: `src/v2/layout/V2Footer.test.tsx`

**Interfaces:**
- Consumes: `v1DestinationFor(pathname: string): string`
- Consumes: `v2DestinationFor(pathname: string): string`

- [ ] **Step 1: Add failing footer link tests**

Assert `/v1/admin` links to `/v2/dinner`, `/v1/directory` links to `/v2/search`, `/v2/dinner` links to `/v1/admin`, and `/v2/search` links to `/v1/directory`.

- [ ] **Step 2: Add a failing V1 CSS regression**

Read `src/index.css` and assert `.v1-version-footer` uses `left: 0` without `right: 0`, while `.v1-version-footer a.active` uses `background: var(--bauhaus-blue)` and white text.

Assert the V1 navigation renders Directory, Admin grouping, Plan review, Algorithm in that order and the Plan review link starts a secondary group using `margin-left: auto`.

- [ ] **Step 3: Run targeted tests and confirm failure**

Run: `npx vitest run src/app/versionLinks.test.ts src/app/AppRouter.test.tsx src/v2/layout/V2Footer.test.tsx`

Expected: FAIL on current home-only footer links and bottom-right styling.

- [ ] **Step 4: Integrate route helpers**

Compute the opposite-version destination from `window.location.pathname` in each footer. Keep each active-version link canonical and unchanged.

- [ ] **Step 5: Update V1 styling**

Set `left: 0`, remove `right: 0`, retain `bottom: 0`, and use a solid blue background with white active text.

Reorder the V1 navigation links and mark Plan review as the start of the right-aligned secondary group.

- [ ] **Step 6: Run targeted tests**

Run: `npx vitest run src/app/versionLinks.test.ts src/app/AppRouter.test.tsx src/v2/layout/V2Footer.test.tsx`

Expected: PASS.

### Task 3: Full verification and publication

**Files:**
- Modify: `docs/superpowers/execution/v2-status.md`

**Interfaces:**
- Consumes the completed route mapping and footer behavior.

- [ ] **Step 1: Run quality checks**

Run: `npm run lint && npm run build`

Expected: both exit successfully.

- [ ] **Step 2: Verify locally in a production server**

Open representative V1 and V2 routes and confirm the V1 switcher is bottom-left, V1 is blue with white text, and cross-version links preserve discovery/grouping intent.

- [ ] **Step 3: Update task status**

Mark deep links and V1 footer placement complete with the verification evidence.

- [ ] **Step 4: Commit and push**

Stage only the specification, plan, mapping implementation, footer changes, tests, CSS, and status file. Push `main`, then verify the new Render deploy and the live V1/V2 routes.
