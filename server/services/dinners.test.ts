import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { SavedDinnerSchema } from '../../src/shared/dinnerContracts.js'
import { normalizeFounders } from '../../src/shared/founder.js'
import {
  buildDinnerState,
  buildDraftDinnerState,
} from '../../src/test/dinnerStateFixture.js'
import { createDatabase, type SqliteDatabase } from '../database.js'
import { DinnerRepository } from '../repositories/dinners.js'
import { RepositoryError } from '../repositories/errors.js'
import { FounderRepository } from '../repositories/founders.js'
import { DinnerService, DinnerServiceError } from './dinners.js'

const founders = normalizeFounders(
  JSON.parse(
    readFileSync(resolve(process.cwd(), 'src/founders.json'), 'utf8'),
  ) as unknown,
)
const cohort = founders.slice(0, 6)
const cohortIds = cohort.map((founder) => founder.id)

describe('DinnerService', () => {
  let database: SqliteDatabase
  let dinners: DinnerRepository
  let service: DinnerService
  let clock: number

  beforeEach(() => {
    database = createDatabase({ filename: ':memory:' })
    new FounderRepository(database).saveAll(founders)
    dinners = new DinnerRepository(database)
    clock = Date.parse('2026-10-01T12:00:00.000Z')
    service = new DinnerService({
      dinners,
      founders: new FounderRepository(database),
      now: () => {
        clock += 60_000
        return new Date(clock)
      },
    })
  })

  afterEach(() => {
    if (database.open) {
      database.close()
    }
  })

  it('saves a complete dinner and reopens it unchanged', () => {
    const state = buildDinnerState(cohortIds)

    const created = service.create({
      name: 'AI Infrastructure Dinner',
      note: 'First pass',
      state,
    })
    const reopened = service.get(created.id)

    expect(SavedDinnerSchema.parse(reopened)).toEqual(reopened)
    expect(reopened).toEqual(created)
    expect(reopened).toMatchObject({
      name: 'AI Infrastructure Dinner',
      note: 'First pass',
      version: 1,
      latestVersion: 1,
      status: 'ready',
      createdAt: '2026-10-01T12:01:00.000Z',
      savedAt: '2026-10-01T12:01:00.000Z',
      recovery: {
        status: 'complete',
        savedFounderCount: 6,
        restoredFounderCount: 6,
        missingFounders: [],
      },
    })
    expect(reopened.state).toEqual(state)
  })

  it('stores a server-derived founder directory with each version', () => {
    const created = service.create({
      name: 'Directory',
      state: buildDinnerState(cohortIds),
    })

    const snapshot = dinners.getLatestVersion(created.id).snapshot as {
      founderDirectory: unknown
    }
    expect(snapshot.founderDirectory).toEqual(
      cohort.map(({ id, name, company, role }) => ({ id, name, company, role })),
    )
  })

  it('rejects unknown founders without storing anything', () => {
    const state = buildDinnerState([...cohortIds.slice(0, 5), 'not-a-founder'])

    let caught: unknown
    try {
      service.create({ name: 'Unknown', state })
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(DinnerServiceError)
    expect(caught).toMatchObject({
      code: 'unknown_founders',
      details: { founderIds: ['not-a-founder'] },
    })
    expect(service.list()).toEqual([])
  })

  it('rejects invalid dinner state with validation details', () => {
    const state = { ...buildDinnerState(cohortIds), threshold: 140 }

    expect(() => service.create({ name: 'Invalid', state })).toThrow(
      expect.objectContaining({ code: 'invalid_dinner' }),
    )
  })

  it('appends versions while keeping earlier versions readable', () => {
    const first = service.create({
      name: 'Draft dinner',
      state: buildDraftDinnerState(cohortIds),
    })
    const assigned = buildDinnerState(cohortIds)

    const second = service.appendVersion(first.id, {
      note: 'Generated tables',
      state: assigned,
    })
    const renamed = service.appendVersion(first.id, {
      name: 'Final dinner',
      state: assigned,
    })

    expect(second).toMatchObject({ version: 2, name: 'Draft dinner', status: 'ready' })
    expect(renamed).toMatchObject({ version: 3, latestVersion: 3, name: 'Final dinner', note: null })
    expect(service.get(first.id, 1)).toMatchObject({
      version: 1,
      latestVersion: 3,
      name: 'Draft dinner',
      status: 'draft',
      state: buildDraftDinnerState(cohortIds),
    })
    expect(service.get(first.id).state).toEqual(assigned)
    expect(service.listVersions(first.id)).toEqual([
      expect.objectContaining({ version: 3, name: 'Final dinner', status: 'ready', founderCount: 6, tableCount: 2 }),
      expect.objectContaining({ version: 2, name: 'Draft dinner', note: 'Generated tables' }),
      expect.objectContaining({ version: 1, status: 'draft', tableCount: null }),
    ])
    expect(service.get(first.id).createdAt).toBe(first.createdAt)
  })

  it('reports missing founders as a recovery warning without changing the saved dinner', () => {
    const state = buildDinnerState(cohortIds)
    const created = service.create({ name: 'Recovery', state })
    const before = dinners.getLatestVersion(created.id)
    const missing = cohort[2]!
    database.prepare('DELETE FROM founders WHERE id = ?').run(missing.id)

    const reopened = service.get(created.id)

    expect(reopened.state).toEqual(state)
    expect(reopened.status).toBe('needs_attention')
    expect(reopened.recovery).toEqual({
      status: 'missing_founders',
      savedFounderCount: 6,
      restoredFounderCount: 5,
      missingFounders: [
        {
          founderId: missing.id,
          name: missing.name,
          company: missing.company,
          role: missing.role,
          tableIndex: 0,
          seatIndex: 2,
          locked: true,
        },
      ],
    })
    expect(dinners.getLatestVersion(created.id)).toEqual(before)
    expect(dinners.listVersions(created.id)).toHaveLength(1)
    expect(service.list()).toEqual([
      expect.objectContaining({
        id: created.id,
        status: 'needs_attention',
        missingFounderCount: 1,
      }),
    ])
  })

  it('refuses to save a version that still references a missing founder', () => {
    const created = service.create({
      name: 'Recovery',
      state: buildDinnerState(cohortIds),
    })
    database.prepare('DELETE FROM founders WHERE id = ?').run(cohortIds[0])

    expect(() =>
      service.appendVersion(created.id, { state: buildDinnerState(cohortIds) }),
    ).toThrow(expect.objectContaining({ code: 'unknown_founders' }))
    expect(service.get(created.id).latestVersion).toBe(1)
  })

  it('lists saved dinners newest first with draft and ready status', () => {
    const draft = service.create({
      name: 'Draft',
      state: buildDraftDinnerState(cohortIds),
    })
    const ready = service.create({
      name: 'Ready',
      state: buildDinnerState(cohortIds),
    })

    expect(service.list()).toEqual([
      {
        id: ready.id,
        name: 'Ready',
        status: 'ready',
        founderCount: 6,
        tableCount: 2,
        latestVersion: 1,
        missingFounderCount: 0,
        createdAt: ready.createdAt,
        updatedAt: ready.updatedAt,
      },
      expect.objectContaining({ id: draft.id, status: 'draft', tableCount: null }),
    ])
  })

  it('reports unknown dinners and versions as not found', () => {
    expect(() => service.get('missing')).toThrow(RepositoryError)
    const created = service.create({
      name: 'Only version',
      state: buildDraftDinnerState(cohortIds),
    })
    expect(() => service.get(created.id, 2)).toThrow(
      expect.objectContaining({ code: 'not_found' }),
    )
    expect(() =>
      service.appendVersion('missing', { state: buildDraftDinnerState(cohortIds) }),
    ).toThrow(expect.objectContaining({ code: 'not_found' }))
  })

  it('fails explicitly when a stored version is unreadable', () => {
    const created = service.create({
      name: 'Corrupt',
      state: buildDinnerState(cohortIds),
    })
    database
      .prepare('UPDATE dinner_versions SET snapshot_json = ? WHERE configuration_id = ?')
      .run(JSON.stringify({ formatVersion: 1, state: { cohort: 'broken' } }), created.id)

    expect(() => service.get(created.id)).toThrow(
      expect.objectContaining({ code: 'saved_dinner_unreadable' }),
    )
  })
})
