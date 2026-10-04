import { test, expect } from '@playwright/test'

// Placeholder until Phase 3 wires a real injected service adapter and
// the actual widget markup. Keeps `npm run test:ui` a real, green command.
test('dev server renders the app shell', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('body')).toBeVisible()
})
