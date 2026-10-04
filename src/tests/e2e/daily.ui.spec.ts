import { test, expect, type Page } from '@playwright/test'
import { installFakeAdapterScript } from './fakeAdapter'

/**
 * Daily folder lists against the mocked native adapter. The date row, the
 * `+` button and per-day navigation live in the paper header; list
 * switching stays in the cream display. Browser/mock checks only.
 */

type LogEntry = { profileId: string; op: string; date?: string | null; text?: string }

const header = (page: Page) => page.locator('.title-bar')
const dayDate = (page: Page) => page.getByTestId('day-date')
const older = (page: Page) => header(page).getByRole('button', { name: 'Older day' })
const newer = (page: Page) => header(page).getByRole('button', { name: 'Newer day' })
const plus = (page: Page) => header(page).getByRole('button', { name: 'New note for today' })
const prevList = (page: Page) =>
  page.locator('.display').getByRole('button', { name: 'Previous list' })
const expander = (page: Page) => page.locator('.clickable-area')

async function open(page: Page) {
  await page.clock.setFixedTime(new Date(2026, 9, 5, 10, 0, 0)) // 2026-10-05, local
  await page.addInitScript(installFakeAdapterScript({ daily: true }))
  await page.goto('/')
  // Personal -> previous wraps to Work (the daily list).
  await prevList(page).click()
  await expect(page.locator('.display .name')).toHaveText('Work')
  await expander(page).click()
  await expect(page.locator('#todo-sheet')).toBeVisible()
}

const writeLog = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { __TYPEWRITER_TEST__: { writeLog: LogEntry[] } }).__TYPEWRITER_TEST__
        .writeLog,
  )

test('plain lists show no day row and no + button', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 9, 5, 10, 0, 0))
  await page.addInitScript(installFakeAdapterScript({ daily: true }))
  await page.goto('/')
  await expander(page).click()
  await expect(page.locator('#todo-sheet')).toBeVisible()
  await expect(dayDate(page)).toHaveCount(0)
  await expect(plus(page)).toHaveCount(0)
})

test('a daily list opens on its newest note with a date row', async ({ page }) => {
  await open(page)
  await expect(header(page).locator('.title-text')).toHaveText('Work')
  await expect(dayDate(page)).toHaveText('2026-10-04')
  await expect(page.getByText('Work task today')).toBeVisible()
  await expect(newer(page)).toBeDisabled()
  await expect(older(page)).toBeEnabled()
})

test('older/newer step between existing notes and stop at both ends', async ({ page }) => {
  await open(page)
  await older(page).click()
  await expect(dayDate(page)).toHaveText('2026-10-03')
  await expect(page.getByText('Yesterday task')).toBeVisible()
  await expect(page.getByText('Work task today')).toBeHidden()
  await expect(older(page)).toBeDisabled()
  await expect(newer(page)).toBeEnabled()
  await newer(page).click()
  await expect(dayDate(page)).toHaveText('2026-10-04')
  await expect(header(page).locator('.title-text')).toHaveText('Work')
})

test('+ creates a note for today and is idempotent', async ({ page }) => {
  await open(page)
  await plus(page).click()
  await expect(dayDate(page)).toHaveText('2026-10-05')
  await expect(page.getByText('Work task today')).toBeHidden()
  await expect(older(page)).toBeEnabled()
  await expect(newer(page)).toBeDisabled()

  // Pressing + again opens the same note rather than creating another.
  await plus(page).click()
  await expect(dayDate(page)).toHaveText('2026-10-05')
  await older(page).click()
  await expect(dayDate(page)).toHaveText('2026-10-04')
  await older(page).click()
  await expect(dayDate(page)).toHaveText('2026-10-03')
  await expect(older(page)).toBeDisabled()
})

test('tasks added after + are written to the new day only', async ({ page }) => {
  await open(page)
  await plus(page).click()
  await expect(dayDate(page)).toHaveText('2026-10-05')
  await page.fill('#add-task-input', 'ship the daily lists')
  await page.keyboard.press('Enter')
  await expect(page.getByText('ship the daily lists')).toBeVisible()

  const log = await writeLog(page)
  const adds = log.filter((e) => e.op === 'add')
  expect(adds).toEqual([
    { profileId: 'p-work', date: '2026-10-05', op: 'add', text: 'ship the daily lists' },
  ])

  await older(page).click()
  await expect(page.getByText('ship the daily lists')).toBeHidden()
  await expect(page.getByText('Work task today')).toBeVisible()
})

test('a toggle changes only the day being shown', async ({ page }) => {
  await open(page)
  await older(page).click()
  await page.getByRole('checkbox', { name: 'Yesterday task' }).click()
  const toggles = (await writeLog(page)).filter((e) => e.op === 'toggle')
  expect(toggles).toHaveLength(1)
  expect(toggles[0].date).toBe('2026-10-03')
})

