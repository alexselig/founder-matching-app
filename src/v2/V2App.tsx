import { lazy, Suspense } from 'react'

import { matchDinnerRoute } from './dinner/dinnerRoutes'

const DinnerPage = lazy(() => import('./dinner/DinnerPage').then((module) => ({ default: module.DinnerPage })))
const SeatingPlansPage = lazy(() =>
  import('./dinner/SeatingPlansPage').then((module) => ({ default: module.SeatingPlansPage })),
)

export interface V2AppProps {
  readonly pathname?: string
  readonly search?: string
}

export function V2App({ pathname = window.location.pathname, search = window.location.search }: V2AppProps = {}) {
  const dinnerRoute = matchDinnerRoute(pathname)
  if (dinnerRoute) {
    return (
      <Suspense fallback={null}>
        {dinnerRoute === 'dinner' ? <DinnerPage search={search} /> : <SeatingPlansPage />}
      </Suspense>
    )
  }

  return (
    <main>
      <h1>Founder Search</h1>
      <p>V2 shell</p>
    </main>
  )
}
