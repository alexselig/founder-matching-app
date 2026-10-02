import type { SqliteDatabase } from '../database.js'
import {
  RepositoryError,
  throwRepositoryFailure,
} from './errors.js'
import {
  assertDenseArray,
  assertNoSparseArrays,
  assertRepositoryId,
} from './validation.js'

export type WebResultClassification = 'founder' | 'company' | 'both'
export type WebEnrichmentRunStatus =
  | 'queued'
  | 'running'
  | 'complete'
  | 'partial'
  | 'failed'

export interface WebEnrichmentError {
  code: string
  message: string
  retryable: boolean
}

export interface WebResultInput {
  rank: number
  classification: WebResultClassification
  title: string
  url: string
  domain: string
  snippet: string
  provider: string
  providerResultId?: string
  retrievedAt: string
  confidence?: number
  entityMatch?: Readonly<{
    founder?: boolean
    company?: boolean
  }>
  staleAfter?: string
  rawProviderMetadata?: unknown
}

export interface WebResult extends WebResultInput {
  runId: string
  founderId: string
}

export interface WebEnrichmentRun {
  id: string
  founderId: string
  queryFingerprint: string
  provider: string
  status?: WebEnrichmentRunStatus
  retrievedAt: string
  completedAt?: string
  warnings?: string[]
  error?: WebEnrichmentError
  queryContext?: unknown
  rawProviderMetadata?: unknown
  results: WebResultInput[]
}

interface WebRunRow {
  id: string
  founder_id: string
  query_fingerprint: string
  provider: string
  status: WebEnrichmentRunStatus
  retrieved_at: string
  completed_at: string | null
  warnings_json: string | null
  error_json: string | null
  query_context_json: string | null
  raw_provider_metadata_json: string | null
}

interface WebResultRow {
  run_id: string
  founder_id: string
  rank: number
  classification: WebResultClassification
  title: string
  canonical_url: string
  domain: string
  snippet: string
  provider: string
  provider_result_id: string | null
  retrieved_at: string
  confidence: number | null
  entity_match_json: string
  stale_after: string | null
  raw_provider_metadata_json: string | null
}

interface NormalizedRunInput {
  id: string
  founderId: string
  queryFingerprint: string
  provider: string
  status: WebEnrichmentRunStatus
  retrievedAt: string
  completedAt: string | null
  warningsJson: string | null
  errorJson: string | null
  queryContextJson: string | null
  rawProviderMetadataJson: string | null
  results: Array<{
    rank: number
    classification: WebResultClassification
    title: string
    url: string
    domain: string
    snippet: string
    provider: string
    providerResultId: string | null
    retrievedAt: string
    confidence: number | null
    entityMatchJson: string
    staleAfter: string | null
    rawProviderMetadataJson: string | null
  }>
}

const WEB_RESULT_CLASSIFICATIONS: readonly WebResultClassification[] = [
  'founder',
  'company',
  'both',
]
const WEB_ENRICHMENT_STATUSES: readonly WebEnrichmentRunStatus[] = [
  'queued',
  'running',
  'complete',
  'partial',
  'failed',
]

function assertNonEmpty(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !value) {
    throw new RepositoryError(`${label} is required`, 'invalid_data')
  }
}

function normalizeTimestamp(value: unknown, label: string) {
  assertNonEmpty(value, label)
  const timestamp = Date.parse(value)
  if (Number.isNaN(timestamp)) {
    throw new RepositoryError(
      `${label} must be a valid timestamp`,
      'invalid_data',
    )
  }

  return new Date(timestamp).toISOString()
}

function assertClassification(
  value: unknown,
): asserts value is WebResultClassification {
  if (
    typeof value !== 'string' ||
    !WEB_RESULT_CLASSIFICATIONS.includes(
      value as WebResultClassification,
    )
  ) {
    throw new RepositoryError(
      'Web result classification must be founder, company, or both',
      'invalid_data',
    )
  }
}

function assertStatus(
  value: unknown,
): asserts value is WebEnrichmentRunStatus {
  if (
    typeof value !== 'string' ||
    !WEB_ENRICHMENT_STATUSES.includes(
      value as WebEnrichmentRunStatus,
    )
  ) {
    throw new RepositoryError(
      'Enrichment status is invalid',
      'invalid_data',
    )
  }
}

function normalizeWarnings(value: unknown) {
  if (value === undefined) {
    return null
  }
  assertDenseArray(value, 'Enrichment warnings')
  if (
    value.some(
      (warning) =>
        typeof warning !== 'string' || warning.length === 0,
    )
  ) {
    throw new RepositoryError(
      'Enrichment warnings must be non-empty strings',
      'invalid_data',
    )
  }
  return encodeOptionalJson(value, 'Enrichment warnings')
}

