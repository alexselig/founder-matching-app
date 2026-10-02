import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { normalizeFounders } from '../../src/shared/founder.js'
import { createDatabase, type SqliteDatabase } from '../database.js'
import {
  DinnerRepository,
  type DinnerConfiguration,
} from './dinners.js'
import { RepositoryError } from './errors.js'
import { FounderRepository } from './founders.js'

const founders = normalizeFounders(
  JSON.parse(
    readFileSync(resolve(process.cwd(), 'src/founders.json'), 'utf8'),
  ) as unknown,
)

function expectRepositoryError(
  action: () => unknown,
  code: RepositoryError['code'],
) {
  let caught: unknown
  try {
    action()
  } catch (error) {
    caught = error
  }
  expect(caught).toBeInstanceOf(RepositoryError)
  expect((caught as RepositoryError).code).toBe(code)
}

function configuration(
  overrides: Partial<DinnerConfiguration> = {},
): DinnerConfiguration {
  return {
    id: 'dinner-a',
    name: 'AI Infrastructure Dinner',
    founderIds: ['f-1', 'f-2'],
    configuration: { formatVersion: 1, summary: { founderCount: 2 } },
    createdAt: '2026-10-01T12:00:00.000Z',
    updatedAt: '2026-10-01T12:00:00.000Z',
    ...overrides,
  }
}

