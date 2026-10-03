# Bauhausian Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a clean, reusable Bauhausian design-system source with neutral token names, evolve Founder Index's `DESIGN.md` from that source, and remove YC naming from application design tokens and CSS component identifiers.

**Architecture:** `~/repos/alex-tools-design-md/Bauhausian/` becomes the canonical reusable source and generated CSS location. Founder Index keeps an application-specific `DESIGN.md` that applies those foundations to its shipped responsive and interaction patterns. The application renames only design-system identifiers (`--yc-orange`, `.yc-link-button`); product account copy such as “YC Admin” remains unchanged because it describes a user role, not a design token.

**Tech Stack:** Markdown with YAML frontmatter, Python 3 token generator, CSS custom properties, React/TypeScript, Vitest.

## Global Constraints

- The canonical design system must contain no `YC`, `Y Combinator`, `yc-`, or `--yc` naming.
- The new folder is `/Users/alexselig/repos/alex-tools-design-md/Bauhausian/`.
- The canonical source is `Bauhausian/Bauhausian-Design.md`.
- Generated tokens are `Bauhausian/bauhausian-tokens.css`.
- Founder Index remains visually unchanged; this work renames identifiers and documents shipped behavior.
- Product role copy such as “YC Admin” is out of scope.
- Application and GitHub overview remain separate visual systems.
- Run `python3 build-tokens.py` after changing design-token frontmatter.
- Do not mix Bauhausian tokens with Alex Tools, Idea Repository, or Crew tokens.

---

### Task 1: Add the canonical Bauhausian design-system source

**Files:**
- Create: `/Users/alexselig/repos/alex-tools-design-md/Bauhausian/Bauhausian-Design.md`
- Modify: `/Users/alexselig/repos/alex-tools-design-md/build-tokens.py`
- Modify: `/Users/alexselig/repos/alex-tools-design-md/README.md`
- Generate: `/Users/alexselig/repos/alex-tools-design-md/Bauhausian/bauhausian-tokens.css`

**Interfaces:**
- Consumes: `build-tokens.py` YAML frontmatter groups `colors`, `rounded`, `spacing`, `shadows`, `motion`, and `sizing`.
- Produces: neutral CSS custom properties including `--bauhaus-orange`, `--bauhaus-blue`, `--bauhaus-yellow`, `--surface`, `--surface-alt`, `--line`, `--line-strong`, `--ink`, and `--ink-muted`.

- [ ] **Step 1: Create the Bauhausian source document**

Create `Bauhausian/Bauhausian-Design.md` with this frontmatter and document outline:

