import { createHash, randomUUID } from 'node:crypto'

import type { Founder } from '../../src/shared/founder.js'
import type {
  CreateEnrichmentRunRequest,
  EnrichmentBatch,
  EnrichmentStatus,
  ProviderId,
} from '../../src/shared/contracts.js'
import {
  ProviderError,
  redactProviderMetadata,
  type ProviderAdapter,
  type ProviderWebResult,
  type WebSearchIdentityContext,
  type WebSearchQuery,
} from '../providers/types.js'
import { FounderRepository } from '../repositories/founders.js'
import {
  WebResultsRepository,
  type WebEnrichmentError,
  type WebEnrichmentRun,
  type WebResult,
  type WebResultClassification,
  type WebResultInput,
} from '../repositories/webResults.js'

export interface EnrichmentRetryOptions {
  maxAttempts: number
  baseDelayMs: number
  maxDelayMs: number
}

export interface EnrichmentServiceOptions {
  founderRepository: FounderRepository
  webResultsRepository: WebResultsRepository
  providers: readonly ProviderAdapter[]
  now?: () => Date
  createId?: () => string
  sleep?: (milliseconds: number) => Promise<void>
  concurrency?: number
  staleAfterMs?: number
  retry?: Partial<EnrichmentRetryOptions>
}

export interface EnrichFounderOptions {
  provider: ProviderId
  forceRefresh?: boolean
}

export interface EnrichAllFoundersOptions extends EnrichFounderOptions {
  founderIds?: readonly string[]
}

export interface EnrichmentRunResult {
  runId: string
  founderId: string
  provider: ProviderId
  status: 'complete' | 'partial' | 'failed'
  cached: boolean
  items: WebResult[]
  warnings?: string[]
  error?: WebEnrichmentError
}

export interface EnrichmentProgress {
  founderId: string
  status: 'complete' | 'partial' | 'failed'
  runId?: string
  cached: boolean
  error?: string
}

export interface EnrichmentService {
  validateProvider(provider: ProviderId): Promise<void>
  enrichFounder(
    founderId: string,
    options: EnrichFounderOptions,
  ): Promise<EnrichmentRunResult>
  enrichAllFounders(
    options: EnrichAllFoundersOptions,
  ): AsyncIterable<EnrichmentProgress>
  resolveFounderIds(founderIds?: readonly string[]): string[]
  hasProvider(provider: ProviderId): boolean
}

export interface EnrichmentRunManagerOptions {
  service: EnrichmentService
  createId?: () => string
  now?: () => Date
}

export interface EnrichmentRunManager {
  create(
    request: CreateEnrichmentRunRequest,
  ): Promise<EnrichmentBatch>
  get(id: string): EnrichmentBatch | undefined
}

const DEFAULT_RETRY: EnrichmentRetryOptions = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30_000,
}
const DEFAULT_STALE_AFTER_MS = 24 * 60 * 60 * 1000

function normalizeMatchText(value: string) {
  return value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function phraseMatches(haystack: string, phrase: string) {
  const normalizedPhrase = normalizeMatchText(phrase)
  return (
    normalizedPhrase.length > 0 &&
    normalizeMatchText(haystack).includes(normalizedPhrase)
  )
}

export function canonicalizeWebUrl(value: string) {
  const url = new URL(value)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only HTTP and HTTPS URLs are supported')
  }
  url.hash = ''
  url.hostname = url.hostname.toLowerCase()
  if (
    (url.protocol === 'https:' && url.port === '443') ||
    (url.protocol === 'http:' && url.port === '80')
  ) {
    url.port = ''
  }
  for (const key of [...url.searchParams.keys()]) {
    if (
      /^utm_/i.test(key) ||
      ['fbclid', 'gclid', 'mc_cid', 'mc_eid'].includes(
        key.toLowerCase(),
      )
    ) {
      url.searchParams.delete(key)
    }
  }
  url.searchParams.sort()
  if (url.pathname !== '/') {
    url.pathname = url.pathname.replace(/\/+$/, '') || '/'
  }
  return url.toString()
}

