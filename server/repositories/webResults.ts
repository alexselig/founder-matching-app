import type { SqliteDatabase } from '../database.js'
import {
  RepositoryError,
  throwRepositoryFailure,
} from './errors.js'

export type WebResultClassification = 'founder' | 'company' | 'both'

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
  retrievedAt: string
  queryContext?: unknown
  rawProviderMetadata?: unknown
  results: WebResultInput[]
}

interface WebRunRow {
  id: string
  founder_id: string
  query_fingerprint: string
  provider: string
  retrieved_at: string
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
  retrievedAt: string
  results: Array<{
    input: WebResultInput
    retrievedAt: string
    staleAfter: string | null
  }>
}

const WEB_RESULT_CLASSIFICATIONS: readonly WebResultClassification[] = [
  'founder',
  'company',
  'both',
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
  const retrievedAt = normalizeTimestamp(
    run.retrievedAt,
    'Run retrieval time',
  )

  if (!Array.isArray(run.results)) {
    throw new RepositoryError(
      'Enrichment run results must be an array',
      'invalid_data',
    )
  }

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
      !Number.isInteger(result.rank) ||
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
      input: result,
      retrievedAt: resultRetrievedAt,
      staleAfter:
        result.staleAfter === undefined
          ? null
          : normalizeTimestamp(
              result.staleAfter,
              'Web result stale-after time',
            ),
    }
  })

  return {
    retrievedAt,
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
        this.assertFounderExists(run.founderId)

        this.database
          .prepare(
            `INSERT INTO web_enrichment_runs (
               id,
               founder_id,
               query_fingerprint,
               provider,
               retrieved_at,
               query_context_json,
               raw_provider_metadata_json
             ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            run.id,
            run.founderId,
            run.queryFingerprint,
            run.provider,
            normalized.retrievedAt,
            encodeOptionalJson(
              run.queryContext,
              'Enrichment query context',
            ),
            encodeOptionalJson(
              run.rawProviderMetadata,
              'Enrichment provider metadata',
            ),
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
          const { input: result } = normalizedResult
          insertResult.run(
            run.id,
            run.founderId,
            result.rank,
            result.classification,
            result.title,
            result.url,
            result.domain,
            result.snippet,
            result.provider,
            result.providerResultId ?? null,
            normalizedResult.retrievedAt,
            result.confidence ?? null,
            encodeOptionalJson(
              result.entityMatch ?? {},
              'Web result entity match',
            ),
            normalizedResult.staleAfter,
            encodeOptionalJson(
              result.rawProviderMetadata,
              'Web result provider metadata',
            ),
          )
        }
      })

      append()
    } catch (error) {
      throwRepositoryFailure(
        error,
        `Failed to append enrichment run ${run.id}`,
      )
    }
  }

  latest(founderId: string): WebResult[] {
    try {
      this.assertFounderExists(founderId)

      const run = this.database
        .prepare(
          `SELECT id
           FROM web_enrichment_runs
           WHERE founder_id = ?
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
    try {
      this.assertFounderExists(founderId)

      const rows = this.database
        .prepare(
          `SELECT
             id,
             founder_id,
             query_fingerprint,
             provider,
             retrieved_at,
             query_context_json,
             raw_provider_metadata_json
           FROM web_enrichment_runs
           WHERE founder_id = ?
           ORDER BY retrieved_at DESC, id DESC`,
        )
        .all(founderId) as WebRunRow[]

      return rows.map((row) => {
        const queryContext = parseOptionalJson(
          row.query_context_json,
          'enrichment query context',
        )
        const rawProviderMetadata = parseOptionalJson(
          row.raw_provider_metadata_json,
          'enrichment provider metadata',
        )

        return {
          id: row.id,
          founderId: row.founder_id,
          queryFingerprint: row.query_fingerprint,
          provider: row.provider,
          retrievedAt: row.retrieved_at,
          ...(queryContext === undefined ? {} : { queryContext }),
          ...(rawProviderMetadata === undefined
            ? {}
            : { rawProviderMetadata }),
          results: this.resultsForRun(row.id),
        }
      })
    } catch (error) {
      throwRepositoryFailure(
        error,
        `Failed to list web result runs for founder ${founderId}`,
      )
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
