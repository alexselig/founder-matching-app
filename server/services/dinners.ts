import { randomUUID } from 'node:crypto'

import { z } from 'zod'

import {
  AppendDinnerVersionRequestSchema,
  CreateDinnerRequestSchema,
  DinnerStateSchema,
  type DinnerRecovery,
  type DinnerState,
  type DinnerStatus,
  type DinnerSummary,
  type DinnerVersionSummary,
  type MissingFounder,
  type SavedDinner,
} from '../../src/shared/dinnerContracts.js'
import type { DinnerRepository, DinnerVersion } from '../repositories/dinners.js'
import type { FounderRepository } from '../repositories/founders.js'

export type DinnerServiceErrorCode =
  | 'invalid_dinner'
  | 'unknown_founders'
  | 'saved_dinner_unreadable'

export class DinnerServiceError extends Error {
  constructor(
    message: string,
    readonly code: DinnerServiceErrorCode,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'DinnerServiceError'
  }
}

const SNAPSHOT_FORMAT_VERSION = 1

const FounderDirectoryEntrySchema = z
  .object({
    id: z.string(),
    name: z.string(),
    company: z.string(),
    role: z.string(),
  })
  .strict()
export type FounderDirectoryEntry = z.infer<typeof FounderDirectoryEntrySchema>

const DinnerSnapshotSchema = z
  .object({
    formatVersion: z.literal(SNAPSHOT_FORMAT_VERSION),
    name: z.string().min(1),
    note: z.string().nullable(),
    state: DinnerStateSchema,
    founderDirectory: z.array(FounderDirectoryEntrySchema),
  })
  .strict()
type DinnerSnapshot = z.infer<typeof DinnerSnapshotSchema>

export interface DinnerServiceOptions {
  dinners: DinnerRepository
  founders: FounderRepository
  now?: () => Date
  createId?: () => string
}

function statusFor(state: DinnerState, missingCount: number): DinnerStatus {
  if (missingCount > 0) {
    return 'needs_attention'
  }
  return state.assignments.length > 0 ? 'ready' : 'draft'
}

function configurationSummary(state: DinnerState) {
  return {
    formatVersion: SNAPSHOT_FORMAT_VERSION,
    summary: {
      founderCount: state.cohort.founderIds.length,
      tableCount: state.tableCount,
      assigned: state.assignments.length > 0,
    },
  }
}

function seatOf(state: DinnerState, founderId: string) {
  for (const table of state.assignments) {
    const seatIndex = table.seats.indexOf(founderId)
    if (seatIndex >= 0) {
      return { tableIndex: table.index, seatIndex }
    }
  }
  return { tableIndex: null, seatIndex: null }
}

function invalidDinner(error: z.ZodError) {
  return new DinnerServiceError(
    'Dinner configuration is invalid',
    'invalid_dinner',
    error.issues.map(({ path, message }) => ({ path, message })),
  )
}

export class DinnerService {
  private readonly now: () => Date
  private readonly createId: () => string

  constructor(private readonly options: DinnerServiceOptions) {
    this.now = options.now ?? (() => new Date())
    this.createId = options.createId ?? randomUUID
  }

