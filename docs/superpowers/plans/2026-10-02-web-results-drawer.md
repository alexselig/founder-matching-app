# Top Web Results Drawer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Present founder evidence in a responsive, full-height right-side panel over Founder Search.

**Architecture:** `V2App` keeps ownership of evidence route matching and loading, but renders `SearchPage` as the route background and a focused `FounderEvidenceDrawer` as a sibling overlay. The drawer preserves the existing evidence data model and deep-link URL while providing modal close, Escape, scrim, and responsive behavior.

**Tech Stack:** React 19, TypeScript, CSS, Vitest, Testing Library.

## Global Constraints

- Preserve `/v2/founders/:founderId/evidence` as a refreshable and shareable deep link.
- Display the title exactly as `Top web results`.
- Close actions return to `/v2/search`.
- Do not add a routing or animation dependency.
- Retain all fresh, stale, no-results, unsupported, and provider-failure content states.

---

### Task 1: Convert the evidence surface into a modal drawer

**Files:**
- Modify: `src/v2/evidence/FounderEvidencePage.tsx`
- Modify: `src/v2/evidence/founder-evidence.css`
- Modify: `src/v2/evidence/FounderEvidencePage.test.tsx`

**Interfaces:**
- Consumes: `founder: Founder`, `evidence: FounderEvidenceData`, `onClose: () => void`
- Produces: `FounderEvidenceDrawer` modal component

- [ ] **Step 1: Write failing component tests**

Assert the component has `role="dialog"`, accessible name `Top web results`, a close button, founder identity, and retained result/empty-state content. Assert Escape invokes `onClose`.

- [ ] **Step 2: Run the component test and verify failure**

Run: `npm test -- --run src/v2/evidence/FounderEvidencePage.test.tsx`

Expected: FAIL because the current component renders a full app shell rather than a modal dialog.

- [ ] **Step 3: Implement the drawer**

Remove the nested V2 header/footer and full-page authoritative-data rail. Render a scrim plus `<aside role="dialog" aria-modal="true">`, move focus to the close button, trap Tab within the drawer, invoke `onClose` for Escape/scrim/close, and preserve all evidence status/list markup.

- [ ] **Step 4: Add responsive panel styles**

Use a fixed panel attached to the right viewport edge. Set `height: 100dvh`, `max-height: 100dvh`, and `width: min(540px, 100vw)`. Remove the inset margins and floating-card border, retaining only a left border. Keep the result list independently scrollable, use a full-width sheet below 640px, and reduce header/title/status padding below 700px viewport height.

- [ ] **Step 5: Run the component test**

Run: `npm test -- --run src/v2/evidence/FounderEvidencePage.test.tsx`

Expected: PASS.

### Task 2: Compose Search and the drawer at the evidence route

**Files:**
- Modify: `src/v2/V2App.tsx`
- Modify: `src/v2/V2App.test.tsx`

**Interfaces:**
- Consumes: `FounderEvidenceDrawer`
- Produces: evidence route composition of `SearchPage` plus drawer

- [ ] **Step 1: Write a failing route test**

Render the evidence deep link and assert both the Search heading and `Top web results` dialog are present. Assert the dialog close control targets `/v2/search` through the injected navigation callback.

- [ ] **Step 2: Run the route test and verify failure**

Run: `npm test -- --run src/v2/V2App.test.tsx`

Expected: FAIL because the route currently returns only the full evidence page.

- [ ] **Step 3: Implement route composition**

Render `SearchPage` for the evidence route, then render `FounderEvidenceDrawer` with the matched founder and loaded evidence. Add a small `navigate` prop to `V2App` defaulting to `window.location.assign`, pass it to Search, and call `navigate('/v2/search')` on drawer close.

- [ ] **Step 4: Run the route test**

Run: `npm test -- --run src/v2/V2App.test.tsx`

Expected: PASS.

### Task 3: Validate, publish, and deploy

**Files:**
- Modify: `docs/superpowers/execution/v2-status.md`
- Modify: screenshot capture script and `docs/showcase/images/*` as required by the existing publication checklist

- [ ] **Step 1: Run focused and full validation**

Run:

```bash
npm test -- --run src/v2/evidence/FounderEvidencePage.test.tsx src/v2/V2App.test.tsx src/v2/search/SearchPage.test.tsx
npm run lint
npm run build
npm test -- --run
```

Expected: all commands pass.

- [ ] **Step 2: Capture and verify the final showcase screenshots**

Regenerate all referenced images after the drawer and Dinner changes. Verify every `docs/index.html` image path exists, desktop images are 1440x900, and the mobile image is 780x1688.

- [ ] **Step 3: Update status and commit**

Document the drawer, Dinner controls, navigation, screenshot refresh, and validation. Commit all final application and showcase changes with required Copilot trailers.

- [ ] **Step 4: Push and verify deployment**

Push `main`, monitor the Render deployment to `live`, then verify the production evidence link opens the right-side drawer and the close action returns to Search.

### Task 4: Refine the shipped drawer into a dynamic-height edge panel

**Files:**
- Modify: `src/v2/evidence/founder-evidence.css`
- Modify: `docs/showcase/images/14-web-evidence.png`

**Interfaces:**
- Consumes: existing `FounderEvidenceDrawer` markup and modal behavior
- Produces: edge-attached panel geometry that follows the dynamic viewport height

- [ ] **Step 1: Update the desktop panel geometry**

Replace the inset card geometry with:

```css
.v2-evidence-drawer {
  top: 0;
  right: 0;
  bottom: auto;
  width: min(540px, 100vw);
  height: 100dvh;
  max-height: 100dvh;
  border-width: 0 0 0 1px;
}
```

- [ ] **Step 2: Add short-height compaction**

Add:

```css
@media (max-height: 700px) {
  .v2-evidence-drawer-head { padding-block: 10px; }
  .v2-evidence-title { min-height: 68px; padding-block: 12px; }
  .v2-evidence-status { min-height: 56px; padding-block: 8px; }
}
```

- [ ] **Step 3: Preserve narrow-window behavior**

Keep the existing `@media (max-width: 640px)` rule, but remove redundant top, right, and bottom declarations because the base panel is already edge-attached and full-height.

- [ ] **Step 4: Build and visually verify three heights**

Run:

```bash
npm run build
```

Start the production server, then verify the panel at `1440x900`, `1024x640`, and `780x500`. Expected: the panel fills the dynamic viewport, the header/title/status remain visible, and only the result list scrolls.

- [ ] **Step 5: Refresh the evidence screenshot and commit**

Run:

```bash
SHOWCASE_BASE_URL=http://127.0.0.1:4325 node scripts/capture-showcase.mjs
```

Expected: `docs/showcase/images/14-web-evidence.png` shows a full-height panel flush to the right edge.
