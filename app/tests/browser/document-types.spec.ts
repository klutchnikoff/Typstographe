import { expect, test } from '@playwright/test'
import { confirmNewDocument } from './document-lifecycle'

test.beforeEach(async ({ request, page }) => {
  await request.post('/__spike/invoke', {
    data: { command: 'reset', peer: 'main', args: {} },
  })
  await page.goto('/?client=main&welcome=1')
  await page.waitForFunction(() => window.__spike?.ready)
  await page.locator('#create-document').click()
})

test(
  'planned profiles remain inspectable without allowing document creation',
  { tag: '@smoke' },
  async ({ page }) => {
    const dialog = page.locator('dialog[open]')
    await expect(dialog.locator('.type-card')).toHaveCount(14)
    await expect(dialog.locator('.type-card:not(.planned)')).toHaveCount(2)
    await dialog.locator('[data-type="cv"]').click()
    await expect(dialog.locator('.type-choice-description')).toContainText(
      'ne peut pas encore être créé',
    )
    await expect(dialog.getByRole('button', { name: 'Créer', exact: true })).toBeDisabled()
    await expect(dialog.getByLabel('Modèle', { exact: true })).toBeHidden()
    await page.keyboard.press('ControlOrMeta+Enter')
    await expect(dialog).toBeVisible()
    await expect(page.locator('main')).toBeHidden()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(page.locator('.welcome')).toBeVisible()
  },
)

test('group filtering reuses the same type and actual models', async ({ page }) => {
  const dialog = page.locator('dialog[open]')
  const groups = dialog.getByLabel('Groupe de documents', { exact: true })
  await groups.selectOption('research')
  await expect(dialog.locator('[data-type="courrier"]')).toHaveCount(0)
  await dialog.locator('[data-type="article"]').click()
  await expect(dialog.getByLabel('Modèle', { exact: true })).toHaveValue('article.model.working')
  await expect(dialog.getByRole('button', { name: 'Créer', exact: true })).toBeEnabled()
  await groups.selectOption('careers')
  await expect(dialog.locator('[data-type="courrier"]')).toHaveCount(1)
  await dialog.locator('[data-type="research-project"]').click()
  await expect(dialog.getByRole('button', { name: 'Créer', exact: true })).toBeDisabled()
  await groups.selectOption('research')
  await expect(dialog.locator('[data-type="research-project"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await dialog.locator('[data-type="article"]').click()
  await confirmNewDocument(page)
  await expect(page.locator('#document-type-label')).toContainText('article')
})

test('cards support shared arrow navigation and remain usable in a small dark window', async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 600 })
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
  const dialog = page.locator('dialog[open]')
  const first = dialog.locator('[data-type="courrier"]')
  await first.focus()
  await page.keyboard.press('ArrowRight')
  const next = dialog.locator('[data-type="compte-rendu"]')
  await expect(next).toBeFocused()
  await expect(next).toHaveAccessibleDescription(/À venir/)
  await page.keyboard.press('Enter')
  await expect(next).toHaveAttribute('aria-pressed', 'true')
  await expect(dialog.getByRole('button', { name: 'Créer', exact: true })).toBeDisabled()
  await expect(dialog.getByRole('button', { name: 'Annuler', exact: true })).toBeInViewport()
  const bounds = await dialog.boundingBox()
  expect(bounds!.width).toBeLessThanOrEqual(800)
  expect(bounds!.height).toBeLessThanOrEqual(600)
})
