import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  AppendDinnerVersionRequestSchema,
  CreateDinnerRequestSchema,
  DinnerStateSchema,
  SavedDinnerSchema,
} from '../../shared/dinnerContracts.js'
import { normalizeFounders } from '../../shared/founder.js'
import {
  buildDemoFixtureBundle,
  DEMO_FIXTURE_FILE_NAMES,
  renderDemoFixtureFiles,
} from '../../../scripts/generate-demo-fixtures.js'
import { createDatabase } from '../../../server/database.js'
import { DinnerRepository } from '../../../server/repositories/dinners.js'
import { FounderRepository } from '../../../server/repositories/founders.js'
import { WebResultsRepository } from '../../../server/repositories/webResults.js'
import { DinnerService } from '../../../server/services/dinners.js'

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
    const { founders, manifest, webEvidence } = buildDemoFixtureBundle()
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
              result.staleAfter === manifest.freshEvidenceStaleAfter,
          ),
        ).toBe(true)
        expect(
          record.run.results.every(
            (result) =>
              Date.parse(result.staleAfter) >
              Date.parse('2050-01-01T00:00:00.000Z'),
          ),
        ).toBe(true)
      } else if (record.state === 'stale') {
        expect(record.run.results).toHaveLength(3)
        expect(
          record.run.results.every(
            (result) =>
              Date.parse(result.staleAfter) <
              Date.parse(manifest.demoReferenceTime),
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
        expect(result.title.toLowerCase()).not.toContain('synthetic')
        expect(result.snippet.toLowerCase()).not.toContain('synthetic')
        expect(`${result.title} ${result.snippet}`).not.toContain('->')
        expect(result.title).toMatch(/[A-Z][A-Za-z]+/)
        expect(result.snippet.length).toBeGreaterThan(80)
        expect(result.snippet).toMatch(/\b(founder|company|startup|platform|customers|market|team)\b/i)
      }
    }
  })

  it('round trips all five evidence states through listRuns query context', () => {
    const { founders, manifest, webEvidence } = buildDemoFixtureBundle()
    const database = createDatabase({ filename: ':memory:' })

    try {
      new FounderRepository(database).saveAll(normalizeFounders(founders))
      const repository = new WebResultsRepository(database)

      for (const record of webEvidence.records) {
        repository.appendRun(record.run)
      }

      for (const recordIndex of [0, 64, 96, 120, 144]) {
        const record = webEvidence.records[recordIndex]!
        const [stored] = repository.listRuns(record.founderId)
        const queryContext = stored!.queryContext as {
          demoReferenceTime: string
          demoEvidence: {
            state: string
            unsupportedReason?: string
            summary?: string
            error?: {
              code: string
              message: string
              retryable: boolean
            }
          }
        }

        expect(queryContext.demoReferenceTime).toBe(
          manifest.demoReferenceTime,
        )
        expect(queryContext.demoEvidence.state).toBe(record.state)
        expect(queryContext.demoEvidence.unsupportedReason).toBe(
          record.unsupportedReason,
        )
        expect(queryContext.demoEvidence.summary).toBe(record.summary)
        expect(queryContext.demoEvidence.error).toEqual(record.error)
        expect(stored!.results).toEqual(
          record.run.results.map((result) => ({
            ...result,
            runId: record.run.id,
            founderId: record.founderId,
          })),
        )
      }
    } finally {
      database.close()
    }
  })

  it('seeds and reopens every saved plan through DinnerRepository and DinnerService', () => {
    const { founders, seatingPlans } = buildDemoFixtureBundle()
    const database = createDatabase({ filename: ':memory:' })

    try {
      const founderRepository = new FounderRepository(database)
      founderRepository.saveAll(normalizeFounders(founders))
      const dinnerRepository = new DinnerRepository(database)
      const service = new DinnerService({
        dinners: dinnerRepository,
        founders: founderRepository,
      })

      for (const configuration of seatingPlans.configurations) {
        dinnerRepository.saveConfiguration(configuration)
      }
      for (const version of seatingPlans.versions) {
        dinnerRepository.appendVersion(version)
      }

      const listed = service.list()
      expect(new Set(listed.map((dinner) => dinner.id))).toEqual(
        new Set(
          seatingPlans.scenarios.map((scenario) => scenario.configurationId),
        ),
      )
      for (const scenario of seatingPlans.scenarios) {
        const seedConfiguration = seatingPlans.configurations.find(
          (configuration) => configuration.id === scenario.configurationId,
        )!
        expect(
          dinnerRepository.getConfiguration(scenario.configurationId),
        ).toEqual(seedConfiguration)
        expect(
          dinnerRepository
            .listVersions(scenario.configurationId)
            .map((version) => version.version),
        ).toEqual(
          Array.from(
            { length: scenario.latestVersion },
            (_, index) => scenario.latestVersion - index,
          ),
        )
        expect(
          listed.find((dinner) => dinner.id === scenario.configurationId),
        ).toMatchObject({
          name: scenario.name,
          status: 'ready',
          founderCount: scenario.founderCount,
          tableCount: scenario.tableCount,
          latestVersion: scenario.latestVersion,
          missingFounderCount: 0,
        })

        const history = service.listVersions(scenario.configurationId)
        expect(history.map((version) => version.version)).toEqual(
          Array.from(
            { length: scenario.latestVersion },
            (_, index) => scenario.latestVersion - index,
          ),
        )

        for (const version of history) {
          const reopened = service.get(
            scenario.configurationId,
            version.version,
          )
          expect(SavedDinnerSchema.parse(reopened)).toEqual(reopened)
          expect(reopened.versionId).toBe(version.versionId)
          expect(reopened.state.cohort.founderIds).toHaveLength(
            scenario.founderCount,
          )
        }

        expect(service.get(scenario.configurationId)).toMatchObject({
          latestVersion: scenario.latestVersion,
          version: scenario.latestVersion,
          recovery: { status: 'complete', missingFounders: [] },
        })
      }
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

    expect(seatingPlans.scenarios).toHaveLength(4)
    expect(seatingPlans.configurations).toHaveLength(4)
    expect(seatingPlans.versions).toHaveLength(15)
    expect(
      new Set(seatingPlans.scenarios.map((plan) => plan.scenario)),
    ).toEqual(new Set(expected.keys()))

    for (const scenario of seatingPlans.scenarios) {
      const counts = expected.get(scenario.scenario)
      expect(counts).toBeDefined()
      const configuration = seatingPlans.configurations.find(
        (record) => record.id === scenario.configurationId,
      )!
      const versions = seatingPlans.versions.filter(
        (version) => version.configurationId === scenario.configurationId,
      )

      expect(configuration.founderIds).toHaveLength(counts!.founders)
      expect(configuration.configuration.summary).toEqual({
        founderCount: counts!.founders,
        tableCount: counts!.tables,
        assigned: true,
      })
      expect(versions).toHaveLength(counts!.versions)
      expect(scenario.latestVersion).toBe(counts!.versions)
      expect(configuration.createdAt).toBe(versions[0]!.createdAt)
      expect(configuration.updatedAt).toBe(versions.at(-1)!.createdAt)
      expect(versions.map((version) => version.version)).toEqual(
        Array.from({ length: counts!.versions }, (_, index) => index + 1),
      )
      expect(
        versions.every(
          (version, index) =>
            index === 0 ||
            Date.parse(version.createdAt) >
              Date.parse(versions[index - 1]!.createdAt),
        ),
      ).toBe(true)

      for (const [versionIndex, version] of versions.entries()) {
        const state = DinnerStateSchema.parse(version.snapshot.state)
        const request = {
          name: version.snapshot.name,
          note: version.snapshot.note,
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
        expect(version.snapshot.formatVersion).toBe(1)
        expect(version.snapshot.founderDirectory).toHaveLength(
          counts!.founders,
        )
        expect(
          version.snapshot.founderDirectory.map((founder) => founder.id),
        ).toEqual(state.cohort.founderIds)

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

    const uneven = seatingPlans.scenarios.find(
      (scenario) => scenario.scenario === 'uneven-five-tables',
    )!
    const unevenLatest = seatingPlans.versions.find(
      (version) =>
        version.configurationId === uneven.configurationId &&
        version.version === uneven.latestVersion,
    )!
    expect(
      unevenLatest.snapshot.state.assignments.map((table) => table.capacity),
    ).toEqual([10, 10, 10, 9, 9])
  })

  it('keeps every fixture reference inside the synthetic cohort', () => {
    const { founders, seatingPlans, webEvidence } = buildDemoFixtureBundle()
    const founderIds = new Set(founders.map((founder) => founder.Id))

    for (const evidence of webEvidence.records) {
      expect(founderIds.has(evidence.founderId)).toBe(true)
    }

    for (const configuration of seatingPlans.configurations) {
      expect(
        configuration.founderIds.every((id) => founderIds.has(id)),
      ).toBe(true)
    }
    for (const version of seatingPlans.versions) {
      expect(
        version.snapshot.state.cohort.founderIds.every((id) =>
          founderIds.has(id),
        ),
      ).toBe(true)
    }
  })

  it('keeps every generated solution consistent with its synthetic hard rules', () => {
    const { founders, seatingPlans } = buildDemoFixtureBundle()
    const foundersById = new Map(
      founders.map((founder) => [founder.Id, founder]),
    )

    for (const version of seatingPlans.versions) {
      const state = version.snapshot.state
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
  })

  it('documents the fixture scenarios and screenshot uses in the manifest', () => {
    const { manifest } = buildDemoFixtureBundle()

    expect(manifest.synthetic).toBe(true)
    expect(manifest.demoReferenceTime).toBe('2026-10-01T20:00:00.000Z')
    expect(manifest.freshEvidenceStaleAfter).toBe(
      '2099-12-31T00:00:00.000Z',
    )
    expect(Date.parse(manifest.freshEvidenceStaleAfter)).toBeGreaterThan(
      Date.parse('2050-01-01T00:00:00.000Z'),
    )
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
