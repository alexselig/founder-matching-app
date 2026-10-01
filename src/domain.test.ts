import { describe, expect, it } from 'vitest'
import {
  exportGroupsCsv,
  generateGroups,
  normalizeFounders,
  type RawFounder,
} from './domain'

const raw = (id: string, company = `Company ${id}`): RawFounder => ({
  Id: id,
  Name: `Founder ${id}`,
  Group: '1',
  'Group Section': '1A',
  'Company vertical': id === '1' ? 'Healthcare -> Healthcare IT' : 'Consumer',
  Company: company,
  Age: 20 + Number(id),
  Education: 'Math',
  Role: Number(id) % 2 ? 'Engineering' : 'Design',
})

describe('founder domain', () => {
  it('normalizes source records and derives the top-level vertical', () => {
    expect(normalizeFounders([{ ...raw('1'), Interests: ['AI', ' AI ', 'AI'] }])[0]).toMatchObject({
      id: '1',
      topLevelVertical: 'Healthcare',
      interests: ['AI'],
    })
  })

  it('rejects malformed data', () => {
    expect(() => normalizeFounders([{ Id: '1' }])).toThrow('missing Name')
  })

  it('builds balanced deterministic groups', () => {
    const founders = normalizeFounders(['1', '2', '3', '4', '5'].map((id) => raw(id)))
    const config = {
      targetSize: 2,
      strategy: 'balanced' as const,
      seed: 'test',
      attributes: ['industry', 'role'] as const,
    }
    const first = generateGroups(founders, { ...config, attributes: [...config.attributes] })
    const second = generateGroups(founders, { ...config, attributes: [...config.attributes] })
    expect(first.groups.map((group) => group.length)).toEqual([2, 2, 1])
    expect(first.groups.map((group) => group.map((founder) => founder.id))).toEqual(
      second.groups.map((group) => group.map((founder) => founder.id)),
    )
  })

  it('changes arrangements when the seed changes', () => {
    const founders = normalizeFounders(
      Array.from({ length: 12 }, (_, index) => raw(String(index + 1))),
    )
    const config = {
      targetSize: 4,
      strategy: 'balanced' as const,
      attributes: ['industry', 'role'] as const,
    }
    const first = generateGroups(founders, { ...config, seed: 'first', attributes: [...config.attributes] })
    const second = generateGroups(founders, { ...config, seed: 'second', attributes: [...config.attributes] })
    expect(first.groups.map((group) => group.map((founder) => founder.id))).not.toEqual(
      second.groups.map((group) => group.map((founder) => founder.id)),
    )
  })

  it('uses enabled attributes for diverse grouping', () => {
    const founders = normalizeFounders(
      Array.from({ length: 12 }, (_, index) => ({
        ...raw(String(index + 1)),
        Role: index < 6 ? 'Engineering' : 'Design',
        'Company vertical': index % 2 ? 'Consumer' : 'Healthcare',
      })),
    )
    const roleGroups = generateGroups(founders, {
      targetSize: 4,
      strategy: 'diverse',
      seed: 'diverse',
      attributes: ['role'],
    })
    const industryGroups = generateGroups(founders, {
      targetSize: 4,
      strategy: 'diverse',
      seed: 'diverse',
      attributes: ['industry'],
    })
    expect(roleGroups.groups.map((group) => group.map((founder) => founder.id))).not.toEqual(
      industryGroups.groups.map((group) => group.map((founder) => founder.id)),
    )
  })

  it('rejects invalid target sizes and handles an empty pool', () => {
    expect(() =>
      generateGroups([], {
        targetSize: 0,
        strategy: 'balanced',
        seed: 'test',
        attributes: [],
      }),
    ).toThrow('Target table size')
    expect(
      generateGroups([], {
        targetSize: 8,
        strategy: 'balanced',
        seed: 'test',
        attributes: [],
      }).groups,
    ).toEqual([])
  })

  it('escapes exported CSV values', () => {
    const founder = normalizeFounders([{ ...raw('1'), Name: 'Ada, "A"' }])[0]
    expect(exportGroupsCsv([[founder]])).toContain('"Ada, ""A"""')
  })
})
