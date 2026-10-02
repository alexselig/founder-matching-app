import type {
  FastifyPluginAsync,
  FastifyReply,
} from 'fastify'

import {
  ApiFailureEnvelopeSchema,
  InterpretationRequestSchema,
  InterpretationResponseSchema,
  type ApiEnvelope,
} from '../../src/shared/contracts.js'
import type { AiInterpretationService } from '../services/aiInterpretation.js'

export interface AiRoutesOptions {
  service: AiInterpretationService
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

export const aiRoutes: FastifyPluginAsync<
  AiRoutesOptions
> = async (server, options) => {
  async function interpret(
    requestBody: unknown,
    execute: (
      provider: 'openai' | 'anthropic' | 'xai',
      input: string,
    ) => Promise<unknown>,
    reply: FastifyReply,
  ) {
    const parsed = InterpretationRequestSchema.safeParse(requestBody)
    if (!parsed.success) {
      return reply.code(400).send(
        errorEnvelope(
          'invalid_request',
          'Invalid AI interpretation request',
          parsed.error.issues,
        ),
      )
    }

    const result = await execute(
      parsed.data.provider,
      parsed.data.input,
    )
    return InterpretationResponseSchema.parse({
      ok: true,
      data: result,
    })
  }

  server.post(
    '/api/v2/ai/interpret/search',
    async (request, reply) =>
      interpret(
        request.body,
        options.service.interpretSearch,
        reply,
      ),
  )

  server.post(
    '/api/v2/ai/interpret/dinner-criteria',
    async (request, reply) =>
      interpret(
        request.body,
        options.service.interpretDinnerCriteria,
        reply,
      ),
  )

  server.post(
    '/api/v2/ai/interpret/hard-rule',
    async (request, reply) =>
      interpret(
        request.body,
        options.service.interpretHardRule,
        reply,
      ),
  )
}
