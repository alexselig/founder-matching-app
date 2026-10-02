import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { normalizeFounders, type Founder } from './founder.js'
import { buildScaleFixture, type ScaleScenario } from './fixtures.js'

const foundersFixturePath = resolve(process.cwd(), 'src/founders.json')
const rawFounders = JSON.parse(readFileSync(foundersFixturePath, 'utf8')) as unknown
const founders = normalizeFounders(rawFounders)
const scenarios: readonly ScaleScenario[] = [
  'three-tables',
  'five-tables',
  'twenty-tables',
  'uneven-five-tables',
]

function stableHash(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function makeFounder(index: number): Founder {
  return {
    id: `synthetic-${index}`,
    name: `Founder ${index}`,
    cohortGroup: '1',
    cohortSection: '1A',
    companyVertical: 'Vertical 1',
    companyVerticalLevels: ['Vertical 1'],
    company: `Company ${index}`,
    age: 20 + (index % 8),
    education: 'Education 1',
    role: 'Engineering',
    searchName: `founder ${index}`,
    raw: Object.freeze({
      Id: `synthetic-${index}`,
      Name: `Founder ${index}`,
      Group: '1',
      'Group Section': '1A',
      'Company vertical': 'Vertical 1',
      Company: `Company ${index}`,
      Age: 20 + (index % 8),
      Education: 'Education 1',
      Role: 'Engineering',
    }),
  }
}

function makeNonContiguousRegressionFixture() {
  const orderedIds = Array.from({ length: 25 }, (_, index) => `synthetic-${index}`).sort(
    (left, right) => stableHash(left) - stableHash(right) || left.localeCompare(right),
  )

  return orderedIds.map((id, index) => {
    const founder = makeFounder(index)

    return {
      ...founder,
      id,
      cohortGroup: index === 0 ? '3' : index % 2 === 0 ? '1' : '2',
      cohortSection: `S${(index % 8) + 1}`,
      companyVertical: index === 24 ? 'Vertical 8' : `Vertical ${((index % 7) + 1)}`,
      companyVerticalLevels: [index === 24 ? 'Vertical 8' : `Vertical ${((index % 7) + 1)}`],
      company: index === 12 ? 'Company 11' : `Company ${index}`,
      age: 20 + (index % 8),
      education: index === 0 ? 'Education 6' : `Education ${((index - 1 + 5) % 5) + 1}`,
      role: index === 24 ? 'Sales' : index % 2 === 0 ? 'Engineering' : 'Design',
      searchName: `founder ${index}`,
      raw: founder.raw,
    }
  })
}

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
      scenarios.flatMap((scenario) => buildScaleFixture(founders, scenario).map((founder) => founder.id)),
    )
    const countsByFounder = new Map<string, number>()
    const ranksByFounder = new Map<string, number[]>()
    const tupleKeys = new Set<string>()
    const urls = new Set<string>()

    expect(sampleRows.length).toBe(fixtureFounderIds.size * 5)
    for (const row of sampleRows) {
      expect(typeof row.founderId).toBe('string')
      expect(typeof row.runId).toBe('string')
      expect(typeof row.url).toBe('string')
      expect(typeof row.classification).toBe('string')
      expect(typeof row.title).toBe('string')
      expect(typeof row.domain).toBe('string')
      expect(typeof row.snippet).toBe('string')
      expect(typeof row.provider).toBe('string')
      expect(typeof row.retrievedAt).toBe('string')
      expect(typeof row.rank).toBe('number')
      expect(typeof row.confidence).toBe('number')
      expect(fixtureFounderIds.has(row.founderId as string)).toBe(true)
      expect(row.runId).toBe('fixture-run-1')
      expect(row.provider).toBe('fixture')
      expect(row.retrievedAt).toBe('2026-10-01T00:00:00.000Z')
      expect(row.classification === 'both' || row.classification === 'founder' || row.classification === 'company').toBe(true)
      expect(row.title).not.toBe('')
      expect(row.domain).toBe('example.test')
      expect(row.snippet).not.toBe('')
      expect(row.rank).toBeGreaterThanOrEqual(1)
      expect(row.rank).toBeLessThanOrEqual(5)
      expect(row.confidence).toBeGreaterThan(0)
      expect(row.confidence).toBeLessThanOrEqual(1)
      expect(urls.has(row.url as string)).toBe(false)
      urls.add(row.url as string)
      const tupleKey = `${String(row.founderId)}::${String(row.runId)}::${String(row.rank)}`
      expect(tupleKeys.has(tupleKey)).toBe(false)
      tupleKeys.add(tupleKey)
      countsByFounder.set(
        row.founderId as string,
        (countsByFounder.get(row.founderId as string) ?? 0) + 1,
      )
      ranksByFounder.set(
        row.founderId as string,
        [...(ranksByFounder.get(row.founderId as string) ?? []), row.rank as number],
      )
    }

    expect([...countsByFounder.values()].every((count) => count === 5)).toBe(true)
    for (const ranks of ranksByFounder.values()) {
      expect([...ranks].sort((left, right) => left - right)).toEqual([1, 2, 3, 4, 5])
    }
    expect(countsByFounder.size).toBe(fixtureFounderIds.size)
  })

  it('selects a valid non-contiguous fixture when a contiguous window would miss required variation', () => {
    const syntheticFounders = makeNonContiguousRegressionFixture()
    const fixture = buildScaleFixture(syntheticFounders, 'three-tables')

    expect(fixture).toHaveLength(24)
    expect(fixture.some((founder) => founder.education === 'Education 6')).toBe(true)
    expect(fixture.some((founder) => founder.role === 'Sales')).toBe(true)
    expect(new Set(fixture.map((founder) => founder.companyVertical)).size).toBeGreaterThanOrEqual(8)
    expect(new Set(fixture.map((founder) => founder.education)).size).toBeGreaterThanOrEqual(6)
    expect(new Set(fixture.map((founder) => founder.role)).size).toBeGreaterThanOrEqual(3)
    expect(new Set(fixture.map((founder) => founder.cohortGroup)).size).toBeGreaterThanOrEqual(3)
    expect(new Set(fixture.map((founder) => founder.cohortSection)).size).toBeGreaterThanOrEqual(8)
  })

  it('throws a descriptive error when variation requirements are impossible', () => {
    const impossible = Array.from({ length: 32 }, (_, index) => {
      const founder = makeFounder(index)
      const verticalIndex = index < 8 ? index + 1 : 1
      const educationIndex = index >= 8 && index < 14 ? index - 7 : 1
      const role = index === 14 ? 'Design' : index === 15 ? 'Sales' : 'Engineering'
      const cohortGroup = index === 16 ? '2' : index === 17 ? '3' : '1'
      const cohortSection = index >= 18 && index < 25 ? `S${index - 16}` : 'S1'
      const age = index >= 25 ? index - 4 : 20

      return {
        ...founder,
        companyVertical: `Vertical ${verticalIndex}`,
        companyVerticalLevels: [`Vertical ${verticalIndex}`],
        age,
        education: `Education ${educationIndex}`,
        role,
        cohortGroup,
        cohortSection,
      }
    })

    expect(() => buildScaleFixture(impossible, 'three-tables')).toThrow(
      /could not satisfy variation requirements/i,
    )
  })

  it('rejects unknown runtime scenario values', () => {
    expect(() => buildScaleFixture(founders, 'six-tables' as ScaleScenario)).toThrow(
      'Unknown scale scenario: six-tables',
    )
  })
})
