import { test, expect, type Page } from '@playwright/test'
import { installFakeAdapterScript } from './fakeAdapter'

type Hooks = {
  setMissing(id: string, missing: boolean): void
  setSwitchDelay(ms: number): void
  writeLog: Array<{ profileId: string; op: string; text?: string; lineId?: string }>
  tasksFor(id: string): Array<{ text: string; completed: boolean }>
  publishEventFromSession(session: string, tasks: unknown[]): void
  currentSession(): string
}

function hooks<T, A = undefined>(page: Page, fn: (h: Hooks, a: A) => T, arg?: A): Promise<T> {
  return page.evaluate(
    ([src, a]) => {
      const h = (window as unknown as { __TYPEWRITER_TEST__: Hooks }).__TYPEWRITER_TEST__
      return new Function('h', 'a', `return (${src})(h, a)`)(h, a)
    },
    [fn.toString(), arg] as const,
  )
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(installFakeAdapterScript())
  await page.goto('/')
  await page.click('.clickable-area')
  await expect(page.getByText('Seed task two')).toBeVisible()
})

const next = (page: Page) => page.getByRole('button', { name: 'Next list' })
const prev = (page: Page) => page.getByRole('button', { name: 'Previous list' })
const name = (page: Page) => page.locator('.switcher .name')

test('heading shows the active list name, not a date', async ({ page }) => {
  await expect(name(page)).toHaveText('Personal')
  await expect(page.locator('.title-bar')).not.toContainText(/\d{4}-\d{2}-\d{2}/)
})

test('right chevron switches to next list and wraps; left wraps back', async ({ page }) => {
  await next(page).click()
  await expect(name(page)).toHaveText('Groceries')
  await expect(page.getByText('Buy oat milk')).toBeVisible()
  await next(page).click()
  await expect(name(page)).toHaveText('Personal')
  await prev(page).click()
  await expect(name(page)).toHaveText('Groceries')
})

test('duplicate task text toggles independently per list', async ({ page }) => {
  await page.getByRole('checkbox', { name: 'Seed task one' }).click()
  await expect(page.getByRole('checkbox', { name: 'Seed task one' })).toBeChecked()
  await next(page).click()
  await expect(page.getByText('Buy oat milk')).toBeVisible()
  await expect(page.getByRole('checkbox', { name: 'Seed task one' })).not.toBeChecked()
  const log = await hooks(page, (h) => h.writeLog)
  expect(log.every((w) => w.profileId === 'p-personal')).toBe(true)
})

test('add task lands only in the active list', async ({ page }) => {
  await next(page).click()
  await expect(page.getByText('Buy oat milk')).toBeVisible()
  await page.fill('#add-task-input', 'Bananas')
  await page.click('button:has-text("Add")')
  await expect(page.getByText('Bananas')).toBeVisible()
  await prev(page).click()
  await expect(page.getByText('Seed task two')).toBeVisible()
  await expect(page.getByText('Bananas')).toBeHidden()
  const personal = await hooks(page, (h) => h.tasksFor('p-personal').map((t) => t.text))
  expect(personal).not.toContain('Bananas')
})

test('unsent drafts stay with their own list across switches', async ({ page }) => {
  await page.fill('#add-task-input', 'personal draft')
  await next(page).click()
  await expect(page.getByText('Buy oat milk')).toBeVisible()
  await expect(page.locator('#add-task-input')).toHaveValue('')
  await page.fill('#add-task-input', 'grocery draft')
  await prev(page).click()
  await expect(page.locator('#add-task-input')).toHaveValue('personal draft')
  await next(page).click()
  await expect(page.locator('#add-task-input')).toHaveValue('grocery draft')
  const log = await hooks(page, (h) => h.writeLog)
  expect(log).toHaveLength(0)
})

test('rapid clicks settle on the last requested list', async ({ page }) => {
  await hooks(page, (h) => h.setSwitchDelay(80))
  await next(page).click()
  await next(page).click()
  await next(page).click()
  // Personal -> Groceries -> Personal -> Groceries
  await expect(name(page)).toHaveText('Groceries')
  await expect(page.getByText('Buy oat milk')).toBeVisible()
  await expect(page.getByText('Seed task two')).toBeHidden()
})

test('events from a superseded session cannot change the visible list', async ({ page }) => {
  const oldSession = await hooks(page, (h) => h.currentSession())
  await next(page).click()
  await expect(page.getByText('Buy oat milk')).toBeVisible()
  await hooks(
    page,
    (h, a) =>
      h.publishEventFromSession(a.session, [
        { lineId: 'x', lineIndex: 0, text: 'STALE LEAK', completed: false, indent: '' },
      ]),
    { session: oldSession },
  )
  await expect(page.getByText('STALE LEAK')).toBeHidden()
  await expect(page.getByText('Buy oat milk')).toBeVisible()
})

