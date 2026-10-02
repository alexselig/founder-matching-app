import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import type { FastifyInstance } from 'fastify'

import { normalizeFounders } from '../src/shared/founder.js'
import { createServer } from './app.js'
import { createDatabase } from './database.js'
import { createConfiguredProviders } from './providers/configured.js'
import { FounderRepository } from './repositories/founders.js'
import { WebResultsRepository } from './repositories/webResults.js'
import { createAiInterpretationService } from './services/aiInterpretation.js'
import {
  createEnrichmentRunManager,
  createEnrichmentService,
} from './services/enrichment.js'

export function requireDurableDatabasePath(
  environment: NodeJS.ProcessEnv,
) {
  const databasePath = environment.DATABASE_PATH

  if (!databasePath || databasePath === ':memory:') {
    throw new Error(
      'DATABASE_PATH must name a durable SQLite file',
    )
  }

  return databasePath
}

function loadFounders() {
  const fixturePath = resolveRuntimeFile(
    '../src/founders.json',
    [
      resolve(process.cwd(), 'src/founders.json'),
      resolve(process.cwd(), 'dist-server/src/founders.json'),
    ],
    'founders.json',
  )
  const rawFounders = JSON.parse(
    readFileSync(fixturePath, 'utf8'),
  ) as unknown

  return normalizeFounders(rawFounders)
}

function moduleRelativePath(relativePath: string) {
  const moduleUrl = new URL(import.meta.url)
  return moduleUrl.protocol === 'file:'
    ? fileURLToPath(new URL(relativePath, moduleUrl))
    : undefined
}

function resolveRuntimeFile(
  moduleRelative: string,
  fallbackPaths: string[],
  label: string,
) {
  const candidates = [
    moduleRelativePath(moduleRelative),
    ...fallbackPaths,
  ].filter((candidate): candidate is string => candidate !== undefined)
  const filePath = candidates.find((candidate) => existsSync(candidate))

  if (!filePath) {
    throw new Error(`Could not locate ${label}`)
  }

  return filePath
}

function resolveStaticRoot(environment: NodeJS.ProcessEnv) {
  if (environment.STATIC_ROOT) {
    return resolve(environment.STATIC_ROOT)
  }

  const candidates = [
    moduleRelativePath('../dist'),
    moduleRelativePath('../../dist'),
    resolve(process.cwd(), 'dist'),
  ].filter((candidate): candidate is string => candidate !== undefined)
  const staticRoot = candidates.find((candidate) => existsSync(candidate))

  if (!staticRoot) {
    throw new Error('Could not locate built client assets')
  }

  return staticRoot
}

export async function startServer(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<FastifyInstance> {
  const port = Number(environment.PORT ?? '3000')
  const host = environment.HOST ?? '127.0.0.1'
  const database = createDatabase({
    filename: requireDurableDatabasePath(environment),
  })

  try {
    const founderRepository = new FounderRepository(database)
    founderRepository.saveAll(loadFounders())
    const webResultsRepository = new WebResultsRepository(database)
    const providers = createConfiguredProviders(environment)
    const enrichmentService = createEnrichmentService({
      founderRepository,
      webResultsRepository,
      providers,
    })

    const server = createServer({
      databaseStatus: () =>
        database.open ? 'ready' : 'not-ready',
      founderRepository,
      webResultsRepository,
      enrichmentRunManager: createEnrichmentRunManager({
        service: enrichmentService,
      }),
      aiInterpretationService: createAiInterpretationService({
        providers,
      }),
      staticRoot: resolveStaticRoot(environment),
    })
    let closing = false

    const shutdown = (signal: NodeJS.Signals) => {
      if (closing) {
        return
      }
      closing = true
      server.log.info({ signal }, 'Closing founder app server')
      void server.close().catch((error: unknown) => {
        server.log.error(error)
        process.exitCode = 1
      })
    }
    const onSigint = () => shutdown('SIGINT')
    const onSigterm = () => shutdown('SIGTERM')

    process.once('SIGINT', onSigint)
    process.once('SIGTERM', onSigterm)
    server.addHook('onClose', async () => {
      process.removeListener('SIGINT', onSigint)
      process.removeListener('SIGTERM', onSigterm)
      if (database.open) {
        database.close()
      }
    })

    try {
      await server.listen({ port, host })
    } catch (error) {
      await server.close()
      throw error
    }

    console.log(`Founder app server listening on http://${host}:${port}`)
    return server
  } catch (error) {
    if (database.open) {
      database.close()
    }
    throw error
  }
}

function isMainModule() {
  const entryPath = process.argv[1]
  return (
    entryPath !== undefined &&
    import.meta.url === pathToFileURL(resolve(entryPath)).href
  )
}

if (isMainModule()) {
  try {
    await startServer()
  } catch {
    console.error('Founder app server failed to start')
    process.exitCode = 1
  }
}
