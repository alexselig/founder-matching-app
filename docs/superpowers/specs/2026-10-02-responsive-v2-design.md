# Founder Index V2 Responsive Design

## Goal

Make every Founder Index V2 route usable on phones, tablets, compact desktops,
and wide desktops without shrinking the desktop interface into an unreadable
canvas.

The responsive system must preserve every capability. Phones present one primary
task at a time. Tablets use two-column layouts where the content remains legible.
Desktop keeps the existing dense workbench.

## Supported viewports

The implementation and visual QA cover these reference widths:

| Class | Reference | Expected behavior |
|---|---:|---|
| Mobile | 390px | Single primary column, 44px controls, no page-level horizontal scroll |
| Tablet | 768px | One or two columns depending on content density |
| Compact desktop | 1024px | Dense layouts may simplify, but retain side-by-side review where readable |
| Desktop | 1440px | Preserve the current approved layout |

Intermediate widths must flow naturally rather than target device names.

## Chosen approach

Use a shared responsive shell plus page-specific container queries.

This is preferable to:

1. **Shrinking the desktop UI.** Faster, but produces tiny type, undersized
   controls, and horizontal scrolling.
2. **Separate mobile components.** Maximum control, but duplicates state,
   interactions, accessibility behavior, and tests.

The chosen approach keeps one DOM and behavior model while allowing each
workspace to reorganize around its own content width.

## Shared shell

### Header

- Remove the desktop minimum width on tablet and mobile.
- At tablet width, keep the brand, primary navigation, and account control in one
  row with compact spacing.
- At mobile width, keep the brand and account control in the top row and expose
  Founder Index and Seating Plans as a second-row tab strip.
- Account menus remain anchored to the right edge and never exceed the viewport.

### Footer

- Keep V1/V2, demo state, and primary route actions available.
- At tablet width, allow secondary action groups to scroll internally instead of
  forcing page overflow.
- At mobile width, preserve the primary action and current mode; secondary
  actions may collapse or scroll inside the footer.
- Respect bottom safe-area insets.

### Controls

- Interactive controls visible on mobile must be at least 44px tall or wide,
  except compact numeric steppers grouped inside a 44px control row.
- Active-state backgrounds include intentional horizontal breathing room.
- Dialogs and panels use `100dvh` where they occupy the viewport.

## Page behavior

### Search and zero-query discovery

- Mobile stacks the hero, search composer, discovery groups, and results.
- The search input and submit action become one full-width composition.
- Filter, grouping, sorting, and view controls wrap into multiple rows rather
  than forcing a wide toolbar.
- Grid results become one column on mobile and two columns on tablet.
- List results become labeled stacked rows on mobile; no wide table is required.
- Pickers fit within the viewport and use a scrollable body.

### Founder evidence

- Desktop and tablet retain the 540px edge-attached sheet.
- Below 640px, the sheet uses the full viewport width and height.
- Header, status, and results remain independently usable at short heights.

### Seating Plans

- Mobile uses single-column plan cards with actions beneath metadata.
- Tablet may use compact rows, but no action or version-history column may leave
  the viewport.
- Dialogs use full-width mobile action rows.

### Dinner setup

- Mobile presents the setup sequence vertically.
- Selection dialogs and rule editors use the viewport width and scroll their
  content independently.
- Sticky generation actions remain reachable above the footer.

### Dinner results and Analysis

- Mobile uses one focused table at a time with previous/next navigation and a
  horizontally scrollable table index.
- Tablet uses two table columns where founder names remain readable.
- Analysis insight cards stack on mobile and use two columns on tablet.
- Toolbar labels and active tabs retain adequate padding at every breakpoint.
- Match-threshold and density controls may move to a second toolbar row; they
  must not disappear unless an equivalent control remains accessible.

### Alternatives, recovery, and export

- Comparison layouts stack into a linear decision flow on mobile.
- Recovery actions remain adjacent to the problem they resolve.
- Export becomes a full-width mobile sheet with vertically stacked summary,
  options, and actions.

### AI provider settings

- Provider choices become a single column on mobile.
- Configuration and security guidance stack in reading order.
- Credential fields and actions use full width.

## Accessibility and interaction

- Preserve focus order when layouts reorganize.
- Do not hide a required action solely to make a layout fit.
- Keep visible focus rings and modal focus traps.
- Avoid page-level horizontal scrolling; local tab strips and data indexes may
  scroll with clear boundaries.
- Preserve reduced-motion behavior.

## Validation

For every reference width:

1. Open Search, Seating Plans, Dinner setup, Dinner Tables, Analysis, Export,
   AI settings, and Founder evidence.
2. Assert document width does not exceed viewport width.
3. Verify primary interactions remain reachable.
4. Check header/footer geometry and dialog containment.
5. Capture representative mobile and tablet screenshots.
6. Run unit tests, lint, production build, and Playwright E2E.

## Release

- Apply fixes in route-sized commits.
- Refresh GitHub showcase screenshots affected by layout changes.
- Merge to `main`, push, wait for Render, and verify the live reference widths.
