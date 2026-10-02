import type { FastifyPluginAsync } from 'fastify'

import type { ExportService } from '../services/export.js'
import {
  safeErrorCode,
  sanitizedRequestError,
  sendAttachment,
  sendServiceError,
} from './responses.js'

export interface ExportRoutesOptions {
  exports: ExportService
}

const FOUNDER_EXPORT_BODY_LIMIT = 256 * 1024

export const exportRoutes: FastifyPluginAsync<ExportRoutesOptions> = async (
  server,
  options,
) => {
  server.setErrorHandler((error, request, reply) => {
    const { status, envelope } = sanitizedRequestError(error)
    request.log.warn(
      { statusCode: status, code: safeErrorCode(error) },
      'Export request rejected',
    )
    return reply.code(status).send(envelope)
  })

  server.post(
    '/api/v2/exports/founders',
    { bodyLimit: FOUNDER_EXPORT_BODY_LIMIT },
    async (request, reply) => {
      try {
        return sendAttachment(
          reply,
          options.exports.exportFounders(request.body),
        )
      } catch (error) {
        return sendServiceError(reply, error)
      }
    },
  )
}