test('a draft stays with its own day', async ({ page }) => {
  await open(page)
  await page.fill('#add-task-input', 'for the 4th')
  await older(page).click()
  await expect(dayDate(page)).toHaveText('2026-10-03')
  await expect(page.locator('#add-task-input')).toHaveValue('')
  await newer(page).click()
  await expect(page.locator('#add-task-input')).toHaveValue('for the 4th')
})

test('day steps with a slow backend land on the requested note', async ({ page }) => {
  await open(page)
  await page.evaluate(() => {
    ;(
      window as unknown as { __TYPEWRITER_TEST__: { setSwitchDelay(ms: number): void } }
    ).__TYPEWRITER_TEST__.setSwitchDelay(60)
  })
  // Older, then newer: end on the 4th even though the first call resolves later.
  await older(page).click()
  await dayDate(page).waitFor()
  await expect(dayDate(page)).toHaveText('2026-10-03')
  await newer(page).click()
  await expect(dayDate(page)).toHaveText('2026-10-04')
  await expect(page.getByText('Work task today')).toBeVisible()
})

test('day stepping never changes the window mode or the list shown in the display', async ({
  page,
}) => {
  await open(page)
  const before = await page.locator('.typewriter').boundingBox()
  await older(page).click()
  await expect(dayDate(page)).toHaveText('2026-10-03')
  await expect(page.locator('.display .name')).toHaveText('Work')
  await expect(expander(page)).toHaveAttribute('aria-expanded', 'true')
  expect(await page.locator('.typewriter').boundingBox()).toEqual(before)
})

test('adding a list creates its folder note for today', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 9, 5, 10, 0, 0))
  await page.addInitScript(installFakeAdapterScript({ daily: true }))
  await page.goto('/')
  await expander(page).click()
  await page.getByRole('button', { name: 'Manage lists' }).click()
  const dialog = page.getByRole('dialog', { name: 'Manage lists' })
  await dialog.getByLabel('New list name').fill('Errands')
  await dialog.getByRole('button', { name: '+ add list' }).click()

  await expect(header(page).locator('.title-text')).toHaveText('Errands')
  await expect(page.getByText('No note in this folder yet.')).toHaveCount(0)
  await expect(dayDate(page)).toHaveText('2026-10-05')
  await expect(page.locator('#add-task-input')).toBeEnabled()
  await expect(older(page)).toBeDisabled()
  await expect(newer(page)).toBeDisabled()
})

test('a list name that cannot be a folder name is refused', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 9, 5, 10, 0, 0))
  await page.addInitScript(installFakeAdapterScript({ daily: true }))
  await page.goto('/')
  await expander(page).click()
  await page.getByRole('button', { name: 'Manage lists' }).click()
  const dialog = page.getByRole('dialog', { name: 'Manage lists' })
  await dialog.getByLabel('New list name').fill('a/b')
  await dialog.getByRole('button', { name: '+ add list' }).click()
  await expect(page.getByText(/List names can't/)).toBeVisible()
  await expect(page.locator('.display .name')).not.toHaveText('a/b')
})

test('manager marks daily lists', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: 'Manage lists' }).click()
  const dialog = page.getByRole('dialog', { name: 'Manage lists' })
  await expect(dialog.locator('.row-tag')).toHaveCount(1)
  await expect(dialog.locator('.row-tag')).toHaveText('daily')
})

test('the + and day arrows are separate buttons not nested in another button', async ({ page }) => {
  await open(page)
  for (const inner of ['button', 'a', 'input', '[tabindex]']) {
    await expect(page.locator(`button ${inner}`)).toHaveCount(0)
  }
})

const noProfilesScript = () =>
  installFakeAdapterScript({ daily: true })
    .replace(/const profiles = \[[\s\S]*?\n {6}\];/, 'const profiles = [];')
    .replace("let activeProfileId = 'p-personal';", 'let activeProfileId = null;')
    .replace(/if \(WITH_DAILY\) \{[\s\S]*?\n {6}\}\n/, '')
    .replace(/if \(WITH_DAILY && DAILY_EMPTY\)[^\n]*\n/, '')

test('first start: name a list, choose its folder, then + starts today', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 9, 5, 10, 0, 0))
  await page.addInitScript(noProfilesScript())
  await page.goto('/')
  await expander(page).click()
  const choose = page.getByRole('button', { name: 'Choose where to keep it' })
  await expect(choose).toBeDisabled()
  await page.getByLabel('List name').fill('Groceries')
  await choose.click()
  await expect(header(page).locator('.title-text')).toHaveText('Groceries')
  // The list folder and today's note are created straight away.
  await expect(dayDate(page)).toHaveText('2026-10-05')
  await expect(page.locator('#add-task-input')).toBeEnabled()
  const created = (await writeLog(page)).filter((e) => e.op === 'create')
  expect(created).toEqual([{ profileId: 'p-new-3', op: 'create', date: '2026-10-05' }])
})

