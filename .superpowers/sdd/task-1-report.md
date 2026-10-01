# Task 1 Handoff Report

## Status
- Complete

## Branch
- `v2/task-1-foundation`

## Full commit hash
- Implementation commit: `2af032fc38bae8255adbf5ea27b62f6e66025cfc`
- - Review fixes commit: `9f3280ba7f3a9a45c35e48c3d827636a6ab3a251`

## Exact tests and results
- `npm test -- src/app/AppRouter.test.tsx server/app.test.ts`
  - RED: exit 1, both suites failed before implementation because `./AppRouter` and `./app` did not exist.
  - GREEN: exit 0, `2` files passed, `3` tests passed.
- `npm test -- src/app/AppRouter.test.tsx server/app.test.ts`
  - RED (review fixes): exit 1.
    - V1 link rebasing still pointed at `/`, `/plan`, `/directory`, `/algorithm`, and `/admin`.
    - V1 route matching did not recognize `/v1/plan` or `/v1/admin`.
    - `createServer` did not yet serve static assets, provide SPA fallback, or expose `/healthz`.
  - GREEN (review fixes): exit 0, `2` files passed, `6` tests passed.
- `npm run lint`
  - GREEN: exit 0.
- `npm test && npm run build`
  - GREEN: exit 0.
  - `vitest run`: `3` files passed, `13` tests passed.
  - `build:client`: `tsc -b && vite build` passed.
  - `build:server`: `tsc -p tsconfig.server.json` passed.
- Production smoke test:
  - Started `npm start` with `HOST=127.0.0.1 PORT=43173`.
  - Verified `200` responses for `/`, `/v1`, `/v1/admin`, `/v2`, `/healthz`, and `/api/v2/health`.
  - Verified HTML routes returned the SPA shell and both health routes returned `{"version":"v2","database":"ready"}`.

## TDD RED/GREEN evidence
### RED
- Added `src/app/AppRouter.test.tsx` before `AppRouter` existed.
- Added `server/app.test.ts` before `createServer` existed.
- Ran focused tests and captured the expected failures:
  - `Error: Failed to resolve import "./AppRouter" from "src/app/AppRouter.test.tsx"`
  - `Error: Failed to resolve import "./app" from "server/app.test.ts"`

### GREEN
- Implemented `AppRouter`, `V1App`, `V2App`, shared health contracts, and Fastify `createServer`.
- Re-ran focused tests successfully.
- Ran full lint, test, and build validation successfully.

### RED (review fixes)
- Expanded `src/app/AppRouter.test.tsx` with rebased V1 link assertions and `/v1/plan` + `/v1/admin` route coverage.
- Expanded `server/app.test.ts` with `/healthz`, static asset serving, SPA fallback, and non-fallback `/api/*` coverage.
- Ran focused tests and captured the expected failures:
  - V1 header links still rendered the old unprefixed routes.
  - `/v1/plan` and `/v1/admin` did not render the expected V1 screens.
  - `createServer` lacked the static serving and `/healthz` behavior required by the review.

### GREEN (review fixes)
- Rebased V1 navigation to `/v1`, `/v1/plan`, `/v1/directory`, `/v1/algorithm`, and `/v1/admin`.
- Normalized V1 pathname matching so legacy V1 screens render correctly under `/v1/*`.
- Registered `@fastify/static`, added a non-API SPA fallback, and added `/healthz` using the shared health payload builder.
- Re-ran focused tests, lint, full tests, build, and a production smoke test successfully.

## Files changed
- `package.json`
- `package-lock.json`
- `vite.config.ts`
- `tsconfig.server.json`
- `src/main.tsx`
- `src/App.tsx`
- `src/v1/V1App.tsx`
- `src/v2/V2App.tsx`
- `src/app/AppRouter.tsx`
- `src/app/AppRouter.test.tsx`
- `src/shared/contracts.ts`
- `src/test/setup.ts`
- `server/app.ts`
- `server/app.test.ts`
- `server/index.ts`
- `server/test-fixtures/dist/index.html`
- `server/test-fixtures/dist/assets/app.js`

## Contracts produced
- `createServer(options: ServerOptions): FastifyInstance`
- `ServerOptions`
  - `databaseStatus: () => DatabaseStatus`
- `DatabaseStatus`
  - `'ready' | 'not-ready'`
- `HealthResponse`
  - `{ version: 'v2'; database: DatabaseStatus }`
- `HealthResponseSchema`
  - runtime validation for `/api/v2/health` and `/healthz`
- `createHealthResponse(database: DatabaseStatus): HealthResponse`
  - shared payload builder used by both health endpoints
- `AppRouter(): JSX.Element | null`
  - `/v1` renders frozen V1 app
  - `/v2` renders minimal V2 shell
  - `/` redirects to the last selected version, defaulting to V2
- `createServer(options: ServerOptions): FastifyInstance`
  - serves built static assets from an injectable `staticRoot`
  - falls back to `index.html` for non-API GET routes
  - preserves `404` JSON responses for unknown `/api/*` routes

## Requested contract changes
- None.

## Design gaps reached
- None in Task 1 scope.

## Self-review
- Preserved V1 behavior by wrapping the existing `src/App.tsx` in `src/v1/V1App.tsx` instead of changing V1 logic.
- Kept V2 intentionally minimal: a shell with the approved `Founder Search` heading only.
- Added shared Zod-backed health contracts without pulling in later search, dinner, persistence, provider, or enrichment behavior.
- Scoped the server build to runtime code by excluding `server/**/*.test.ts` from `tsconfig.server.json`.
- Scoped Vitest to `src/**` and `server/**` test files so new server dependencies do not cause `node_modules` test discovery.
- Kept the V1 changes strictly to route rebasing and pathname normalization; copy and styling remain unchanged.
- Made the Fastify static root injectable so server tests do not depend on a real production build.
- Verified the built server path with an end-to-end smoke test rather than relying only on injection tests.

## Integration notes
- `src/main.tsx` now mounts `AppRouter`, which is the only bootstrap change needed to expose `/v1` and `/v2` in the browser.
- `AppRouter` stores the selected version under `founder-app-version` so `/` can redirect to the last-used version while defaulting to `/v2`.
- `server/index.ts` currently reports database status as `'ready'`; later waves can replace that callback with real readiness wiring without changing the shared health contract or either endpoint.
- `createServer` now expects the built client to live at `dist/` relative to `process.cwd()` in production, while tests can supply their own `staticRoot`.
- Unknown API routes keep JSON `404` behavior and do not receive the SPA fallback.
- Left `docs/superpowers/execution/v2-status.md` and `design-gaps.md` untouched for the coordinator.
