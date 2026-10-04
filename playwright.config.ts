import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'src/tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:1420',
  },
  webServer: {
    command: 'npm run dev -- --port 1420 --strictPort',
    url: 'http://localhost:1420',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [
    {
      name: 'ui',
      testMatch: /\.ui\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'visual',
      testMatch: /\.visual\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
