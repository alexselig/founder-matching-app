import {
  type FastifyPluginAsync,
  type FastifyReply,
} from 'fastify'

import {
  ApiFailureEnvelopeSchema,
  FounderDetailResponseSchema,
  FounderListQuerySchema,
  FounderListResponseSchema,
  FounderParamsSchema,
  type ApiEnvelope,
  type FounderListData,
  type FounderListQuery,
} from '../../src/shared/contracts.js'
import {
  FounderRepository,
  type FounderListOptions,
} from '../repositories/founders.js'
import { RepositoryError } from '../repositories/errors.js'

export interface FounderRoutesOptions {
  repository: FounderRepository
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

function listOptions(
  query: FounderListQuery,
): FounderListOptions {
  return {
    limit: query.limit,
    offset: query.offset,
  }
}

export const founderRoutes: FastifyPluginAsync<
  FounderRoutesOptions
> = async (server, options) => {
  server.get('/api/v2/founders', async (request, reply) => {
    const parsedQuery = FounderListQuerySchema.safeParse(request.query)

    if (!parsedQuery.success) {
      return reply.code(400).send(
        errorEnvelope(
          'invalid_request',
          'Invalid founder list query',
          parsedQuery.error.issues,
        ),
      )
    }

    try {
      const data: FounderListData = {
        items: options.repository.list(
          listOptions(parsedQuery.data),
        ),
        total: options.repository.count(),
        limit: parsedQuery.data.limit,
        offset: parsedQuery.data.offset,
      }

      return FounderListResponseSchema.parse({
        ok: true,
        data,
      })
    } catch (error) {
      if (error instanceof RepositoryError) {
        return sendRepositoryError(reply, error)
      }

      return reply
        .code(500)
        .send(
          errorEnvelope(
            'internal_error',
            'An unexpected error occurred',
          ),
        )
    }
  })

  server.get('/api/v2/founders/:id', async (request, reply) => {
    const parsedParams = FounderParamsSchema.safeParse(request.params)

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
      return FounderDetailResponseSchema.parse({
        ok: true,
        data: options.repository.get(parsedParams.data.id),
      })
    } catch (error) {
      if (error instanceof RepositoryError) {
        return sendRepositoryError(reply, error)
      }

      return reply
        .code(500)
        .send(
          errorEnvelope(
            'internal_error',
            'An unexpected error occurred',
          ),
        )
    }
  })
}
