# DESIGN.md Evolution Design

## Goal

Evolve `DESIGN.md` from a short visual token sheet into the authoritative
application UI guide for Founder Index V2.

The guide must describe the product that shipped after iterative user feedback,
not only the original visual reference. It should let a future contributor
make a new screen or refine an existing one without rediscovering the product's
layout, interaction, responsive, content, and validation conventions.

## Scope

`DESIGN.md` governs the Founder Index application.

It does not govern the GitHub Pages product overview. That overview uses a
separate editorial system with Instrument Serif and Instrument Sans. The two
systems may present the same product, but their tokens and visual conventions
must not be mixed.

The evolved guide covers:

- Product principles and visual foundations.
- Color, typography, spacing, shape, and motion tokens.
- Responsive behavior and supported reference widths.
- Shared shell, navigation, footer, and account-mode patterns.
- Search, discovery, seating setup, tables, analysis, evidence, export, and
  settings patterns.
- State communication for Demo mode, AI availability, loading, failure,
  recovery, and destructive actions.
- Accessibility and interaction requirements.
- Content and labeling rules established through user feedback.
- Approved exceptions and the process for introducing a new exception.
- Visual and automated validation requirements.

It does not duplicate feature architecture, data models, optimizer behavior, or
route-level implementation plans.

## Chosen Approach

Use one layered living guide:

1. **Foundations** define the stable visual language.
2. **System rules** define responsive, interaction, accessibility, and content
   behavior that applies across routes.
3. **Canonical patterns** describe the product's recurring UI compositions.
4. **Exceptions** record intentional deviations from the foundations.
5. **Validation** defines how a change proves it still belongs in the system.

This is preferable to:

1. **Visual-only expansion.** It would preserve a compact file, but omit most of
   the feedback that shaped the current product.
2. **A catalog of every component.** It would be exhaustive but brittle,
   duplicate the codebase, and become stale quickly.

The guide describes invariants and canonical patterns. Source files remain the
authority for exact implementation details.

## Proposed Document Structure

### 1. Authority and surface boundary

State that Founder Index uses its Bauhausian application language exclusively.
Name the GitHub overview as a separate editorial system and prohibit token
mixing.

### 2. Product design principles

Retain and expand the current principles:

- Every region has a job and occupies a deliberate grid cell.
- Use strong hierarchy through type, rules, and filled areas rather than cards
  floating in space.
- Keep one dominant color field per view.
- Dense interfaces must remain readable and task-focused.
- Show the user's current mode, data state, and system state.
- Preserve continuity from discovery to search to seating to analysis.
- Make automated decisions inspectable and reversible.
- Prefer plain labels over clever or compressed wording.

### 3. Foundations

Keep the existing token tables, while adding the shipped semantic extensions:

- Blue soft backgrounds and group lines.
- Orange soft warning and recovery backgrounds.
- Success, warning, and destructive state colors.
- Explicit white-on-blue contrast.
- Display and body type usage limits.
- The spacing scale plus minimum touch-target requirements.
- Zero-radius controls, circular avatars, pill-only statuses.
- Hairline grids as the primary separation mechanism.

The guide should clarify that an inset active bar is a state indicator, not a
decorative shadow.

### 4. Responsive system

Promote the approved responsive specification into the main guide:

- Reference widths: 390, 768, 1024, and 1440 pixels.
- One responsive component tree.
- Mobile presents one primary task at a time.
- Tablet uses one or two columns where content remains readable.
- Desktop preserves the dense workbench.
- No page-level horizontal scrolling.
- Local tab strips or table indexes may scroll when their boundary is clear.
- Visible mobile controls are at least 44 pixels in one interactive dimension.
- Full-height panels use dynamic viewport units and adapt to short screens.
- Safe-area insets are respected by fixed footer actions.

### 5. Shared application shell

Document:

- Founder and Admin as explicit modes with a visible account switcher.
- Founder mode prioritizes discovery and export.
- Admin mode adds saved plans, dinner matching, analysis, and plan management.
- Header navigation reorganizes into two rows on phone widths.
- The footer is persistent, capability-aware, and preserves the primary action.
- Demo mode and AI status are visible system states, not hidden settings.