```markdown
---
version: 1.0
name: Bauhausian
description: >-
  A functional Bauhausian interface system for dense, inspectable workflows:
  flat grid cells, hard rules, square controls, geometric type, one dominant
  color field, explicit system state, and task-focused responsive layouts.

colors:
  surface: "#ffffff"
  surface-alt: "#f5f3ee"
  surface-hover: "#fbfaf7"
  line: "#e3e5e9"
  line-strong: "#7d828b"
  ink: "#141414"
  ink-muted: "#5b5f66"
  bauhaus-orange: "#f26522"
  on-orange: "#141414"
  orange-soft: "#fff3ed"
  orange-text: "#b4410b"
  bauhaus-blue: "#2f5bea"
  on-blue: "#ffffff"
  blue-soft: "#edf1ff"
  blue-line: "#cfd8fb"
  bauhaus-yellow: "#f2b33d"
  on-yellow: "#141414"
  success: "#17634d"
  success-soft: "#eaf5f0"
  warning: "#9a4b18"
  warning-soft: "#fff0e5"
  destructive: "#b42318"
  destructive-soft: "#fff0ee"

rounded:
  none: 0
  pill: 999px
  circle: 50%

spacing:
  1: 4px
  2: 8px
  3: 16px
  4: 24px
  5: 32px
  6: 48px
  7: 96px
  8: 144px

shadows:
  none: none
  active-inset: inset 0 -4px var(--bauhaus-blue)
  illustrative-offset: 7px 7px 0 var(--ink)

motion:
  fast: 160ms
  standard: 320ms

sizing:
  touch: 44px
  evidence-sheet: 540px
  footer: 65px
---

# Bauhausian Design System

## Authority

This system governs application interfaces built with the Bauhausian language.
It is a sibling of the other systems in this repository, not a variant. Never
mix its tokens with Alex Tools, Idea Repository, or Crew.

## Principles

- Every region has one job and occupies a deliberate grid cell.
- Use type, rules, and filled areas for hierarchy instead of floating cards.
- Spend one dominant color field per view.
- Dense interfaces remain readable and task-focused.
- Show the current mode, data state, and system state.
- Make automated decisions inspectable and reversible.
- Use plain labels and short sentences.

## Color

Blue means active, selected, focused, or primary action. Orange means framing,
change, warning, or a singular loud action. Yellow is a small tertiary accent.
Success and destructive colors are reserved for state. Use `{colors.blue-soft}`
and `{colors.orange-soft}` for quiet explanatory fields.

## Typography

Display uses League Spartan, Futura, or Avenir Next. Body uses Figtree or Avenir
Next. Uppercase display type is for short headings and chrome; explanatory copy
uses sentence case. Body copy should remain under 68 characters per line.

## Grid, spacing, and shape

Use the `{spacing.1}` through `{spacing.8}` scale. Desktop compositions use
edge-to-edge grid cells and 1px rules. Controls and containers use
`{rounded.none}`. Only status pills use `{rounded.pill}` and semantic circular
objects use `{rounded.circle}`.

## Responsive behavior

Validate at 390, 768, 1024, and 1440 pixels. Mobile presents one primary task at
a time, tablet uses one or two readable columns, and desktop preserves the dense
workbench. Never allow page-level horizontal scrolling. Visible mobile controls
use at least `{sizing.touch}` in one interactive dimension.

## Interaction patterns

- Zero-query states must be useful before typing.
- Natural-language interpretation remains visible and editable.
- Preserve continuity when moving a cohort into a downstream workflow.
- Use centered dialogs for bounded confirmation and edge-attached sheets for
  long review workflows.
- Full-height sheets use dynamic viewport units and adapt to short screens.
- Recovery states preserve completed work and place the remedy beside the
  blocker.

## States and trust

Design loading, empty, no-results, validation, provider failure, stale evidence,
read-only, optional automation, and destructive states explicitly. Core product
workflows must remain functional when optional automation is unavailable.

## Motion and focus

Use `{motion.fast}` for local state changes and `{motion.standard}` for sheets
or larger transitions. Focus uses a 2px blue outline with a 2px offset. Respect
reduced motion.

## Exceptions

- `{shadows.illustrative-offset}` is allowed only for one illustration-like
  primary CTA in an otherwise empty composition.
- `{shadows.active-inset}` is a state indicator, not elevation.
- Scrims may use transparency; gradients remain prohibited.
- New exceptions require a purpose, a bounded scope, and a shipped example.

## Validation

Check reference widths, overflow, focus order, required actions, touch targets,
safe areas, reduced motion, affected empty/error states, automated tests, and
canonical screenshots before shipping a substantial UI change.
```

- [ ] **Step 2: Add a Bauhausian footer and build specification**

In `build-tokens.py`, add:

```python
BAUHAUSIAN_FOOTER = """
body {
  margin: 0;
  background: var(--surface);
  color: var(--ink);
  font-family: var(--font-sans);
  font-size: 16px;
  line-height: 1.625;
  -webkit-font-smoothing: antialiased;
}

button, input, select, textarea {
  border-radius: var(--radius-none);
  font-family: inherit;
}

.pill { border-radius: var(--radius-pill); }
.avatar, .semantic-circle { border-radius: var(--radius-circle); }

:focus-visible {
  outline: 2px solid var(--bauhaus-blue);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition: none !important; animation: none !important; }
}
"""
```

Append this entry to `DOCS`:

```python
{
    "source": "Bauhausian/Bauhausian-Design.md",
    "target": "Bauhausian/bauhausian-tokens.css",
    "title": "Bauhausian design tokens",
    "blurb": "Flat functional grids, geometric type, square controls, blue action, orange framing.",
    "comments": {
        "rounded": "Radius — square controls; pill state; semantic circles",
        "spacing": "Spacing — 4px base",
        "shadows": "Shadows — inset state plus one bounded illustrative exception",
        "motion": "Motion — local and structural durations",
        "sizing": "Sizing — interaction and persistent shell dimensions",
    },
    "order": ["colors", "rounded", "spacing", "shadows", "motion", "sizing"],
    "variants": [],
    "fonts": """
  /* Type */
  --font-display: "League Spartan", Futura, "Avenir Next", system-ui, sans-serif;
  --font-sans: Figtree, "Avenir Next", system-ui, sans-serif;""",
    "footer": BAUHAUSIAN_FOOTER,
},
```

