import { describe, expect, it } from 'vitest'

import { v1DestinationFor, v2DestinationFor } from './versionLinks'

describe('version links', () => {
  it.each([
    ['/v1', '/v2/search'],
    ['/v1/search', '/v2/search'],
    ['/v1/directory/', '/v2/search'],
    ['/v1/admin', '/v2/dinner'],
    ['/v1/algorithm', '/v2/dinner'],
    ['/v1/plan', '/v2/search'],
    ['/v1/unknown', '/v2/search'],
  ])('maps %s to its V2 workflow at %s', (pathname, destination) => {
    expect(v2DestinationFor(pathname)).toBe(destination)
  })

  it.each([
    ['/v2', '/v1/directory'],
    ['/v2/search/', '/v1/directory'],
    ['/v2/settings/ai', '/v1/directory'],
    ['/v2/founders/f-1/evidence', '/v1/directory'],
    ['/v2/dinner', '/v1/admin'],
    ['/v2/seating-plans', '/v1/admin'],
    ['/v2/unknown', '/v1/directory'],
  ])('maps %s to its V1 workflow at %s', (pathname, destination) => {
    expect(v1DestinationFor(pathname)).toBe(destination)
  })
})
