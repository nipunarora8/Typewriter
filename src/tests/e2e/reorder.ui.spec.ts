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

test('dragging a task by its text moves it above another', async ({ page }) => {
  const grip = page.locator('[role="listitem"]').nth(1).locator('.text')
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
  const grip = page.locator('[role="listitem"]').nth(0).locator('.text')
  const last = (await page.locator('[role="listitem"]').nth(1).boundingBox())!
  const g = (await grip.boundingBox())!
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2)
  await page.mouse.down()
  await page.mouse.move(g.x + g.width / 2, last.y + last.height + 10, { steps: 5 })
  await page.mouse.up()
  await expect.poll(() => texts(page)).toEqual(['Seed task two', 'Seed task one'])
})

test('Escape cancels a drag', async ({ page }) => {
  const grip = page.locator('[role="listitem"]').nth(1).locator('.text')
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

test('clicking the text does not complete a task; the checkbox does', async ({ page }) => {
  const box = page.getByRole('checkbox', { name: 'Seed task one' })
  await page.locator('[role="listitem"]').nth(0).locator('.text').click()
  await expect(box).not.toBeChecked()
  await box.click()
  await expect(box).toBeChecked()
})

test('dragging by the text does not toggle the checkbox', async ({ page }) => {
  const text = page.locator('[role="listitem"]').nth(0).locator('.text')
  const last = (await page.locator('[role="listitem"]').nth(1).boundingBox())!
  const t = (await text.boundingBox())!
  await page.mouse.move(t.x + 5, t.y + t.height / 2)
  await page.mouse.down()
  await page.mouse.move(t.x + 5, last.y + last.height + 10, { steps: 5 })
  await page.mouse.up()
  await expect.poll(() => texts(page)).toEqual(['Seed task two', 'Seed task one'])
  await expect(page.getByRole('checkbox', { name: 'Seed task one' })).not.toBeChecked()
})

test('Alt+Arrow on a checkbox reorders and keeps focus on it', async ({ page }) => {
  const box = (n: number) => page.locator('[role="listitem"]').nth(n).getByRole('checkbox')
  await box(1).focus()
  await page.keyboard.press('Alt+ArrowUp')
  await expect.poll(() => texts(page)).toEqual(['Seed task two', 'Seed task one'])
  await expect(box(0)).toBeFocused()
  await page.keyboard.press('Alt+ArrowDown')
  await expect.poll(() => texts(page)).toEqual(['Seed task one', 'Seed task two'])
})