Before writing each target, create its parent:

```python
target = ROOT / spec["target"]
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(build(spec, data))
```

Replace the existing direct `(ROOT / spec["target"]).write_text(...)` call.

- [ ] **Step 3: Add Bauhausian to the repository index**

Add this row to the README system table:

```markdown
| **Bauhausian** — functional geometric application UI | [`Bauhausian/Bauhausian-Design.md`](./Bauhausian/Bauhausian-Design.md) | [`Bauhausian/bauhausian-tokens.css`](./Bauhausian/bauhausian-tokens.css) |
```

Add a short `## Bauhausian` section stating:

```markdown
## Bauhausian

Flat functional grids, League Spartan display type, Figtree body copy, square
controls, blue active states, orange framing, explicit system state, and
task-focused responsive behavior. It is built for dense workflows that must
remain inspectable from search through decision and recovery.
```

- [ ] **Step 4: Generate and validate tokens**

Run:

```bash
cd /Users/alexselig/repos/alex-tools-design-md
python3 build-tokens.py
```

Expected output includes:

```text
Bauhausian/Bauhausian-Design.md: 12 refs resolved -> Bauhausian/bauhausian-tokens.css
```

Run:

```bash
! rg -n 'YC|Y Combinator|yc-|--yc' Bauhausian README.md build-tokens.py
test -s Bauhausian/bauhausian-tokens.css
git diff --check
```

Expected: all commands exit zero.

- [ ] **Step 5: Commit the canonical system**

```bash
cd /Users/alexselig/repos/alex-tools-design-md
git add Bauhausian/Bauhausian-Design.md Bauhausian/bauhausian-tokens.css README.md build-tokens.py
git commit -m "Add Bauhausian design system"
```

---

### Task 2: Replace Founder Index's local design guide

**Files:**
- Modify: `/Users/alexselig/founder-matching-app/DESIGN.md`
- Reference: `/Users/alexselig/founder-matching-app/docs/superpowers/specs/2026-10-02-design-md-evolution-design.md`
- Reference: `/Users/alexselig/repos/alex-tools-design-md/Bauhausian/Bauhausian-Design.md`

**Interfaces:**
- Consumes: canonical Bauhausian foundations and the approved Founder Index design-guide evolution spec.
- Produces: an application-specific guide with no design-system YC attribution or legacy token names.

- [ ] **Step 1: Write the evolved application guide**

Replace `DESIGN.md` with:

```markdown
# Founder Index Bauhausian Design Guide

Canonical foundations:
`~/repos/alex-tools-design-md/Bauhausian/Bauhausian-Design.md`

This guide governs the Founder Index application. The GitHub product overview
uses a separate editorial system; never mix its tokens or typography into the
application.

## Product principles

- Every region has one job and occupies a deliberate grid cell.
- Build hierarchy with display type, 1px rules, and filled areas instead of
  floating cards.
- Spend one dominant color field per view.
- Dense interfaces remain readable and task-focused.
- Show the current account mode, data state, and system state.
- Preserve continuity from discovery to search to seating to analysis.
- Make automated decisions inspectable and reversible.
- Use plain labels, visible spaces, short sentences, and no hype.

## Foundations

### Color

| Token | Light | Dark | Use |
|---|---|---|---|
| `surface` | `#ffffff` | `#111214` | Page and grid cells |
| `surface-alt` | `#f5f3ee` | `#1a1b1e` | Quiet cells and secondary fields |
| `line` | `#e3e5e9` | `#2a2c31` | Grid hairlines |
| `line-strong` | `#7d828b` | `#6e737c` | Control borders |
| `ink` | `#141414` | `#f4f2ee` | Primary text and icons |
| `ink-muted` | `#5b5f66` | `#a3a7ae` | Metadata and captions |
| `bauhaus-orange` | `#f26522` | `#f26522` | Framing, change, warnings, singular loud action |
| `orange-soft` | `#fff3ed` | `#3a2117` | Quiet warning and recovery field |
| `bauhaus-blue` | `#2f5bea` | `#6b8cff` | Active state, focus, primary action |
| `blue-soft` | `#edf1ff` | `#1b2340` | Quiet selection and explanation |
| `bauhaus-yellow` | `#f2b33d` | `#f2b33d` | Small tertiary accent |
| `success` | `#17634d` | `#67c8a5` | Verified or complete state |
| `destructive` | `#b42318` | `#ff7b70` | Destructive action and irreversible warning |

