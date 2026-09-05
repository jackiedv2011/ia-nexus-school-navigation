import { defineConfig, devices } from '@playwright/test';

// End-to-end tests drive a real browser against the real app: the actual
// backend (with only its database stubbed — see e2e/fake-backend.js) behind the
// real Vite dev server and its /api proxy.
//
// The pre-installed Chromium is used directly rather than downloaded. Point
// PW_CHROMIUM at a different binary if your environment ships one elsewhere.
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.js',
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: false,          // one shared backend, so keep it sequential
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5183',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{
    name: 'chromium',
    use: {
      ...devices['Desktop Chrome'],
      launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
    },
  }],
  webServer: [
    {
      command: 'node e2e/fake-backend.cjs',
      url: 'http://localhost:3001/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: { PORT: '3001', JWT_SECRET: 'e2e-secret', NODE_ENV: 'test', ADMIN_KEY: 'e2e-admin-key' },
    },
    {
      command: 'npm run dev',
      url: 'http://localhost:5183',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
