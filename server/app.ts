import path from 'node:path'

import fastifyStatic from '@fastify/static'
import Fastify, { type FastifyInstance } from 'fastify'

import {
  createHealthResponse,
  type DatabaseStatus,
  type HealthResponse,
} from '../src/shared/contracts.js'
import type { FounderRepository } from './repositories/founders.js'
import type { WebResultsRepository } from './repositories/webResults.js'
import { aiRoutes } from './routes/ai.js'
import { enrichmentRoutes } from './routes/enrichment.js'
import { founderRoutes } from './routes/founders.js'
import type { AiInterpretationService } from './services/aiInterpretation.js'
import type { EnrichmentRunManager } from './services/enrichment.js'

export interface ServerOptions {
  databaseStatus: () => DatabaseStatus
  founderRepository: FounderRepository
  webResultsRepository: WebResultsRepository
  enrichmentRunManager: EnrichmentRunManager
  aiInterpretationService: AiInterpretationService
  staticRoot?: string
}

function isClientDocumentRoute(method: string, rawUrl: string | undefined) {
  if (method !== 'GET') {
    return false
  }

  const requestUrl = new URL(rawUrl ?? '/', 'http://127.0.0.1')
  const { pathname } = requestUrl

  if (pathname === '/api' || pathname.startsWith('/api/')) {
    return false
  }

  if (pathname === '/assets' || pathname.startsWith('/assets/')) {
    return false
  }

  const lastSegment = pathname.split('/').filter(Boolean).at(-1) ?? ''
  return !lastSegment.includes('.')
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

  server.register(founderRoutes, {
    repository: options.founderRepository,
  })
  server.register(enrichmentRoutes, {
    repository: options.webResultsRepository,
    runManager: options.enrichmentRunManager,
  })
  server.register(aiRoutes, {
    service: options.aiInterpretationService,
  })

  server.setNotFoundHandler((request, reply) => {
    if (!isClientDocumentRoute(request.method, request.raw.url)) {
      return reply.code(404).send({
        message: `Route ${request.method}:${request.url} not found`,
      })
    }

    return reply.type('text/html; charset=utf-8').sendFile('index.html')
  })

  return server
}
