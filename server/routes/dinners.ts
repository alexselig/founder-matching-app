import type { FastifyPluginAsync } from 'fastify'

import {
  DinnerListEnvelopeSchema,
  DinnerParamsSchema,
  DinnerVersionListEnvelopeSchema,
  DinnerVersionParamsSchema,
  SavedDinnerEnvelopeSchema,
} from '../../src/shared/dinnerContracts.js'
import type { DinnerService } from '../services/dinners.js'
import type { ExportService } from '../services/export.js'
import {
  errorEnvelope,
  safeErrorCode,
  sanitizedRequestError,
  sendAttachment,
  sendServiceError,
} from './responses.js'

export interface DinnerRoutesOptions {
  dinners: DinnerService
  exports: ExportService
}

// A 1,000-founder dinner with three alternatives fits comfortably inside this.
export const DINNER_BODY_LIMIT = 4 * 1024 * 1024

function invalidParams() {
  return errorEnvelope('invalid_request', 'Invalid dinner identifier or version')
}

export const dinnerRoutes: FastifyPluginAsync<DinnerRoutesOptions> = async (
  server,
  options,
) => {
  server.setErrorHandler((error, request, reply) => {
    const { status, envelope } = sanitizedRequestError(error)
    request.log.warn(
      { statusCode: status, code: safeErrorCode(error) },
      'Dinner request rejected',
    )
    return reply.code(status).send(envelope)
  })

  server.get('/api/v2/dinners', async (_request, reply) => {
    try {
      return DinnerListEnvelopeSchema.parse({
        ok: true,
        data: { items: options.dinners.list() },
      })
    } catch (error) {
      return sendServiceError(reply, error)
    }
  })

  server.post(
    '/api/v2/dinners',
    { bodyLimit: DINNER_BODY_LIMIT },
    async (request, reply) => {
      try {
        const dinner = options.dinners.create(request.body)
        return reply
          .code(201)
          .header('location', `/api/v2/dinners/${encodeURIComponent(dinner.id)}`)
          .send(SavedDinnerEnvelopeSchema.parse({ ok: true, data: dinner }))
      } catch (error) {
        return sendServiceError(reply, error)
      }
    },
  )

  server.get('/api/v2/dinners/:id', async (request, reply) => {
    const params = DinnerParamsSchema.safeParse(request.params)
    if (!params.success) {
      return reply.code(400).send(invalidParams())
    }
    try {
      return SavedDinnerEnvelopeSchema.parse({
        ok: true,
        data: options.dinners.get(params.data.id),
      })
    } catch (error) {
      return sendServiceError(reply, error)
    }
  })

  server.get('/api/v2/dinners/:id/versions', async (request, reply) => {
    const params = DinnerParamsSchema.safeParse(request.params)
    if (!params.success) {
      return reply.code(400).send(invalidParams())
    }
    try {
      return DinnerVersionListEnvelopeSchema.parse({
        ok: true,
        data: { items: options.dinners.listVersions(params.data.id) },
      })
    } catch (error) {
      return sendServiceError(reply, error)
    }
  })

  server.post(
    '/api/v2/dinners/:id/versions',
    { bodyLimit: DINNER_BODY_LIMIT },
    async (request, reply) => {
      const params = DinnerParamsSchema.safeParse(request.params)
      if (!params.success) {
        return reply.code(400).send(invalidParams())
      }
      try {
        const dinner = options.dinners.appendVersion(
          params.data.id,
          request.body,
        )
        return reply
          .code(201)
          .header(
            'location',
            `/api/v2/dinners/${encodeURIComponent(dinner.id)}/versions/${dinner.version}`,
          )
          .send(SavedDinnerEnvelopeSchema.parse({ ok: true, data: dinner }))
      } catch (error) {
        return sendServiceError(reply, error)
      }
    },
  )

  server.get(
    '/api/v2/dinners/:id/versions/:version',
    async (request, reply) => {
      const params = DinnerVersionParamsSchema.safeParse(request.params)
      if (!params.success) {
        return reply.code(400).send(invalidParams())
      }
      try {
        return SavedDinnerEnvelopeSchema.parse({
          ok: true,
          data: options.dinners.get(params.data.id, params.data.version),
        })
      } catch (error) {
        return sendServiceError(reply, error)
      }
    },
  )

  server.get('/api/v2/dinners/:id/export', async (request, reply) => {
    const params = DinnerParamsSchema.safeParse(request.params)
    if (!params.success) {
      return reply.code(400).send(invalidParams())
    }
    try {
      return sendAttachment(
        reply,
        options.exports.exportDinner(params.data.id, request.query),
      )
    } catch (error) {
      return sendServiceError(reply, error)
    }
  })
}