### 6. Canonical interaction patterns

Describe recurring patterns rather than individual React components:

- **Zero-query discovery:** useful before typing, grouped recommendations, and a
  visible reason for every recommendation.
- **Structured search:** natural language becomes visible, editable dimensions;
  result count and grouping remain obvious.
- **Search-to-seating handoff:** preserve the exact ordered cohort and make the
  next step visually explicit.
- **Task setup:** a vertical sequence of named decisions with the generation
  action reachable at all viewport sizes.
- **Tables and Analysis:** one navigation row, adequately padded active states,
  threshold labeling as “Match threshold,” and the legend heading “Match
  Threshold Color Coding.”
- **Evidence:** a right-attached, full-height sheet on desktop and tablet; a
  full-viewport sheet on narrow screens; independently scrollable results.
- **Dialogs versus sheets:** use centered dialogs for bounded confirmations and
  edge-attached sheets for long review workflows.
- **Recovery:** preserve completed work, put the blocker beside its remedy, and
  explain what happens next.
- **Export and alternatives:** present choices as a linear decision flow on
  mobile.

### 7. States and trust

Require visible handling for:

- Loading.
- Empty and zero-query states.
- No results.
- Validation failure.
- Provider failure.
- Stale or unsupported evidence.
- Read-only public Demo mode.
- AI enabled, disabled, or unavailable.
- Destructive confirmation.

AI must remain optional. Deterministic search, matching, analysis, and export
must still work without an AI provider.

### 8. Content rules

Capture feedback-driven language rules:

- Use full words and visible spaces; never rely on hidden line breaks to create
  labels.
- Labels name the thing being controlled, not the implementation.
- Use “Match threshold” and “Match Threshold Color Coding.”
- Distinguish Founder account, Organizer account, Founder mode, and Admin mode
  consistently.
- Use “Demo data” or “Demo mode” when data is fictitious.
- Sentence case for explanatory copy; uppercase display type only for short
  navigation, labels, and headings.
- Keep action labels specific and directional where the destination matters.

### 9. Approved exceptions

Record exceptions so contributors do not generalize them:

- The saved-plans empty-state CTA may use one hard offset shadow as an
  illustration-like Bauhaus gesture. It is the only floating-shadow exception.
- Circular table diagrams and avatars are semantic shapes, not general radius
  permission.
- Status pills may use full rounding; controls and containers may not.
- Scrims may use transparency for modal separation; gradients remain prohibited.
- The GitHub overview's editorial typography is outside the application system.

Any new exception must be documented with its purpose, allowed scope, and a
canonical shipped example.

### 10. Validation checklist

Every substantial UI change should verify:

- The changed route at 390, 768, 1024, and 1440 pixels.
- No page-level horizontal overflow.
- Keyboard focus order and visible focus rings.
- Primary actions and required controls remain reachable.
- Mobile touch targets and safe-area behavior.
- Reduced-motion behavior.
- Loading, empty, error, and recovery states affected by the change.
- Relevant unit, lint, build, and Playwright checks.
- Updated canonical screenshots when a documented pattern changes.

## Editing Strategy

Replace the current short `DESIGN.md` rather than appending an unrelated second
guide. Preserve its useful token values and source attribution, then reorganize
the content under the proposed layered structure.

Keep the document concise enough to read before UI work. Link to detailed specs
for responsive behavior and feature architecture instead of copying every
route-specific rule.

## Success Criteria

The evolution is complete when:

1. A contributor can identify which system governs the application.
2. The guide explains the latest shipped visual and responsive behavior.
3. The user feedback that changed labels, padding, panels, modes, Demo state,
   AI state, and responsive behavior is represented as reusable rules.
4. Intentional exceptions no longer contradict undocumented absolutes.
5. The guide provides a concrete pre-ship validation checklist.
6. No implementation-specific component inventory is required to keep it useful.
