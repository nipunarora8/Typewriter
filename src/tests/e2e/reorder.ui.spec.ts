import { test, expect, type Page } from '@playwright/test'
import { installFakeAdapterScript } from './fakeAdapter'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(installFakeAdapterScript())
  await page.goto('/')
  await page.click('.typewriter')
  await expect(page.getByText('Seed task one')).toBeVisible()
})

async function texts(page: Page) {
  return page.locator('[role="listitem"] .text').allTextContents()
}

test('dragging the handle moves a task above another', async ({ page }) => {
  const grip = page.locator('[role="listitem"]').nth(1).locator('.grip')
  const first = await page.locator('[role="listitem"]').nth(0).boundingBox()
  const g = (await grip.boundingBox())!
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2)
  await page.mouse.down()
  await page.mouse.move(g.x + g.width / 2, first!.y + 2, { steps: 5 })
  await expect(page.locator('.drop-before')).toHaveCount(1)
  await page.mouse.up()
  await expect.poll(() => texts(page)).toEqual(['Seed task two', 'Seed task one'])
})

test('dragging below the last task moves it to the end', async ({ page }) => {
  const grip = page.locator('[role="listitem"]').nth(0).locator('.grip')
  const last = (await page.locator('[role="listitem"]').nth(1).boundingBox())!
  const g = (await grip.boundingBox())!
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2)
  await page.mouse.down()
  await page.mouse.move(g.x + g.width / 2, last.y + last.height + 10, { steps: 5 })
  await page.mouse.up()
  await expect.poll(() => texts(page)).toEqual(['Seed task two', 'Seed task one'])
})

test('Escape cancels a drag', async ({ page }) => {
  const grip = page.locator('[role="listitem"]').nth(1).locator('.grip')
  const first = (await page.locator('[role="listitem"]').nth(0).boundingBox())!
  const g = (await grip.boundingBox())!
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2)
  await page.mouse.down()
  await page.mouse.move(g.x + g.width / 2, first.y + 2, { steps: 5 })
  await page.keyboard.press('Escape')
  await page.mouse.up()
  expect(await texts(page)).toEqual(['Seed task one', 'Seed task two'])
  await expect(page.getByText('Seed task one')).toBeVisible()
})

test('dragging does not toggle the checkbox', async ({ page }) => {
  const grip = page.locator('[role="listitem"]').nth(0).locator('.grip')
  await grip.click()
  await expect(page.getByRole('checkbox', { name: 'Seed task one' })).not.toBeChecked()
})

test('Arrow keys on the handle reorder and keep focus on it', async ({ page }) => {
  const grip = page.locator('[role="listitem"]').nth(1).locator('.grip')
  await grip.focus()
  await page.keyboard.press('ArrowUp')
  await expect.poll(() => texts(page)).toEqual(['Seed task two', 'Seed task one'])
  await expect(page.locator('[role="listitem"]').nth(0).locator('.grip')).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect.poll(() => texts(page)).toEqual(['Seed task one', 'Seed task two'])
})
