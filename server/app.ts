import Fastify, { type FastifyInstance } from 'fastify'

import {
  appVersion,
  HealthResponseSchema,
  type DatabaseStatus,
  type HealthResponse,
} from '../src/shared/contracts.js'

export interface ServerOptions {
  databaseStatus: () => DatabaseStatus
}

export function createServer(options: ServerOptions): FastifyInstance {
  const server = Fastify()

  server.get('/api/v2/health', async (): Promise<HealthResponse> => {
    return HealthResponseSchema.parse({
      version: appVersion,
      database: options.databaseStatus(),
    })
  })

  return server
}
