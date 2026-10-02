import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (file: string) => readFileSync(resolve(process.cwd(), 'src/v2/dinner', file), 'utf8')

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
  it('drops to the reference two-card tablet grid before three cards squeeze founder names', () => {
    const css = read('dinner-results.css')
    const narrowDesktop = css.slice(css.indexOf('@container dinner (max-width: 1180px)'), css.indexOf('@container dinner (max-width: 900px)'))
    expect(narrowDesktop).not.toBe('')
    expect(narrowDesktop).toMatch(/\.v2-dinner-tables \{ grid-template-columns: repeat\(2, minmax\(250px, 1fr\)\); \}/)
  })
})
