import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

import { chromium } from 'playwright'

const baseUrl = process.env.SHOWCASE_BASE_URL ?? 'http://127.0.0.1:4325'
const outputDir = resolve('docs/showcase/images')

await mkdir(outputDir, { recursive: true })

const browser = await chromium.launch({ headless: true })

async function openPage(path, options = {}) {
  const {
    demo = true,
    viewport = { width: 1440, height: 900 },
  } = options
  const context = await browser.newContext({ viewport })
  await context.addInitScript(({ demoMode }) => {
    localStorage.setItem('founder-app-demo-mode', demoMode ? 'true' : 'false')
    sessionStorage.setItem('founder-v2-account-tip-dismissed', 'true')
  }, { demoMode: demo })
  const page = await context.newPage()
  await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' })
  return { context, page }
}

async function capture(page, filename) {
  await page.screenshot({
    path: resolve(outputDir, filename),
    fullPage: false,
    animations: 'disabled',
  })
}

async function withPage(path, filename, prepare, options) {
  const { context, page } = await openPage(path, options)
  try {
    if (prepare) await prepare(page)
    await capture(page, filename)
  } finally {
    await context.close()
  }
}

async function runSearch(page, text) {
  await page.getByRole('textbox', { name: 'Describe the founders you want to meet' }).fill(text)
  await page.getByRole('button', { name: 'Search' }).click()
  await page.getByTestId('result-count').waitFor()
}

async function openTwentyTablePlan(page) {
  await page.getByRole('heading', { name: 'Demo · All Cohort Showcase' }).waitFor()
  await page.getByText('Table 01', { exact: true }).waitFor()
}

await withPage('/v2/search', '01-search-zero.png')

await withPage('/v2/search', '02-search-grid.png', async (page) => {
  await runSearch(page, 'Engineering founders in B2B software, age 25–33')
})

await withPage('/v2/search', '03-search-list.png', async (page) => {
  await runSearch(page, 'Engineering founders in B2B software, age 25–33')
  await page.getByRole('button', { name: 'List view' }).click()
})

await withPage('/v2/search', '04-search-no-results.png', async (page) => {
  await runSearch(page, 'engineers age 99')
  await page.getByRole('heading', { name: /No founders match/ }).waitFor()
})

await withPage('/v2/seating-plans', '05-seating-plans-zero.png', undefined, { demo: false })
await withPage('/v2/seating-plans', '06-seating-plans-populated.png')

await withPage('/v2/dinner', '07-dinner-configuration.png', async (page) => {
  await page.getByRole('button', { name: /Advanced criteria/ }).click()
  await page.getByRole('button', { name: '+ Add dimension' }).click()
  await page.getByRole('dialog', { name: 'Add matching dimension' }).waitFor()
})

await withPage('/v2/dinner', '08-rule-recovery.png', async (page) => {
  await page.getByLabel(/Seating plan name/).fill('Founder Dinner · Conflict Review')
  const cohortCard = page.getByText('2 · Founder cohort').locator('..')
  await cohortCard.getByRole('button').click()
  await page.getByRole('dialog', { name: 'Select founder cohort' })
    .getByRole('button', { name: /All loaded founders/ })
    .click()
  const tableDialog = page.getByRole('dialog', { name: 'Set tables and seats' })
  await tableDialog.getByRole('button', { name: /^20 × 8/ }).click()
  await tableDialog.getByRole('button', { name: 'Use this setup →' }).click()
  for (const text of ['Keep Ari Quill and Mira Quill together', 'Keep Ari Quill and Mira Quill apart']) {
    await page.getByRole('button', { name: /^\+ Add (custom|another) rule$/ }).click()
    const dialog = page.getByRole('dialog', { name: 'Add custom rule' })
    await dialog.getByLabel('Custom rule · plain language').fill(text)
    await dialog.getByRole('button', { name: 'Add hard rule' }).click()
  }
  await page.getByRole('button', { name: 'Generate tables →' }).click()
  await page.getByRole('heading', { name: 'Rules cannot all be true' }).waitFor()
})

const twentyTablePath = '/v2/dinner?plan=demo-plan-twenty-table-showcase&version=5'

await withPage(twentyTablePath, '09-tables.png', openTwentyTablePlan)

await withPage(twentyTablePath, '10-analysis.png', async (page) => {
  await openTwentyTablePlan(page)
  await page.getByRole('button', { name: 'Analysis' }).click()
  await page.getByText('Objective performance').waitFor()
})

await withPage('/v2/dinner?plan=demo-plan-five-table-operator-mix&version=4', '11-alternatives.png', async (page) => {
  await page.getByRole('heading', { name: 'Demo · Fintech Operator Mix' }).waitFor()
  await page.getByText('Table 01', { exact: true }).waitFor()
  await page.getByRole('button', { name: /Generate 2 Alternatives/ }).click()
  await page.getByRole('heading', { name: 'Choose the strongest arrangement.' }).waitFor()
})

await withPage('/v2/seating-plans', '12-saved-history.png', async (page) => {
  await page.getByRole('button', { name: /Versions · 5/ }).click()
  await page.getByRole('region', { name: /Version history · Demo · All Cohort Showcase/ }).waitFor()
})

await withPage(twentyTablePath, '13-export.png', async (page) => {
  await openTwentyTablePlan(page)
  await page.getByRole('button', { name: 'Export' }).click()
  await page.getByRole('dialog', { name: 'CONFIRM EXPORT CONTENT' }).waitFor()
})

await withPage('/v2/founders/demo-founder-ae527df17156/evidence', '14-web-evidence.png', async (page) => {
  await page.getByRole('dialog', { name: 'Top web results' }).waitFor()
})

await withPage('/v2/settings/ai', '15-ai-provider.png', async (page) => {
  await page.getByText('Credential is valid').waitFor()
})

await withPage(
  twentyTablePath,
  '16-mobile-tables.png',
  openTwentyTablePlan,
  { viewport: { width: 390, height: 844 } },
)

await browser.close()
console.log(`Captured 16 showcase images in ${outputDir}`)
