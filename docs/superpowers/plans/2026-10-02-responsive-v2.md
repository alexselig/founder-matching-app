# Founder Index V2 Responsive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every V2 route usable at 390px, 768px, 1024px, and 1440px without page-level horizontal scrolling or inaccessible primary actions.

**Architecture:** Keep one responsive DOM per feature. Add shared shell breakpoints for the header/footer, then use existing page-level media and container queries to reorganize each workspace. Phones show one primary task at a time; tablets use one or two columns; desktop remains unchanged.

**Tech Stack:** React 19, TypeScript 6, CSS media/container queries, Vitest, Testing Library, Playwright.

## Global Constraints

- Preserve every V2 capability at every viewport.
- Reference widths are 390px, 768px, 1024px, and 1440px.
- No page-level horizontal scrolling.
- Mobile controls are at least 44px in their primary hit dimension, except numeric steppers grouped inside a 44px row.
- Keep the YC design language from `DESIGN.md`: flat grid cells, zero radius except pills/avatars, one-pixel rules, no shadows.
- Preserve focus order, visible focus rings, modal focus traps, and reduced-motion behavior.

---

### Task 1: Responsive shell, navigation, and footer

**Files:**
- Modify: `src/v2/search/v2-chrome.css`
- Modify: `src/v2/layout/v2-footer-actions.css`
- Modify: `src/v2/dinner/dinner-header.css`
- Test: `src/v2/V2App.test.tsx`

**Interfaces:**
- Consumes: existing `.v2-shell`, `.v2-topbar`, `.v2-nav`, `.v2-profile`, and `.v2-footer` markup.
- Produces: a shell no wider than the viewport and a reusable two-row mobile header.

- [ ] **Step 1: Add a failing CSS contract test**

Add assertions to the responsive CSS test in `src/v2/V2App.test.tsx`:

```ts
expect(chrome).toMatch(/@media \(max-width: 900px\)[\s\S]*\.v2-topbar \{[^}]*min-width: 0/)
expect(chrome).toMatch(/@media \(max-width: 620px\)[\s\S]*\.v2-topbar \{[^}]*grid-template-rows: 64px 48px/)
expect(footer).toMatch(/env\(safe-area-inset-bottom\)/)
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run:

```bash
npm test -- --run src/v2/V2App.test.tsx
```

Expected: FAIL because the shell has only a 1100px compact-desktop rule and `.v2-topbar` still has `min-width: 980px`.

- [ ] **Step 3: Implement tablet and mobile shell rules**

Add rules equivalent to:

```css
@media (max-width: 900px) {
  .v2-shell { overflow-x: hidden; }
  .v2-topbar { min-width: 0; grid-template-columns: minmax(0, 1fr) 220px; }
  .v2-brand { min-width: 0; }
  .v2-nav { min-width: 0; }
  .v2-profile { grid-column: 2; }
}

