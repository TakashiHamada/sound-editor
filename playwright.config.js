import { defineConfig, devices } from '@playwright/test';

// End-to-end tests run against the *built* site (`npm run build` first, or use
// `npm run test:build`). `vite preview` serves the repo root, exactly what
// GitHub Pages publishes.
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173/',
    acceptDownloads: true,
    viewport: { width: 1400, height: 820 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 820 } } }],
  webServer: {
    command: 'npx vite preview',
    url: 'http://localhost:4173/',
    reuseExistingServer: !process.env.CI,
  },
});
