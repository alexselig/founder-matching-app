import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { normalizeFounders, type Founder } from '../../src/shared/founder.js'
import { createDatabase, type SqliteDatabase } from '../database.js'
import { DinnerRepository } from './dinners.js'
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

  it('rejects duplicate append-only enrichment runs as conflicts', () => {
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

  it('persists saved dinner configurations with append-only versions', () => {
    const configuration = {
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
