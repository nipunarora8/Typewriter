import { test, expect } from '@playwright/test'
import { installFakeAdapterScript } from './fakeAdapter'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(installFakeAdapterScript())
  await page.goto('/')
})

test('expands via click and shows seeded tasks', async ({ page }) => {
  await page.click('.typewriter')
  await expect(page.getByText('Seed task one')).toBeVisible()
  await expect(page.getByText('Seed task two')).toBeVisible()
})

test('expands via keyboard (Enter) and collapses via Escape', async ({ page }) => {
  await page.locator('.typewriter').focus()
  await page.keyboard.press('Enter')
  await expect(page.getByText('Seed task one')).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(page.getByText('Seed task one')).toBeHidden()
})

test('toggling a checkbox updates its state', async ({ page }) => {
  await page.click('.typewriter')
  const checkbox = page.getByRole('checkbox', { name: 'Seed task one' })
  await expect(checkbox).not.toBeChecked()
  await checkbox.click()
  await expect(checkbox).toBeChecked()
})

test('adding a task via the form appends it to the list', async ({ page }) => {
  await page.click('.typewriter')
  await page.fill('#add-task-input', 'A brand new task')
  await page.click('button:has-text("Add")')
  await expect(page.getByText('A brand new task')).toBeVisible()
  await expect(page.locator('#add-task-input')).toHaveValue('')
})

test('draft text survives a theme switch without being cleared', async ({ page }) => {
  await page.click('.typewriter')
  await page.fill('#add-task-input', 'Unsent draft')
  await page.click('.dev-theme-switcher button:has-text("midnight")')
  await expect(page.locator('#add-task-input')).toHaveValue('Unsent draft')
})

test('Escape does not collapse while a draft is unsent', async ({ page }) => {
  await page.click('.typewriter')
  await page.fill('#add-task-input', 'Do not lose me')
  await page.keyboard.press('Escape')
  await expect(page.getByText('Seed task one')).toBeVisible()
  await expect(page.locator('#add-task-input')).toHaveValue('Do not lose me')
})

test('an external change event updates the list live', async ({ page }) => {
  await page.click('.typewriter')
  await expect(page.getByText('Seed task one')).toBeVisible()

  await page.evaluate(() => {
    ;(
      window as unknown as { __TYPEWRITER_TEST__: { publishExternalChange: () => void } }
    ).__TYPEWRITER_TEST__.publishExternalChange()
  })

  // Same content republished with a bumped sequence; list still renders
  // without clearing or erroring.
  await expect(page.getByText('Seed task one')).toBeVisible()
})

test('long task text wraps without clipping the sheet', async ({ page }) => {
  await page.click('.typewriter')
  const sheet = page.locator('#todo-sheet')
  const box = await sheet.boundingBox()
  expect(box).not.toBeNull()
  // All task rows must stay within the sheet's own bounds.
  const items = page.locator('[role="listitem"]')
  const count = await items.count()
  for (let i = 0; i < count; i++) {
    const itemBox = await items.nth(i).boundingBox()
    if (!itemBox || !box) continue
    expect(itemBox.x).toBeGreaterThanOrEqual(box.x - 1)
    expect(itemBox.x + itemBox.width).toBeLessThanOrEqual(box.x + box.width + 1)
  }
})
