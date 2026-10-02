import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('founder-app-demo-mode', 'true')
    localStorage.setItem('founder-v2-account-tip-dismissed', 'true')
  })
})

test('loads public-safe Demo discovery and saved plans', async ({ page }) => {
  await page.goto('/v2')
  await expect(
    page.getByRole('heading', { name: 'Find the right founders.' }),
  ).toBeVisible()
  await expect(page.getByText('Ari North')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Demo mode On' })).toBeVisible()

  await page.goto('/v2/seating-plans')
  await expect(page.getByText('4 seating plans')).toBeVisible()
  await page.getByRole('button', { name: 'Reopen' }).first().click()
  await expect(page).toHaveURL(/\/v2\/dinner\?plan=/)
  await expect(
    page.getByRole('heading', {
      name: 'Demo · AI Infrastructure Roundtable',
    }),
  ).toBeVisible()
  await expect(page.getByText('Table 01', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Demo mode On' }).click()
  await expect(page).toHaveURL('/v2')
})

test('shows source-separated evidence and secure AI setup', async ({ page }) => {
  await page.goto('/v2/founders/demo-founder-ae527df17156/evidence')
  await expect(
    page.getByRole('heading', {
      name: 'Review the evidence, not just the summary.',
    }),
  ).toBeVisible()
  await expect(page.getByText('Authoritative founder data')).toBeVisible()
  await expect(
    page.getByText('Supported by cited Web Search evidence'),
  ).toBeVisible()

  await page.goto('/v2/settings/ai')
  await expect(page.getByText('Credential is valid')).toBeVisible()
  const storage = await page.evaluate(() => ({
    local: { ...localStorage },
    session: { ...sessionStorage },
  }))
  expect(JSON.stringify(storage)).not.toContain('DEMO-secret')
})
