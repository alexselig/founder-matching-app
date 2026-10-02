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

## Deploy the public demo on Render

Live public demo: <https://founder-index-demo.onrender.com/v2>

The checked-in `render.yaml` creates a free Render web service from this
repository. It forces Demo mode and rejects mutating V2 API requests, so public
visitors can explore fictitious founders and sample seating plans without
storing provider credentials or changing shared data.

1. In Render, choose **New → Blueprint**.
2. Connect the `alexselig/founder-matching-app` GitHub repository.
3. Select the repository's `render.yaml` and apply the Blueprint.
4. Wait for `/healthz` to report a healthy deployment, then open the generated
   `onrender.com` URL.

The free service uses an ephemeral SQLite file because the public demo is
read-only. A private persistent deployment should use a paid service with a
disk mounted at `/var/data`, set `DATABASE_PATH=/var/data/founders.sqlite`, and
keep a single service instance while SQLite remains in use.

## Validate

```bash
npm test
npm run lint
npm run build
npm run preview -- --host 127.0.0.1
```

## V2 server and web enrichment

The production server requires `DATABASE_PATH` and serves the V2 API plus the
built client from one Fastify process. Optional provider adapters are enabled
only when their server-side environment variables are present:

- Anthropic: `ANTHROPIC_API_KEY` (`claude-opus-4-8`)
- OpenAI: `OPENAI_API_KEY` and `OPENAI_MODEL`
- xAI: `XAI_API_KEY` and `XAI_MODEL`

Provider credentials stay server-side. They are never accepted by enrichment
run requests or returned in API responses.

`POST /api/v2/enrichment/runs` starts append-only founder enrichment.
`GET /api/v2/enrichment/runs/:id` and
`GET /api/v2/enrichment/runs/:id/progress` report batch state.
`GET /api/v2/founders/:id/web-results` returns the latest successful evidence
plus redacted run history. Tests inject fake transports and never require live
provider access.

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