Blue means active, selected, focused, or primary action. Orange means framing,
change, warning, or one loud action. Orange is normally a fill rather than
small text on white. Yellow occupies at most one quarter of the dominant color
area and never touches an orange block directly.

### Type

- Display: `"League Spartan", "Futura", "Avenir Next", system-ui, sans-serif`
- Body: `"Figtree", "Avenir Next", system-ui, sans-serif`
- Display XL: 96px / 0.9 / 800, uppercase
- Display L: 64px / 0.95 / 800, uppercase
- Heading 1: 40px / 1.05 / 800
- Heading 2: 28px / 1.15 / 700
- Eyebrow: 13px / 16px / 700 / `0.12em`, uppercase
- Body large: 19px / 30px / 400
- Body: 16px / 26px / 400
- Body small: 14px / 20px / 400

Uppercase display type is for short headings and chrome. Explanatory copy uses
sentence case. Keep body copy under 68 characters per line.

### Grid, spacing, and shape

Spacing scale: `4, 8, 16, 24, 32, 48, 96, 144px`.

Desktop compositions run edge to edge with 1px hairlines. Controls and
containers use zero radius. Status pills may use full rounding. Avatars, table
diagrams, and other semantic circular objects may be circular. Do not infer
general radius permission from those objects.

Controls use a 1px strong border. Active states use a 3px or 4px blue or orange
inset bar. Focus uses a 2px blue outline with a 2px offset.

## Responsive system

Reference widths:

| Class | Reference | Expected behavior |
|---|---:|---|
| Mobile | 390px | One primary column, 44px controls, no page overflow |
| Tablet | 768px | One or two columns where content remains readable |
| Compact desktop | 1024px | Dense layouts may simplify without losing controls |
| Desktop | 1440px | Preserve the approved workbench |

- Keep one responsive component tree.
- Mobile presents one primary task at a time.
- Tablet uses one or two readable columns.
- Desktop preserves the dense workbench.
- Never allow page-level horizontal scrolling.
- Local tab strips and table indexes may scroll when their boundary is clear.
- Visible mobile controls are at least 44px in one interactive dimension.
- Full-height sheets use `100dvh` and adapt to short screens.
- Fixed footer actions respect safe-area insets.
- Do not hide a required control solely to make a layout fit.

## Shared application shell

- Founder mode prioritizes discovery and export.
- Admin mode adds saved plans, dinner matching, analysis, and plan management.
- The account switcher makes the current mode and available capabilities clear.
- At phone widths, the header uses a brand/account row plus a second navigation
  row.
- The footer remains persistent, capability-aware, and preserves the primary
  action.
- Demo mode and AI availability are visible system states, not hidden settings.

## Canonical interaction patterns

### Zero-query discovery

The first screen is useful before typing. Group recommendations by useful
adjacency, complementary backgrounds, and shared context. Show a visible reason
for every recommendation.

### Structured search

Natural language becomes visible, editable dimensions. Keep the result count,
grouping, sorting, view control, and active dimensions obvious. On mobile,
search composition becomes full width and toolbars wrap rather than overflow.

### Search-to-seating handoff

Preserve the exact ordered cohort when moving into dinner setup. Make the next
step visually explicit and do not require the organizer to rebuild the cohort.

### Task setup

Present setup as a vertical sequence of named decisions: plan identity, cohort,
capacity, criteria, weights, and hard rules. Keep the generation action
reachable at every supported width.

### Tables and Analysis

Tables and Analysis form one navigation row. Active tabs retain intentional
horizontal padding. Label the threshold control “Match threshold.” Label its
legend “Match Threshold Color Coding.” On mobile, focus one table at a time and
use a bounded scrollable table index. Analysis cards stack on mobile and use two
columns on tablet.

