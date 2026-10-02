# Dinner Results Toolbar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorder and restyle the Dinner results toolbar so workspace tabs lead the row, an editable Threshold stepper precedes Legend, and Density appears at the far right only in Tables.

**Architecture:** Keep all control state in `DinnerTables`. Change only toolbar composition and namespaced CSS; no dinner engine or persistence behavior changes.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, CSS.

## Global Constraints

- Desktop order is Tabs, Threshold stepper, Legend, Density.
- Threshold is editable and supports minus/plus buttons within 60–85.
- Density is absent in Analysis.
- Tables and Analysis are full-height tabs, not compact segmented buttons.
- Existing responsive hiding rules remain intact.

---

### Task 1: Toolbar behavior

**Files:**
- Modify: `src/v2/dinner/DinnerTables.tsx`
- Modify: `src/v2/dinner/DinnerPage.test.tsx`

- [ ] Add failing assertions for desktop control order, threshold typing/stepping, and Analysis Density removal.
- [ ] Run the focused DinnerPage tests and confirm the current toolbar fails.
- [ ] Recompose the toolbar and conditionally render Density only for Tables.
- [ ] Run focused DinnerPage tests and confirm they pass.

### Task 2: Tab styling and responsive verification

**Files:**
- Modify: `src/v2/dinner/dinner-results.css`
- Modify: `src/v2/dinner/dinnerResponsive.test.ts`

- [ ] Add failing CSS assertions for full-height workspace tabs and far-right Density.
- [ ] Implement namespaced toolbar/tab styles without changing existing phone/tablet hiding behavior.
- [ ] Run Dinner responsive and DinnerPage tests.
- [ ] Run lint and full build.
- [ ] Verify Tables and Analysis in a production browser before recapturing showcase screenshots.