export function buildWebSearchQuery(founder: Founder): WebSearchQuery {
  const context: WebSearchIdentityContext = {
    name: founder.name,
    company: founder.company,
    companyVertical: founder.companyVertical,
    role: founder.role,
    education: founder.education,
    cohortGroup: founder.cohortGroup,
    cohortSection: founder.cohortSection,
  }
  const query = [
    `name: "${context.name}"`,
    `company: "${context.company}"`,
    `company vertical: "${context.companyVertical}"`,
    `role: "${context.role}"`,
    `education: "${context.education}"`,
    `cohort group: "${context.cohortGroup}"`,
    `cohort section: "${context.cohortSection}"`,
  ].join(' ')

  return {
    founderId: founder.id,
    context,
    query,
  }
}

function fingerprintQuery(
  provider: ProviderId,
  query: WebSearchQuery,
) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        provider,
        founderId: query.founderId,
        context: query.context,
      }),
    )
    .digest('hex')
}

function classificationFor(
  founder: boolean,
  company: boolean,
): WebResultClassification | undefined {
  if (founder && company) {
    return 'both'
  }
  if (founder) {
    return 'founder'
  }
  if (company) {
    return 'company'
  }
  return undefined
}

function prepareProviderResult(
  result: ProviderWebResult,
  query: WebSearchQuery,
  provider: ProviderId,
  retrievedAt: string,
  staleAfter: string,
): Omit<WebResultInput, 'rank'> | undefined {
  if (result.provenance === 'summary_only') {
    return undefined
  }
  let url: string
  try {
    url = canonicalizeWebUrl(result.url)
  } catch {
    return undefined
  }
  const haystack = `${result.title}\n${result.snippet}`
  const founderMatch =
    phraseMatches(haystack, query.context.name) ||
    result.entityMatch?.founder === true
  const companyMatch =
    phraseMatches(haystack, query.context.company) ||
    result.entityMatch?.company === true
  const classification = classificationFor(
    founderMatch,
    companyMatch,
  )
  if (!classification) {
    return undefined
  }

  return {
    classification,
    title: result.title.trim() || new URL(url).hostname,
    url,
    domain: new URL(url).hostname,
    snippet: result.snippet.trim() || 'Provider-cited source.',
    provider,
    ...(result.id ? { providerResultId: result.id } : {}),
    retrievedAt: result.retrievedAt ?? retrievedAt,
    ...(result.confidence === undefined
      ? {}
      : {
          confidence: Math.min(1, Math.max(0, result.confidence)),
        }),
    entityMatch: {
      founder: founderMatch,
      company: companyMatch,
    },
    staleAfter,
    ...(result.rawMetadata === undefined
      ? {}
      : {
          rawProviderMetadata: redactProviderMetadata(
            result.rawMetadata,
          ),
        }),
  }
}

function resultPriority(
  result: Omit<WebResultInput, 'rank'>,
) {
  const classification = {
    both: 3,
    founder: 2,
    company: 1,
  }[result.classification]
  return classification * 10 + (result.confidence ?? 0)
}

function rankResults(
  results: readonly ProviderWebResult[],
  query: WebSearchQuery,
  provider: ProviderId,
  retrievedAt: string,
  staleAfter: string,
) {
  const prepared = results
    .map((result) =>
      prepareProviderResult(
        result,
        query,
        provider,
        retrievedAt,
        staleAfter,
      ),
    )
    .filter(
      (
        result,
      ): result is Omit<WebResultInput, 'rank'> =>
        result !== undefined,
    )
    .sort(
      (left, right) =>
        resultPriority(right) - resultPriority(left) ||
        left.url.localeCompare(right.url),
    )
  const deduplicated = new Map<
    string,
    Omit<WebResultInput, 'rank'>
  >()
  for (const result of prepared) {
    if (!deduplicated.has(result.url)) {
      deduplicated.set(result.url, result)
    }
  }

  return [...deduplicated.values()]
    .slice(0, 5)
    .map((result, index) => ({
      ...result,
      rank: index + 1,
    }))
}

function isRunFresh(
  run: WebEnrichmentRun,
  now: Date,
  staleAfterMs: number,
) {
  if (
    run.status !== 'complete' &&
    run.status !== 'partial' &&
    run.status !== undefined
  ) {
    return false
  }
  if (run.results.length === 0) {
    return (
      run.status !== 'partial' &&
      Date.parse(run.retrievedAt) + staleAfterMs > now.getTime()
    )
  }
  return run.results.every(
    (result) =>
      result.staleAfter !== undefined &&
      Date.parse(result.staleAfter) > now.getTime(),
  )
}

