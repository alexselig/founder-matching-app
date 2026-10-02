# Seating Plan Footer Action

## Goal

Move the orange **New seating plan** action from the Seating Plans hero into the standard lower-right footer action position.

## Design

- Remove the orange hero CTA tile.
- Expand the hero summary grid so the intro copy and three statistics use the released space.
- Render one orange `+ New seating plan` button in `V2Footer` through its page-specific `actions` slot.
- Keep the button flush with the footer's right edge and at the footer's full height.
- Navigate to `/v2/dinner` on activation.
- Preserve the existing empty-state CTA because it is contextual content shown only when no plans exist.

## Responsive behavior

- The footer action remains the rightmost visible command at desktop, tablet, and phone widths.
- The label may tighten at phone widths, but the action remains at least 44px tall and does not cover page content.
- Removing the hero CTA must not leave an empty grid column at any breakpoint.

## Accessibility

- Use a native button with the accessible name `New seating plan`.
- Preserve keyboard focus styling from the shared footer.

## Verification

- Update Seating Plans tests to assert that the archive hero no longer contains the CTA and the footer does.
- Verify the action navigates to `/v2/dinner`.
- Run the responsive CSS contract tests and Playwright phone/tablet viewport checks.