test('the user adds their own lists and switches between them', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 9, 5, 10, 0, 0))
  await page.addInitScript(noProfilesScript())
  await page.goto('/')
  await expander(page).click()
  await page.getByLabel('List name').fill('Personal')
  await page.getByRole('button', { name: 'Choose where to keep it' }).click()
  await expect(header(page).locator('.title-text')).toHaveText('Personal')
  await page.getByRole('button', { name: 'Manage lists' }).click()
  const dialog = page.getByRole('dialog', { name: 'Manage lists' })
  await dialog.getByLabel('New list name').fill('Work')
  await dialog.getByRole('button', { name: '+ add list' }).click()
  await expect(header(page).locator('.title-text')).toHaveText('Work')
  const name = page.locator('.display .name')
  await expect(name).toHaveText('Work')
  await page.locator('.display').getByRole('button', { name: 'Previous list' }).click()
  await expect(name).toHaveText('Personal')
})

test.describe('leftovers from the previous day', () => {
  const banner = (page: Page) => page.getByRole('status')

  test("pressing + on a new day offers yesterday's unfinished tasks", async ({ page }) => {
    await open(page)
    await expect(banner(page)).toHaveCount(0) // today's shown note already has a task
    await plus(page).click()
    await expect(dayDate(page)).toHaveText('2026-10-05')
    await expect(banner(page)).toContainText('1 unfinished from 2026-10-04')
  })

  test('Bring them over copies only the unfinished tasks into today', async ({ page }) => {
    await open(page)
    await plus(page).click()
    await banner(page).getByRole('button', { name: 'Bring them over' }).click()
    await expect(page.getByText('Work task today')).toBeVisible()
    await expect(banner(page)).toHaveCount(0)
    const log = await writeLog(page)
    expect(log.filter((e) => e.op === 'bring-over')).toEqual([
      { profileId: 'p-work', date: '2026-10-05', op: 'bring-over', from: '2026-10-04' },
    ])
    // Yesterday is untouched.
    await older(page).click()
    await expect(page.getByText('Work task today')).toBeVisible()
    await expect(page.getByRole('checkbox', { name: 'Work task today' })).not.toBeChecked()
  })

  test('Not now hides it and it stays hidden for that day', async ({ page }) => {
    await open(page)
    await plus(page).click()
    await banner(page).getByRole('button', { name: 'Not now' }).click()
    await expect(banner(page)).toHaveCount(0)
    await plus(page).click()
    await expect(dayDate(page)).toHaveText('2026-10-05')
    await expect(banner(page)).toHaveCount(0)
  })

  test('no banner once today has tasks, or when yesterday is finished', async ({ page }) => {
    await open(page)
    await older(page).click() // 2026-10-03 has a previous? no: it is the oldest
    await expect(banner(page)).toHaveCount(0)
    await newer(page).click()
    await plus(page).click()
    await page.fill('#add-task-input', 'already started')
    await page.keyboard.press('Enter')
    await expect(page.getByText('already started')).toBeVisible()
    await expect(banner(page)).toHaveCount(0)
  })

  test('a plain list never shows the banner', async ({ page }) => {
    await page.addInitScript(installFakeAdapterScript({ daily: true }))
    await page.goto('/')
    await expander(page).click()
    await expect(banner(page)).toHaveCount(0)
  })
})

test('only the first list asks where to keep things; later lists go next to it', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date(2026, 9, 5, 10, 0, 0))
  await page.addInitScript(noProfilesScript())
  await page.goto('/')
  await expander(page).click()
  await page.getByLabel('List name').fill('Personal')
  await page.getByRole('button', { name: 'Choose where to keep it' }).click()
  await expect(header(page).locator('.title-text')).toHaveText('Personal')
  await page.getByRole('button', { name: 'Manage lists' }).click()
  const dialog = page.getByRole('dialog', { name: 'Manage lists' })
  await expect(dialog.getByText('New lists are created in “Typewriter”')).toBeVisible()
  await dialog.getByLabel('New list name').fill('Work')
  await dialog.getByRole('button', { name: '+ add list' }).click()
  await expect(header(page).locator('.title-text')).toHaveText('Work')
  const picks = await page.evaluate(
    () =>
      (window as unknown as { __TYPEWRITER_TEST__: { pickerCalls: string[] } }).__TYPEWRITER_TEST__
        .pickerCalls,
  )
  expect(picks).toEqual(['parent', 'none'])
})
