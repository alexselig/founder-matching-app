# V2 Execution Status

| Task | Status | Branch | Commit | Verification |
|---|---|---|---|---|
| 1. Isolate V1 and scaffold V2 | Complete | `v2/task-1-foundation` | `d190ad0` | Lint; 14/14 tests; client/server build; production route smoke; reviewer signoff |
| 2. Schema registry and fixtures | Complete | `v2/task-2-schema` | `1bdcb07` | 14/14 targeted tests; 28/28 integrated tests; lint; client/server build; reviewer signoff |
| 3. SQLite repositories | Complete | `v2/task-3-persistence` | `738ba03` | 91/91 source tests; lint; client/server build; built-only 574-founder smoke; reviewer signoff |
| 4. V2 Search | Complete | `v2/task-4-search` | `f27a607` | 75/75 Search tests; lint; client/server build; reviewer signoff |
| 5. Web enrichment | Complete | `v2/task-5-enrichment` | `3e9b948` | Strict completed-envelope and citation validation; integrated provider credentials; full suite and built smoke |
| 6. Dinner engine | Complete | `v2/task-6-dinner-engine` | `fd6099c` | 44/44 dinner tests; full integrated suite; lint; client/server build; reviewer signoff |
| 7. Dinner workbench | Complete | `v2/task-7-dinner-ui` | `e1f9553` | Approved setup, recovery, Tables, Analysis, alternatives, archive, and responsive layouts |
| 8. Secure persistence and exports | Complete | `v2/task-8-server` | `239e687` | Encrypted credentials, append-only dinner versions, recovery snapshots, and CSV/JSON exports |
| 9. Release verification | Complete | `main` | `3efc54b` | 529 tests; lint; client/server build; built-only smoke; 2 Playwright E2E tests; 16-screen synthetic storyboard; GitHub Pages live |
| 10. Post-release configuration polish | Complete | `main` | `30cb804` | Search cohort handoff; editable result criteria; 100-table cap; full 574-founder seating; realistic Demo evidence; navigation and screenshot cleanup |
| 11. Footer utility controls | Complete | `main` | `8207ade`, `8af9fd2` | AI settings link and Demo switch in both account modes; hover/focus explanation; 33 targeted tests; lint; client build; browser visual QA |
| 12. Founder AI credential setup | Complete | `main` | `1222eaa`, `c470fdc` | AI setup available in Founder and Admin modes; provider validation no longer assumes premium Anthropic model access; pasted credentials normalized; 48 focused tests; lint; client/server build |
| 13. Criteria controls and version navigation | Complete | `main` | `36355b5` | Generated criteria match the approved desktop treatment; criteria remain removable during review; V1 includes a compact V1/V2 footer; 28 dinner tests; browser visual QA |
| 14. Safe Render public demo | Complete | `main` | `cf971cb`, `7328a4e` | Free Render Blueprint live; public Demo mode forced and locked; mutating V2 APIs return `403 public_demo_read_only`; live health, API, and browser verification passed |

## Current task list

- [x] Preserve the selected Search result cohort when creating a dinner plan.
- [x] Remove Table Config from top-level navigation and published screenshots.
- [x] Replace placeholder Demo web results with plausible fictitious evidence.
- [x] Keep Advanced Criteria editable while reviewing Tables and Analysis.
- [x] Raise the organizer table limit to 100 and seat all 574 founders.
- [x] Keep deterministic table assignment after optional AI criteria interpretation.
- [x] Make the AI status open API-key settings in both Admin and Founder modes.
- [x] Show Demo mode in both Admin and Founder modes as a clear On/Off switch.
- [x] Explain on hover and keyboard focus that Demo mode uses fictitious data and sample seating history.
- [x] Verify founder data against the canonical GitLab source.
  - `src/founders.json` is byte-identical to the 574-record source.
  - Three running SQLite databases had zero missing, extra, or changed founder rows.
- [x] Allow Founder-mode users to configure and validate AI providers.
- [x] Normalize pasted provider credentials and validate Anthropic access without requiring one premium model.
- [x] Match generated dinner criteria controls to the approved desktop formatting.
- [x] Add compact V1/V2 navigation to every V1 page.
- [x] Push a safe, read-only Render Blueprint for public evaluation.
  - Public builds force fictitious Demo mode on and disable the toggle.
  - Server-side guards block all mutating `/api/v2/*` requests.
  - The exact Render environment passed local health, browser, GET, and mutation-blocking checks.
- [x] Diagnose and resolve the first live Render deployment failure.
  - Render MCP traced the failure to omitted TypeScript/Vite development dependencies.
  - `render.yaml` now builds with `npm ci --include=dev && npm run build`.
- [x] Verify the deployed `onrender.com` URL end to end.
  - `/healthz` reports the database ready.
  - Founder GET APIs return successfully.
  - Mutations return `403 public_demo_read_only`.
  - Browser verification confirms Demo mode is On and disabled.
- [x] Add the final Render URL to the README, this status page, and the public overview.
- [ ] Wire Founder Search to the existing `/api/v2/ai/interpret/search` endpoint.
  - Search currently uses deterministic local query compilation.
  - This is the only known AI wiring gap; table assignment intentionally remains deterministic.
- [ ] Refresh the public showcase screenshots to include the final footer controls and Demo callout.

## Release

- Main merge commit: `3efc54b`
- Latest product commit: `7328a4e`
- Public showcase: https://alexselig.github.io/founder-matching-app/
- Render public demo: https://founder-index-demo.onrender.com/v2
- Integrated through Tasks 1–9.
- Task 1 shared health, routing, and server boundaries passed review.
- Task 2 founder contracts, schema registry, deterministic scale fixtures, and provider-shaped web samples passed review.
- Task 3 durable SQLite persistence, runtime packaging, and founder APIs passed review.
- Task 4 approved Search, truthful recovery states, and Search-to-Dinner handoff passed review.
- Task 5 strict provider parsing, source-local evidence, and runtime credential proxies passed review.
- Task 6 deterministic rules, maximin optimization, alternatives, and scale bounds passed review.
- Task 7 approved Dinner workbench, recovery, Tables, Analysis, alternatives, and saved-plan archive passed review.
- Task 8 encrypted provider credentials, append-only dinner versions, and exports passed review.
- Runtime coordinator loads production APIs by default and public-safe deterministic fixtures only in admin Demo mode.
- AI provider setup and founder evidence review use approved designs and server-backed contracts.
- Integrated verification: 529/529 tests, lint, client/server build, built-only 574-founder startup smoke, 2/2 Playwright E2E tests, manual browser QA, and 16 public-safe screenshots.
- GitHub Pages serves the showcase from `main` `/docs`; the page and screenshot assets return HTTP 200.
- Post-release dinner configuration verification: 531/531 tests, lint, client/server build, built-only smoke, 2/2 Playwright E2E tests, and manual 574-founder seating QA.
- Footer verification: 33 targeted tests, lint, client build, and browser hover-placement QA at 1440×900.
- Founder credential verification: 48 focused tests, lint, and full client/server build.
- Criteria and V1 navigation verification: 28 dinner tests plus browser visual QA.
- Render public-demo verification: 47 targeted tests, lint, full client/server build, Blueprint parse, and exact local Render-environment smoke.
- Live Render verification: deploy `dep-davv8u9mgk9c73c988p0` is live; `/healthz`, founder GET APIs, read-only mutation guard, and forced Demo-mode browser behavior passed.