@media (max-width: 620px) {
  .v2-topbar {
    height: 112px;
    grid-template-columns: minmax(0, 1fr) 116px;
    grid-template-rows: 64px 48px;
  }
  .v2-brand { grid-column: 1; grid-row: 1; padding-inline: 18px; }
  .v2-profile { grid-column: 2; grid-row: 1; }
  .v2-nav { grid-column: 1 / -1; grid-row: 2; border-top: 1px solid var(--line); }
  .v2-nav-item { flex: 1; justify-content: center; min-height: 48px; padding: 0 12px; }
  .v2-profile-menu { width: min(318px, 100vw); }
}
```

Update the footer to include `padding-bottom: env(safe-area-inset-bottom)` and internal action scrolling rather than page overflow.

- [ ] **Step 4: Run focused tests**

Run:

```bash
npm test -- --run src/v2/V2App.test.tsx src/v2/layout/V2Footer.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/v2/search/v2-chrome.css src/v2/layout/v2-footer-actions.css src/v2/dinner/dinner-header.css src/v2/V2App.test.tsx
git commit -m "style: make V2 shell responsive"
```

### Task 2: Responsive Search and discovery

**Files:**
- Modify: `src/v2/search/search.css`
- Test: `src/v2/search/SearchPage.test.tsx`
- Test: `src/v2/dinner/dinnerResponsive.test.ts`

**Interfaces:**
- Consumes: existing Search hero, toolbar, founder grid/list, recommendation groups, and picker markup.
- Produces: one-column mobile Search, two-column tablet cards, wrapped controls, and viewport-contained pickers.

- [ ] **Step 1: Add failing responsive CSS assertions**

Extend `src/v2/dinner/dinnerResponsive.test.ts` to load `search.css` and assert:

```ts
expect(search).toMatch(/@media \(max-width: 900px\)[\s\S]*\.v2-search-hero \{[^}]*grid-template-columns: 1fr/)
expect(search).toMatch(/@media \(max-width: 620px\)[\s\S]*\.v2-recommendation-grid \{[^}]*grid-template-columns: 1fr/)
expect(search).toMatch(/\.v2-picker \{[^}]*width: min\(640px, calc\(100vw - 32px\)\)/)
```

- [ ] **Step 2: Verify the test fails**

Run:

```bash
npm test -- --run src/v2/dinner/dinnerResponsive.test.ts
```

Expected: FAIL because Search only has a 1100px rule.

- [ ] **Step 3: Implement Search breakpoints**

At 900px:

- Stack the hero title and search composer.
- Use two recommendation/result columns.
- Wrap the results toolbar into named rows.
- Constrain pickers to `calc(100vw - 32px)`.

At 620px:

- Use one recommendation/result column.
- Convert the input/submit composition to one column.
- Make list rows stacked labeled blocks.
- Keep filter/sort/group controls at least 44px tall.

Use `min-width: 0` on every grid child that can contain long founder or company text.

- [ ] **Step 4: Validate Search behavior**

Run:

```bash
npm test -- --run src/v2/search/SearchPage.test.tsx src/v2/dinner/dinnerResponsive.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/v2/search/search.css src/v2/dinner/dinnerResponsive.test.ts
git commit -m "style: make founder search responsive"
```

### Task 3: Responsive Seating Plans, AI settings, and evidence

**Files:**
- Modify: `src/v2/dinner/seating-plans.css`
- Modify: `src/v2/settings/ai-provider.css`
- Modify: `src/v2/evidence/founder-evidence.css`
- Test: `src/v2/dinner/dinnerResponsive.test.ts`

**Interfaces:**
- Consumes: current route markup and the full-height evidence panel.
- Produces: mobile plan cards, a viewport-width AI page, and a full-width evidence sheet below 640px.

- [ ] **Step 1: Add failing CSS contract assertions**

```ts
expect(plans).toMatch(/@container plans \(max-width: 760px\)[\s\S]*min-height: 44px/)
expect(ai).toMatch(/@media \(max-width: 620px\)[\s\S]*padding-inline: 20px/)
expect(evidence).toMatch(/@media \(max-width: 640px\)[\s\S]*width: 100vw/)
```

- [ ] **Step 2: Verify failure**

Run:

```bash
npm test -- --run src/v2/dinner/dinnerResponsive.test.ts
```

Expected: FAIL on missing mobile touch and spacing contracts.

- [ ] **Step 3: Implement route-specific mobile polish**

- Fix `NEW SEATING PLAN` spacing and give plan row actions 44px targets.
- Make plan dialogs use viewport width with stacked actions below 620px.
- Give AI page sections 20px mobile gutters and full-width fields/actions.
- Keep evidence rank/content columns readable at 390px and the close control 44px.

- [ ] **Step 4: Run route tests**

```bash
npm test -- --run src/v2/dinner/SeatingPlansPage.test.tsx src/v2/settings/AiProviderPage.test.tsx src/v2/evidence/FounderEvidencePage.test.tsx src/v2/dinner/dinnerResponsive.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/v2/dinner/seating-plans.css src/v2/settings/ai-provider.css src/v2/evidence/founder-evidence.css src/v2/dinner/dinnerResponsive.test.ts
git commit -m "style: polish responsive secondary routes"
```

### Task 4: Responsive Dinner workbench

**Files:**
- Modify: `src/v2/dinner/dinner.css`
- Modify: `src/v2/dinner/dinner-setup.css`
- Modify: `src/v2/dinner/dinner-results.css`
- Modify: `src/v2/dinner/dinner-alternatives.css`
- Modify: `src/v2/dinner/dinner-recovery.css`
- Modify: `src/v2/dinner/dinner-export.css`
- Test: `src/v2/dinner/dinnerResponsive.test.ts`
- Test: `src/v2/dinner/DinnerPage.test.tsx`

**Interfaces:**
- Consumes: current setup/results/analysis/alternatives/recovery/export components.
- Produces: one-task mobile setup, focused-table mobile results, readable tablet grids, and contained overlays.

- [ ] **Step 1: Add failing layout contracts**

Assert:

```ts
expect(results).toMatch(/@container dinner \(max-width: 560px\)[\s\S]*\.v2-dinner-segmented button \{[^}]*padding: 0 14px/)
expect(results).toMatch(/@container dinner \(max-width: 900px\)[\s\S]*\.v2-dinner-work-tools \{[^}]*flex-wrap: wrap/)
expect(exportCss).toMatch(/@container dinner \(max-width: 560px\)[\s\S]*\.v2-export-dialog/)
```

- [ ] **Step 2: Verify failure**

Run:

```bash
npm test -- --run src/v2/dinner/dinnerResponsive.test.ts src/v2/dinner/DinnerPage.test.tsx
```

Expected: FAIL on toolbar wrapping and mobile export containment.

- [ ] **Step 3: Implement Dinner responsive behavior**

- Preserve the approved focused-table mobile results view.
- Increase active tab padding to 20px desktop/tablet and 14px mobile.
- Wrap tablet toolbars rather than hide threshold/density controls.
- Ensure setup sections and dialogs scroll above the fixed footer.
- Stack alternatives and recovery panels at tablet/mobile widths.
- Convert export to a full-width mobile sheet with stacked actions.

- [ ] **Step 4: Run Dinner tests**

```bash
npm test -- --run src/v2/dinner/DinnerPage.test.tsx src/v2/dinner/dinnerResponsive.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/v2/dinner/dinner.css src/v2/dinner/dinner-setup.css src/v2/dinner/dinner-results.css src/v2/dinner/dinner-alternatives.css src/v2/dinner/dinner-recovery.css src/v2/dinner/dinner-export.css src/v2/dinner/dinnerResponsive.test.ts
git commit -m "style: finish responsive dinner workbench"
```

### Task 5: Cross-route browser regression and screenshots

**Files:**
- Modify: `e2e/v2.spec.ts`
- Modify: `scripts/capture-showcase.mjs`
- Modify: affected files in `docs/showcase/images/`

**Interfaces:**
- Consumes: all responsive route CSS from Tasks 1-4.
- Produces: executable no-overflow regression coverage and refreshed public screenshots.

- [ ] **Step 1: Add Playwright viewport assertions**

Add a test that visits the eight V2 states at 390px and 768px and asserts:

```ts
const width = await page.evaluate(() => ({
  scroll: document.documentElement.scrollWidth,
  client: document.documentElement.clientWidth,
}))
expect(width.scroll).toBeLessThanOrEqual(width.client + 1)
```

Also assert the mobile header, footer, primary actions, and evidence close button are visible.

- [ ] **Step 2: Run E2E and verify failures before final fixes**

Run:

```bash
npm run test:e2e
```

Expected before final fixes: any remaining route overflow is named by route and viewport.

- [ ] **Step 3: Fix only failures exposed by the regression test**

Adjust the responsible page CSS. Do not add global clipping to hide overflow.

- [ ] **Step 4: Run complete validation**

```bash
npm test -- --run
npm run lint
npm run build
npm run test:e2e
git diff --check
```

Expected: 553+ unit tests pass, lint and build pass, all Playwright tests pass.

- [ ] **Step 5: Refresh and inspect screenshots**

Run:

```bash
SHOWCASE_BASE_URL=http://127.0.0.1:4326 node scripts/capture-showcase.mjs
```

Capture new dedicated tablet/mobile screenshots if the existing set does not show Search, AI settings, and Dinner Analysis at responsive widths.

- [ ] **Step 6: Commit**

```bash
git add e2e/v2.spec.ts scripts/capture-showcase.mjs docs/showcase/images
git commit -m "test: cover V2 responsive layouts"
```

### Task 6: Publish and verify

**Files:**
- No source changes expected.

- [ ] **Step 1: Merge the feature branch into `main`**

Use a fast-forward merge after confirming the primary worktree's unrelated files remain untouched.

- [ ] **Step 2: Re-run the unit suite on merged `main`**

```bash
npm test -- --run
```

Expected: PASS.

- [ ] **Step 3: Push `main`**

```bash
git push origin main
```

- [ ] **Step 4: Wait for Render and verify live widths**

Verify Search, Dinner Tables, Analysis, AI settings, and Founder evidence at 390px, 768px, and 1024px. Assert no page-level horizontal scroll.

- [ ] **Step 5: Verify GitHub Pages image hashes**

Download each changed showcase image and compare its SHA-256 hash with the repository copy.
