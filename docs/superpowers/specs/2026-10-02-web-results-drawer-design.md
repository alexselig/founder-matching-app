# Top Web Results Drawer Design

## Goal

Show founder web results without taking users away from Founder Search. The existing evidence deep link remains valid, but renders as a full-height right-side panel over the Search page.

## Chosen approach

Use the existing local-and-route-driven drawer:

- `/v2/search` renders Founder Search normally.
- Selecting **View top web results** opens the panel without changing the Search URL.
- `/v2/founders/:founderId/evidence` renders the same Search page as the background plus a modal drawer containing that founder's web results.
- The existing route continues to support bookmarks, refreshes, and shared deep links.

This preserves the fast in-place interaction while retaining deep links. A separate full page would interrupt search context.

## Drawer behavior

- A translucent scrim covers the Search workspace.
- A fixed panel enters from the right and remains above the scrim.
- The panel is attached to the viewport edge with no outer margin or floating-card frame.
- Desktop width is approximately 540px.
- Height uses the dynamic viewport (`100dvh`) so the panel follows browser height changes.
- The results region scrolls independently while the identity, title, and status regions remain visible.
- Short-height windows use more compact header, title, and status spacing.
- Narrow layouts use a full-width, edge-to-edge right sheet.
- The panel retains modal dialog semantics and a visible close button for accessibility.
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
- Responsive CSS keeps the panel full-height, compacts short windows, and converts narrow layouts into an edge-to-edge sheet
