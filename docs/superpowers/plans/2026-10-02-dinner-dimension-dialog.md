# Dinner Dimension Dialog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an explicit dimension-and-weight dialog to Dinner setup and generated seating-plan review.

**Architecture:** `dinnerState.ts` owns the catalog and pure add operation. `DinnerDimensionDialog.tsx` owns selection UI. Setup and results reuse it.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, CSS.

## Global Constraints

- Never add a dimension on trigger click alone.
- Only unused dimensions are selectable.
- L/M/H weight is required and applied on confirmation.
- Both setup and results use the same dialog.

---

### Task 1: Explicit dimension state API

**Files:**
- Modify: `src/v2/dinner/dinnerState.ts`
- Modify: `src/v2/dinner/dinnerState.test.ts`

- [ ] Add failing tests for available dimensions and explicit field/weight addition.
- [ ] Replace implicit next-dimension addition with explicit arguments.
- [ ] Run state tests.

### Task 2: Shared dialog and setup integration

**Files:**
- Create: `src/v2/dinner/DinnerDimensionDialog.tsx`
- Modify: `src/v2/dinner/DinnerSetup.tsx`
- Modify: `src/v2/dinner/DinnerPage.test.tsx`
- Modify: `src/v2/dinner/dinner.css`

- [ ] Add failing setup tests proving the trigger opens a dialog without mutation.
- [ ] Implement field selection, L/M/H selection, confirm, and cancel.
- [ ] Integrate with setup and run focused tests.

### Task 3: Results review integration

**Files:**
- Modify: `src/v2/dinner/DinnerTables.tsx`
- Modify: `src/v2/dinner/DinnerPage.test.tsx`

- [ ] Add a failing generated-results test for restoring a removed dimension with a chosen weight.
- [ ] Add the trigger and shared dialog to the results rail.
- [ ] Run Dinner tests, lint, build, and browser QA before screenshots.
