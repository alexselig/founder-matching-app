function normalizePathname(pathname: string) {
  return pathname.replace(/\/+$/, '') || '/'
}

export function v2DestinationFor(pathname: string) {
  const path = normalizePathname(pathname)
  if (
    path === '/v1/admin' ||
    path.startsWith('/v1/admin/') ||
    path === '/v1/algorithm' ||
    path.startsWith('/v1/algorithm/')
  ) {
    return '/v2/dinner'
  }
  return '/v2/search'
}

export function v1DestinationFor(pathname: string) {
  const path = normalizePathname(pathname)
  if (
    path === '/v2/dinner' ||
    path.startsWith('/v2/dinner/') ||
    path === '/v2/seating-plans' ||
    path.startsWith('/v2/seating-plans/')
  ) {
    return '/v1/admin'
  }
  return '/v1/directory'
}
