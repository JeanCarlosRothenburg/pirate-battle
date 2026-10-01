import { defineConfig } from '@playwright/test'

const PORT = 4174

/**
 * Performance profiling (`npm run perf`), separate from the E2E suite. It measures the
 * optimised build in the installed Google Chrome, which renders with the real GPU even
 * headless; Playwright's bundled Chromium falls back to software WebGL, which would
 * measure the CPU rasteriser instead of the game.
 */
export default defineConfig({
  testDir: '.',
  testMatch: /.*\.perf\.ts/,
  timeout: 15 * 60_000,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}`, channel: 'chrome', viewport: { width: 1280, height: 720 } },
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    cwd: '..',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