### Evidence

Evidence review is a right-attached, full-height sheet on desktop and tablet.
Below 640px it becomes a full-viewport sheet. Header, status, and result list
remain usable at short heights, and the result list scrolls independently.

### Dialogs and sheets

Use centered dialogs for bounded confirmation. Use edge-attached sheets for
long review workflows. Mobile actions become full-width rows when horizontal
buttons would compress labels or touch targets.

### Recovery

Preserve completed work, identify the blocker, put the remedy beside the
problem, and explain what the next action will change.

### Alternatives and export

Comparison layouts become a linear decision flow on mobile. Export sheets stack
summary, options, privacy guidance, and actions in reading order.

## States and trust

Design these states explicitly:

- Loading.
- Zero query.
- Empty.
- No results.
- Validation failure.
- Provider failure.
- Stale or unsupported evidence.
- Read-only Demo mode.
- AI enabled, disabled, or unavailable.
- Destructive confirmation.

AI is optional. Deterministic search, matching, analysis, and export continue to
work without an AI provider.

## Content rules

- Use full words and visible spaces. Never rely on hidden line breaks to create
  labels.
- Labels name the thing being controlled, not the implementation.
- Use “Match threshold” and “Match Threshold Color Coding.”
- Distinguish Founder account, Organizer account, Founder mode, and Admin mode
  consistently.
- Use “Demo data” or “Demo mode” when records are fictitious.
- Use sentence case for explanation and uppercase display type only for short
  headings, labels, and navigation.
- Use specific action labels. Add direction when the destination matters.

## Approved exceptions

- The saved-plans empty-state CTA may use one hard offset shadow as an
  illustration-like gesture. It is the only floating-shadow exception.
- Inset active bars are state indicators, not elevation.
- Circular table diagrams and avatars are semantic shapes, not general radius
  permission.
- Status pills may use full rounding; controls and containers may not.
- Scrims may use transparency for modal separation; gradients are prohibited.
- The GitHub product overview's editorial typography is outside this system.

Any new exception requires a purpose, a bounded scope, and a canonical shipped
example.

## Validation checklist

For every substantial UI change:

- Check 390, 768, 1024, and 1440 pixels.
- Assert no page-level horizontal overflow.
- Verify keyboard focus order and visible focus rings.
- Verify primary actions and required controls remain reachable.
- Check mobile touch targets and safe-area behavior.
- Check reduced-motion behavior.
- Exercise affected loading, empty, error, and recovery states.
- Run relevant unit tests, lint, production build, and Playwright checks.
- Update canonical screenshots when a documented pattern changes.
```

- [ ] **Step 2: Verify the guide has no legacy design-system naming**

Run:

```bash
cd /Users/alexselig/founder-matching-app
! rg -n 'YC Design System|Y Combinator|yc-orange|--yc' DESIGN.md
rg -n '^## (Product principles|Foundations|Responsive system|Shared application shell|Canonical interaction patterns|States and trust|Content rules|Approved exceptions|Validation checklist)$' DESIGN.md
git diff --check
```

Expected: the first command finds nothing, every required section is listed, and the diff check passes.

- [ ] **Step 3: Commit the evolved application guide**

```bash
git add DESIGN.md
git commit -m "docs: evolve Founder Index Bauhausian guide" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>" \
  -m "Copilot-Session: 48816420-e146-4179-a56c-0c59fcc154ad"
