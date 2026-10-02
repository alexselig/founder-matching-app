# Top Web Results Drawer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the founder evidence full page with a route-driven right-side drawer over Founder Search.

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

- [ ] **Step 4: Add responsive drawer styles**

Use a fixed right card under the app chrome on desktop and an edge-to-edge right sheet below 640px. Disable pointer interaction through the scrim and keep the result list independently scrollable.

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
