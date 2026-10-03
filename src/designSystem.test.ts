import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('Bauhausian design-system naming', () => {
  it('uses neutral design token and component identifiers', () => {
    const design = read('DESIGN.md')
    const indexCss = read('src/index.css')
    const chromeCss = read('src/v2/search/v2-chrome.css')
    const app = read('src/App.tsx')
    const source = [design, indexCss, chromeCss, app].join('\n')

    expect(source).not.toMatch(/YC Design System|Y Combinator|--yc-|\.yc-link-button|yc-link-button/)
    expect(indexCss).toContain('--bauhaus-orange: #f26522;')
    expect(chromeCss).toContain('var(--bauhaus-orange, #f26522)')
    expect(app).toContain('className="bauhaus-link-button"')
  })
})
