# Seating Plan Footer Action Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the orange New seating plan action from the Seating Plans hero to the footer's lower-right action slot.

**Architecture:** Reuse `V2Footer.actions` for the page-specific command and keep navigation owned by `SeatingPlansPage`. Remove the hero-only CTA markup and styles, then let the existing hero summary grid distribute the copy and three statistics across the available width.

**Tech Stack:** React 19, TypeScript, CSS, Vitest, Testing Library, Playwright

## Global Constraints

- The button label is `+ New seating plan`.
- The button navigates to `/v2/dinner`.
- The contextual empty-state CTA remains unchanged.
- The footer action stays rightmost and at least 44px tall at every supported width.
- No new dependencies.

---

### Task 1: Move New seating plan into the shared footer

**Files:**
- Modify: `src/v2/dinner/SeatingPlansPage.tsx:296-318,471`
- Modify: `src/v2/dinner/seating-plans.css:18-20,132-145,167-175`
- Modify: `src/v2/layout/v2-footer-actions.css:116-119,122-139`
- Test: `src/v2/dinner/SeatingPlansPage.test.tsx:142-161`
- Test: `src/v2/dinner/dinnerResponsive.test.ts`

**Interfaces:**
- Consumes: `V2Footer.actions?: ReactNode`
- Produces: `.v2-plans-footer-create`, a page-specific footer button that calls `navigate('/v2/dinner')`

- [ ] **Step 1: Update the behavior test to require a footer action and no hero action**

Replace the archive-state assertions in `SeatingPlansPage.test.tsx` with:

```tsx
cleanup()
const archive = renderPlans({ navigate })
expect(archive.container.querySelector('.v2-plans-hero .v2-plans-new-plan')).not.toBeInTheDocument()

const footerAction = within(archive.container.querySelector('footer')!).getByRole('button', {
  name: 'New seating plan',
})
expect(footerAction).toHaveClass('v2-plans-footer-create')
fireEvent.click(footerAction)
expect(navigate).toHaveBeenLastCalledWith('/v2/dinner')
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
npm test -- --run src/v2/dinner/SeatingPlansPage.test.tsx
```

Expected: FAIL because the archive action is still inside `.v2-plans-hero` and the footer has no `New seating plan` button.

- [ ] **Step 3: Move the action into `V2Footer.actions`**

Delete the `!zero` hero button block and render the footer as:

```tsx
<V2Footer
  role={role}
  aiStatus={aiStatus}
  aiTone={aiTone}
  actions={
    restricted ? undefined : (
      <button
        ref={createRef}
        type="button"
        className="v2-plans-footer-create"
        aria-label="New seating plan"
        onClick={() => navigate('/v2/dinner')}
      >
        <span aria-hidden="true">+</span>
        New seating plan
      </button>
    )
  }
/>
```

Keep the empty-state `Create your first seating plan` button in place. It may continue sharing `createRef`; only one of the two creation controls is used for focus recovery at a time.

- [ ] **Step 4: Remove the hero CTA column and styles**

Change the desktop summary grid in `seating-plans.css` to:

```css
.v2-plans-hero-summary,
.v2-plans-hero-summary.v2-plans-zero-state {
  grid-template-columns: minmax(380px, 1fr) 156px 156px 156px;
}
```

Delete `.v2-plans-new-plan`, `.v2-plans-new-plan-plus`, and their responsive overrides. At the 1320px and 1120px container breakpoints, remove the extra CTA column so the hero continues to contain only the copy plus three statistics.

- [ ] **Step 5: Style the footer action as the orange right-edge primary command**

Add to `v2-footer-actions.css`:

```css
.v2-footer-actions > .v2-plans-footer-create {
  min-width: 190px;
  gap: 9px;
  padding-inline: 18px;
  color: var(--ink);
  background: var(--v2-orange);
  font-size: 12px;
  text-transform: uppercase;
}

.v2-footer-actions > .v2-plans-footer-create > span {
  font-size: 22px;
  line-height: 1;
}

.v2-footer-actions > .v2-plans-footer-create:hover {
  color: white;
  background: var(--ink);
}

@media (max-width: 560px) {
  .v2-footer-actions > .v2-plans-footer-create {
    min-width: 156px;
    min-height: 44px;
    font-size: 10px;
  }
}
```

- [ ] **Step 6: Add responsive CSS contracts**

In `dinnerResponsive.test.ts`, assert that:

```ts
expect(plans).not.toContain('.v2-plans-new-plan')
expect(footer).toMatch(/\.v2-footer-actions > \.v2-plans-footer-create \{[^}]*background: var\(--v2-orange\)/)
expect(footer).toMatch(/@media \(max-width: 560px\)[\s\S]*\.v2-footer-actions > \.v2-plans-footer-create \{[^}]*min-height: 44px/)
```

Read `src/v2/layout/v2-footer-actions.css` into a `footer` constant beside the existing route CSS fixtures.

- [ ] **Step 7: Run focused tests**

Run:

```bash
npm test -- --run src/v2/dinner/SeatingPlansPage.test.tsx src/v2/dinner/dinnerResponsive.test.ts
```

Expected: all tests pass.

- [ ] **Step 8: Run code-quality and browser verification**

Run:

```bash
npm run lint
npm run build
npm run test:e2e
```

Expected: lint and build exit 0; Playwright reports 3 passed, including the phone/tablet viewport containment test.

- [ ] **Step 9: Commit**

```bash
git add src/v2/dinner/SeatingPlansPage.tsx \
  src/v2/dinner/seating-plans.css \
  src/v2/layout/v2-footer-actions.css \
  src/v2/dinner/SeatingPlansPage.test.tsx \
  src/v2/dinner/dinnerResponsive.test.ts
git commit -m "fix: move seating plan action to footer"
```
