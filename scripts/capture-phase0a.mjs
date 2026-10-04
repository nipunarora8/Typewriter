import { chromium } from '@playwright/test'
import { mkdirSync } from 'fs'

const outDir = 'dev-artifacts/phase-0a'
mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 400, height: 300 } })
await page.goto('http://localhost:1420/')
await page.waitForTimeout(300)

const themes = ['ivory', 'midnight', 'high-contrast']

for (const theme of themes) {
  await page.click(`.dev-theme-switcher button:has-text("${theme}")`)
  await page.waitForTimeout(250)

  await page.screenshot({ path: `${outDir}/${theme}-collapsed.png` })

  await page.click('.typewriter')
  await page.waitForTimeout(400)
  await page.setViewportSize({ width: 420, height: 620 })
  await page.waitForTimeout(100)
  await page.screenshot({ path: `${outDir}/${theme}-expanded.png` })

  // long text / empty / focus states for ivory only (representative)
  if (theme === 'ivory') {
    await page.screenshot({ path: `${outDir}/${theme}-expanded-with-tasks.png` })
    await page.focus('#add-task-input')
    await page.screenshot({ path: `${outDir}/${theme}-focus-add-input.png` })
  }

  await page.setViewportSize({ width: 400, height: 300 })
  // collapse back for next theme iteration
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
}

await browser.close()
console.log('done')
