# Founder Table

A reviewable prototype for founder discovery, search, and organizer-controlled
dinner grouping.

## Views

- `/` — founder discovery and search
- `/plan` — proposed product plan with section-level decisions, inline comments,
  browser autosave, and JSON feedback export
- `/directory` — alternate URL for founder discovery plus name, company, industry,
  role, and education search
- `/algorithm` — plain-language documentation of table sizing, attribute
  distance, strategy behavior, deterministic seeds, v1 limitations, and planned
  constraint-aware improvements
- `/admin` — organizer preview with attendee filtering, target table size,
  grouping strategy, parameter selection, deterministic seeds, and CSV export

The admin route is intentionally marked as an unprotected prototype. Production
use requires authentication and an organizer role.

## Run locally

```bash
npm install
npm run dev
```

Open the URL printed by Vite.

## Validate

```bash
npm test
npm run lint
npm run build
npm run preview -- --host 127.0.0.1
```

## Data

The prototype checks in the dataset published at:

<https://gitlab.com/-/snippets/5976927/raw/main/founder-dinner-matching.json>

It contains 574 founders and the following supplied fields: name, company,
company vertical, age, education, role, historical group, and historical group
section.

Batch and interests are not present. The interface marks those grouping
parameters unavailable instead of fabricating values.

## Matching and grouping

Founder discovery is deterministic and explainable. It uses the structured
profile fields only and does not present scores as scientific compatibility.

Dinner grouping is a deterministic heuristic. Organizers choose a Similar,
Diverse, Balanced, or Random arrangement and select the available parameters.
Groups differ in size by no more than one, and same-company founders are
strongly discouraged from sharing a table. Because assignment is greedy, that
penalty does not guarantee globally optimal separation.

## Feedback persistence

Plan feedback is autosaved to `localStorage` under
`founder-plan-feedback-v1`. Exported feedback is a JSON file suitable for
sharing or committing. The app does not provide a destructive reset action.
