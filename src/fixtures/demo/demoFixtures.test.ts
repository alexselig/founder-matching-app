import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  AppendDinnerVersionRequestSchema,
  CreateDinnerRequestSchema,
  DinnerStateSchema,
} from '../../shared/dinnerContracts.js'
import { normalizeFounders } from '../../shared/founder.js'
import {
  buildDemoFixtureBundle,
  DEMO_FIXTURE_FILE_NAMES,
  renderDemoFixtureFiles,
} from '../../../scripts/generate-demo-fixtures.js'
import { createDatabase } from '../../../server/database.js'
import { FounderRepository } from '../../../server/repositories/founders.js'
import { WebResultsRepository } from '../../../server/repositories/webResults.js'

const authoritativeFounders = normalizeFounders(
  JSON.parse(
    readFileSync(resolve(process.cwd(), 'src/founders.json'), 'utf8'),
  ) as unknown,
)

function sorted(values: Iterable<string>) {
  return [...values].sort((left, right) => left.localeCompare(right))
}

describe('demo fixtures', () => {
  it('renders byte-identical generated files and keeps committed JSON current', () => {
    const first = renderDemoFixtureFiles(buildDemoFixtureBundle())
    const second = renderDemoFixtureFiles(buildDemoFixtureBundle())

    expect(first).toEqual(second)
    expect(sorted(Object.keys(first))).toEqual(sorted(DEMO_FIXTURE_FILE_NAMES))

    for (const fileName of DEMO_FIXTURE_FILE_NAMES) {
      expect(
        readFileSync(
          resolve(process.cwd(), 'src/fixtures/demo', fileName),
          'utf8',
        ),
      ).toBe(first[fileName])
    }
  })

  it('provides exactly 160 isolated synthetic founders with useful variation', () => {
    const { founders } = buildDemoFixtureBundle()
    const normalized = normalizeFounders(founders)
    const authoritativeIds = new Set(
      authoritativeFounders.map((founder) => founder.id),
    )
    const authoritativeNames = new Set(
      authoritativeFounders.map((founder) => founder.name),
    )
    const authoritativeCompanies = new Set(
      authoritativeFounders.map((founder) => founder.company),
    )

    expect(normalized).toHaveLength(160)
    expect(new Set(normalized.map((founder) => founder.id)).size).toBe(160)
    expect(
      normalized.every(
        (founder) =>
          founder.id.startsWith('demo-') &&
          !authoritativeIds.has(founder.id) &&
          !authoritativeNames.has(founder.name) &&
          !authoritativeCompanies.has(founder.company),
      ),
    ).toBe(true)
    expect(
      new Set(normalized.map((founder) => founder.companyVertical)).size,
    ).toBeGreaterThanOrEqual(20)
    expect(new Set(normalized.map((founder) => founder.company)).size).toBe(96)
    expect(new Set(normalized.map((founder) => founder.age)).size).toBe(31)
    expect(new Set(normalized.map((founder) => founder.education)).size).toBe(
      12,
    )
    expect(new Set(normalized.map((founder) => founder.role)).size).toBe(6)
    expect(new Set(normalized.map((founder) => founder.cohortGroup)).size).toBe(
      5,
    )
    expect(
      new Set(normalized.map((founder) => founder.cohortSection)).size,
    ).toBe(40)
  })

  it('covers fresh, stale, no-results, unsupported, and provider-failure evidence states with safe URLs', () => {
    const { founders, webEvidence } = buildDemoFixtureBundle()
    const founderIds = new Set(founders.map((founder) => founder.Id))
    const stateCounts = Object.fromEntries(
      ['fresh', 'stale', 'no_results', 'unsupported', 'provider_failure'].map(
        (state) => [
          state,
          webEvidence.records.filter((record) => record.state === state).length,
        ],
      ),
    )

    expect(webEvidence.records).toHaveLength(160)
    expect(new Set(webEvidence.records.map((record) => record.founderId))).toEqual(
      founderIds,
    )
    expect(stateCounts).toEqual({
      fresh: 64,
      stale: 32,
      no_results: 24,
      unsupported: 24,
      provider_failure: 16,
    })

    for (const record of webEvidence.records) {
      expect(record.founderId.startsWith('demo-')).toBe(true)
      expect(record.run.founderId).toBe(record.founderId)
      expect(record.run.provider).toBe('demo-fixture')
      expect(record.run.rawProviderMetadata).toBeUndefined()

      if (record.state === 'fresh') {
        expect(record.run.results).toHaveLength(5)
        expect(
          record.run.results.every(
            (result) =>
              Date.parse(result.staleAfter) > Date.parse(result.retrievedAt),
          ),
        ).toBe(true)
      } else if (record.state === 'stale') {
        expect(record.run.results).toHaveLength(3)
        expect(
          record.run.results.every(
            (result) =>
              Date.parse(result.staleAfter) < Date.parse('2026-10-01T00:00:00.000Z'),
          ),
        ).toBe(true)
      } else {
        expect(record.run.results).toEqual([])
      }

      if (record.state === 'unsupported') {
        expect(record.unsupportedReason).toBe(
          'provider_response_without_citations',
        )
      }
      if (record.state === 'provider_failure') {
        expect(record.error).toMatchObject({
          code: 'demo_provider_unavailable',
          retryable: true,
        })
      }

      for (const result of record.run.results) {
        const url = new URL(result.url)
        expect(url.protocol).toBe('https:')
        expect(
          url.hostname === 'example' || url.hostname.endsWith('.example'),
        ).toBe(true)
        expect(result.domain).toBe(url.hostname)
        expect(result.provider).toBe('demo-fixture')
        expect(result.rawProviderMetadata).toBeUndefined()
        expect(result.title.toLowerCase()).toContain('synthetic')
        expect(result.snippet.toLowerCase()).toContain('synthetic')
      }
    }
  })

  it('loads every provider-shaped run through the existing web-results repository', () => {
    const { founders, webEvidence } = buildDemoFixtureBundle()
    const database = createDatabase({ filename: ':memory:' })

    try {
      new FounderRepository(database).saveAll(normalizeFounders(founders))
      const repository = new WebResultsRepository(database)

      for (const record of webEvidence.records) {
        repository.appendRun(record.run)
      }

      expect(repository.latest(webEvidence.records[0]!.founderId)).toHaveLength(
        5,
      )
      expect(
        repository.latest(webEvidence.records[64]!.founderId),
      ).toHaveLength(3)
      expect(
        repository.latest(webEvidence.records[96]!.founderId),
      ).toHaveLength(0)
    } finally {
      database.close()
    }
  })

  it('ships four complete saved-plan histories that validate through Task 8 contracts', () => {
    const { seatingPlans } = buildDemoFixtureBundle()
    const expected = new Map([
      ['three-tables', { founders: 24, tables: 3, versions: 3 }],
      ['five-tables', { founders: 40, tables: 5, versions: 4 }],
      ['uneven-five-tables', { founders: 48, tables: 5, versions: 3 }],
      ['twenty-tables', { founders: 160, tables: 20, versions: 5 }],
    ])

    expect(seatingPlans.configurations).toHaveLength(4)
    expect(
      new Set(seatingPlans.configurations.map((plan) => plan.scenario)),
    ).toEqual(new Set(expected.keys()))

    for (const plan of seatingPlans.configurations) {
      const counts = expected.get(plan.scenario)
      expect(counts).toBeDefined()
      expect(plan.versions).toHaveLength(counts!.versions)
      expect(plan.latestVersion).toBe(counts!.versions)
      expect(plan.updatedAt).toBe(plan.versions.at(-1)!.savedAt)
      expect(plan.versions.map((version) => version.version)).toEqual(
        Array.from({ length: counts!.versions }, (_, index) => index + 1),
      )
      expect(
        plan.versions.every(
          (version, index) =>
            index === 0 ||
            Date.parse(version.savedAt) >
              Date.parse(plan.versions[index - 1]!.savedAt),
        ),
      ).toBe(true)

      for (const [versionIndex, version] of plan.versions.entries()) {
        const state = DinnerStateSchema.parse(version.state)
        const request = {
          name: version.name,
          note: version.note,
          state,
        }
        if (versionIndex === 0) {
          expect(CreateDinnerRequestSchema.parse(request)).toEqual(request)
        } else {
          expect(AppendDinnerVersionRequestSchema.parse(request)).toEqual(
            request,
          )
        }

        expect(state.cohort.founderIds).toHaveLength(counts!.founders)
        expect(state.assignments).toHaveLength(counts!.tables)
        expect(state.criteria.criteria.length).toBeGreaterThanOrEqual(3)
        expect(state.rules.length).toBeGreaterThanOrEqual(5)
        expect(state.locks.length).toBeGreaterThanOrEqual(2)
        expect(state.alternatives).toHaveLength(3)
        expect(state.metrics).not.toBeNull()
        expect(state.notes.length).toBeGreaterThanOrEqual(3)

        const seated = state.assignments.flatMap((table) => table.founderIds)
        expect(sorted(seated)).toEqual(sorted(state.cohort.founderIds))
        expect(new Set(seated).size).toBe(seated.length)

        for (const alternative of state.alternatives) {
          const alternativeIds = alternative.tables.flatMap(
            (table) => table.founderIds,
          )
          expect(sorted(alternativeIds)).toEqual(
            sorted(state.cohort.founderIds),
          )
          expect(new Set(alternativeIds).size).toBe(alternativeIds.length)
        }
      }
    }

    const uneven = seatingPlans.configurations.find(
      (plan) => plan.scenario === 'uneven-five-tables',
    )!
    expect(
      uneven.versions.at(-1)!.state.assignments.map((table) => table.capacity),
    ).toEqual([10, 10, 10, 9, 9])
  })

  it('keeps every fixture reference inside the synthetic cohort', () => {
    const { founders, seatingPlans, webEvidence } = buildDemoFixtureBundle()
    const founderIds = new Set(founders.map((founder) => founder.Id))

    for (const evidence of webEvidence.records) {
      expect(founderIds.has(evidence.founderId)).toBe(true)
    }

    for (const plan of seatingPlans.configurations) {
      for (const version of plan.versions) {
        expect(
          version.state.cohort.founderIds.every((id) => founderIds.has(id)),
        ).toBe(true)
      }
    }
  })

  it('keeps every generated solution consistent with its synthetic hard rules', () => {
    const { founders, seatingPlans } = buildDemoFixtureBundle()
    const foundersById = new Map(
      founders.map((founder) => [founder.Id, founder]),
    )

    for (const plan of seatingPlans.configurations) {
      for (const version of plan.versions) {
        const state = version.state
        const mustSit = state.rules.find(
          (rule) => rule.type === 'must-sit-together',
        )
        const cannotSit = state.rules.find(
          (rule) => rule.type === 'cannot-sit-together',
        )
        const solutions = [
          state.assignments,
          ...state.alternatives.map((alternative) => alternative.tables),
        ]

        for (const tables of solutions) {
          const tableByFounder = new Map(
            tables.flatMap((table) =>
              table.founderIds.map((founderId) => [
                founderId,
                table.index,
              ] as const),
            ),
          )

          for (const table of tables) {
            const companies = table.founderIds.map(
              (founderId) => foundersById.get(founderId)!.Company,
            )
            expect(new Set(companies).size).toBe(companies.length)
            expect(
              table.founderIds.some(
                (founderId) =>
                  foundersById.get(founderId)!.Role === 'Engineering',
              ),
            ).toBe(true)
          }

          expect(
            mustSit!.founderIds.map((id) => tableByFounder.get(id)),
          ).toEqual([
            tableByFounder.get(mustSit!.founderIds[0]!),
            tableByFounder.get(mustSit!.founderIds[0]!),
          ])
          expect(tableByFounder.get(cannotSit!.founderIds[0]!)).not.toBe(
            tableByFounder.get(cannotSit!.founderIds[1]!),
          )
        }
      }
    }
  })

  it('documents the fixture scenarios and screenshot uses in the manifest', () => {
    const { manifest } = buildDemoFixtureBundle()

    expect(manifest.synthetic).toBe(true)
    expect(manifest.counts).toEqual({
      founders: 160,
      evidenceRecords: 160,
      evidenceResults: 416,
      seatingPlans: 4,
      seatingPlanVersions: 15,
    })
    expect(manifest.scenarios.map((scenario) => scenario.id)).toEqual([
      'founder-cohort',
      'web-evidence',
      'saved-seating-plans',
    ])
    expect(
      manifest.scenarios.flatMap((scenario) => scenario.screenshotUses),
    ).toEqual(
      expect.arrayContaining([
        'Search results — Grid view',
        'Seating Plans populated index',
        'Analysis view',
        'Founder web evidence',
        'Responsive mobile Tables view',
      ]),
    )
  })
})
