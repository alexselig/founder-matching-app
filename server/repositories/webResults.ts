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

function assertNonEmpty(value: string, label: string) {
  if (!value) {
    throw new RepositoryError(`${label} is required`, 'invalid_data')
  }
}

function assertTimestamp(value: string, label: string) {
  assertNonEmpty(value, label)
  if (Number.isNaN(Date.parse(value))) {
    throw new RepositoryError(
      `${label} must be a valid timestamp`,
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

function validateRun(run: WebEnrichmentRun) {
  assertNonEmpty(run.id, 'Enrichment run ID')
  assertNonEmpty(run.founderId, 'Founder ID')
  assertNonEmpty(run.queryFingerprint, 'Query fingerprint')
  assertNonEmpty(run.provider, 'Provider')
  assertTimestamp(run.retrievedAt, 'Run retrieval time')

  if (run.results.length > 5) {
    throw new RepositoryError(
      'Enrichment runs may contain at most five results',
      'invalid_data',
    )
  }

  const ranks = new Set<number>()
  const urls = new Set<string>()
  for (const result of run.results) {
    if (
      !Number.isInteger(result.rank) ||
      result.rank < 1 ||
      result.rank > 5
    ) {
      throw new RepositoryError(
        'Web result ranks must be integers from 1 through 5',
        'invalid_data',
      )
    }
    if (ranks.has(result.rank)) {
      throw new RepositoryError(
        `Duplicate web result rank ${result.rank}`,
        'invalid_data',
      )
    }
    ranks.add(result.rank)

    assertNonEmpty(result.title, 'Web result title')
    assertNonEmpty(result.url, 'Web result URL')
    assertNonEmpty(result.domain, 'Web result domain')
    assertNonEmpty(result.snippet, 'Web result snippet')
    assertNonEmpty(result.provider, 'Web result provider')
    assertTimestamp(result.retrievedAt, 'Web result retrieval time')

    if (urls.has(result.url)) {
      throw new RepositoryError(
        `Duplicate web result URL ${result.url}`,
        'invalid_data',
      )
    }
    urls.add(result.url)

    if (
      result.confidence !== undefined &&
      (result.confidence < 0 || result.confidence > 1)
    ) {
      throw new RepositoryError(
        'Web result confidence must be between 0 and 1',
        'invalid_data',
      )
    }
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
    validateRun(run)

    try {
      const append = this.database.transaction(() => {
        const founder = this.database
          .prepare('SELECT id FROM founders WHERE id = ?')
          .get(run.founderId)

        if (!founder) {
          throw new RepositoryError(
            `Founder ${run.founderId} was not found`,
            'not_found',
          )
        }

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
            run.retrievedAt,
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

        for (const result of run.results) {
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
            result.retrievedAt,
            result.confidence ?? null,
            encodeOptionalJson(
              result.entityMatch ?? {},
              'Web result entity match',
            ),
            result.staleAfter ?? null,
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
}
