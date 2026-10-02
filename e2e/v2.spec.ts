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
  await expect(page.getByRole('switch', { name: 'Demo mode' })).toHaveAttribute('aria-checked', 'true')

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
  await page.getByRole('switch', { name: 'Demo mode' }).click()
  await expect(page).toHaveURL('/v2')
})

test('shows top web results in a drawer and secure AI setup', async ({ page }) => {
  await page.goto('/v2/founders/demo-founder-ae527df17156/evidence')
  await expect(
    page.getByRole('dialog', { name: 'Top web results' }),
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Find the right founders.' })).toBeVisible()
  await expect(page.getByRole('dialog').getByRole('listitem')).toHaveCount(5)

  await page.goto('/v2/settings/ai')
  await expect(page.getByText('Credential is valid')).toBeVisible()
  const storage = await page.evaluate(() => ({
    local: { ...localStorage },
    session: { ...sessionStorage },
  }))
  expect(JSON.stringify(storage)).not.toContain('DEMO-secret')
})

test('keeps every V2 route inside mobile and tablet viewports', async ({ page }) => {
  const routes = [
    '/v2',
    '/v2/seating-plans',
    '/v2/settings/ai',
    '/v2/founders/demo-founder-ae527df17156/evidence',
  ]

  for (const width of [390, 768]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1024 })

    for (const route of routes) {
      await page.goto(route)
      await expect
        .poll(() =>
          page.evaluate(() => ({
            clientWidth: document.documentElement.clientWidth,
            scrollWidth: document.documentElement.scrollWidth,
          })),
        )
        .toEqual({ clientWidth: width, scrollWidth: width })
    }

    await page.goto('/v2/seating-plans')
    await page.getByRole('button', { name: 'Reopen' }).first().click()
    await expect(page).toHaveURL(/\/v2\/dinner\?plan=/)
    await expect
      .poll(() =>
        page.evaluate(() => ({
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
        })),
      )
      .toEqual({ clientWidth: width, scrollWidth: width })
  }
})
