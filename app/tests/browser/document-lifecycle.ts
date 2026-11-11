import type { Page } from '@playwright/test'

/** Creation reloads the view. The old page can still report ready while its
 * replacement is loading, so observe navigation before reading the new owner.
 */
export async function confirmNewDocument(page: Page) {
  await Promise.all([
    page.waitForEvent('domcontentloaded'),
    page.getByRole('button', { name: 'Créer', exact: true }).click(),
  ])
  await page.waitForFunction(() => window.__spike?.ready)
}

export async function openDocumentVersions(page: Page) {
  const document = page.locator('.side-rail [data-command="ui.document"]')
  if ((await document.getAttribute('aria-expanded')) !== 'true') await document.click()
  const summary = page
    .locator('.document-navigation summary')
    .getByText('Versions', { exact: true })
  if (!(await summary.evaluate((element) => element.closest('details')!.open)))
    await summary.click()
}
