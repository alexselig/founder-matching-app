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
