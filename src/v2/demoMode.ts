export const DEMO_MODE_STORAGE_KEY = 'founder-app-demo-mode'

export function readDemoMode(storage: Pick<Storage, 'getItem'> = window.localStorage) {
  return storage.getItem(DEMO_MODE_STORAGE_KEY) === 'true'
}

export function setDemoMode(
  enabled: boolean,
  storage: Pick<Storage, 'setItem'> = window.localStorage,
) {
  storage.setItem(DEMO_MODE_STORAGE_KEY, String(enabled))
}
