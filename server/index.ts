import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import type { FastifyInstance } from 'fastify'

import { normalizeFounders } from '../src/shared/founder.js'
import { createServer } from './app.js'
import { createDatabase } from './database.js'
import { FounderRepository } from './repositories/founders.js'

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
  const fixturePath = resolve(process.cwd(), 'src/founders.json')
  const rawFounders = JSON.parse(
    readFileSync(fixturePath, 'utf8'),
  ) as unknown

  return normalizeFounders(rawFounders)
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

    const server = createServer({
      databaseStatus: () =>
        database.open ? 'ready' : 'not-ready',
      founderRepository,
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
