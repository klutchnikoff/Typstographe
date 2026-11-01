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
    const dialog = page.getByRole('dialog', { name: 'Nouveau document', exact: true })
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

test('group toggles combine without duplicates and clear a filtered-out selection', async ({
  page,
}) => {
  const dialog = page.locator('dialog[open]')
  const groups = dialog.getByRole('group', { name: 'Groupe de documents', exact: true })
  await groups.locator('[data-group="research"]').click()
  await expect(dialog.locator('[data-type="courrier"]')).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'Créer', exact: true })).toBeDisabled()
  await dialog.locator('[data-type="article"]').click()
  await expect(dialog.locator('[data-model="article.model.working"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(dialog.getByRole('button', { name: 'Créer', exact: true })).toBeEnabled()
  await groups.locator('[data-group="careers"]').click()
  await expect(dialog.locator('[data-type="courrier"]')).toHaveCount(1)
  await expect(dialog.locator('[data-type="research-project"]')).toHaveCount(1)
  await expect(dialog.locator('[data-type="article"]')).toHaveAttribute('aria-pressed', 'true')
  await groups.locator('[data-group="research"]').click()
  await expect(dialog.locator('[data-type="article"]')).toHaveCount(0)
  await expect(dialog.locator('[data-model]')).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'Créer', exact: true })).toBeDisabled()
  await groups.locator('[data-group="careers"]').click()
  await expect(groups.locator('[data-group=""]')).toHaveAttribute('aria-pressed', 'true')
  await expect(dialog.locator('.type-card')).toHaveCount(14)
  await groups.locator('[data-group="research"]').click()
  await groups.locator('[data-group=""]').click()
  await expect(dialog.locator('.type-card')).toHaveCount(14)
  await expect(groups.locator('[aria-pressed="true"]')).toHaveCount(1)
  await dialog.locator('[data-type="article"]').click()
  await confirmNewDocument(page)
  await expect(page.locator('#document-type-label')).toContainText('article')
})

test('real model thumbnails load without altering the document or blocking creation', async ({
  page,
}) => {
  const dialog = page.locator('dialog[open]')
  const image = dialog.locator('.model-thumbnail img')
  await expect(image).toHaveAttribute('src', /^data:image\/png;base64,/)
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(320)
  await expect(dialog.locator('.model-thumbnail-status')).toHaveCount(0)
  await dialog.locator('[data-type="article"]').click()
  await expect(dialog.locator('[data-model]')).toHaveCount(1)
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(320)
  await confirmNewDocument(page)
  await expect(page.locator('.tiptap')).not.toContainText('L’organisation du travail universitaire')
})

test('thumbnail failure leaves the actual model selectable and creation available', async ({
  page,
}) => {
  await page.route('**/__spike/invoke', async (route) => {
    if (route.request().postDataJSON().command === 'model_thumbnail')
      await route.fulfill({ json: { error: 'thumbnail unavailable' } })
    else await route.continue()
  })
  await page.reload()
  await page.waitForFunction(() => window.__spike?.ready)
  await page.locator('#create-document').click()
  const dialog = page.locator('dialog[open]')
  await expect(dialog.locator('.model-thumbnail-status')).toHaveText('Aperçu indisponible')
  await expect(dialog.getByRole('button', { name: 'Créer', exact: true })).toBeEnabled()
  await confirmNewDocument(page)
  await expect(page.locator('main')).toBeVisible()
})

for (const dark of [false, true]) {
  test(`gallery fits a ${dark ? 'dark' : 'light'} small window with fixed footer and contained tiles`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 800, height: 600 })
    await page.emulateMedia({ colorScheme: dark ? 'dark' : 'light', reducedMotion: 'reduce' })
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
    const cancel = dialog.getByRole('button', { name: 'Annuler', exact: true })
    await expect(cancel).toBeInViewport()
    const bounds = await dialog.boundingBox()
    expect(bounds!.width).toBeCloseTo(800 * 0.94, 0)
    expect(bounds!.height).toBeCloseTo(600 * 0.94, 0)
    const footerBefore = await cancel.boundingBox()
    const bandBefore = await dialog.locator('.type-model-band').boundingBox()
    await dialog.locator('.type-card-scroller').evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    expect(await cancel.boundingBox()).toEqual(footerBefore)
    expect(await dialog.locator('.type-model-band').boundingBox()).toEqual(bandBefore)
    const overflow = await dialog.locator('.type-card').evaluateAll(
      (cards) =>
        cards.filter((card) => {
          const box = card.getBoundingClientRect()
          return [...card.children].some((child) => {
            const inner = child.getBoundingClientRect()
            return inner.left < box.left || inner.right > box.right || inner.bottom > box.bottom
          })
        }).length,
    )
    expect(overflow).toBe(0)
    await page.keyboard.press('Escape')
    await expect(page.locator('#create-document')).toBeFocused()
  })
}
