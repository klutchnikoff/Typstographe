import { expect, type Page } from '@playwright/test'

/** A retained page count alone does not acknowledge the latest render. */
export async function expectPreviewReady(page: Page, count?: number, timeout = 5000) {
  await expect(page.locator('#render-status')).toBeHidden({ timeout })
  await expect(page.locator('#preview-heading')).toHaveText(
    count === undefined
      ? /^Aperçu \(\d+ pages?\)$/
      : `Aperçu (${count} ${count === 1 ? 'page' : 'pages'})`,
  )
}
