import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { normalizeFounders, type Founder } from '../../src/shared/founder.js'
import {
  createDatabase,
  type DatabaseOptions,
  type SqliteDatabase,
} from '../database.js'
import {
  DinnerRepository,
  type DinnerConfiguration,
  type DinnerVersion,
} from './dinners.js'
import { RepositoryError } from './errors.js'
import { FounderRepository } from './founders.js'
import {
  WebResultsRepository,
  type WebEnrichmentRun,
} from './webResults.js'

const fixturePath = resolve(process.cwd(), 'src/founders.json')
const founders = normalizeFounders(
  JSON.parse(readFileSync(fixturePath, 'utf8')) as unknown,
)

function makeRun(
  founderId: string,
  id: string,
  retrievedAt: string,
): WebEnrichmentRun {
  return {
    id,
    founderId,
    queryFingerprint: `fingerprint-${id}`,
    provider: 'fixture',
    retrievedAt,
    results: Array.from({ length: 5 }, (_, index) => ({
      rank: index + 1,
      classification: index % 2 === 0 ? 'both' : 'founder',
      title: `${id} result ${index + 1}`,
      url: `https://example.test/${id}/${index + 1}`,
      domain: 'example.test',
      snippet: `Evidence ${index + 1} for ${founderId}`,
      provider: 'fixture',
      retrievedAt,
      confidence: 0.95 - index * 0.05,
      entityMatch: {
        founder: true,
        company: index % 2 === 0,
      },
    })),
  }
}

function makeDinnerConfiguration(): DinnerConfiguration {
  return {
    id: 'dinner-1',
    name: 'Founder Dinner',
    founderIds: founders.slice(0, 24).map((founder) => founder.id),
    configuration: {
      tableCount: 3,
      seatsPerTable: 8,
      criteria: [],
      rules: [],
      locks: [],
    },
    createdAt: '2026-10-01T12:00:00.000Z',
    updatedAt: '2026-10-01T12:00:00.000Z',
  }
}

function makeSparseArray<T>(value: T): T[] {
  const array = new Array<T>(2)
  array[1] = value
  return array
}

function expectRepositoryError(
  action: () => unknown,
  code: RepositoryError['code'],
) {
  try {
    action()
    throw new Error('Expected repository operation to throw')
  } catch (error) {
    expect(error).toBeInstanceOf(RepositoryError)
    expect((error as RepositoryError).code).toBe(code)
  }
}

