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
    expect(normalizeFounders([raw('1')])[0]).toMatchObject({
      id: '1',
      topLevelVertical: 'Healthcare',
      interests: [],
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

  it('escapes exported CSV values', () => {
    const founder = normalizeFounders([{ ...raw('1'), Name: 'Ada, "A"' }])[0]
    expect(exportGroupsCsv([[founder]])).toContain('"Ada, ""A"""')
  })
})