test('a missing note shows relink/retry, other lists stay navigable', async ({ page }) => {
  await hooks(page, (h) => h.setMissing('p-groceries', true))
  await next(page).click()
  await expect(page.getByRole('alert')).toContainText('could not be found')
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Browse for note' })).toBeVisible()
  await expect(page.getByText('Seed task one')).toBeHidden()
  await expect(name(page)).toHaveText('Groceries')

  await prev(page).click()
  await expect(page.getByText('Seed task two')).toBeVisible()
  await expect(page.getByRole('alert')).toBeHidden()

  await next(page).click()
  await hooks(page, (h) => h.setMissing('p-groceries', false))
  await page.getByRole('button', { name: 'Retry' }).click()
  await expect(page.getByText('Buy oat milk')).toBeVisible()
})

test('list manager adds, renames and removes lists without touching tasks', async ({ page }) => {
  await page.getByRole('button', { name: 'Manage lists' }).click()
  const dialog = page.getByRole('dialog', { name: 'Manage lists' })
  await expect(dialog).toBeVisible()

  await dialog.getByRole('button', { name: 'Groceries' }).click()
  await dialog.locator('.rename-input').first().fill('Shopping')
  await dialog.locator('.rename-input').first().press('Enter')
  await expect(dialog.getByRole('button', { name: 'Shopping' })).toBeVisible()

  await dialog.getByLabel('New list name').fill('Work')
  await dialog.getByRole('button', { name: '+ add list' }).click()
  await expect(dialog).toBeHidden()
  await expect(name(page)).toHaveText('Work')

  await page.getByRole('button', { name: 'Manage lists' }).click()
  await page
    .getByRole('dialog', { name: 'Manage lists' })
    .locator('li', { hasText: 'Work' })
    .getByRole('button', { name: 'remove', exact: true })
    .click()
  await page.getByRole('button', { name: 'confirm remove' }).click()
  await page.keyboard.press('Escape')
  await expect(name(page)).not.toHaveText('Work')
  const groceries = await hooks(page, (h) => h.tasksFor('p-groceries').length)
  expect(groceries).toBe(2)
})

test('Escape closes the manager before collapsing the widget', async ({ page }) => {
  await page.getByRole('button', { name: 'Manage lists' }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Manage lists' })).toBeHidden()
  await expect(page.getByText('Seed task two')).toBeVisible()
})

test('chevrons do not collapse the widget', async ({ page }) => {
  await next(page).click()
  await expect(page.getByText('Buy oat milk')).toBeVisible()
  await expect(page.locator('#todo-sheet')).toBeVisible()
})

test('rename input is focused with its text selected so typing replaces the name', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Manage lists' }).click()
  const dialog = page.getByRole('dialog', { name: 'Manage lists' })
  await dialog.getByRole('button', { name: 'Groceries' }).click()
  const input = dialog.getByLabel('List name', { exact: true })
  await expect(input).toBeFocused()
  await page.keyboard.type('Errands')
  await page.keyboard.press('Enter')
  await expect(dialog.getByRole('button', { name: 'Errands' })).toBeVisible()
})

test('Escape while renaming cancels the rename and keeps the manager open', async ({ page }) => {
  await page.getByRole('button', { name: 'Manage lists' }).click()
  const dialog = page.getByRole('dialog', { name: 'Manage lists' })
  await dialog.getByRole('button', { name: 'Groceries' }).click()
  await expect(dialog.getByLabel('List name', { exact: true })).toBeFocused()
  await page.keyboard.type('Nope')
  await page.keyboard.press('Escape')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Groceries' })).toBeVisible()
})

test('paper swap animation is disabled under reduced motion', async ({ page }) => {
  const animationName = () =>
    page.locator('.list').evaluate((el) => getComputedStyle(el).animationName)
  expect(await animationName()).toMatch(/paper-swap/)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  expect(await animationName()).toBe('none')
})

test('single list hides the chevrons', async ({ page }) => {
  await page.getByRole('button', { name: 'Manage lists' }).click()
  const dialog = page.getByRole('dialog', { name: 'Manage lists' })
  await dialog
    .locator('li', { hasText: 'Groceries' })
    .getByRole('button', { name: 'remove', exact: true })
    .click()
  await page.getByRole('button', { name: 'confirm remove' }).click()
  await page.keyboard.press('Escape')
  await expect(name(page)).toHaveText('Personal')
  await expect(next(page)).toHaveCount(0)
  await expect(prev(page)).toHaveCount(0)
})
