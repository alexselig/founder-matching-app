import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export {
  buildDemoFixtureBundle,
  DEMO_FIXTURE_FILE_NAMES,
  renderDemoFixtureFiles,
} from '../src/fixtures/demo/generator.js'

import {
  buildDemoFixtureBundle,
  renderDemoFixtureFiles,
} from '../src/fixtures/demo/generator.js'

const outputDirectory = resolve(process.cwd(), 'src/fixtures/demo')

export function writeDemoFixtureFiles() {
  const rendered = renderDemoFixtureFiles(buildDemoFixtureBundle())
  mkdirSync(outputDirectory, { recursive: true })

  for (const [fileName, contents] of Object.entries(rendered)) {
    writeFileSync(resolve(outputDirectory, fileName), contents)
  }
}

const invokedPath = process.argv[1]
if (
  invokedPath &&
  pathToFileURL(resolve(invokedPath)).href === import.meta.url
) {
  writeDemoFixtureFiles()
}
