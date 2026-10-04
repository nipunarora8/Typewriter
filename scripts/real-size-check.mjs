import { chromium } from '@playwright/test'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 300, height: 150 } })
await page.goto('http://localhost:1420/')
await page.waitForTimeout(300)
await page.evaluate(() => {
  const el = document.querySelector('.dev-theme-switcher')
  if (el) el.style.display = 'none'
})
await page.screenshot({ path: 'dev-artifacts/phase-0a/ivory-collapsed-real-size.png' })
await browser.close()
