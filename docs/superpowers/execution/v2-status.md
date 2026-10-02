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
- [ ] Wire Founder Search to the existing `/api/v2/ai/interpret/search` endpoint.
  - Search currently uses deterministic local query compilation.
  - This is the only known AI wiring gap; table assignment intentionally remains deterministic.
- [ ] Refresh the public showcase screenshots to include the final footer controls and Demo callout.

## Release

- Main merge commit: `3efc54b`
- Latest product commit: `8af9fd2`
- Public showcase: https://alexselig.github.io/founder-matching-app/
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