  create(request: unknown): SavedDinner {
    const parsed = CreateDinnerRequestSchema.safeParse(request)
    if (!parsed.success) {
      throw invalidDinner(parsed.error)
    }

    const { name, note, state } = parsed.data
    const snapshot = this.snapshot(name, note ?? null, state)
    const timestamp = this.now().toISOString()
    const id = this.createId()

    const version = this.options.dinners.createWithFirstVersion(
      {
        id,
        name,
        founderIds: [...state.cohort.founderIds],
        configuration: configurationSummary(state),
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      { id: this.createId(), snapshot, createdAt: timestamp },
    )
    return this.toSavedDinner(version)
  }

  appendVersion(id: string, request: unknown): SavedDinner {
    const parsed = AppendDinnerVersionRequestSchema.safeParse(request)
    if (!parsed.success) {
      throw invalidDinner(parsed.error)
    }

    const current = this.options.dinners.getConfiguration(id)
    const name = parsed.data.name ?? current.name
    const { state } = parsed.data
    const snapshot = this.snapshot(name, parsed.data.note ?? null, state)

    const version = this.options.dinners.appendNextVersion({
      id: this.createId(),
      configurationId: id,
      name,
      founderIds: [...state.cohort.founderIds],
      configuration: configurationSummary(state),
      snapshot,
      createdAt: this.now().toISOString(),
    })
    return this.toSavedDinner(version)
  }

  get(id: string, version?: number): SavedDinner {
    const stored =
      version === undefined
        ? this.options.dinners.getLatestVersion(id)
        : this.options.dinners.getVersion(id, version)
    return this.toSavedDinner(stored)
  }

  list(): DinnerSummary[] {
    const configurations = this.options.dinners.listConfigurations()
    const present = this.options.founders.getMany([
      ...new Set(configurations.flatMap((entry) => entry.founderIds)),
    ])

    return configurations.map((configuration) => {
      const latest = this.parse(
        this.options.dinners.getVersion(
          configuration.id,
          configuration.latestVersion,
        ),
      )
      const missingFounderCount = latest.state.cohort.founderIds.filter(
        (founderId) => !present.has(founderId),
      ).length

      return {
        id: configuration.id,
        name: configuration.name,
        status: statusFor(latest.state, missingFounderCount),
        founderCount: latest.state.cohort.founderIds.length,
        tableCount: latest.state.tableCount,
        latestVersion: configuration.latestVersion,
        missingFounderCount,
        createdAt: configuration.createdAt,
        updatedAt: configuration.updatedAt,
      }
    })
  }

  listVersions(id: string): DinnerVersionSummary[] {
    const versions = this.options.dinners.listVersions(id)
    const snapshots = versions.map((version) => this.parse(version))
    const present = this.options.founders.getMany([
      ...new Set(
        snapshots.flatMap((snapshot) => snapshot.state.cohort.founderIds),
      ),
    ])

    return versions.map((version, index) => {
      const { name, note, state } = snapshots[index]!
      const missing = state.cohort.founderIds.filter(
        (founderId) => !present.has(founderId),
      ).length
      return {
        versionId: version.id,
        version: version.version,
        name,
        note,
        status: statusFor(state, missing),
        founderCount: state.cohort.founderIds.length,
        tableCount: state.tableCount,
        savedAt: version.createdAt,
      }
    })
  }

  private snapshot(
    name: string,
    note: string | null,
    state: DinnerState,
  ): DinnerSnapshot {
    const found = this.options.founders.getMany(state.cohort.founderIds)
    const unknown = state.cohort.founderIds.filter((id) => !found.has(id))
    if (unknown.length > 0) {
      throw new DinnerServiceError(
        `${unknown.length} founder${unknown.length === 1 ? ' is' : 's are'} not in the current dataset`,
        'unknown_founders',
        { founderIds: unknown },
      )
    }

    return {
      formatVersion: SNAPSHOT_FORMAT_VERSION,
      name,
      note: note || null,
      state,
      founderDirectory: state.cohort.founderIds.map((founderId) => {
        const { id, name: founderName, company, role } = found.get(founderId)!
        return { id, name: founderName, company, role }
      }),
    }
  }

  private parse(version: DinnerVersion): DinnerSnapshot {
    const parsed = DinnerSnapshotSchema.safeParse(version.snapshot)
    if (!parsed.success) {
      throw new DinnerServiceError(
        `Saved dinner ${version.configurationId} version ${version.version} is unreadable`,
        'saved_dinner_unreadable',
      )
    }
    return parsed.data
  }

  private toSavedDinner(version: DinnerVersion): SavedDinner {
    const snapshot = this.parse(version)
    const configuration = this.options.dinners.getConfiguration(
      version.configurationId,
    )
    const latest = this.options.dinners.getLatestVersion(
      version.configurationId,
    )
    const recovery = this.recover(snapshot)

    return {
      id: configuration.id,
      name: snapshot.name,
      note: snapshot.note,
      version: version.version,
      versionId: version.id,
      latestVersion: latest.version,
      status: statusFor(snapshot.state, recovery.missingFounders.length),
      createdAt: configuration.createdAt,
      updatedAt: configuration.updatedAt,
      savedAt: version.createdAt,
      state: snapshot.state,
      recovery,
    }
  }

  private recover(snapshot: DinnerSnapshot): DinnerRecovery {
    const { state } = snapshot
    const present = this.options.founders.getMany(state.cohort.founderIds)
    const directory = new Map(
      snapshot.founderDirectory.map((entry) => [entry.id, entry]),
    )
    const locked = new Set(state.locks.map((lock) => lock.founderId))
    const missingFounders: MissingFounder[] = state.cohort.founderIds
      .filter((founderId) => !present.has(founderId))
      .map((founderId) => {
        const saved = directory.get(founderId)
        return {
          founderId,
          name: saved?.name ?? null,
          company: saved?.company ?? null,
          role: saved?.role ?? null,
          ...seatOf(state, founderId),
          locked: locked.has(founderId),
        }
      })

    return {
      status: missingFounders.length > 0 ? 'missing_founders' : 'complete',
      savedFounderCount: state.cohort.founderIds.length,
      restoredFounderCount:
        state.cohort.founderIds.length - missingFounders.length,
      missingFounders,
    }
  }
}
