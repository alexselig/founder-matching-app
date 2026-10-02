# V1/V2 Version Deep Links Design

## Goal

Make every supported V1 and V2 page directly addressable and make the footer version switch preserve the user's closest equivalent workflow instead of always returning home.

The V1 version switcher must occupy the same bottom-left position as the V2 version links. It remains compact and does not adopt the rest of the V2 footer controls. Its active V1 tab uses a solid blue highlight with white text rather than the current white surface with blue text.

The V1 top navigation is grouped by audience intent: Directory and Admin grouping remain left-aligned, while Plan review and Algorithm are right-aligned immediately before the founder-count block.

## Route Mapping

| Current route | Switch destination |
|---|---|
| `/v1`, `/v1/search`, `/v1/directory` | `/v2/search` |
| `/v1/admin`, `/v1/algorithm` | `/v2/dinner` |
| `/v1/plan` or unknown V1 route | `/v2/search` |
| `/v2`, `/v2/search`, V2 founder evidence, `/v2/settings/ai` | `/v1/directory` |
| `/v2/dinner`, `/v2/seating-plans` | `/v1/admin` |
| Unknown V2 route | `/v1/directory` |

Query strings and route-specific state do not cross versions because V1 and V2 use different state contracts. The destination preserves workflow intent, not incompatible implementation state.

## Architecture

Add one pure route-mapping module used by both version footers. Each footer computes the other version's link from `window.location.pathname`; active-version links keep the canonical current-version home. Existing routing and page components remain unchanged.

Move the existing V1 switcher from the bottom-right to the bottom-left using its current compact 32px treatment. Replace the active tab's blue inset rule with a solid `var(--bauhaus-blue)` background and white text.

Reorder the V1 navigation links to Directory, Admin grouping, Plan review, and Algorithm. Apply an auto margin to the start of the secondary Plan review/Algorithm group so it sits against the founder-count block.

## Error Handling

Unknown or malformed paths fall back to the destination version's discovery page. Mapping never throws and never emits a route outside `/v1` or `/v2`.

## Verification

Unit-test every mapping row and both fallback directions. Update footer tests to verify context-preserving links and add style regressions for the bottom-left position, solid active tab, and split top-navigation alignment. Then run targeted routing/footer tests, lint, and the full client build. Verify representative V1 and V2 URLs in the live Render deployment after pushing.
