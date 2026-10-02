import type {
  FastifyPluginAsync,
  FastifyReply,
} from 'fastify'

import {
  ApiFailureEnvelopeSchema,
  CreateEnrichmentRunRequestSchema,
  EnrichmentBatchResponseSchema,
  EnrichmentProgressResponseSchema,
  EnrichmentRunParamsSchema,
  FounderParamsSchema,
  FounderWebResultsResponseSchema,
  type ApiEnvelope,
  type EnrichmentBatch,
  type FounderWebResultsData,
  type ProviderId,
  type PublicWebResult,
} from '../../src/shared/contracts.js'
import { ProviderError } from '../providers/types.js'
import {
  RepositoryError,
} from '../repositories/errors.js'
import {
  WebResultsRepository,
  type WebEnrichmentRun,
  type WebResult,
} from '../repositories/webResults.js'
import type { EnrichmentRunManager } from '../services/enrichment.js'

export interface EnrichmentRoutesOptions {
  repository: WebResultsRepository
  runManager: EnrichmentRunManager
  now?: () => Date
}

function errorEnvelope(
  code: string,
  message: string,
  details?: unknown,
): ApiEnvelope<never> {
  return ApiFailureEnvelopeSchema.parse({
    ok: false,
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details }),
    },
  })
}

function sendRepositoryError(
  reply: FastifyReply,
  error: RepositoryError,
) {
  const statusCode = {
    not_found: 404,
    conflict: 409,
    invalid_data: 400,
    storage_failure: 500,
  }[error.code]

  return reply
    .code(statusCode)
    .send(errorEnvelope(error.code, error.message))
}

function publicRun(run: WebEnrichmentRun) {
  return {
    id: run.id,
    founderId: run.founderId,
    queryFingerprint: run.queryFingerprint,
    provider: run.provider as ProviderId,
    status: run.status ?? 'complete',
    retrievedAt: run.retrievedAt,
    ...(run.completedAt === undefined
      ? {}
      : { completedAt: run.completedAt }),
    ...(run.warnings === undefined
      ? {}
      : { warnings: run.warnings }),
    ...(run.error === undefined ? {} : { error: run.error }),
    resultCount: run.results.length,
  }
}

function publicResult(result: WebResult): PublicWebResult {
  const entityMatch = {
    founder:
      result.entityMatch?.founder ??
      result.classification !== 'company',
    company:
      result.entityMatch?.company ??
      result.classification !== 'founder',
  }
  return {
    runId: result.runId,
    founderId: result.founderId,
    rank: result.rank,
    classification: result.classification,
    title: result.title,
    url: result.url,
    domain: result.domain,
    snippet: result.snippet,
    provider: result.provider as PublicWebResult['provider'],
    ...(result.providerResultId === undefined
      ? {}
      : { providerResultId: result.providerResultId }),
    retrievedAt: result.retrievedAt,
    ...(result.confidence === undefined
      ? {}
      : { confidence: result.confidence }),
    entityMatch,
    ...(result.staleAfter === undefined
      ? {}
      : { staleAfter: result.staleAfter }),
  }
}

function progressFromBatch(batch: EnrichmentBatch) {
  return {
    id: batch.id,
    status: batch.status,
    total: batch.total,
    completed: batch.completed,
    failed: batch.failed,
    cached: batch.cached,
    updatedAt: batch.updatedAt,
  }
}

export const enrichmentRoutes: FastifyPluginAsync<
  EnrichmentRoutesOptions
