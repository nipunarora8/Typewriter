import { test, expect, type Page } from '@playwright/test'
import { installFakeAdapterScript } from './fakeAdapter'

/**
 * List navigation lives in the housing's cream display, independent of
 * expansion. Browser/mock-adapter checks only: native window geometry is
 * covered by manual native runs, not here.
 */

type Hooks = { setMissing(id: string, missing: boolean): void; writeLog: unknown[] }

const display = (page: Page) => page.locator('.typewriter .display')
const prev = (page: Page) => display(page).getByRole('button', { name: 'Previous list' })
const next = (page: Page) => display(page).getByRole('button', { name: 'Next list' })
const displayName = (page: Page) => display(page).locator('.name')
const expander = (page: Page) => page.locator('.clickable-area')
const sheet = (page: Page) => page.locator('#todo-sheet')

async function setMissing(page: Page, id: string, missing: boolean) {
  await page.evaluate(
    ([i, m]) => {
      ;(window as unknown as { __TYPEWRITER_TEST__: Hooks }).__TYPEWRITER_TEST__.setMissing(
        i as string,
        m as boolean,
      )
    },
    [id, missing],
  )
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(installFakeAdapterScript())
  await page.goto('/')
})

test.describe('placement', () => {
  test('collapsed: arrows and label are inside the housing cream display', async ({ page }) => {
    await expect(displayName(page)).toHaveText('Personal')
    await expect(prev(page)).toBeVisible()
    await expect(next(page)).toBeVisible()
    await expect(page.locator('.typewriter')).toContainText('Personal')
    await expect(sheet(page)).toHaveCount(0)
  })

  test('expanded: arrows stay in the display, not in the paper header', async ({ page }) => {
    await expander(page).click()
    await expect(sheet(page)).toBeVisible()
    await expect(display(page).getByRole('button', { name: 'Next list' })).toBeVisible()
    await expect(
      page.locator('.title-bar').getByRole('button', { name: 'Previous list' }),
    ).toHaveCount(0)
    await expect(page.locator('.title-bar').getByRole('button', { name: 'Next list' })).toHaveCount(
      0,
    )
    await expect(
      page.locator('.title-bar').getByRole('button', { name: 'Manage lists' }),
    ).toBeVisible()
    await expect(page.locator('.title-bar .title-text')).toHaveText('Personal')
  })

  test('display box sits above the keys inside the housing', async ({ page }) => {
    const d = await display(page).boundingBox()
    const k = await page.locator('.keys').boundingBox()
    const t = await page.locator('.typewriter').boundingBox()
    expect(d && k && t).toBeTruthy()
    expect(d!.y + d!.height).toBeLessThanOrEqual(k!.y)
    expect(d!.x).toBeGreaterThanOrEqual(t!.x)
    expect(d!.x + d!.width).toBeLessThanOrEqual(t!.x + t!.width)
  })
})

