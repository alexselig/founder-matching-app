import {
  cp,
  mkdir,
  rm,
  symlink,
} from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const scratchRoot = join(
  homedir(),
  `.founder-app-built-smoke-${process.pid}`,
)
const artifactRoot = join(scratchRoot, 'artifact')
const workingRoot = join(scratchRoot, 'working')
const databasePath = join(scratchRoot, 'founders.sqlite')
const masterKey = Buffer.alloc(32, 42).toString('base64')
const originalCwd = process.cwd()
let server

try {
  await mkdir(artifactRoot, { recursive: true })
  await mkdir(workingRoot, { recursive: true })
  await cp(
    resolve(projectRoot, 'dist-server'),
    join(artifactRoot, 'dist-server'),
    { recursive: true },
  )
  await cp(
    resolve(projectRoot, 'dist'),
    join(artifactRoot, 'dist'),
    { recursive: true },
  )
  await symlink(
    resolve(projectRoot, 'node_modules'),
    join(artifactRoot, 'node_modules'),
    'dir',
  )

  process.chdir(workingRoot)

  const builtIndexUrl = pathToFileURL(
    join(artifactRoot, 'dist-server/server/index.js'),
  )
  builtIndexUrl.searchParams.set('smoke', String(Date.now()))
  const { startServer } = await import(builtIndexUrl.href)

  let invalidKeyError
  try {
    const rejected = await startServer({
      DATABASE_PATH: databasePath,
      HOST: '127.0.0.1',
      PORT: '0',
      FOUNDER_APP_MASTER_KEY: 'not-a-32-byte-key',
    })
    await rejected.close()
  } catch (error) {
    invalidKeyError = error
  }
  if (invalidKeyError?.code !== 'master_key_invalid') {
    throw new Error('Built server accepted an invalid FOUNDER_APP_MASTER_KEY')
  }

  server = await startServer({
    DATABASE_PATH: databasePath,
    HOST: '127.0.0.1',
    PORT: '0',
    FOUNDER_APP_MASTER_KEY: masterKey,
  })

  const response = await server.inject({
    method: 'GET',
    url: '/api/v2/founders?limit=1',
  })
  const payload = response.json()

  if (
    response.statusCode !== 200 ||
    payload.ok !== true ||
    payload.data?.total !== 574
  ) {
    throw new Error('Built server did not seed 574 founders')
  }

  const credentials = await server.inject({
    method: 'GET',
    url: '/api/v2/providers/credentials',
  })
  if (
    credentials.statusCode !== 200 ||
    credentials.json().data?.masterKeyConfigured !== true
  ) {
    throw new Error('Built server did not report credential status')
  }

  const founderIds = (
    await server.inject({ method: 'GET', url: '/api/v2/founders?limit=2' })
  )
    .json()
    .data.items.map((founder) => founder.id)
  const state = {
    cohort: { source: 'direct', founderIds },
    tableCount: null,
    criteria: { criteria: [] },
    rules: [],
    locks: [],
    assignments: [],
    metrics: null,
    alternatives: [],
    chosenAlternativeId: null,
    threshold: 70,
    notes: [],
  }
  const created = await server.inject({
    method: 'POST',
    url: '/api/v2/dinners',
    payload: { name: 'Smoke Dinner', state },
  })
  const dinnerId = created.json().data?.id
  const reopened = await server.inject({
    method: 'GET',
    url: `/api/v2/dinners/${dinnerId}`,
  })
  const exported = await server.inject({
    method: 'GET',
    url: `/api/v2/dinners/${dinnerId}/export?format=csv`,
  })
  if (
    created.statusCode !== 201 ||
    !isDeepStrictEqual(reopened.json().data?.state, state) ||
    exported.statusCode !== 200 ||
    !exported.headers['content-disposition']?.startsWith(
      'attachment; filename="smoke-dinner-v1-',
    ) ||
    exported.body.split('\r\n').length !== 3
  ) {
    throw new Error('Built server did not save, reopen, and export a dinner')
  }

  await server.close()
  server = undefined

  console.log(
    'built-only startup smoke passed with 574 founders, credential status, and dinner save/reopen/export outside the repository cwd',
  )
} finally {
  if (server) {
    await server.close()
  }
  process.chdir(originalCwd)
  await rm(scratchRoot, { recursive: true, force: true })
}