function toRunResult(
  run: WebEnrichmentRun,
  cached: boolean,
): EnrichmentRunResult {
  return {
    runId: run.id,
    founderId: run.founderId,
    provider: run.provider as ProviderId,
    status:
      run.status === 'partial' || run.status === 'failed'
        ? run.status
        : 'complete',
    cached,
    items: run.results.map((result) => ({
      ...result,
      runId: run.id,
      founderId: run.founderId,
    })),
    ...(run.warnings === undefined
      ? {}
      : { warnings: run.warnings }),
    ...(run.error === undefined ? {} : { error: run.error }),
  }
}

function normalizedProviderError(error: unknown): ProviderError {
  if (error instanceof ProviderError) {
    return error
  }
  return new ProviderError(
    'unavailable',
    'Provider request failed',
    { cause: error },
  )
}

function delayForAttempt(
  attempt: number,
  error: ProviderError,
  retry: EnrichmentRetryOptions,
) {
  const exponential = retry.baseDelayMs * 2 ** (attempt - 1)
  return Math.min(
    retry.maxDelayMs,
    error.retryAfterMs ?? exponential,
  )
}

export function createEnrichmentService(
  options: EnrichmentServiceOptions,
): EnrichmentService {
  const now = options.now ?? (() => new Date())
  const createId = options.createId ?? randomUUID
  const sleep =
    options.sleep ??
    ((milliseconds: number) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, milliseconds)
      }))
  const concurrency = Math.max(
    1,
    Math.min(4, options.concurrency ?? 4),
  )
  const staleAfterMs =
    options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS
  const configuredRetry = {
    ...DEFAULT_RETRY,
    ...options.retry,
  }
  const retry: EnrichmentRetryOptions = {
    maxAttempts: Math.max(
      1,
      Math.trunc(configuredRetry.maxAttempts),
    ),
    baseDelayMs: Math.max(
      0,
      Math.min(30_000, configuredRetry.baseDelayMs),
    ),
    maxDelayMs: Math.max(
      0,
      Math.min(30_000, configuredRetry.maxDelayMs),
    ),
  }
  const providers = new Map(
    options.providers.map((provider) => [provider.id, provider]),
  )
  const providerValidations = new Map<ProviderId, Promise<void>>()

  async function validateWithRetry(provider: ProviderAdapter) {
    let lastError: ProviderError | undefined
    for (let attempt = 1; attempt <= retry.maxAttempts; attempt += 1) {
      try {
        await provider.validateCredential()
        return
      } catch (error) {
        lastError = normalizedProviderError(error)
        if (
          !lastError.retryable ||
          attempt >= retry.maxAttempts
        ) {
          throw lastError
        }
        await sleep(delayForAttempt(attempt, lastError, retry))
      }
    }
    throw (
      lastError ??
      new ProviderError('unavailable', 'Provider validation failed')
    )
  }

  function validateProvider(providerId: ProviderId) {
    const cached = providerValidations.get(providerId)
    if (cached) return cached

    const provider = providers.get(providerId)
    if (!provider) {
      return Promise.reject(
        new ProviderError(
          'unavailable',
          `Provider ${providerId} is not configured`,
        ),
      )
    }

    let validation: Promise<void>
    validation = validateWithRetry(provider)
      .catch((error: unknown) => {
        const providerError = normalizedProviderError(error)
        const permanentInvalidCredential =
          providerError.code === 'invalid_credential' &&
          !providerError.retryable
        if (
          !permanentInvalidCredential &&
          providerValidations.get(providerId) === validation
        ) {
          providerValidations.delete(providerId)
        }
        throw providerError
      })
    providerValidations.set(providerId, validation)
    return validation
  }

  async function searchWithRetry(
    provider: ProviderAdapter,
    query: WebSearchQuery,
  ) {
    let lastError: ProviderError | undefined
    for (let attempt = 1; attempt <= retry.maxAttempts; attempt += 1) {
      try {
        return await provider.searchWeb(query)
      } catch (error) {
        lastError = normalizedProviderError(error)
        if (
          !lastError.retryable ||
          attempt >= retry.maxAttempts
        ) {
          throw lastError
        }
        await sleep(delayForAttempt(attempt, lastError, retry))
      }
    }
    throw (
      lastError ??
      new ProviderError('unavailable', 'Provider request failed')
    )
  }

  async function enrichFounder(
    founderId: string,
    enrichmentOptions: EnrichFounderOptions,
  ): Promise<EnrichmentRunResult> {
    const founder = options.founderRepository.get(founderId)
    const query = buildWebSearchQuery(founder)
    const fingerprint = fingerprintQuery(
      enrichmentOptions.provider,
      query,
    )
    const requestTime = now()
    if (!enrichmentOptions.forceRefresh) {
      const evidence =
        options.webResultsRepository.findLatestByFingerprint(
          founder.id,
          fingerprint,
          enrichmentOptions.provider,
        )
      if (evidence && isRunFresh(evidence, requestTime, staleAfterMs)) {
        return toRunResult(evidence, true)
      }

      const empty =
        options.webResultsRepository.findLatestCompletedZeroByFingerprint(
          founder.id,
          fingerprint,
          enrichmentOptions.provider,
        )
      if (empty && isRunFresh(empty, requestTime, staleAfterMs)) {
        return toRunResult(empty, true)
      }
    }

    const provider = providers.get(enrichmentOptions.provider)
    const runId = createId()
    const retrievedAt = requestTime.toISOString()
    const staleAfter = new Date(
      requestTime.getTime() + staleAfterMs,
    ).toISOString()

    if (!provider || !provider.capabilities.webSearch) {
      const unavailable: WebEnrichmentRun = {
        id: runId,
        founderId: founder.id,
        queryFingerprint: fingerprint,
        provider: enrichmentOptions.provider,
        status: 'failed',
        retrievedAt,
        completedAt: now().toISOString(),
        queryContext: query.context,
        error: {
          code: 'unavailable',
          message: 'Provider web search is unavailable',
          retryable: false,
        },
        results: [],
      }
      options.webResultsRepository.appendRun(unavailable)
      return toRunResult(unavailable, false)
    }

    try {
      const providerResults = await searchWithRetry(provider, query)
      const ranked = rankResults(
        providerResults,
        query,
        enrichmentOptions.provider,
        retrievedAt,
        staleAfter,
      )
      const unsupportedCount = providerResults.filter(
        (result) => result.provenance === 'summary_only',
      ).length
      const warnings = [
        ...(unsupportedCount > 0
          ? [
              `${unsupportedCount} provider result(s) lacked usable provenance`,
            ]
          : []),
        ...(providerResults.length > 0 && ranked.length === 0
          ? [
              'Provider results did not contain identity-matched cited evidence',
            ]
          : []),
      ]
      const status =
        warnings.length > 0 ? 'partial' : 'complete'
      const run: WebEnrichmentRun = {
        id: runId,
        founderId: founder.id,
        queryFingerprint: fingerprint,
        provider: enrichmentOptions.provider,
        status,
        retrievedAt,
        completedAt: now().toISOString(),
        queryContext: query.context,
        ...(warnings.length === 0 ? {} : { warnings }),
        rawProviderMetadata: {
          returnedCount: providerResults.length,
          usableCount: ranked.length,
        },
        results: ranked,
      }
      options.webResultsRepository.appendRun(run)
      return toRunResult(run, false)
    } catch (error) {
      const providerError = normalizedProviderError(error)
      const run: WebEnrichmentRun = {
        id: runId,
        founderId: founder.id,
        queryFingerprint: fingerprint,
        provider: enrichmentOptions.provider,
        status: 'failed',
        retrievedAt,
        completedAt: now().toISOString(),
        queryContext: query.context,
        error: {
          code: providerError.code,
          message: providerError.message,
          retryable: providerError.retryable,
        },
        results: [],
      }
      options.webResultsRepository.appendRun(run)
      return toRunResult(run, false)
    }
  }

  function resolveFounderIds(founderIds?: readonly string[]) {
    if (founderIds) {
      return [...new Set(founderIds)]
    }
    return options.founderRepository
      .list({ limit: 1000, offset: 0 })
      .map((founder) => founder.id)
  }

  async function* enrichAllFounders(
    enrichmentOptions: EnrichAllFoundersOptions,
  ): AsyncIterable<EnrichmentProgress> {
    const founderIds = resolveFounderIds(
      enrichmentOptions.founderIds,
    )
    let nextIndex = 0
    let sequence = 0
    const inFlight = new Map<
      number,
      Promise<{
        sequence: number
        progress: EnrichmentProgress
      }>
    >()

    const launch = (founderId: string) => {
      const taskSequence = sequence
      sequence += 1
      const task = enrichFounder(founderId, enrichmentOptions)
        .then((result) => ({
          sequence: taskSequence,
          progress: {
            founderId,
            status: result.status,
            runId: result.runId,
            cached: result.cached,
            ...(result.error === undefined
              ? {}
              : { error: result.error.message }),
          } satisfies EnrichmentProgress,
        }))
        .catch((error: unknown) => ({
          sequence: taskSequence,
          progress: {
            founderId,
            status: 'failed' as const,
            cached: false,
            error:
              error instanceof Error
                ? error.message
                : 'Enrichment failed',
          },
        }))
      inFlight.set(taskSequence, task)
    }

    while (
      nextIndex < founderIds.length &&
      inFlight.size < concurrency
    ) {
      launch(founderIds[nextIndex]!)
      nextIndex += 1
    }

    while (inFlight.size > 0) {
      const settled = await Promise.race(inFlight.values())
      inFlight.delete(settled.sequence)
      yield settled.progress

      if (nextIndex < founderIds.length) {
        launch(founderIds[nextIndex]!)
        nextIndex += 1
      }
    }
  }

  return {
    validateProvider,
    enrichFounder,
    enrichAllFounders,
    resolveFounderIds,
    hasProvider(provider) {
      return providers.has(provider)
    },
  }
}