test.describe('independence from expansion', () => {
  test('switching while collapsed never opens the sheet; expanding shows only the chosen note', async ({
    page,
  }) => {
    await next(page).click()
    await expect(displayName(page)).toHaveText('Groceries')
    await expect(sheet(page)).toHaveCount(0)
    await expect(expander(page)).toHaveAttribute('aria-expanded', 'false')

    await expander(page).click()
    await expect(page.getByText('Buy oat milk')).toBeVisible()
    await expect(page.getByText('Seed task two')).toBeHidden()
    await expect(page.locator('.title-bar .title-text')).toHaveText('Groceries')
  })

  test('switching while expanded keeps it expanded, stationary and updates the heading', async ({
    page,
  }) => {
    await expander(page).click()
    await expect(sheet(page)).toBeVisible()
    const before = await page.locator('.typewriter').boundingBox()
    const sheetBefore = await sheet(page).boundingBox()

    await next(page).click()
    await expect(page.locator('.title-bar .title-text')).toHaveText('Groceries')
    await expect(expander(page)).toHaveAttribute('aria-expanded', 'true')
    expect(await page.locator('.typewriter').boundingBox()).toEqual(before)
    expect(await sheet(page).boundingBox()).toEqual(sheetBefore)
  })

  for (const key of ['Enter', 'Space'] as const) {
    test(`${key} on an arrow switches lists without toggling expansion`, async ({ page }) => {
      await next(page).focus()
      await page.keyboard.press(key)
      await expect(displayName(page)).toHaveText('Groceries')
      await expect(expander(page)).toHaveAttribute('aria-expanded', 'false')
      await expect(sheet(page)).toHaveCount(0)

      await expander(page).click()
      await expect(sheet(page)).toBeVisible()
      // Expansion finishes by focusing the add box; wait for it before moving focus.
      await expect(page.locator('#add-task-input')).toBeFocused()
      await prev(page).focus()
      await page.keyboard.press(key)
      await expect(displayName(page)).toHaveText('Personal')
      await expect(expander(page)).toHaveAttribute('aria-expanded', 'true')
      await expect(sheet(page)).toBeVisible()
    })
  }

  test('the separate expansion control still toggles; Enter and Space work on it', async ({
    page,
  }) => {
    await expander(page).focus()
    await page.keyboard.press('Enter')
    await expect(sheet(page)).toBeVisible()
    await expect(expander(page)).toHaveAccessibleName('Close todo list')
    await expect(page.locator('[data-widget-mode="expanded"]')).toHaveCount(1)
    await page.keyboard.press('Escape')
    await expect(sheet(page)).toHaveCount(0)
    await expander(page).focus()
    await page.keyboard.press('Space')
    await expect(sheet(page)).toBeVisible()
  })

  test('arrows keep their position for long names', async ({ page }) => {
    const rightX = async () => (await next(page).boundingBox())!.x
    const leftX = async () => (await prev(page).boundingBox())!.x
    const shortRight = await rightX()
    const shortLeft = await leftX()
    await page.getByRole('button', { name: 'Next list' }).click()
    expect(await rightX()).toBe(shortRight)
    expect(await leftX()).toBe(shortLeft)
  })
})

test.describe('focus and semantics', () => {
  test('expanding focuses the add input, never a chevron; collapsing restores the expansion control', async ({
    page,
  }) => {
    await expander(page).click()
    await expect(page.locator('#add-task-input')).toBeFocused()
    await expect(page.locator('[data-widget-mode="expanded"]')).toHaveCount(1)
    await page.keyboard.press('Escape')
    await expect(sheet(page)).toHaveCount(0)
    await expect(expander(page)).toBeFocused()
  })

  test('no interactive element is nested in another button', async ({ page }) => {
    await expander(page).click()
    await expect(sheet(page)).toBeVisible()
    for (const inner of ['button', 'a', 'input', 'select', 'textarea', '[tabindex]']) {
      await expect(page.locator(`button ${inner}`)).toHaveCount(0)
    }
  })

  test('accessible names and drag regions', async ({ page }) => {
    await expect(display(page).getByRole('group', { name: 'Lists' })).toBeVisible()
    await expect(prev(page)).toHaveAccessibleName('Previous list')
    await expect(next(page)).toHaveAccessibleName('Next list')
    await expect(expander(page)).toHaveAccessibleName('Open todo list')
    await expect(display(page)).toHaveAttribute('data-tauri-drag-region', '')
    await expect(displayName(page)).toHaveAttribute('data-tauri-drag-region', '')
    // Interactive controls must not be drag regions or they could not be clicked.
    await expect(prev(page)).not.toHaveAttribute('data-tauri-drag-region', /.*/)
    await expect(next(page)).not.toHaveAttribute('data-tauri-drag-region', /.*/)
    await expect(display(page).locator('.count')).toHaveAttribute('title', '1 of 2 tasks done')
  })

  test('long names truncate with the full name exposed', async ({ page }) => {
    const longName = installFakeAdapterScript().replace(
      "displayName: 'Personal'",
      "displayName: 'Quarterly planning and long-running personal projects'",
    )
    const fresh = await page.context().newPage()
    await fresh.addInitScript(longName)
    await fresh.goto('/')
    const name = fresh.locator('.typewriter .display .name')
    await expect(name).toHaveAttribute(
      'title',
      'Quarterly planning and long-running personal projects',
    )
    const overflow = await name.evaluate((el) => el.scrollWidth > el.clientWidth)
    expect(overflow).toBe(true)
    await expect(fresh.getByRole('button', { name: 'Next list' })).toBeVisible()
  })
})

