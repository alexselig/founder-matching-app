import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (file: string) => readFileSync(resolve(process.cwd(), 'src/v2/dinner', file), 'utf8')
const readV2 = (file: string) => readFileSync(resolve(process.cwd(), 'src/v2', file), 'utf8')

describe('V2 shared responsive shell', () => {
  it('removes the desktop minimum width and creates a two-row mobile header', () => {
    const css = readV2('search/v2-chrome.css')
    const tablet = css.slice(css.indexOf('@media (max-width: 900px)'), css.indexOf('@media (max-width: 620px)'))
    const phone = css.slice(css.indexOf('@media (max-width: 620px)'))

    expect(tablet).toMatch(/\.v2-topbar \{[^}]*min-width: 0/)
    expect(phone).toMatch(/\.v2-topbar \{[^}]*grid-template-rows: 64px 48px/)
    expect(phone).toMatch(/\.v2-nav \{[^}]*grid-column: 1 \/ -1/)
  })

  it('keeps the mobile footer inside the safe area', () => {
    const css = readV2('layout/v2-footer-actions.css')
    expect(css).toMatch(/env\(safe-area-inset-bottom\)/)
  })
})

describe('V2 responsive routes', () => {
  it('stacks Search and constrains its picker to the viewport', () => {
    const css = readV2('search/search.css')
    const tablet = css.slice(css.indexOf('@media (max-width: 900px)'), css.indexOf('@media (max-width: 620px)'))
    const phone = css.slice(css.indexOf('@media (max-width: 620px)'))

    expect(tablet).toMatch(/\.v2-hero \{[^}]*grid-template-columns: 1fr/)
    expect(tablet).toMatch(/\.v2-founder-grid \{[^}]*grid-template-columns: repeat\(2/)
    expect(phone).toMatch(/\.v2-recommendation-columns \{[^}]*grid-template-columns: 1fr/)
    expect(phone).toMatch(/\.v2-founder-grid \{[^}]*grid-template-columns: 1fr/)
    expect(phone).toMatch(/\.v2-picker \{[^}]*width: calc\(100vw - 32px\)/)
  })

  it('gives secondary-route mobile controls adequate hit areas', () => {
    const plans = read('seating-plans.css')
    const ai = readV2('settings/ai-provider.css')
    const evidence = readV2('evidence/founder-evidence.css')

    expect(plans).toMatch(/@container plans \(max-width: 760px\)[\s\S]*\.v2-plans-dialog-close \{[^}]*width: 44px;[^}]*height: 44px/)
    expect(ai).toMatch(/@media \(max-width: 620px\)[\s\S]*\.v2-ai-config \{[^}]*padding: 24px 20px/)
    expect(evidence).toMatch(/@media \(max-width: 640px\)[\s\S]*\.v2-evidence-close \{[^}]*width: 44px;[^}]*height: 44px/)
  })

  it('keeps the web-results action as a flat text button', () => {
    const evidence = readV2('evidence/founder-evidence.css')
    expect(evidence).toMatch(/\.v2-evidence-link \{[^}]*appearance: none;[^}]*border: 0;[^}]*box-shadow: none;[^}]*background: transparent/)
  })
})

describe('Dinner and Seating Plans responsive header', () => {
  it('is shared by both workbench pages', () => {
    expect(read('DinnerPage.tsx')).toContain("import './dinner-header.css'")
    expect(read('SeatingPlansPage.tsx')).toContain("import './dinner-header.css'")
  })

  it('ports the reference 900px and 560px header rules for both shells', () => {
    const css = read('dinner-header.css')
    const tablet = css.slice(css.indexOf('@media (max-width: 900px)'), css.indexOf('@media (max-width: 560px)'))
    const phone = css.slice(css.indexOf('@media (max-width: 560px)'))

    expect(tablet).toMatch(/:is\(\.v2-dinner-shell, \.v2-plans-shell\) \.v2-topbar \{[^}]*grid-template-columns: 190px 1fr 190px/)
    expect(tablet).toMatch(/\.v2-nav-item \{[^}]*padding: 0 13px;[^}]*font-size: 11px/)
    expect(phone).toMatch(/\.v2-topbar \{[^}]*grid-template-columns: 1fr 116px/)
    expect(phone).toMatch(/\.v2-nav \{[^}]*display: none/)
    // The shared chrome pins the profile to column 3; the two-column phone header must re-home it.
    expect(phone).toMatch(/\.v2-profile \{[^}]*grid-column: 2/)
    expect(phone).toMatch(/\.v2-profile small,[^{]*\.v2-chevron \{[^}]*display: none/)
    expect(phone).toMatch(/\.v2-profile-avatar \{[^}]*width: 30px;[^}]*height: 30px/)
  })

  it('no longer carries the partial header overrides in dinner.css', () => {
    expect(read('dinner.css')).not.toMatch(/\.v2-dinner-shell \.v2-topbar \{ grid-template-columns/)
  })
})

describe('Dinner tables responsive grid', () => {
  it('uses a labeled compact View toggle and keeps the threshold legend visible', () => {
    const css = read('dinner-results.css')
    expect(css).toMatch(/\.v2-dinner-work-tools \{[^}]*padding: 0 14px 0 20px/)
    expect(css).toMatch(/\.v2-dinner-view-label,[^{]*\.v2-dinner-legend-label/)
    expect(css).toMatch(/\.v2-dinner-segmented button \{[^}]*height: 32px;[^}]*border: 1px solid var\(--line-strong\)/)
    expect(css).toMatch(/\.v2-dinner-segmented \.v2-dinner-active \{[^}]*background: var\(--ink\);[^}]*color: white/)
    expect(css).not.toContain('.v2-dinner-density')

    const tablet = css.slice(css.indexOf('@container dinner (max-width: 900px)'), css.indexOf('@container dinner (max-width: 560px)'))
    const phone = css.slice(css.indexOf('@container dinner (max-width: 560px)'))
    expect(tablet).toMatch(/\.v2-dinner-work-tools \{[^}]*flex-wrap: wrap;[^}]*padding: 0 10px 12px 16px/)
    expect(phone).toMatch(/\.v2-dinner-work-tools \{[^}]*display: grid;[^}]*padding: 10px 8px 12px 12px/)
    expect(css).toMatch(/\.v2-dinner-segmented button \{[^}]*padding: 0 13px/)
    expect(css).toMatch(/\.v2-dinner-view, \.v2-dinner-legend, \.v2-dinner-threshold \{[^}]*justify-content: flex-start;[^}]*padding-top: 12px/)
    expect(css).toMatch(/\.v2-dinner-legend i \{[^}]*width: 28px;[^}]*height: 28px/)
    expect(tablet).not.toMatch(/\.v2-dinner-legend \{[^}]*display: none/)
    expect(phone).toMatch(/\.v2-dinner-legend \{[^}]*grid-column: 1 \/ -1/)
    expect(phone).toMatch(/\.v2-dinner-segmented button \{[^}]*padding: 0 14px/)
  })

  it('drops to the reference two-card tablet grid before three cards squeeze founder names', () => {
    const css = read('dinner-results.css')
    const narrowDesktop = css.slice(css.indexOf('@container dinner (max-width: 1180px)'), css.indexOf('@container dinner (max-width: 900px)'))
    expect(narrowDesktop).not.toBe('')
    expect(narrowDesktop).toMatch(/\.v2-dinner-tables \{ grid-template-columns: repeat\(2, minmax\(250px, 1fr\)\); \}/)
  })
})
