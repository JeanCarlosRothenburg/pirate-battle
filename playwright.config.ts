import { defineConfig, devices } from '@playwright/test'

const PORT = 4173

/**
 * End-to-end suite. It runs against the optimised production build (served by
 * `vite preview`), the same build that is deployed, with the MSW mocks active. Every test
 * gets a fresh browser context, so storage, service worker and mock data start isolated.
 * Desktop runs everything except touch-only tests; mobile (a Pixel 7 in landscape, the
 * supported orientation) runs everything except mouse-only tests.
 */
export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  timeout: 90_000,
  expect: { timeout: 15_000, toHaveScreenshot: { maxDiffPixelRatio: 0.02, animations: 'disabled' } },
  fullyParallel: true,
  workers: 2,
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'reports/e2e', open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] }, grepInvert: /@mobile/ },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7 landscape'] }, grepInvert: /@desktop/ },
  ],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
})
