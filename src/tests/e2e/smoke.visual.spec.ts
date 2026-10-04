import { test, expect } from '@playwright/test'

// Placeholder until Phase 0A/4 establish the real theme/state screenshot
// matrix with fictional fixture data. Keeps `npm run test:visual` real and green.
test('dev server renders the app shell', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('body')).toBeVisible()
})
