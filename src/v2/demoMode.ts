export const DEMO_MODE_STORAGE_KEY = 'founder-app-demo-mode'
const PUBLIC_DEMO_ONLY = import.meta.env.VITE_PUBLIC_DEMO_ONLY === 'true'

export function isPublicDemoOnly() {
  return PUBLIC_DEMO_ONLY
}

export function readDemoMode(
  storage: Pick<Storage, 'getItem'> = window.localStorage,
  forced = PUBLIC_DEMO_ONLY,
) {
  return forced || storage.getItem(DEMO_MODE_STORAGE_KEY) === 'true'
}

export function setDemoMode(
  enabled: boolean,
  storage: Pick<Storage, 'setItem'> = window.localStorage,
  forced = PUBLIC_DEMO_ONLY,
) {
  if (forced) return
  storage.setItem(DEMO_MODE_STORAGE_KEY, String(enabled))
}
