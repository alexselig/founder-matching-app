import type { FastifyPluginAsync, FastifyReply } from 'fastify'

import {
  PROVIDER_LABELS,
  ProviderCredentialListEnvelopeSchema,
  ProviderCredentialParamsSchema,
  ProviderCredentialRequestSchema,
  ProviderCredentialStatusEnvelopeSchema,
  type ProviderId,
} from '../../src/shared/providerContracts.js'
import {
  CredentialError,
  ProviderSecret,
  type CredentialErrorCode,
  type CredentialVault,
} from '../services/credentials.js'
import {
  errorEnvelope,
  safeErrorCode,
  sanitizedRequestError,
  sendInternalError,
} from './responses.js'

export type CredentialValidationResult =
  | { ok: true }
  | { ok: false; reason: 'invalid' | 'rate_limited' | 'unavailable' }

export type CredentialValidator = (
  provider: ProviderId,
  secret: ProviderSecret,
) => Promise<CredentialValidationResult>

export interface ProviderRoutesOptions {
  vault: CredentialVault
  validateCredential?: CredentialValidator
  now?: () => Date
}

const CREDENTIAL_BODY_LIMIT = 4096

const CREDENTIAL_ERROR_STATUS: Record<CredentialErrorCode, number> = {
  master_key_missing: 503,
  master_key_invalid: 503,
  master_key_mismatch: 503,
  invalid_provider: 404,
  invalid_credential: 400,
  credential_not_found: 404,
  credential_corrupted: 500,
  storage_failure: 500,
}

function sendCredentialError(reply: FastifyReply, error: unknown) {
  if (error instanceof CredentialError) {
    return reply
      .code(CREDENTIAL_ERROR_STATUS[error.code])
      .send(errorEnvelope(error.code, error.message))
  }
  return sendInternalError(reply)
}

function parseProvider(params: unknown) {
  const parsed = ProviderCredentialParamsSchema.safeParse(params)
  return parsed.success ? parsed.data.provider : undefined
}

function sendUnknownProvider(reply: FastifyReply) {
  return reply
    .code(404)
    .send(errorEnvelope('provider_not_found', 'Unknown AI provider'))
}

async function validate(
  validator: CredentialValidator,
  provider: ProviderId,
  secret: ProviderSecret,
): Promise<CredentialValidationResult> {
  try {
    const result = await validator(provider, secret)
    if (result?.ok === true) {
      return { ok: true }
    }
    if (
      result?.ok === false &&
      ['invalid', 'rate_limited', 'unavailable'].includes(result.reason)
    ) {
      return { ok: false, reason: result.reason }
    }
  } catch {
    // Provider SDK errors can echo request headers; discard them entirely.
  }
  return { ok: false, reason: 'unavailable' }
}

export const providerRoutes: FastifyPluginAsync<
  ProviderRoutesOptions
> = async (server, options) => {
  const now = options.now ?? (() => new Date())

  server.addHook('onSend', async (_request, reply, payload) => {
    reply.header('cache-control', 'no-store')
    return payload
  })

  server.setErrorHandler((error, request, reply) => {
    const { status, envelope } = sanitizedRequestError(error)
    request.log.warn(
      { statusCode: status, code: safeErrorCode(error) },
      'Provider credential request rejected',
    )
    return reply.code(status).send(envelope)
  })

  server.get('/api/v2/providers/credentials', async (_request, reply) => {
    try {
      return ProviderCredentialListEnvelopeSchema.parse({
        ok: true,
        data: options.vault.list(),
      })
    } catch (error) {
      return sendCredentialError(reply, error)
    }
  })

  server.put(
    '/api/v2/providers/:provider/credential',
    { bodyLimit: CREDENTIAL_BODY_LIMIT },
    async (request, reply) => {
      const provider = parseProvider(request.params)
      if (!provider) {
        return sendUnknownProvider(reply)
      }

      const body = ProviderCredentialRequestSchema.safeParse(request.body)
      if (!body.success) {
        return reply
          .code(400)
          .send(
            errorEnvelope(
              'invalid_request',
              'Request body must be {"secret": string}',
            ),
          )
      }

      const secret = new ProviderSecret(body.data.secret.trim())
      try {
        options.vault.assertCanStore(provider, secret)
      } catch (error) {
        return sendCredentialError(reply, error)
      }

      if (!options.validateCredential) {
        return reply
          .code(503)
          .send(
            errorEnvelope(
              'credential_validation_unavailable',
              `${PROVIDER_LABELS[provider]} credential validation is not available on this server`,
            ),
          )
      }

      const result = await validate(
        options.validateCredential,
        provider,
        secret,
      )
      if (!result.ok) {
        request.log.info(
          { provider, reason: result.reason },
          'Provider credential validation did not succeed',
        )
        if (result.reason === 'invalid') {
          return reply
            .code(422)
            .send(
              errorEnvelope(
                'credential_invalid',
                `${PROVIDER_LABELS[provider]} rejected this credential`,
              ),
            )
        }
        return reply
          .code(503)
          .send(
            result.reason === 'rate_limited'
              ? errorEnvelope(
                  'provider_rate_limited',
                  `${PROVIDER_LABELS[provider]} is rate limiting validation; try again shortly`,
                )
              : errorEnvelope(
                  'provider_unavailable',
                  `${PROVIDER_LABELS[provider]} could not be reached to validate this credential`,
                ),
          )
      }

      try {
        return ProviderCredentialStatusEnvelopeSchema.parse({
          ok: true,
          data: options.vault.store(provider, secret, now()),
        })
      } catch (error) {
        return sendCredentialError(reply, error)
      }
    },
  )

  server.delete(
    '/api/v2/providers/:provider/credential',
    async (request, reply) => {
      const provider = parseProvider(request.params)
      if (!provider) {
        return sendUnknownProvider(reply)
      }

      try {
        return ProviderCredentialStatusEnvelopeSchema.parse({
          ok: true,
          data: options.vault.remove(provider),
        })
      } catch (error) {
        return sendCredentialError(reply, error)
      }
    },
  )
}