function normalizeError(value: unknown) {
  if (value === undefined) {
    return null
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RepositoryError(
      'Enrichment error must be an object',
      'invalid_data',
    )
  }
  const error = value as Record<string, unknown>
  if (
    Object.keys(error).some(
      (key) =>
        key !== 'code' &&
        key !== 'message' &&
        key !== 'retryable',
    ) ||
    typeof error.code !== 'string' ||
    !error.code ||
    typeof error.message !== 'string' ||
    !error.message ||
    typeof error.retryable !== 'boolean'
  ) {
    throw new RepositoryError(
      'Enrichment error has an invalid shape',
      'invalid_data',
    )
  }
  return encodeOptionalJson(error, 'Enrichment error')
}

function assertEntityMatch(value: unknown) {
  if (value === undefined) {
    return
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RepositoryError(
      'Web result entity match must be an object',
      'invalid_data',
    )
  }

  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    throw new RepositoryError(
      'Web result entity match must be a plain object',
      'invalid_data',
    )
  }

  const entries = Object.entries(value)
  if (
    entries.some(
      ([key, entryValue]) =>
        (key !== 'founder' && key !== 'company') ||
        typeof entryValue !== 'boolean',
    )
  ) {
    throw new RepositoryError(
      'Web result entity match accepts only boolean founder and company fields',
      'invalid_data',
    )
  }
}

function assertHttpUrl(value: string) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('Unsupported URL protocol')
    }
  } catch {
    throw new RepositoryError(
      'Web result URL must be an absolute HTTP or HTTPS URL',
      'invalid_data',
    )
  }
}

function encodeOptionalJson(value: unknown, label: string) {
  if (value === undefined) {
    return null
  }

  try {
    assertNoSparseArrays(value, label)
    const encoded = JSON.stringify(value)
    if (encoded === undefined) {
      throw new Error(`${label} is not JSON serializable`)
    }
    return encoded
  } catch {
    throw new RepositoryError(
      `${label} is not JSON serializable`,
      'invalid_data',
    )
  }
}

function parseOptionalJson(
  value: string | null,
  label: string,
): unknown {
  if (value === null) {
    return undefined
  }

  try {
    return JSON.parse(value) as unknown
  } catch {
    throw new RepositoryError(
      `Stored ${label} is invalid`,
      'storage_failure',
    )
  }
}

function validateRun(run: WebEnrichmentRun): NormalizedRunInput {
  if (!run || typeof run !== 'object' || Array.isArray(run)) {
    throw new RepositoryError(
      'Enrichment run must be an object',
      'invalid_data',
    )
  }

  assertNonEmpty(run.id, 'Enrichment run ID')
  assertNonEmpty(run.founderId, 'Founder ID')
  assertNonEmpty(run.queryFingerprint, 'Query fingerprint')
  assertNonEmpty(run.provider, 'Provider')
  const status = run.status ?? 'complete'
  assertStatus(status)
  const retrievedAt = normalizeTimestamp(
    run.retrievedAt,
    'Run retrieval time',
  )
  const completedAt =
    run.completedAt === undefined
      ? null
      : normalizeTimestamp(
          run.completedAt,
          'Run completion time',
        )
  const warningsJson = normalizeWarnings(run.warnings)
  const errorJson = normalizeError(run.error)
  const queryContextJson = encodeOptionalJson(
    run.queryContext,
    'Enrichment query context',
  )
  const rawProviderMetadataJson = encodeOptionalJson(
    run.rawProviderMetadata,
    'Enrichment provider metadata',
  )

  assertDenseArray(run.results, 'Enrichment run results')

  if (run.results.length > 5) {
    throw new RepositoryError(
      'Enrichment runs may contain at most five results',
      'invalid_data',
    )
  }

  const results = run.results.map((result) => {
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      throw new RepositoryError(
        'Web results must be objects',
        'invalid_data',
      )
    }

    if (
      typeof result.rank !== 'number' ||
      !Number.isSafeInteger(result.rank) ||
      result.rank < 1 ||
      result.rank > 5
    ) {
      throw new RepositoryError(
        'Web result ranks must be integers from 1 through 5',
        'invalid_data',
      )
    }

    assertClassification(result.classification)
    assertNonEmpty(result.title, 'Web result title')
    assertNonEmpty(result.url, 'Web result URL')
    assertHttpUrl(result.url)
    assertNonEmpty(result.domain, 'Web result domain')
    assertNonEmpty(result.snippet, 'Web result snippet')
    assertNonEmpty(result.provider, 'Web result provider')
    const resultRetrievedAt = normalizeTimestamp(
      result.retrievedAt,
      'Web result retrieval time',
    )

    if (
      result.confidence !== undefined &&
      (typeof result.confidence !== 'number' ||
        !Number.isFinite(result.confidence) ||
        result.confidence < 0 ||
        result.confidence > 1)
    ) {
      throw new RepositoryError(
        'Web result confidence must be between 0 and 1',
        'invalid_data',
      )
    }

    if (result.providerResultId !== undefined) {
      assertNonEmpty(
        result.providerResultId,
        'Web result provider result ID',
      )
    }

    assertEntityMatch(result.entityMatch)

    return {
      rank: result.rank,
      classification: result.classification,
      title: result.title,
      url: result.url,
      domain: result.domain,
      snippet: result.snippet,
      provider: result.provider,
      providerResultId: result.providerResultId ?? null,
      retrievedAt: resultRetrievedAt,
      confidence: result.confidence ?? null,
      entityMatchJson:
        encodeOptionalJson(
          result.entityMatch ?? {},
          'Web result entity match',
        ) ?? '{}',
      staleAfter:
        result.staleAfter === undefined
          ? null
          : normalizeTimestamp(
              result.staleAfter,
              'Web result stale-after time',
            ),
      rawProviderMetadataJson: encodeOptionalJson(
        result.rawProviderMetadata,
        'Web result provider metadata',
      ),
    }
  })

  return {
    id: run.id,
    founderId: run.founderId,
    queryFingerprint: run.queryFingerprint,
    provider: run.provider,
    status,
    retrievedAt,
    completedAt,
    warningsJson,
    errorJson,
    queryContextJson,
    rawProviderMetadataJson,
    results,
  }
}

