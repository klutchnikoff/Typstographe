import { copyFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { confirmNewDocument } from './document-lifecycle'

test('the Projects catalogue is available on welcome and retains pins when opening a file', async ({
  page,
  request,
}) => {
  await request.post('/__spike/invoke', { data: { command: 'reset', peer: 'main', args: {} } })
  await page.goto('/?client=main&welcome=1')
  await page.waitForFunction(() => window.__spike?.ready)
  const root = await page.evaluate(() => window.__spike!.provider.sessionPath)
  const path = join(root, 'Étude de terrain.typsto')
  mkdirSync(root, { recursive: true })
  copyFileSync(new URL('../../../fixtures/projects/article-working.typsto', import.meta.url), path)
  await page.evaluate(async (path) => {
    const { transport } = window.__spike!.provider
    const preferences = await transport.invoke<object>('preferences_load')
    await transport.invoke('preferences_save', { preferences: { ...preferences, recent: [path] } })
  }, path)
  await page.reload()
  await page.waitForFunction(() => window.__spike?.ready)

  const rail = page.locator('.side-rail')
  const projects = rail.getByRole('button', { name: 'Projets', exact: true })
  const document = rail.getByRole('button', { name: 'Document', exact: true })
  const panel = page.locator('#side-panel')
  const search = panel.getByRole('searchbox', { name: 'Rechercher un projet' })
  const pin = panel.getByRole('button', { name: 'Épingler Étude de terrain', exact: true })
  const file = panel.getByRole('button', { name: 'Étude de terrain', exact: true })
  await expect(document).toBeDisabled()
  await projects.click()
  await expect(search).toBeFocused()
  await expect(panel.getByRole('heading', { name: 'Récents', exact: true })).toBeVisible()
  await search.fill('absent')
  await expect(panel.getByRole('status')).toHaveText('Aucun projet trouvé.')
  await search.fill('etude')
  await pin.click()
  await expect(pin).toBeFocused()
  await expect(pin).toHaveAttribute('aria-pressed', 'true')
  await expect(panel.getByRole('heading', { name: 'Épinglés', exact: true })).toBeVisible()
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const { transport } = window.__spike!.provider
        return (await transport.invoke<{ pinned: string[] }>('preferences_load')).pinned
      }),
    )
    .toEqual([path])
  await search.press('Escape')
  await expect(panel).toBeHidden()
  await expect(projects).toBeFocused()

  await projects.click()
  await rail.locator('.side-rail-toggle').click()
  await expect(panel).toHaveAttribute('data-docked', 'false')
  await expect(search).toBeFocused()
  await search.press('ArrowDown')
  await expect(file).toBeFocused()
  await Promise.all([page.waitForEvent('domcontentloaded'), file.press('Enter')])
  await page.waitForFunction(() => window.__spike?.ready)
  await expect(page.locator('.welcome')).toBeHidden()
  await expect(document).toBeEnabled()
  await expect(document).toHaveAttribute('aria-expanded', 'true')
  await projects.click()
  await expect(pin).toHaveAttribute('aria-pressed', 'true')
  await expect(file).toHaveAttribute('aria-current', 'true')

  await document.click()
  await expect(projects).toHaveAttribute('aria-expanded', 'false')
  const plan = panel.locator('details[open]')
  await expect(plan.locator('summary')).toHaveText('Plan')
  const heading = plan.getByRole('button', { name: 'Conclusion', exact: true })
  await heading.press('Enter')
  await expect(page.getByRole('textbox', { name: 'Corps du document', exact: true })).toBeFocused()
  expect(
    await page.evaluate(() => window.__spike!.editor.state.selection.$from.parent.textContent),
  ).toBe('Conclusion')
  const bibliography = panel.getByRole('button', { name: 'Bibliographie', exact: true })
  await bibliography.click()
  const manager = page.locator('#bibliography-manager')
  await expect(manager).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(manager).toBeHidden()
  await expect(bibliography).toBeFocused()
})

test('Projects can create a letter and Document only shows sections for that type', async ({
  page,
  request,
}) => {
  await request.post('/__spike/invoke', { data: { command: 'reset', peer: 'main', args: {} } })
  await page.goto('/?client=main&welcome=1')
  await page.waitForFunction(() => window.__spike?.ready)
  const rail = page.locator('.side-rail')
  const panel = page.locator('#side-panel')
  await rail.getByRole('button', { name: 'Projets', exact: true }).click()
  await panel.getByRole('button', { name: 'Nouveau', exact: true }).click()
  await confirmNewDocument(page)
  await rail.getByRole('button', { name: 'Document', exact: true }).click()
  await expect(panel.getByRole('button', { name: 'Bibliographie', exact: true })).toHaveCount(0)
  const emptyPlan = panel.getByText('Aucun titre dans le document.', { exact: true })
  await expect(emptyPlan).toBeVisible()
  await panel.locator('summary').getByText('Ressources', { exact: true }).click()
  const emptyResources = panel.getByText('Aucune ressource dans le document.', { exact: true })
  await expect(panel.locator('details[open]')).toHaveCount(2)
  await expect(emptyPlan).toBeVisible()
  await expect(emptyResources).toBeVisible()
  await panel
    .locator('summary')
    .filter({ has: page.getByText('Plan', { exact: true }) })
    .press('Enter')
  await expect(panel.locator('details[open]')).toHaveCount(1)
  await expect(emptyPlan).toBeHidden()
  await expect(emptyResources).toBeVisible()
})