function cloneBatch(batch: EnrichmentBatch): EnrichmentBatch {
  return {
    ...batch,
    items: batch.items.map((item) => ({ ...item })),
  }
}

export function createEnrichmentRunManager(
  options: EnrichmentRunManagerOptions,
): EnrichmentRunManager {
  const createId = options.createId ?? randomUUID
  const now = options.now ?? (() => new Date())
  const batches = new Map<string, EnrichmentBatch>()

  async function run(
    batch: EnrichmentBatch,
    request: CreateEnrichmentRunRequest,
    founderIds: string[],
  ) {
    batch.status = 'running'
    batch.updatedAt = now().toISOString()
    let sawPartial = false

    for await (const progress of options.service.enrichAllFounders({
      provider: request.provider,
      founderIds,
      forceRefresh: request.forceRefresh,
    })) {
      batch.items.push(progress)
      batch.completed += 1
      if (progress.status === 'failed') {
        batch.failed += 1
      }
      if (progress.status === 'partial') {
        sawPartial = true
      }
      if (progress.cached) {
        batch.cached += 1
      }
      batch.updatedAt = now().toISOString()
    }

    const status: EnrichmentStatus =
      batch.total > 0 && batch.failed === batch.total
        ? 'failed'
        : batch.failed > 0 || sawPartial
          ? 'partial'
          : 'complete'
    batch.status = status
    batch.completedAt = now().toISOString()
    batch.updatedAt = batch.completedAt
  }

  return {
    async create(request) {
      await options.service.validateProvider(request.provider)
      const founderIds = options.service.resolveFounderIds(
        request.founderIds,
      )
      const createdAt = now().toISOString()
      const batch: EnrichmentBatch = {
        id: createId(),
        provider: request.provider,
        status: 'queued',
        total: founderIds.length,
        completed: 0,
        failed: 0,
        cached: 0,
        createdAt,
        updatedAt: createdAt,
        items: [],
      }
      batches.set(batch.id, batch)
      queueMicrotask(() => {
        void run(batch, request, founderIds).catch(() => {
          batch.status = 'failed'
          batch.failed = Math.max(
            batch.failed,
            batch.total - batch.completed,
          )
          batch.completed = batch.total
          batch.completedAt = now().toISOString()
          batch.updatedAt = batch.completedAt
        })
      })
      return cloneBatch(batch)
    },
    get(id) {
      const batch = batches.get(id)
      return batch ? cloneBatch(batch) : undefined
    },
  }
}