function rowToResult(row: WebResultRow): WebResult {
  const rawProviderMetadata = parseOptionalJson(
    row.raw_provider_metadata_json,
    'web result provider metadata',
  )
  const entityMatch = parseOptionalJson(
    row.entity_match_json,
    'web result entity match',
  ) as WebResultInput['entityMatch']

  return {
    runId: row.run_id,
    founderId: row.founder_id,
    rank: row.rank,
    classification: row.classification,
    title: row.title,
    url: row.canonical_url,
    domain: row.domain,
    snippet: row.snippet,
    provider: row.provider,
    ...(row.provider_result_id === null
      ? {}
      : { providerResultId: row.provider_result_id }),
    retrievedAt: row.retrieved_at,
    ...(row.confidence === null
      ? {}
      : { confidence: row.confidence }),
    ...(entityMatch === undefined ? {} : { entityMatch }),
    ...(row.stale_after === null
      ? {}
      : { staleAfter: row.stale_after }),
    ...(rawProviderMetadata === undefined
      ? {}
      : { rawProviderMetadata }),
  }
}

export class WebResultsRepository {
  constructor(private readonly database: SqliteDatabase) {}

  appendRun(run: WebEnrichmentRun): void {
    const normalized = validateRun(run)

    try {
      const append = this.database.transaction(() => {
        this.assertFounderExists(normalized.founderId)

        this.database
          .prepare(
            `INSERT INTO web_enrichment_runs (
               id,
               founder_id,
               query_fingerprint,
               provider,
               status,
               retrieved_at,
               completed_at,
               warnings_json,
               error_json,
               query_context_json,
               raw_provider_metadata_json
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            normalized.id,
            normalized.founderId,
            normalized.queryFingerprint,
            normalized.provider,
            normalized.status,
            normalized.retrievedAt,
            normalized.completedAt,
            normalized.warningsJson,
            normalized.errorJson,
            normalized.queryContextJson,
            normalized.rawProviderMetadataJson,
          )

        const insertResult = this.database.prepare(
          `INSERT INTO web_results (
             run_id,
             founder_id,
             rank,
             classification,
             title,
             canonical_url,
             domain,
             snippet,
             provider,
             provider_result_id,
             retrieved_at,
             confidence,
             entity_match_json,
             stale_after,
             raw_provider_metadata_json
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )

        for (const normalizedResult of normalized.results) {
          insertResult.run(
            normalized.id,
            normalized.founderId,
            normalizedResult.rank,
            normalizedResult.classification,
            normalizedResult.title,
            normalizedResult.url,
            normalizedResult.domain,
            normalizedResult.snippet,
            normalizedResult.provider,
            normalizedResult.providerResultId,
            normalizedResult.retrievedAt,
            normalizedResult.confidence,
            normalizedResult.entityMatchJson,
            normalizedResult.staleAfter,
            normalizedResult.rawProviderMetadataJson,
          )
        }
      })

      append()
    } catch (error) {
      throwRepositoryFailure(
        error,
        `Failed to append enrichment run ${normalized.id}`,
      )
    }
  }

  latest(founderId: string): WebResult[] {
    assertRepositoryId(founderId, 'Founder ID')

    try {
      this.assertFounderExists(founderId)

      const run = this.database
        .prepare(
          `SELECT id
           FROM web_enrichment_runs
           WHERE founder_id = ?
             AND status IN ('complete', 'partial')
             AND EXISTS (
               SELECT 1
               FROM web_results
               WHERE web_results.run_id = web_enrichment_runs.id
             )
           ORDER BY retrieved_at DESC, id DESC
           LIMIT 1`,
        )
        .get(founderId) as { id: string } | undefined

      return run ? this.resultsForRun(run.id) : []
    } catch (error) {
      throwRepositoryFailure(
        error,
        `Failed to read latest web results for founder ${founderId}`,
      )
    }
  }

  listRuns(founderId: string): WebEnrichmentRun[] {
    assertRepositoryId(founderId, 'Founder ID')

    try {
      this.assertFounderExists(founderId)

      const rows = this.database
        .prepare(
          `SELECT
             id,
             founder_id,
             query_fingerprint,
             provider,
             status,
             retrieved_at,
             completed_at,
             warnings_json,
             error_json,
             query_context_json,
             raw_provider_metadata_json
           FROM web_enrichment_runs
           WHERE founder_id = ?
           ORDER BY retrieved_at DESC, id DESC`,
        )
        .all(founderId) as WebRunRow[]

      return rows.map((row) => {
        return this.rowToRun(row)
      })
    } catch (error) {
      throwRepositoryFailure(
        error,
        `Failed to list web result runs for founder ${founderId}`,
      )
    }
  }

  findLatestByFingerprint(
    founderId: string,
    queryFingerprint: string,
    provider: string,
  ): WebEnrichmentRun | undefined {
    assertRepositoryId(founderId, 'Founder ID')
    assertNonEmpty(queryFingerprint, 'Query fingerprint')
    assertNonEmpty(provider, 'Provider')

    try {
      this.assertFounderExists(founderId)
      const row = this.database
        .prepare(
          `SELECT
               id,
               founder_id,
               query_fingerprint,
               provider,
               status,
               retrieved_at,
               completed_at,
               warnings_json,
               error_json,
               query_context_json,
               raw_provider_metadata_json
             FROM web_enrichment_runs
             WHERE founder_id = ?
               AND query_fingerprint = ?
               AND provider = ?
               AND status IN ('complete', 'partial')
               AND EXISTS (
                 SELECT 1
                 FROM web_results
                 WHERE web_results.run_id = web_enrichment_runs.id
               )
             ORDER BY retrieved_at DESC, id DESC
             LIMIT 1`,
        )
        .get(
          founderId,
          queryFingerprint,
          provider,
        ) as WebRunRow | undefined

      return row ? this.rowToRun(row) : undefined
    } catch (error) {
      throwRepositoryFailure(
        error,
        `Failed to read reusable web results for founder ${founderId}`,
      )
    }
  }

  private rowToRun(row: WebRunRow): WebEnrichmentRun {
    const queryContext = parseOptionalJson(
      row.query_context_json,
      'enrichment query context',
    )
    const rawProviderMetadata = parseOptionalJson(
      row.raw_provider_metadata_json,
      'enrichment provider metadata',
    )
    const warnings = parseOptionalJson(
      row.warnings_json,
      'enrichment warnings',
    ) as string[] | undefined
    const error = parseOptionalJson(
      row.error_json,
      'enrichment error',
    ) as WebEnrichmentError | undefined

    return {
      id: row.id,
      founderId: row.founder_id,
      queryFingerprint: row.query_fingerprint,
      provider: row.provider,
      status: row.status,
      retrievedAt: row.retrieved_at,
      ...(row.completed_at === null
        ? {}
        : { completedAt: row.completed_at }),
      ...(warnings === undefined ? {} : { warnings }),
      ...(error === undefined ? {} : { error }),
      ...(queryContext === undefined ? {} : { queryContext }),
      ...(rawProviderMetadata === undefined
        ? {}
        : { rawProviderMetadata }),
      results: this.resultsForRun(row.id),
    }
  }

  private resultsForRun(runId: string): WebResult[] {
    const rows = this.database
      .prepare(
        `SELECT
           run_id,
           founder_id,
           rank,
           classification,
           title,
           canonical_url,
           domain,
           snippet,
           provider,
           provider_result_id,
           retrieved_at,
           confidence,
           entity_match_json,
           stale_after,
           raw_provider_metadata_json
         FROM web_results
         WHERE run_id = ?
         ORDER BY rank`,
      )
      .all(runId) as WebResultRow[]

    return rows.map(rowToResult)
  }

  private assertFounderExists(founderId: string): void {
    const founder = this.database
      .prepare('SELECT id FROM founders WHERE id = ?')
      .get(founderId)

    if (!founder) {
      throw new RepositoryError(
        `Founder ${founderId} was not found`,
        'not_found',
      )
    }
  }
}
