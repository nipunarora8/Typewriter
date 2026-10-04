import { test, expect, type Page } from '@playwright/test'
import { installFakeAdapterScript } from './fakeAdapter'

/**
 * Deterministic screenshot baselines. Fixed viewport, fake data, and
 * `prefers-reduced-motion: reduce` forced so transitions are near-
 * instant and captures are stable across runs. Playwright generates
 * baselines on first run (`--update-snapshots`) and diffs against them
 * on every run after — a real regression requires intentional review,
 * not an automatic pass.
 */

test.use({
  colorScheme: 'light',
  reducedMotion: 'reduce',
})

async function setTheme(page: Page, theme: 'ivory' | 'midnight' | 'high-contrast') {
  await page.evaluate((t) => {
    if (t === 'ivory') {
      document.documentElement.removeAttribute('data-theme')
    } else {
      document.documentElement.setAttribute('data-theme', t)
    }
  }, theme)
  await page.evaluate(() => {
    const el = document.querySelector('.dev-theme-switcher')
    if (el) (el as HTMLElement).style.display = 'none'
  })
}

const themes = ['ivory', 'midnight', 'high-contrast'] as const

for (const theme of themes) {
  test(`collapsed widget — ${theme}`, async ({ page }) => {
    await page.addInitScript(installFakeAdapterScript())
    await page.setViewportSize({ width: 380, height: 252 })
    await page.goto('/')
    await setTheme(page, theme)
    await expect(page).toHaveScreenshot(`collapsed-${theme}.png`)
  })

  test(`expanded sheet, populated — ${theme}`, async ({ page }) => {
    await page.addInitScript(installFakeAdapterScript())
    await page.setViewportSize({ width: 380, height: 636 })
    await page.goto('/')
    await setTheme(page, theme)
    await page.click('.typewriter')
    await expect(page.getByText('Seed task one')).toBeVisible()
    await expect(page).toHaveScreenshot(`expanded-populated-${theme}.png`)
  })
}

test('expanded sheet, empty state', async ({ page }) => {
  const emptyAdapterScript = installFakeAdapterScript().replace(
    /'p-personal': \[[\s\S]*?\n {8}\],/,
    "'p-personal': [],",
  )
  await page.addInitScript(emptyAdapterScript)
  await page.setViewportSize({ width: 380, height: 636 })
  await page.goto('/')
  await setTheme(page, 'ivory')
  await page.click('.typewriter')
  await expect(page.getByText('No tasks yet')).toBeVisible()
  await expect(page).toHaveScreenshot('expanded-empty.png')
})

test('expanded sheet, focus state on add input', async ({ page }) => {
  await page.addInitScript(installFakeAdapterScript())
  await page.setViewportSize({ width: 380, height: 636 })
  await page.goto('/')
  await setTheme(page, 'ivory')
  await page.click('.typewriter')
  await page.focus('#add-task-input')
  await expect(page).toHaveScreenshot('expanded-focus-add-input.png')
})

test('expanded sheet, second list active', async ({ page }) => {
  await page.addInitScript(installFakeAdapterScript())
  await page.setViewportSize({ width: 380, height: 636 })
  await page.goto('/')
  await setTheme(page, 'ivory')
  await page.click('.typewriter')
  await page.getByRole('button', { name: 'Next list' }).click()
  await expect(page.getByText('Buy oat milk')).toBeVisible()
  await expect(page).toHaveScreenshot('expanded-second-list.png')
})

test('expanded sheet, long list name truncates', async ({ page }) => {
  const longName = installFakeAdapterScript().replace(
    "displayName: 'Personal'",
    "displayName: 'Quarterly planning and long-running personal projects'",
  )
  await page.addInitScript(longName)
  await page.setViewportSize({ width: 380, height: 636 })
  await page.goto('/')
  await setTheme(page, 'ivory')
  await page.click('.typewriter')
  await expect(page.getByText('Seed task one')).toBeVisible()
  await expect(page).toHaveScreenshot('expanded-long-list-name.png')
})

test('expanded sheet, missing note state', async ({ page }) => {
  await page.addInitScript(installFakeAdapterScript())
  await page.setViewportSize({ width: 380, height: 636 })
  await page.goto('/')
  await setTheme(page, 'ivory')
  await page.click('.typewriter')
  await page.evaluate(() => {
    ;(
      window as unknown as { __TYPEWRITER_TEST__: { setMissing(id: string, m: boolean): void } }
    ).__TYPEWRITER_TEST__.setMissing('p-groceries', true)
  })
  await page.getByRole('button', { name: 'Next list' }).click()
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible()
  await expect(page).toHaveScreenshot('expanded-missing-note.png')
})

test('expanded sheet, list manager open', async ({ page }) => {
  await page.addInitScript(installFakeAdapterScript())
  await page.setViewportSize({ width: 380, height: 636 })
  await page.goto('/')
  await setTheme(page, 'ivory')
  await page.click('.typewriter')
  await page.getByRole('button', { name: 'Manage lists' }).click()
  await expect(page.getByRole('dialog', { name: 'Manage lists' })).toBeVisible()
  await expect(page).toHaveScreenshot('expanded-list-manager.png')
})
