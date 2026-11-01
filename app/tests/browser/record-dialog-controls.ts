import { expect, type Page } from '@playwright/test'

export async function openRecordCard(page: Page, index = 0, collection = 'localizations') {
  await page.locator(`[data-section="${collection}"] [data-record-open]`).nth(index).click()
  await expect(page.locator('dialog.form-dialog')).toBeVisible()
}
export async function confirmRecordDialog(page: Page) {
  await page.locator('dialog.form-dialog .dialog-form > .panel-actions .primary').click()
  await expect(page.locator('dialog.form-dialog')).toHaveCount(0)
  await page.evaluate(() => window.__spike!.provider.flush())
}
