import { describe, expect, it } from 'vitest'

import { buildDiscovery as buildV1Discovery, normalizeFounders as normalizeV1Founders } from '../../domain'
import rawFounders from '../../founders.json'
import { normalizeFounders } from '../../shared/founder'
import { buildDiscoveryCollections } from './discovery'

const founders = normalizeFounders(rawFounders)
const diQi = founders.find((founder) => founder.id === '343105')!

describe('buildDiscoveryCollections', () => {
  it('preserves the three V1 collection objectives and copy', () => {
    const collections = buildDiscoveryCollections(founders, diQi)

    expect(collections.map(({ kicker, title, description }) => ({ kicker, title, description }))).toEqual([
      {
        kicker: 'Useful adjacency',
        title: 'Same sector, different seat',
        description: 'Shared market context with a different operating perspective.',
      },
      {
        kicker: 'Complementary',
        title: 'Operators who round you out',
        description: 'Different backgrounds, enough common ground for a useful conversation.',
      },
      {
        kicker: 'Shared context',
        title: 'People likely to get it quickly',
        description: 'Closer patterns for conversations that can start in the middle.',
      },
    ])
  })

  it('ranks the first collection exactly like V1 with schema-grounded reasons', () => {
    const v1Founders = normalizeV1Founders(rawFounders)
    const v1Selected = v1Founders.find((founder) => founder.id === '343105')!
    const [v1First] = buildV1Discovery(v1Founders, v1Selected)
    const [first] = buildDiscoveryCollections(founders, diQi)

    expect(first.founders.map(({ founder, reason }) => [founder.id, reason])).toEqual(
      v1First.founders.map(({ founder, reason }) => [founder.id, reason]),
    )
  })

  it('shows four founders per collection without repeating anyone across collections', () => {
    const collections = buildDiscoveryCollections(founders, diQi)
    const ids = collections.flatMap((collection) => collection.founders.map(({ founder }) => founder.id))

    expect(collections.map((collection) => collection.founders.length)).toEqual([4, 4, 4])
    expect(new Set(ids).size).toBe(12)
  })

  it('excludes the current founder and anyone from the same company', () => {
    const collections = buildDiscoveryCollections(founders, diQi)
    const recommended = collections.flatMap((collection) => collection.founders.map(({ founder }) => founder))

    expect(recommended.some((founder) => founder.id === diQi.id)).toBe(false)
    expect(recommended.some((founder) => founder.company === diQi.company)).toBe(false)
  })

  it('builds reasons from the recommended founder fields', () => {
    const [, complementary, shared] = buildDiscoveryCollections(founders, diQi)

    for (const { founder, reason } of complementary.founders) {
      expect(reason).toBe(`${founder.role} operator with a ${founder.education.toLowerCase()} background`)
    }
    for (const { founder, reason } of shared.founders) {
      const lead = founder.role === diQi.role ? `Also in ${founder.role}` : founder.companyVerticalLevels[0]
      expect(reason).toBe(`${lead} · age ${founder.age}`)
    }
  })

  it('updates when the current founder changes', () => {
    const other = founders.find((founder) => founder.role === 'Sales' && founder.companyVerticalLevels[0] === 'Healthcare')!
    const forDiQi = buildDiscoveryCollections(founders, diQi)
    const forOther = buildDiscoveryCollections(founders, other)

    expect(forOther[0].founders.map(({ founder }) => founder.id)).not.toEqual(
      forDiQi[0].founders.map(({ founder }) => founder.id),
    )
    expect(forOther.flatMap((collection) => collection.founders).some(({ founder }) => founder.company === other.company)).toBe(false)
  })

  it('returns empty collections when there is no current founder', () => {
    expect(buildDiscoveryCollections(founders, null).every((collection) => collection.founders.length === 0)).toBe(true)
  })
})
