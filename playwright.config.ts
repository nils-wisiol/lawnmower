import { defineConfig, devices } from '@playwright/test';

// E2E runs against Vite's preview server (the production build), which serves
// under the GitHub Pages base path '/lawnmower/'. CI reuses the same command;
// locally the server is started on demand.
const baseURL = 'http://localhost:4173/lawnmower/';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build && npm run preview',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
