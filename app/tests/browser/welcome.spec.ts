import { confirmNewDocument } from './document-lifecycle'
import { expect, test } from '@playwright/test'

test.beforeEach(async ({ request }) => {
  const response = await request.post('/__spike/invoke', {
    data: { command: 'reset', peer: 'main', args: {} },
  })
  expect((await response.json()).error).toBeUndefined()
})

test('accueil centré, ouverture sans fenêtre de progression et animation non rejouée au retour', async ({
  page,
}) => {
  await page.goto('/?client=main&welcome=1')
  await page.waitForFunction(() => window.__spike?.ready)
  const welcome = page.locator('.welcome')
  const brand = welcome.getByRole('img', { name: 'typstOgraphe', exact: true })
  const buttons = welcome.getByRole('button')
  await expect(buttons).toHaveCount(2)
  await expect(welcome).not.toContainText('Le contenu d’abord.')
  await expect(page.locator('#resume-document')).toBeHidden()
  const bounds = await buttons.evaluateAll((elements) =>
    elements.map((element) => {
      const { x, y, width, height } = element.getBoundingClientRect()
      return { center: x + width / 2, y, width, height }
    }),
  )
  for (const [index, button] of bounds.entries()) {
    expect(Math.abs(button.center - bounds[0].center)).toBeLessThan(1)
    expect(button.width).toBe(bounds[0].width)
    if (index) expect(button.y).toBeGreaterThan(bounds[index - 1].y + bounds[index - 1].height)
  }
  await expect(brand).toHaveAttribute('data-state', 'writing')
  // The new-document dialog is usable while the signature is still being drawn.
  await page.locator('#create-document').click()
  await expect(page.locator('dialog')).toBeVisible()
  let continueOpening!: () => void
  const pause = new Promise<void>((resolve) => (continueOpening = resolve))
  await page.route('**/__spike/invoke', async (route) => {
    if (route.request().postDataJSON().command === 'transition_status') await pause
    await route.continue()
  })
  const creation = confirmNewDocument(page)
  try {
    const progress = welcome.locator('.welcome-progress')
    await expect(progress).toBeVisible()
    await expect(progress.getByRole('status', { name: 'Chargement…' })).toBeVisible()
    await expect(page.locator('dialog[open]')).toHaveCount(0)
    await expect(page.locator('.welcome-actions')).toHaveJSProperty('inert', true)
    const progressBounds = await progress.boundingBox()
    expect(progressBounds!.y).toBeGreaterThan(bounds.at(-1)!.y + bounds.at(-1)!.height)
    await expect(progress).toBeInViewport()
    expect(await progress.evaluate((element) => element.contains(document.activeElement))).toBe(
      false,
    )
  } finally {
    continueOpening()
  }
  await creation
  await expect(welcome).toBeHidden()
  await page.getByRole('button', { name: 'Fichier', exact: true }).click()
  await page.locator('[data-command="document.close"]').click()
  await expect(welcome).toBeVisible()
  await expect(welcome.locator('.welcome-progress')).toHaveCount(0)
  await expect(page.locator('.welcome-actions')).toHaveJSProperty('inert', false)
  await expect(brand).toHaveAttribute('data-state', 'settled')
  expect(
    await brand.evaluate((element) =>
      element
        .getAnimations({ subtree: true })
        .every((animation) => animation.playState === 'finished'),
    ),
  ).toBe(true)
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(brand).toHaveAttribute('data-state', 'settled')
})

test('accueil sans mouvement et actions accessibles à la taille minimale', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 800, height: 600 })
  await page.goto('/?client=main&welcome=1')
  await page.waitForFunction(() => window.__spike?.ready)
  const brand = page.locator('.welcome-brand')
  await expect(brand).toHaveAttribute('data-state', 'settled')
  expect(await brand.evaluate((element) => element.getAnimations({ subtree: true }).length)).toBe(0)
  const buttons = page.locator('.welcome-actions').getByRole('button')
  await expect(buttons).toHaveCount(2)
  for (const button of await buttons.all()) await expect(button).toBeInViewport()
  await expect(page.locator('#resume-document')).toBeHidden()
  await expect(page.locator('#create-document')).toBeEnabled()
  await expect(page.locator('#open-document')).toBeEnabled()
})
