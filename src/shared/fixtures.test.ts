import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { normalizeFounders } from './founder'
import { buildScaleFixture } from './fixtures'

const foundersFixturePath = resolve(process.cwd(), 'src/founders.json')
const rawFounders = JSON.parse(readFileSync(foundersFixturePath, 'utf8')) as unknown
const founders = normalizeFounders(rawFounders)

describe('scale fixtures', () => {
  it('builds the required scale scenarios', () => {
    expect(buildScaleFixture(founders, 'three-tables')).toHaveLength(24)
    expect(buildScaleFixture(founders, 'five-tables')).toHaveLength(40)
    expect(buildScaleFixture(founders, 'twenty-tables')).toHaveLength(160)
    expect(buildScaleFixture(founders, 'uneven-five-tables')).toHaveLength(48)
  })

  it('reuses canonical founder objects with deterministic membership', () => {
    const first = buildScaleFixture(founders, 'five-tables')
    const second = buildScaleFixture(founders, 'five-tables')

    expect(first.map((founder) => founder.id)).toEqual(second.map((founder) => founder.id))
    expect(first[0]).toBe(founders.find((founder) => founder.id === first[0]?.id))
    expect(new Set(first.map((founder) => founder.id)).size).toBe(first.length)
  })

  it('preserves categorical variation for matching scenarios', () => {
    const fixture = buildScaleFixture(founders, 'twenty-tables')

    expect(new Set(fixture.map((founder) => founder.companyVertical)).size).toBeGreaterThanOrEqual(8)
    expect(new Set(fixture.map((founder) => founder.company)).size).toBeGreaterThanOrEqual(40)
    expect(new Set(fixture.map((founder) => founder.education)).size).toBeGreaterThanOrEqual(6)
    expect(new Set(fixture.map((founder) => founder.role)).size).toBeGreaterThanOrEqual(3)
    expect(new Set(fixture.map((founder) => founder.cohortGroup)).size).toBeGreaterThanOrEqual(3)
    expect(new Set(fixture.map((founder) => founder.cohortSection)).size).toBeGreaterThanOrEqual(8)
  })

  it('ships provider-shaped deterministic web-result samples for fixture founders', () => {
    const sampleFixturePath = resolve(process.cwd(), 'src/fixtures/web-results.sample.json')
    const sampleRows = JSON.parse(readFileSync(sampleFixturePath, 'utf8')) as Array<Record<string, unknown>>
    const fixtureFounderIds = new Set(
      [
        'three-tables',
        'five-tables',
        'twenty-tables',
        'uneven-five-tables',
      ].flatMap((scenario) => buildScaleFixture(founders, scenario).map((founder) => founder.id)),
    )
    const countsByFounder = new Map<string, number>()

    expect(sampleRows.length).toBeGreaterThan(0)
    for (const row of sampleRows) {
      expect(row).toMatchObject({
        runId: 'fixture-run-1',
        provider: 'fixture',
        retrievedAt: '2026-10-01T00:00:00.000Z',
      })
      expect(typeof row.founderId).toBe('string')
      expect(typeof row.url).toBe('string')
      expect(typeof row.rank).toBe('number')
      expect(fixtureFounderIds.has(row.founderId as string)).toBe(true)
      countsByFounder.set(
        row.founderId as string,
        (countsByFounder.get(row.founderId as string) ?? 0) + 1,
      )
    }

    expect([...countsByFounder.values()].every((count) => count >= 1 && count <= 5)).toBe(true)
    expect(countsByFounder.size).toBe(fixtureFounderIds.size)
  })
})
