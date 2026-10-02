export type DinnerRoute = 'dinner' | 'seating-plans'

/** Saved-plan reopen request carried as `/v2/dinner?plan=<id>&version=<n>`. */
export interface DinnerPlanRequest {
  readonly planId: string
  readonly version: number | null
}

const ROUTES: Readonly<Record<string, DinnerRoute>> = {
  '/v2/dinner': 'dinner',
  '/v2/seating-plans': 'seating-plans',
}

export function matchDinnerRoute(pathname: string): DinnerRoute | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  return ROUTES[path] ?? null
}

/** The coordinator resolves this into `DinnerPage.initialPlan`; the UI never loads plans itself. */
export function readPlanRequest(search: string): DinnerPlanRequest | null {
  const params = new URLSearchParams(search)
  const planId = params.get('plan')
  if (!planId) return null
  const version = Number(params.get('version'))
  return { planId, version: Number.isInteger(version) && version > 0 ? version : null }
}