```

---

### Task 3: Rename legacy design identifiers in Founder Index

**Files:**
- Create: `/Users/alexselig/founder-matching-app/src/designSystem.test.ts`
- Modify: `/Users/alexselig/founder-matching-app/src/index.css`
- Modify: `/Users/alexselig/founder-matching-app/src/v2/search/v2-chrome.css`
- Modify: `/Users/alexselig/founder-matching-app/src/App.tsx`

**Interfaces:**
- Consumes: neutral canonical token `--bauhaus-orange`.
- Produces: no `--yc-orange` custom property and no `.yc-link-button` class in application source.

- [ ] **Step 1: Write the failing naming contract**

Create `src/designSystem.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('Bauhausian design-system naming', () => {
  it('uses neutral design token and component identifiers', () => {
    const design = read('DESIGN.md')
    const indexCss = read('src/index.css')
    const chromeCss = read('src/v2/search/v2-chrome.css')
    const app = read('src/App.tsx')
    const source = [design, indexCss, chromeCss, app].join('\n')

    expect(source).not.toMatch(/YC Design System|Y Combinator|--yc-|\\.yc-link-button|yc-link-button/)
    expect(indexCss).toContain('--bauhaus-orange: #f26522;')
    expect(chromeCss).toContain('var(--bauhaus-orange, #f26522)')
    expect(app).toContain('className=\"bauhaus-link-button\"')
  })
})
```

- [ ] **Step 2: Run the contract to verify it fails**

Run:

```bash
npm test -- --run src/designSystem.test.ts
```

Expected: FAIL because `--yc-orange` and `yc-link-button` still exist.

- [ ] **Step 3: Rename the identifiers**

In `src/index.css`:

```css
--bauhaus-orange: #f26522;
```

Replace every `var(--yc-orange)` with `var(--bauhaus-orange)`.

Rename:

```css
.bauhaus-link-button { ... }
.bauhaus-link-button:hover { ... }
```

In `src/App.tsx`, replace:

```tsx
className="yc-link-button"
```

with:

```tsx
className="bauhaus-link-button"
```

In `src/v2/search/v2-chrome.css`, replace:

```css
--v2-orange: var(--yc-orange, #f26522);
```

with:

```css
--v2-orange: var(--bauhaus-orange, #f26522);
```

- [ ] **Step 4: Run the focused contract**

Run:

```bash
npm test -- --run src/designSystem.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run affected application validation**

Run:

```bash
npm test -- --run src/designSystem.test.ts src/domain.test.ts src/v2/search/SearchPage.test.tsx
npm run lint
npm run build
git diff --check
```

Expected: tests, lint, build, and diff check pass.

- [ ] **Step 6: Commit the identifier rename**

```bash
git add src/designSystem.test.ts src/index.css src/v2/search/v2-chrome.css src/App.tsx
git commit -m "refactor: rename Bauhausian design identifiers" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>" \
  -m "Copilot-Session: 48816420-e146-4179-a56c-0c59fcc154ad"
```

---

### Task 4: Cross-repository final verification

**Files:**
- Verify: `/Users/alexselig/repos/alex-tools-design-md/Bauhausian/Bauhausian-Design.md`
- Verify: `/Users/alexselig/repos/alex-tools-design-md/Bauhausian/bauhausian-tokens.css`
- Verify: `/Users/alexselig/founder-matching-app/DESIGN.md`
- Verify: `/Users/alexselig/founder-matching-app/src/index.css`

**Interfaces:**
- Consumes: all outputs from Tasks 1–3.
- Produces: a verified reusable system and a verified application migration.

- [ ] **Step 1: Verify the canonical design repository**

Run:

```bash
cd /Users/alexselig/repos/alex-tools-design-md
python3 build-tokens.py
! rg -n 'YC|Y Combinator|yc-|--yc' Bauhausian
git diff --check
git status --short
```

Expected: token generation succeeds, the naming scan is empty, diff check passes, and the worktree is clean after its commit.

- [ ] **Step 2: Verify Founder Index**

Run:

```bash
cd /Users/alexselig/founder-matching-app
! rg -n 'YC Design System|Y Combinator|--yc-|\\.yc-link-button|yc-link-button' DESIGN.md src/index.css src/v2/search/v2-chrome.css src/App.tsx
npm test -- --run src/designSystem.test.ts
npm run lint
npm run build
git diff --check
git status --short
```

Expected: naming scan is empty, tests/lint/build pass, diff check passes, and only intentional unpushed commits remain.

- [ ] **Step 3: Review the generated token diff**

Confirm `Bauhausian/bauhausian-tokens.css` contains:

```css
--bauhaus-orange: #f26522;
--bauhaus-blue: #2f5bea;
--bauhaus-yellow: #f2b33d;
--radius-none: 0;
--size-touch: 44px;
```

Confirm it contains no legacy design-system naming.

- [ ] **Step 4: Push both repositories**

Use each repository's bound credential helper without switching GitHub accounts:

```bash
cd /Users/alexselig/repos/alex-tools-design-md
git push origin main

cd /Users/alexselig/founder-matching-app
git push origin main
```

Expected: both `main` branches push successfully.