describe('SQLite repositories', () => {
  let database: SqliteDatabase
  let founderRepository: FounderRepository
  let webResultsRepository: WebResultsRepository
  let dinnerRepository: DinnerRepository

  beforeEach(() => {
    database = createDatabase({ filename: ':memory:' })
    founderRepository = new FounderRepository(database)
    webResultsRepository = new WebResultsRepository(database)
    dinnerRepository = new DinnerRepository(database)
    founderRepository.saveAll(founders)
  })

  afterEach(() => {
    if (database.open) {
      database.close()
    }
  })

  it('requires callers to explicitly choose a database filename', () => {
    const createWithoutOptions = () => {
      const unconfiguredCreateDatabase = createDatabase as (
        options?: DatabaseOptions,
      ) => SqliteDatabase
      const unconfiguredDatabase = unconfiguredCreateDatabase()
      unconfiguredDatabase.close()
    }

    expect(createWithoutOptions).toThrow(
      'Database filename is required; use :memory: explicitly for ephemeral storage',
    )
  })

  it('creates the normalized V2 tables, FTS table, and required indexes', () => {
    const schemaObjects = database
      .prepare(
        `SELECT name, type
         FROM sqlite_master
         WHERE name IN (
           'founders',
           'founders_fts',
           'web_enrichment_runs',
           'web_results',
           'dinner_configurations',
           'dinner_versions',
           'idx_web_enrichment_runs_founder_id',
           'idx_web_enrichment_runs_query_fingerprint',
           'idx_web_results_retrieved_at'
         )
         ORDER BY name`,
      )
      .all() as Array<{ name: string; type: string }>

    expect(schemaObjects.map(({ name }) => name)).toEqual([
      'dinner_configurations',
      'dinner_versions',
      'founders',
      'founders_fts',
      'idx_web_enrichment_runs_founder_id',
      'idx_web_enrichment_runs_query_fingerprint',
      'idx_web_results_retrieved_at',
      'web_enrichment_runs',
      'web_results',
    ])
    expect(
      database.pragma('foreign_keys', { simple: true }),
    ).toBe(1)
  })

  it('persists and restores all 574 authoritative founders without merging web evidence', () => {
    expect(founderRepository.list()).toHaveLength(574)

    const sourceFounder = founders.find(
      (founder) => founder.id === '343105',
    ) as Founder
    const storedFounder = founderRepository.get(sourceFounder.id)

    expect(storedFounder).toEqual(sourceFounder)
    expect(storedFounder).not.toHaveProperty('webResults')
    expect(storedFounder).not.toHaveProperty('web_results')
  })

  it.each([
    {
      label: 'null collection',
      input: null,
    },
    {
      label: 'non-array collection',
      input: { founder: founders[0] },
    },
    {
      label: 'null founder object',
      input: [null],
    },
  ])('rejects a malformed founder $label as invalid_data', ({ input }) => {
    expectRepositoryError(
      () =>
        founderRepository.saveAll(
          input as unknown as readonly Founder[],
        ),
      'invalid_data',
    )
  })

  it('validates every required founder field before persistence', () => {
    const requiredFields = [
      'id',
      'name',
      'cohortGroup',
      'cohortSection',
      'companyVertical',
      'companyVerticalLevels',
      'company',
      'age',
      'education',
      'role',
      'searchName',
      'raw',
    ] as const

    for (const field of requiredFields) {
      const malformed = {
        ...founders[0]!,
      } as unknown as Record<string, unknown>
      delete malformed[field]

      expectRepositoryError(
        () =>
          founderRepository.saveAll([
            malformed as unknown as Founder,
          ]),
        'invalid_data',
      )
    }
  })

  it('rejects sparse founder collections and company vertical levels', () => {
    expectRepositoryError(
      () =>
        founderRepository.saveAll(
          makeSparseArray(founders[0]!),
        ),
      'invalid_data',
    )

    expectRepositoryError(
      () =>
        founderRepository.saveAll([
          {
            ...founders[0]!,
            companyVerticalLevels: makeSparseArray('B2B Software'),
          },
        ]),
      'invalid_data',
    )
  })

  it('returns a not_found error for an unknown founder', () => {
    expectRepositoryError(
      () => founderRepository.get('missing-founder'),
      'not_found',
    )
  })

  it('surfaces founder storage failures instead of returning an empty list', () => {
    database.close()

    expectRepositoryError(
      () => founderRepository.list(),
      'storage_failure',
    )
  })

  it('keeps only the latest run evidence in latest and orders run history newest first', () => {
    const founderId = founders[0]!.id
    const firstRun = makeRun(
      founderId,
      'run-first',
      '2026-10-01T10:00:00.000Z',
    )
    const secondRun = makeRun(
      founderId,
      'run-second',
      '2026-10-01T11:00:00.000Z',
    )

    webResultsRepository.appendRun(firstRun)
    webResultsRepository.appendRun(secondRun)

    expect(webResultsRepository.latest(founderId)).toHaveLength(5)
    expect(
      webResultsRepository.latest(founderId).map((result) => result.runId),
    ).toEqual(Array(5).fill(secondRun.id))
    expect(
      webResultsRepository.listRuns(founderId).map((run) => run.id),
    ).toEqual([secondRun.id, firstRun.id])
    expect(founderRepository.get(founderId)).toEqual(founders[0])
  })

  it('returns empty enrichment collections only for existing founders without runs', () => {
    const founderId = founders[0]!.id

    expect(webResultsRepository.latest(founderId)).toEqual([])
    expect(webResultsRepository.listRuns(founderId)).toEqual([])
  })

  it('returns not_found for enrichment reads for an unknown founder', () => {
    expectRepositoryError(
      () => webResultsRepository.latest('missing-founder'),
      'not_found',
    )
    expectRepositoryError(
      () => webResultsRepository.listRuns('missing-founder'),
      'not_found',
    )
  })

  it('normalizes enrichment timestamps to UTC before chronological ordering', () => {
    const founderId = founders[0]!.id
    const laterOffsetRun = makeRun(
      founderId,
      'run-offset-later',
      '2026-10-01T12:00:00-07:00',
    )
    const earlierUtcRun = makeRun(
      founderId,
      'run-utc-earlier',
      '2026-10-01T18:30:00.000Z',
    )

    webResultsRepository.appendRun(laterOffsetRun)
    webResultsRepository.appendRun(earlierUtcRun)

    expect(
      webResultsRepository.latest(founderId).map((result) => result.runId),
    ).toEqual(Array(5).fill(laterOffsetRun.id))
    expect(
      webResultsRepository
        .latest(founderId)
        .map((result) => result.retrievedAt),
    ).toEqual(Array(5).fill('2026-10-01T19:00:00.000Z'))
    expect(
      webResultsRepository.listRuns(founderId).map((run) => ({
        id: run.id,
        retrievedAt: run.retrievedAt,
      })),
    ).toEqual([
      {
        id: laterOffsetRun.id,
        retrievedAt: '2026-10-01T19:00:00.000Z',
      },
      {
        id: earlierUtcRun.id,
        retrievedAt: '2026-10-01T18:30:00.000Z',
      },
    ])
  })

  it('rejects enrichment runs with more than five evidence items', () => {
    const run = makeRun(
      founders[0]!.id,
      'run-too-large',
      '2026-10-01T12:00:00.000Z',
    )
    run.results.push({
      ...run.results[0]!,
      rank: 6,
      url: 'https://example.test/run-too-large/6',
    })

    expectRepositoryError(
      () => webResultsRepository.appendRun(run),
      'invalid_data',
    )
  })

  it.each([
    {
      label: 'result shape',
      mutate: (run: WebEnrichmentRun) => {
        ;(run.results as unknown[])[0] = null
      },
    },
    {
      label: 'classification',
      mutate: (run: WebEnrichmentRun) => {
        ;(
          run.results[0] as WebEnrichmentRun['results'][number] & {
            classification: string
          }
        ).classification = 'unsupported'
      },
    },
    {
      label: 'rank',
      mutate: (run: WebEnrichmentRun) => {
        run.results[0]!.rank = 0
      },
    },
    {
      label: 'confidence',
      mutate: (run: WebEnrichmentRun) => {
        run.results[0]!.confidence = 1.1
      },
    },
  ])('rejects invalid web result $label as invalid_data', ({ mutate }) => {
    const run = makeRun(
      founders[0]!.id,
      'run-invalid-data',
      '2026-10-01T12:00:00.000Z',
    )
    mutate(run)

    expectRepositoryError(
      () => webResultsRepository.appendRun(run),
      'invalid_data',
    )
  })

  it('rejects a non-object enrichment run as invalid_data', () => {
    expectRepositoryError(
      () =>
        webResultsRepository.appendRun(
          null as unknown as WebEnrichmentRun,
        ),
      'invalid_data',
    )
  })

  it('rejects sparse web result collections and nested metadata arrays', () => {
    const sparseResultsRun = makeRun(
      founders[0]!.id,
      'run-sparse-results',
      '2026-10-01T12:00:00.000Z',
    )
    sparseResultsRun.results = makeSparseArray(
      sparseResultsRun.results[0]!,
    )

    expectRepositoryError(
      () => webResultsRepository.appendRun(sparseResultsRun),
      'invalid_data',
    )

    const sparseMetadataRun = makeRun(
      founders[0]!.id,
      'run-sparse-metadata',
      '2026-10-01T12:00:00.000Z',
    )
    sparseMetadataRun.queryContext = {
      aliases: makeSparseArray('founder'),
    }

    expectRepositoryError(
      () => webResultsRepository.appendRun(sparseMetadataRun),
      'invalid_data',
    )
  })

  it('rejects duplicate append-only enrichment run IDs as conflicts', () => {
    const run = makeRun(
      founders[0]!.id,
      'run-conflict',
      '2026-10-01T12:00:00.000Z',
    )

    webResultsRepository.appendRun(run)

    expectRepositoryError(
      () => webResultsRepository.appendRun(run),
      'conflict',
    )
  })

  it('rejects duplicate enrichment ranks as conflicts', () => {
    const run = makeRun(
      founders[0]!.id,
      'run-rank-conflict',
      '2026-10-01T12:00:00.000Z',
    )
    run.results[1]!.rank = run.results[0]!.rank

    expectRepositoryError(
      () => webResultsRepository.appendRun(run),
      'conflict',
    )
  })

  it.each([
    {
      label: 'null configuration',
      configuration: null,
    },
    {
      label: 'non-object configuration',
      configuration: 'dinner',
    },
    {
      label: 'missing founder IDs',
      configuration: {
        ...makeDinnerConfiguration(),
        founderIds: undefined,
      },
    },
    {
      label: 'missing configuration payload',
      configuration: (() => {
        const configuration = {
          ...makeDinnerConfiguration(),
        } as unknown as Record<string, unknown>
        delete configuration.configuration
        return configuration
      })(),
    },
  ])(
    'rejects malformed dinner $label as invalid_data',
    ({ configuration }) => {
      expectRepositoryError(
        () =>
          dinnerRepository.saveConfiguration(
            configuration as unknown as DinnerConfiguration,
          ),
        'invalid_data',
      )
    },
  )

  it.each([
    {
      label: 'null version',
      version: null,
    },
    {
      label: 'non-object version',
      version: 'version',
    },
    {
      label: 'missing snapshot',
      version: {
        id: 'dinner-1-v1',
        configurationId: 'dinner-1',
        version: 1,
        createdAt: '2026-10-01T12:01:00.000Z',
      },
    },
  ])('rejects malformed dinner $label as invalid_data', ({ version }) => {
    expectRepositoryError(
      () =>
        dinnerRepository.appendVersion(
          version as unknown as DinnerVersion,
        ),
      'invalid_data',
    )
  })

  it('rejects sparse dinner founder IDs and nested payload arrays', () => {
    const sparseFounderIds = makeDinnerConfiguration()
    sparseFounderIds.founderIds = makeSparseArray(founders[0]!.id)

    expectRepositoryError(
      () => dinnerRepository.saveConfiguration(sparseFounderIds),
      'invalid_data',
    )

    const sparseConfiguration = makeDinnerConfiguration()
    sparseConfiguration.configuration = {
      criteria: makeSparseArray({ field: 'role' }),
    }

    expectRepositoryError(
      () => dinnerRepository.saveConfiguration(sparseConfiguration),
      'invalid_data',
    )

    const validConfiguration = makeDinnerConfiguration()
    dinnerRepository.saveConfiguration(validConfiguration)

    expectRepositoryError(
      () =>
        dinnerRepository.appendVersion({
          id: 'dinner-1-v-sparse',
          configurationId: validConfiguration.id,
          version: 1,
          snapshot: {
            assignments: makeSparseArray({
              tableId: 'table-1',
            }),
          },
          createdAt: '2026-10-01T12:01:00.000Z',
        }),
      'invalid_data',
    )
  })

  it('persists saved dinner configurations with append-only versions', () => {
    const configuration = makeDinnerConfiguration()

    dinnerRepository.saveConfiguration(configuration)
    dinnerRepository.appendVersion({
      id: 'dinner-1-v1',
      configurationId: configuration.id,
      version: 1,
      snapshot: {
        assignments: [],
        alternatives: [],
        selectedSolutionId: null,
      },
      createdAt: '2026-10-01T12:01:00.000Z',
    })
    dinnerRepository.appendVersion({
      id: 'dinner-1-v2',
      configurationId: configuration.id,
      version: 2,
      snapshot: {
        assignments: [{ tableId: 'table-1', founderIds: [] }],
        alternatives: [],
        selectedSolutionId: 'solution-2',
      },
      createdAt: '2026-10-01T12:02:00.000Z',
    })

    expect(dinnerRepository.getConfiguration(configuration.id)).toEqual(
      configuration,
    )
    expect(
      dinnerRepository
        .listVersions(configuration.id)
        .map((version) => version.version),
    ).toEqual([2, 1])
  })
})
