import type { Founder } from '../../shared/founder'

export type AccountRole = 'admin' | 'founder'

export const ACCOUNT_ROLE_KEY = 'founder-v2-account-role'
export const CURRENT_FOUNDER_KEY = 'founder-v2-current-founder'
export const ACCOUNT_TIP_DISMISSED_KEY = 'founder-v2-account-tip-dismissed'
export const DEFAULT_CURRENT_FOUNDER_ID = '343105'

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>

function safeRead(storage: KeyValueStorage | undefined, key: string) {
  try {
    return storage?.getItem(key) ?? null
  } catch {
    return null
  }
}

function safeWrite(storage: KeyValueStorage | undefined, key: string, value: string) {
  try {
    storage?.setItem(key, value)
  } catch {
    // Storage can be unavailable (private mode, quota); account state then lasts for the page only.
  }
}

export function readAccountRole(storage: KeyValueStorage | undefined): AccountRole {
  return safeRead(storage, ACCOUNT_ROLE_KEY) === 'founder' ? 'founder' : 'admin'
}

export function writeAccountRole(storage: KeyValueStorage | undefined, role: AccountRole) {
  safeWrite(storage, ACCOUNT_ROLE_KEY, role)
}

export function readCurrentFounderId(storage: KeyValueStorage | undefined, founders: readonly Founder[]) {
  const stored = safeRead(storage, CURRENT_FOUNDER_KEY)
  if (stored && founders.some((founder) => founder.id === stored)) return stored
  if (founders.some((founder) => founder.id === DEFAULT_CURRENT_FOUNDER_ID)) return DEFAULT_CURRENT_FOUNDER_ID
  return founders[0]?.id ?? null
}

export function writeCurrentFounderId(storage: KeyValueStorage | undefined, founderId: string) {
  safeWrite(storage, CURRENT_FOUNDER_KEY, founderId)
}

export function readAccountTipDismissed(
  storage: KeyValueStorage | undefined,
  navigationType: PerformanceNavigationTiming['type'] = 'navigate',
) {
  if (navigationType === 'reload') return false
  return safeRead(storage, ACCOUNT_TIP_DISMISSED_KEY) === 'true'
}

export function writeAccountTipDismissed(storage: KeyValueStorage | undefined) {
  safeWrite(storage, ACCOUNT_TIP_DISMISSED_KEY, 'true')
}

export function browserLocalStorage() {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage
  } catch {
    return undefined
  }
}

export function browserSessionStorage() {
  try {
    return typeof window === 'undefined' ? undefined : window.sessionStorage
  } catch {
    return undefined
  }
}

export function browserNavigationType(): PerformanceNavigationTiming['type'] {
  if (typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') return 'navigate'
  const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
  return navigation?.type ?? 'navigate'
}