> = async (server, options) => {
  const now = options.now ?? (() => new Date())

  server.get(
    '/api/v2/founders/:id/web-results',
    async (request, reply) => {
      const parsedParams = FounderParamsSchema.safeParse(
        request.params,
      )
      if (!parsedParams.success) {
        return reply.code(400).send(
          errorEnvelope(
            'invalid_request',
            'Invalid founder ID',
            parsedParams.error.issues,
          ),
        )
      }

      try {
        const runs = options.repository.listRuns(
          parsedParams.data.id,
        )
        const items = options.repository
          .latest(parsedParams.data.id)
          .map(publicResult)
        const latestAttempt = runs[0]
        const latestRun = runs.find(
          (run) =>
            (run.status === 'complete' ||
              run.status === 'partial' ||
              run.status === undefined) &&
            run.results.length > 0,
        )
        const stale = items.some(
          (item) =>
            item.staleAfter !== undefined &&
            Date.parse(item.staleAfter) <= now().getTime(),
        )
        const status: FounderWebResultsData['status'] =
          latestAttempt?.status === 'failed'
            ? 'provider_failure'
            : latestAttempt?.status === 'partial'
              ? 'unsupported'
              : items.length === 0
                ? 'no_results'
                : stale
                  ? 'stale'
                  : 'fresh'
        const data: FounderWebResultsData = {
          founderId: parsedParams.data.id,
          status,
          stale,
          items,
          ...(latestRun === undefined
            ? {}
            : { latestRun: publicRun(latestRun) }),
          ...(latestAttempt === undefined
            ? {}
            : { latestAttempt: publicRun(latestAttempt) }),
          history: runs.map(publicRun),
        }

        return FounderWebResultsResponseSchema.parse({
          ok: true,
          data,
        })
      } catch (error) {
        if (error instanceof RepositoryError) {
          return sendRepositoryError(reply, error)
        }
        return reply.code(500).send(
          errorEnvelope(
            'internal_error',
            'An unexpected error occurred',
          ),
        )
      }
    },
  )

  server.post('/api/v2/enrichment/runs', async (request, reply) => {
    const parsed = CreateEnrichmentRunRequestSchema.safeParse(
      request.body,
    )
    if (!parsed.success) {
      return reply.code(400).send(
        errorEnvelope(
          'invalid_request',
          'Invalid enrichment run request',
          parsed.error.issues,
        ),
      )
    }

    try {
      const batch = await options.runManager.create(parsed.data)
      return reply.code(202).send(
        EnrichmentBatchResponseSchema.parse({
          ok: true,
          data: batch,
        }),
      )
    } catch (error) {
      if (error instanceof ProviderError) {
        return reply.code(400).send(
          errorEnvelope(
            error.code,
            error.message,
          ),
        )
      }
      if (error instanceof RepositoryError) {
        return sendRepositoryError(reply, error)
      }
      return reply.code(500).send(
        errorEnvelope(
          'internal_error',
          'An unexpected error occurred',
        ),
      )
    }
  })

  server.get(
    '/api/v2/enrichment/runs/:id',
    async (request, reply) => {
      const parsedParams = EnrichmentRunParamsSchema.safeParse(
        request.params,
      )
      if (!parsedParams.success) {
        return reply.code(400).send(
          errorEnvelope(
            'invalid_request',
            'Invalid enrichment run ID',
            parsedParams.error.issues,
          ),
        )
      }
      const batch = options.runManager.get(parsedParams.data.id)
      if (!batch) {
        return reply.code(404).send(
          errorEnvelope(
            'not_found',
            `Enrichment run ${parsedParams.data.id} was not found`,
          ),
        )
      }
      return EnrichmentBatchResponseSchema.parse({
        ok: true,
        data: batch,
      })
    },
  )

  server.get(
    '/api/v2/enrichment/runs/:id/progress',
    async (request, reply) => {
      const parsedParams = EnrichmentRunParamsSchema.safeParse(
        request.params,
      )
      if (!parsedParams.success) {
        return reply.code(400).send(
          errorEnvelope(
            'invalid_request',
            'Invalid enrichment run ID',
            parsedParams.error.issues,
          ),
        )
      }
      const batch = options.runManager.get(parsedParams.data.id)
      if (!batch) {
        return reply.code(404).send(
          errorEnvelope(
            'not_found',
            `Enrichment run ${parsedParams.data.id} was not found`,
          ),
        )
      }
      return EnrichmentProgressResponseSchema.parse({
        ok: true,
        data: progressFromBatch(batch),
      })
    },
  )
}
