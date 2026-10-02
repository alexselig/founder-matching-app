import {
  cp,
  mkdir,
  rm,
  symlink,
} from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const scratchRoot = join(
  homedir(),
  `.founder-app-built-smoke-${process.pid}`,
)
const artifactRoot = join(scratchRoot, 'artifact')
const workingRoot = join(scratchRoot, 'working')
const databasePath = join(scratchRoot, 'founders.sqlite')
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

  server = await startServer({
    DATABASE_PATH: databasePath,
    HOST: '127.0.0.1',
    PORT: '0',
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

  await server.close()
  server = undefined

  console.log(
    'built-only startup smoke passed with 574 founders outside the repository cwd',
  )
} finally {
  if (server) {
    await server.close()
  }
  process.chdir(originalCwd)
  await rm(scratchRoot, { recursive: true, force: true })
}
