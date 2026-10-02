import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results/playwright',
  use: {
    baseURL: 'http://127.0.0.1:4321',
    trace: 'retain-on-failure',
  },
  webServer: {
    command:
      'DATABASE_PATH=/tmp/founder-matching-app-playwright.sqlite PORT=4321 HOST=127.0.0.1 FOUNDER_APP_MASTER_KEY=QkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkI= npm start',
    url: 'http://127.0.0.1:4321/healthz',
    reuseExistingServer: false,
    timeout: 30_000,
  },
})
