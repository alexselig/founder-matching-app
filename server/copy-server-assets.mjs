import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outputRoot = resolve(projectRoot, 'dist-server')

const assets = [
  {
    source: resolve(projectRoot, 'server/migrations/001-v2.sql'),
    destination: resolve(
      outputRoot,
      'server/migrations/001-v2.sql',
    ),
  },
  {
    source: resolve(projectRoot, 'src/founders.json'),
    destination: resolve(outputRoot, 'src/founders.json'),
  },
]

for (const asset of assets) {
  await mkdir(dirname(asset.destination), { recursive: true })
  await copyFile(asset.source, asset.destination)
}

await writeFile(
  resolve(outputRoot, 'package.json'),
  `${JSON.stringify({ type: 'module' }, null, 2)}\n`,
)
