import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page, request }) => {
  const response = await request.post('/__spike/invoke', {
    data: { command: 'reset', peer: 'main', args: {} },
  })
  expect((await response.json()).error).toBeUndefined()
  await page.goto('/?client=main')
  await page.waitForFunction(() => window.__spike?.ready)
})

test('les flèches parcourent les commandes filtrées sans quitter la recherche et Entrée lance le choix actif', async ({
  page,
}) => {
  await page.evaluate(() => {
    window.__spike!.editor.commands.setContent('<p>Un titre à appliquer</p>')
    window.__spike!.editor.commands.focus('start')
  })
  // Tiptap focus() resolves on an animation frame. The user starts from a
  // focused editor; opening the palette before that frame lets this test's
  // delayed setup steal focus back from the search field.
  const body = page.getByRole('textbox', { name: 'Corps du document', exact: true })
  await expect(body).toBeFocused()
  await page.evaluate(() => window.__spike!.editor.commands.setTextSelection({ from: 2, to: 8 }))
  const selection = () => page.evaluate(() => window.__spike!.editor.state.selection.toJSON())
  const previousSelection = await selection()
  const before = await page.evaluate(() => window.__spike!.editor.getJSON())
  const dialog = page.getByRole('dialog', { name: 'Palette de commandes', exact: true })
  const input = dialog.getByRole('combobox', { name: 'Rechercher une commande', exact: true })
  await body.press('ControlOrMeta+Shift+P')
  await expect(input).toBeFocused()
  await input.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(body).toBeFocused()
  expect(await selection()).toEqual(previousSelection)
  await body.press('ControlOrMeta+Shift+P')
  await expect(input).toBeFocused()
  await input.fill('Titre')
  const options = page.getByRole('listbox', { name: 'Commandes', exact: true }).getByRole('option')
  await expect(options).toHaveCount(3)
  const selected = page.getByRole('option', { selected: true })
  await expect(selected).toHaveText('Titre 1')
  await input.press('ArrowDown')
  await expect(selected).toHaveText('Titre 2')
  await expect(input).toBeFocused()
  await expect(input).toHaveValue('Titre')
  await expect(input).toHaveAttribute('aria-activedescendant', (await selected.getAttribute('id'))!)
  await input.press('ArrowUp')
  await expect(selected).toHaveText('Titre 1')
  await input.press('ArrowUp')
  await expect(selected).toHaveText('Titre 3')
  expect(await page.evaluate(() => window.__spike!.editor.getJSON())).toEqual(before)
  await input.fill('Titre 2')
  await expect(selected).toHaveText('Titre 2')
  await input.press('Enter')
  await expect(dialog).toBeHidden()
  await expect(page.locator('.side-panel')).toBeHidden()
  await expect(page.locator('.tiptap h2')).toHaveText('Un titre à appliquer')
  await expect(page.locator('.tiptap')).toBeFocused()
})

test('la recherche reste visible pendant le défilement, sans action pour un résultat vide et fermeture avec Échap', async ({
  page,
}) => {
  await page.keyboard.press('ControlOrMeta+F')
  const side = page.locator('.side-panel')
  await expect(side).toBeVisible()
  const palette = page.getByRole('button', { name: 'Commandes', exact: true })
  const wrench = palette.locator(':scope > svg')
  await expect(wrench.locator('path')).toHaveAttribute(
    'd',
    'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z',
  )
  await expect(palette).toHaveAttribute('title', /Palette de commandes \((Cmd|Ctrl)\+Shift\+P\)/)
  for (const appearance of ['light', 'dark']) {
    await page.evaluate(
      (value) => (document.documentElement.dataset.appearance = value),
      appearance,
    )
    await expect(wrench).toHaveCSS('fill', 'none')
    const color = await palette.evaluate((element) => getComputedStyle(element).color)
    await expect(wrench).toHaveCSS('stroke', color)
  }
  await palette.click()
  const dialog = page.getByRole('dialog', { name: 'Palette de commandes', exact: true })
  const input = dialog.getByRole('combobox', { name: 'Rechercher une commande', exact: true })
  const results = dialog.getByRole('listbox', { name: 'Commandes', exact: true })
  await expect(input).toBeFocused()
  for (const width of [1280, 720]) {
    await page.setViewportSize({ width, height: 800 })
    const bounds = (await dialog.boundingBox())!
    expect(bounds.x + bounds.width / 2).toBeCloseTo(width / 2, 0)
    expect(bounds.y).toBeGreaterThan(0)
    expect(bounds.y).toBeLessThan(100)
  }
  const before = await page.evaluate(() => window.__spike!.editor.getJSON())
  // The first enabled result is initially active; Up wraps to the last enabled command.
  await input.press('ArrowUp')
  const selected = results.getByRole('option', { selected: true })
  await expect(selected).toBeInViewport({ ratio: 1 })
  await expect(input).toBeInViewport({ ratio: 1 })
  await expect(input).toBeFocused()
  expect(await results.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
  await input.fill('e')
  await expect(selected).toBeInViewport({ ratio: 1 })
  await input.fill('Nouveau document')
  await expect(selected).toHaveText(/Nouveau document/)
  await expect(selected).toBeInViewport({ ratio: 1 })
  expect(await results.evaluate((element) => element.scrollTop)).toBe(0)
  await input.fill('zz-aucune-commande-zz')
  await expect(results.getByRole('option')).toHaveCount(0)
  await expect(
    page.getByRole('status').filter({ hasText: 'Aucune commande ne correspond.' }),
  ).toBeVisible()
  await expect(input).not.toHaveAttribute('aria-activedescendant')
  await input.press('ArrowDown')
  await input.press('Enter')
  await expect(input).toBeFocused()
  await expect(dialog).toBeVisible()
  expect(await page.evaluate(() => window.__spike!.editor.getJSON())).toEqual(before)
  await input.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(side).toBeVisible()
  await expect(palette).toBeFocused()

  const editMenu = page.getByRole('button', { name: 'Édition', exact: true })
  await editMenu.click()
  await page.getByRole('menuitem', { name: 'Palette de commandes', exact: true }).click()
  await expect(input).toBeFocused()
  await input.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(editMenu).toBeFocused()
})