test.describe('edge states', () => {
  test('one list hides the arrows and keeps the label', async ({ page }) => {
    const single = installFakeAdapterScript().replace(/\{ id: 'p-groceries'[^}]*\},\n/, '')
    const fresh = await page.context().newPage()
    await fresh.addInitScript(single)
    await fresh.goto('/')
    await expect(fresh.locator('.typewriter .display .name')).toHaveText('Personal')
    await expect(fresh.getByRole('button', { name: 'Previous list' })).toHaveCount(0)
    await expect(fresh.getByRole('button', { name: 'Next list' })).toHaveCount(0)
  })

  test('no lists shows a sensible label and the file picker on expand', async ({ page }) => {
    const none = installFakeAdapterScript()
      .replace(/const profiles = \[[\s\S]*?\n {6}\];/, 'const profiles = [];')
      .replace("let activeProfileId = 'p-personal';", 'let activeProfileId = null;')
    const fresh = await page.context().newPage()
    await fresh.addInitScript(none)
    await fresh.goto('/')
    await expect(fresh.locator('.typewriter .display .name')).toHaveText('No list')
    await expect(fresh.getByRole('button', { name: 'Next list' })).toHaveCount(0)
    await fresh.locator('.clickable-area').click()
    await expect(fresh.getByRole('button', { name: 'Choose where to keep it' })).toBeVisible()
  })

  test('navigation still works from and to a missing note, collapsed', async ({ page }) => {
    await setMissing(page, 'p-groceries', true)
    await next(page).click()
    await expect(displayName(page)).toHaveText('Groceries')
    await expect(sheet(page)).toHaveCount(0)
    await expect(next(page)).toBeVisible()
    await prev(page).click()
    await expect(displayName(page)).toHaveText('Personal')

    await next(page).click()
    await expander(page).click()
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible()
    await prev(page).click()
    await expect(page.getByText('Seed task two')).toBeVisible()
  })

  test('rapid collapsed clicks settle on the last request', async ({ page }) => {
    await page.evaluate(() => {
      ;(
        window as unknown as { __TYPEWRITER_TEST__: { setSwitchDelay(ms: number): void } }
      ).__TYPEWRITER_TEST__.setSwitchDelay(60)
    })
    for (let i = 0; i < 5; i++) await next(page).click()
    // Personal -> G -> P -> G -> P -> G
    await expect(displayName(page)).toHaveText('Groceries')
    await expander(page).click()
    await expect(page.getByText('Buy oat milk')).toBeVisible()
    await expect(page.getByText('Seed task two')).toBeHidden()
  })

  test('writes after a collapsed switch target the chosen list only', async ({ page }) => {
    await next(page).click()
    await expander(page).click()
    await page.getByRole('checkbox', { name: 'Seed task one' }).click()
    const log = await page.evaluate(
      () =>
        (window as unknown as { __TYPEWRITER_TEST__: { writeLog: { profileId: string }[] } })
          .__TYPEWRITER_TEST__.writeLog,
    )
    expect(log).toHaveLength(1)
    expect(log[0].profileId).toBe('p-groceries')
  })

  test('a draft stays with its list when switching from the display', async ({ page }) => {
    await expander(page).click()
    await page.fill('#add-task-input', 'personal draft')
    await next(page).click()
    await expect(page.locator('#add-task-input')).toHaveValue('')
    await prev(page).click()
    await expect(page.locator('#add-task-input')).toHaveValue('personal draft')
  })
})

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })
  test('switching still works with the paper animation off', async ({ page }) => {
    await expander(page).click()
    await next(page).click()
    await expect(page.getByText('Buy oat milk')).toBeVisible()
    expect(await page.locator('.list').evaluate((el) => getComputedStyle(el).animationName)).toBe(
      'none',
    )
  })
})

test.describe('focus ring after collapsing', () => {
  test('a mouse collapse leaves no focus ring on the keyboard artwork', async ({ page }) => {
    await expander(page).click()
    await expect(page.locator('[data-widget-mode="expanded"]')).toHaveCount(1)
    await expander(page).click()
    await expect(page.locator('[data-widget-mode="collapsed"]')).toHaveCount(1)
    const ring = await page.evaluate(() =>
      document.querySelector('.clickable-area')!.matches(':focus-visible'),
    )
    expect(ring).toBe(false)
  })
})

test('unavailable note offers browse and remove, and removing forgets only the list', async ({
  page,
}) => {
  await setMissing(page, 'p-groceries', true)
  await next(page).click()
  await expander(page).click()
  await expect(page.getByRole('button', { name: 'Browse for note' })).toBeVisible()
  await page.getByRole('button', { name: 'Remove this list' }).click()
  await expect(displayName(page)).toHaveText('Personal')
  await expect(page.getByText('Seed task two')).toBeVisible()
})