describe('DinnerRepository saved-dinner versions', () => {
  let database: SqliteDatabase
  let repository: DinnerRepository

  beforeEach(() => {
    database = createDatabase({ filename: ':memory:' })
    repository = new DinnerRepository(database)
  })

  afterEach(() => {
    if (database.open) {
      database.close()
    }
  })

  it('creates a configuration and its first version together', () => {
    const version = repository.createWithFirstVersion(configuration(), {
      id: 'version-a1',
      snapshot: { state: 'one' },
      createdAt: '2026-10-01T12:00:00.000Z',
    })

    expect(version).toEqual({
      id: 'version-a1',
      configurationId: 'dinner-a',
      version: 1,
      snapshot: { state: 'one' },
      createdAt: '2026-10-01T12:00:00.000Z',
    })
    expect(repository.getConfiguration('dinner-a')).toEqual(configuration())
    expect(repository.getLatestVersion('dinner-a')).toEqual(version)
  })

  it('rejects a duplicate dinner ID without leaving a partial version', () => {
    repository.createWithFirstVersion(configuration(), {
      id: 'version-a1',
      snapshot: { state: 'one' },
      createdAt: '2026-10-01T12:00:00.000Z',
    })

    expectRepositoryError(
      () =>
        repository.createWithFirstVersion(
          configuration({ name: 'Replacement' }),
          {
            id: 'version-a1-duplicate',
            snapshot: { state: 'replacement' },
            createdAt: '2026-10-01T12:00:00.000Z',
          },
        ),
      'conflict',
    )
    expect(repository.getConfiguration('dinner-a').name).toBe(
      'AI Infrastructure Dinner',
    )
    expect(repository.listVersions('dinner-a')).toHaveLength(1)
  })

  it('rolls back the configuration when the first version cannot be stored', () => {
    repository.createWithFirstVersion(configuration(), {
      id: 'version-shared',
      snapshot: { state: 'one' },
      createdAt: '2026-10-01T12:00:00.000Z',
    })

    expectRepositoryError(
      () =>
        repository.createWithFirstVersion(configuration({ id: 'dinner-b' }), {
          id: 'version-shared',
          snapshot: { state: 'two' },
          createdAt: '2026-10-01T12:00:00.000Z',
        }),
      'conflict',
    )
    expectRepositoryError(
      () => repository.getConfiguration('dinner-b'),
      'not_found',
    )
  })

  it('assigns monotonically increasing versions and updates the configuration', () => {
    repository.createWithFirstVersion(configuration(), {
      id: 'version-a1',
      snapshot: { state: 'one' },
      createdAt: '2026-10-01T12:00:00.000Z',
    })

    const second = repository.appendNextVersion({
      id: 'version-a2',
      configurationId: 'dinner-a',
      name: 'Renamed Dinner',
      founderIds: ['f-1', 'f-2', 'f-3'],
      configuration: { formatVersion: 1, summary: { founderCount: 3 } },
      snapshot: { state: 'two' },
      createdAt: '2026-10-02T08:00:00.000Z',
    })
    const third = repository.appendNextVersion({
      id: 'version-a3',
      configurationId: 'dinner-a',
      name: 'Renamed Dinner',
      founderIds: ['f-1', 'f-2', 'f-3'],
      configuration: { formatVersion: 1, summary: { founderCount: 3 } },
      snapshot: { state: 'three' },
      createdAt: '2026-10-03T08:00:00.000Z',
    })

    expect(second.version).toBe(2)
    expect(third.version).toBe(3)
    expect(repository.getConfiguration('dinner-a')).toEqual({
      id: 'dinner-a',
      name: 'Renamed Dinner',
      founderIds: ['f-1', 'f-2', 'f-3'],
      configuration: { formatVersion: 1, summary: { founderCount: 3 } },
      createdAt: '2026-10-01T12:00:00.000Z',
      updatedAt: '2026-10-03T08:00:00.000Z',
    })
    expect(repository.getVersion('dinner-a', 2).snapshot).toEqual({
      state: 'two',
    })
    expect(repository.getLatestVersion('dinner-a')).toEqual(third)
    expect(repository.listVersions('dinner-a').map((entry) => entry.version)).toEqual([3, 2, 1])
  })

  it('leaves the configuration unchanged when appending fails', () => {
    repository.createWithFirstVersion(configuration(), {
      id: 'version-a1',
      snapshot: { state: 'one' },
      createdAt: '2026-10-01T12:00:00.000Z',
    })

    expectRepositoryError(
      () =>
        repository.appendNextVersion({
          id: 'version-a1',
          configurationId: 'dinner-a',
          name: 'Should Not Apply',
          founderIds: ['f-9'],
          configuration: {},
          snapshot: {},
          createdAt: '2026-10-02T08:00:00.000Z',
        }),
      'conflict',
    )
    expect(repository.getConfiguration('dinner-a')).toEqual(configuration())
  })

  it('reports missing dinners and versions as not found', () => {
    expectRepositoryError(
      () =>
        repository.appendNextVersion({
          id: 'version-x',
          configurationId: 'missing',
          name: 'Missing',
          founderIds: [],
          configuration: {},
          snapshot: {},
          createdAt: '2026-10-02T08:00:00.000Z',
        }),
      'not_found',
    )
    expectRepositoryError(() => repository.getLatestVersion('missing'), 'not_found')
    repository.createWithFirstVersion(configuration(), {
      id: 'version-a1',
      snapshot: {},
      createdAt: '2026-10-01T12:00:00.000Z',
    })
    expectRepositoryError(() => repository.getVersion('dinner-a', 2), 'not_found')
  })

  it('validates inputs before touching SQLite', () => {
    database.close()

    expectRepositoryError(
      () =>
        repository.createWithFirstVersion(
          configuration({ founderIds: new Array<string>(2) }),
          { id: 'v', snapshot: {}, createdAt: '2026-10-01T12:00:00.000Z' },
        ),
      'invalid_data',
    )
    expectRepositoryError(
      () =>
        repository.appendNextVersion({
          id: '',
          configurationId: 'dinner-a',
          name: 'Name',
          founderIds: [],
          configuration: {},
          snapshot: {},
          createdAt: '2026-10-02T08:00:00.000Z',
        }),
      'invalid_data',
    )
    expectRepositoryError(() => repository.getVersion('dinner-a', 0), 'invalid_data')
  })

  it('lists configurations with their latest version, most recently updated first', () => {
    repository.createWithFirstVersion(configuration(), {
      id: 'version-a1',
      snapshot: {},
      createdAt: '2026-10-01T12:00:00.000Z',
    })
    repository.createWithFirstVersion(
      configuration({
        id: 'dinner-b',
        name: 'Second',
        createdAt: '2026-10-01T13:00:00.000Z',
        updatedAt: '2026-10-01T13:00:00.000Z',
      }),
      { id: 'version-b1', snapshot: {}, createdAt: '2026-10-01T13:00:00.000Z' },
    )
    repository.appendNextVersion({
      id: 'version-a2',
      configurationId: 'dinner-a',
      name: 'First',
      founderIds: ['f-1'],
      configuration: {},
      snapshot: {},
      createdAt: '2026-10-02T08:00:00.000Z',
    })

    expect(
      repository.listConfigurations().map((entry) => [
        entry.id,
        entry.name,
        entry.latestVersion,
      ]),
    ).toEqual([
      ['dinner-a', 'First', 2],
      ['dinner-b', 'Second', 1],
    ])
  })
})

describe('FounderRepository.getMany', () => {
  let database: SqliteDatabase
  let repository: FounderRepository

  beforeEach(() => {
    database = createDatabase({ filename: ':memory:' })
    repository = new FounderRepository(database)
    repository.saveAll(founders)
  })

  afterEach(() => {
    if (database.open) {
      database.close()
    }
  })

  it('returns stored founders by ID and omits unknown IDs', () => {
    const ids = [founders[3]!.id, 'unknown-founder', founders[0]!.id]

    const found = repository.getMany(ids)

    expect([...found.keys()]).toEqual([founders[3]!.id, founders[0]!.id])
    expect(found.get(founders[0]!.id)).toEqual(founders[0])
  })

  it('reads more IDs than a single SQLite statement can bind', () => {
    const ids = [
      ...founders.map((founder) => founder.id),
      ...Array.from({ length: 1000 }, (_, index) => `missing-${index}`),
    ]

    expect(repository.getMany(ids).size).toBe(founders.length)
  })

  it('validates IDs before touching SQLite', () => {
    database.close()

    expectRepositoryError(() => repository.getMany(['ok', '']), 'invalid_data')
    expectRepositoryError(
      () => repository.getMany(new Array<string>(2)),
      'invalid_data',
    )
  })
})
