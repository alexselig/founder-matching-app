import { V1App } from '../v1/V1App'
import { V2App } from '../v2/V2App'

const versionStorageKey = 'founder-app-version'

export function AppRouter() {
  const path = window.location.pathname

  if (path.startsWith('/v1')) {
    window.localStorage.setItem(versionStorageKey, 'v1')
    return <V1App />
  }

  if (path.startsWith('/v2')) {
    window.localStorage.setItem(versionStorageKey, 'v2')
    return <V2App />
  }

  window.location.replace(
    window.localStorage.getItem(versionStorageKey) === 'v1' ? '/v1' : '/v2',
  )

  return null
}
