# Top Web Results Drawer Design

## Goal

Show founder web results without taking users away from Founder Search. The existing evidence deep link remains valid, but renders as a right-side overlay card on top of the Search page.

## Chosen approach

Use a route-driven drawer:

- `/v2/search` renders Founder Search normally.
- `/v2/founders/:founderId/evidence` renders the same Search page as the background plus a modal drawer containing that founder's web results.
- The existing route continues to support bookmarks, refreshes, and shared deep links.

This is preferable to local-only component state, which would lose deep linking, and to a separate full page, which interrupts search context.

## Drawer behavior

- A translucent scrim covers the Search workspace.
- A fixed card enters from the right and remains above the scrim.
- Desktop width is approximately 520px, with full available height below the app header and above the footer.
- Narrow layouts use an edge-to-edge right sheet.
- The panel is a modal dialog with a visible close button.
- Escape, scrim click, and close return to `/v2/search`.
- Focus moves into the drawer when it opens and remains trapped until close.
- Background content is visually retained but not interactive while the drawer is open.

## Content

The drawer contains:

- Founder name and company
- The title **Top web results**
- Result count and fresh/stale/unsupported status
- Ranked cited result cards with classification, title, URL, snippet, provider, retrieval date, and confidence
- Existing no-results, stale, unsupported, and provider-failure states

The prior full-page hero and authoritative-data side rail are removed from this interaction. The founder record remains visible in the Search page behind the drawer.

## Data flow

`V2App` continues matching and loading `/v2/founders/:id/evidence`. Once founders and evidence are available, it renders `SearchPage` and the drawer together. Demo and production evidence loaders remain unchanged.

## Testing

Tests cover:

- The deep link renders Search plus the modal drawer
- The drawer title is **Top web results**
- Close points to `/v2/search`
- Escape invokes close
- Fresh and unsupported states retain their existing result/empty content
- Responsive CSS converts the fixed-width card into an edge-to-edge sheet
