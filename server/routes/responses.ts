import type { FastifyReply } from 'fastify'

import {
  ApiFailureEnvelopeSchema,
  type ApiEnvelope,
} from '../../src/shared/contracts.js'
import { RepositoryError } from '../repositories/errors.js'
import {
  DinnerServiceError,
  type DinnerServiceErrorCode,
} from '../services/dinners.js'
import {
  ExportError,
  type ExportErrorCode,
  type ExportFile,
} from '../services/export.js'

export function errorEnvelope(
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

const REPOSITORY_STATUS = {
  not_found: 404,
  conflict: 409,
  invalid_data: 400,
  storage_failure: 500,
} as const

export function sendRepositoryError(
  reply: FastifyReply,
  error: RepositoryError,
) {
  return reply
    .code(REPOSITORY_STATUS[error.code])
    .send(errorEnvelope(error.code, error.message))
}

export function sendInternalError(reply: FastifyReply) {
  return reply
    .code(500)
    .send(errorEnvelope('internal_error', 'An unexpected error occurred'))
}

interface HttpError {
  statusCode?: unknown
  code?: unknown
}

// Fastify body-parser messages can quote request bytes, so only fixed text is returned.
export function sanitizedRequestError(error: unknown) {
  const { statusCode, code } = (error ?? {}) as HttpError
  const status =
    typeof statusCode === 'number' && statusCode >= 400 && statusCode < 600
      ? statusCode
      : 500

  if (status === 413) {
    return {
      status,
      envelope: errorEnvelope('payload_too_large', 'Request body is too large'),
    }
  }
  if (status === 415) {
    return {
      status,
      envelope: errorEnvelope(
        'unsupported_media_type',
        'Request body must be JSON',
      ),
    }
  }
  if (code === 'FST_ERR_CTP_INVALID_JSON_BODY' || status === 400) {
    return {
      status: 400,
      envelope: errorEnvelope(
        'invalid_request',
        'Request body must be valid JSON',
      ),
    }
  }
  if (status < 500) {
    return {
      status,
      envelope: errorEnvelope('invalid_request', 'Invalid request'),
    }
  }
  return {
    status: 500,
    envelope: errorEnvelope('internal_error', 'An unexpected error occurred'),
  }
}

export function safeErrorCode(error: unknown) {
  const { code } = (error ?? {}) as HttpError
  return typeof code === 'string' && /^[A-Z0-9_]{1,64}$/.test(code)
    ? code
    : undefined
}

const DINNER_ERROR_STATUS: Record<DinnerServiceErrorCode, number> = {
  invalid_dinner: 400,
  unknown_founders: 422,
  saved_dinner_unreadable: 500,
}

const EXPORT_ERROR_STATUS: Record<ExportErrorCode, number> = {
  invalid_export: 400,
  unknown_founders: 422,
}

export function sendServiceError(reply: FastifyReply, error: unknown) {
  if (error instanceof RepositoryError) {
    return sendRepositoryError(reply, error)
  }
  if (error instanceof DinnerServiceError) {
    return reply
      .code(DINNER_ERROR_STATUS[error.code])
      .send(errorEnvelope(error.code, error.message, error.details))
  }
  if (error instanceof ExportError) {
    return reply
      .code(EXPORT_ERROR_STATUS[error.code])
      .send(errorEnvelope(error.code, error.message, error.details))
  }
  reply.log.error({ code: safeErrorCode(error) }, 'Unexpected request failure')
  return sendInternalError(reply)
}

export function sendAttachment(reply: FastifyReply, file: ExportFile) {
  return reply
    .header('content-type', file.contentType)
    .header('content-disposition', `attachment; filename="${file.filename}"`)
    .header('cache-control', 'no-store')
    .send(file.body)
}
