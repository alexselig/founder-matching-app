import path from 'node:path'

import fastifyStatic from '@fastify/static'
import Fastify, { type FastifyInstance } from 'fastify'

import {
  createHealthResponse,
  type DatabaseStatus,
  type HealthResponse,
} from '../src/shared/contracts.js'

export interface ServerOptions {
  databaseStatus: () => DatabaseStatus
  staticRoot?: string
}

export function createServer(options: ServerOptions): FastifyInstance {
  const server = Fastify()
  const staticRoot = options.staticRoot ?? path.resolve(process.cwd(), 'dist')

  server.register(fastifyStatic, {
    root: staticRoot,
    prefix: '/',
  })

  const getHealthResponse = (): HealthResponse =>
    createHealthResponse(options.databaseStatus())

  server.get('/api/v2/health', async (): Promise<HealthResponse> => {
    return getHealthResponse()
  })

  server.get('/healthz', async (): Promise<HealthResponse> => {
    return getHealthResponse()
  })

  server.setNotFoundHandler((request, reply) => {
    if (request.method !== 'GET' || request.url.startsWith('/api/')) {
      return reply.code(404).send({
        message: `Route ${request.method}:${request.url} not found`,
      })
    }

    return reply.type('text/html; charset=utf-8').sendFile('index.html')
  })

  return server
}
