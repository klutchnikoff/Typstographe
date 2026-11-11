import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page, request }) => {
  const reset = await request.post('/__spike/invoke', {
    data: { command: 'reset', peer: 'main', args: {} },
  })
  expect((await reset.json()).error).toBeUndefined()
  await page.goto('/?client=main')
  await page.waitForFunction(() => window.__spike?.ready)
})

test('orthographe : clic droit ciblé, navigation, annulation et menu natif sur la prose', async ({
  page,
}) => {
  let reply!: () => void
  const pending = new Promise<void>((resolve) => {
    reply = resolve
  })
  await page.route('**/__spike/invoke', async (route) => {
    if (route.request().postDataJSON().command !== 'spelling_suggestions') return route.continue()
    await pending
    await route.fulfill({ json: { result: ['courrier', 'courriers'] } })
  })
  await page.evaluate(async () => {
    const { editor, provider } = window.__spike!
    editor.commands.setContent('<p>Ce courrrier est prêt.</p>')
    editor.commands.setTextSelection(6)
    editor.view.focus()
    await provider.flush()
  })
  const editor = page.locator('.tiptap[data-rich-zone-profile="document"]')
  const word = editor.locator('.spelling-error[data-word="courrrier"]')
  const menu = page.getByRole('menu', { name: /^Orthographe/ })
  await expect(word).toBeVisible()
  const before = await word.boundingBox()
  try {
    await word.click({ button: 'right' })
    await expect(menu).toBeFocused()
    await page.keyboard.press('ArrowDown')
    const ignore = menu.getByRole('menuitem', { name: 'Ignorer dans ce document' })
    await expect(ignore).toBeFocused()
    reply()
    const suggestion = menu.getByRole('menuitem', { name: 'courrier', exact: true })
    await expect(suggestion).toBeVisible()
    await expect(ignore).toBeFocused()
    expect(await word.boundingBox()).toEqual(before)
    await page.keyboard.press('Home')
    await expect(suggestion).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(editor).toContainText('Ce courrier est prêt.')
    await expect(editor).toBeFocused()
    await page.keyboard.press('ControlOrMeta+z')
    await expect(word).toBeVisible()
  } finally {
    reply()
  }
  await page.evaluate(() => {
    const { editor } = window.__spike!
    editor.commands.setTextSelection(1)
    editor.view.focus()
  })
  await word.click({ button: 'right' })
  await expect(menu).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(editor).toBeFocused()
  expect(await page.evaluate(() => window.__spike!.editor.state.selection.from)).toBe(1)
  await page.evaluate(() => {
    const { editor } = window.__spike!
    editor.commands.setTextSelection(6)
    editor.view.focus()
  })
  await page.keyboard.press('ControlOrMeta+Enter')
  await expect(menu).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await expect(editor).toBeFocused()
  await page.evaluate(() => {
    const { editor } = window.__spike!
    editor.commands.setTextSelection({ from: 4, to: 13 })
    editor.view.focus()
  })
  const selectedIntercepted = await word.evaluate((element) => {
    element.dispatchEvent(new PointerEvent('pointerdown', { button: 2, bubbles: true }))
    return !element.dispatchEvent(
      new MouseEvent('contextmenu', { button: 2, bubbles: true, cancelable: true }),
    )
  })
  expect(selectedIntercepted).toBe(false)
  expect(
    await editor.evaluate(
      (element) =>
        !element
          .querySelector('p')!
          .dispatchEvent(
            new MouseEvent('contextmenu', { button: 2, bubbles: true, cancelable: true }),
          ),
    ),
  ).toBe(false)
})

test('tableau : un axe depuis la poignée, deux depuis la cellule et focus dans la nouvelle colonne', async ({
  page,
}) => {
  const widget = page.locator('[data-editor-widget="tableFigure"]').first()
  const handle = widget.getByRole('button', { name: 'Actions sur la ligne 2', exact: true })
  const menu = page.locator('#object-menu')
  await handle.click({ button: 'right' })
  await expect(menu.getByRole('group', { name: 'Ligne 2', exact: true })).toBeVisible()
  await expect(menu.getByRole('group', { name: /^Colonne/ })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(handle).toBeFocused()
  await page.keyboard.press('Shift+F10')
  await expect(menu).toBeVisible()
  await page.keyboard.press('Escape')
  await widget.locator('tr').nth(1).locator('td').nth(1).click()
  const before = await widget.boundingBox()
  await page.keyboard.press('ControlOrMeta+Enter')
  await expect(menu.getByRole('group', { name: 'Ligne 2', exact: true })).toBeVisible()
  await expect(menu.getByRole('group', { name: 'Colonne 2', exact: true })).toBeVisible()
  expect(await widget.boundingBox()).toEqual(before)
  const headerCount = await widget.locator('th').count()
  await menu.getByRole('menuitem', { name: 'Insérer à droite', exact: true }).click()
  await expect(widget.locator('th')).toHaveCount(headerCount + 1)
  await expect(menu).toBeHidden()
  await expect(page.locator('.tiptap[data-rich-zone-profile="document"]')).toBeFocused()
  await page.keyboard.press('ControlOrMeta+z')
  await expect(widget.locator('th')).toHaveCount(headerCount)
})

test('liste : type courant, conversion immédiate, numéro initial séparé et annulation', async ({
  page,
}) => {
  const list = page.locator('.widget-bulletList').first()
  const trigger = list.getByRole('button', { name: 'Liste à puces', exact: true })
  const menu = page.getByRole('menu', { name: 'Type de liste', exact: true })
  await trigger.click()
  await expect(
    menu.getByRole('menuitemradio', { name: 'Liste à puces', checked: true }),
  ).toBeFocused()
  await page.keyboard.press('ArrowDown')
  const numbered = menu.getByRole('menuitemradio', { name: 'Liste numérotée', exact: true })
  await expect(numbered).toBeFocused()
  await expect(list).toHaveCount(1)
  await page.keyboard.press('Space')
  const ordered = page.locator('.widget-orderedList').first()
  await expect(ordered).toBeVisible()
  await expect(menu).toBeHidden()
  await expect(page.locator('.tiptap[data-rich-zone-profile="document"]')).toBeFocused()
  const orderedTrigger = ordered.getByRole('button', { name: 'Liste numérotée', exact: true })
  await orderedTrigger.click()
  await menu.getByRole('menuitem', { name: 'Numéro initial…', exact: true }).click()
  const field = page.locator('#properties').getByRole('spinbutton', { name: 'Numéro initial' })
  await expect(field).toBeFocused()
  await field.fill('3')
  await field.press('Enter')
  await expect(ordered.locator('ol')).toHaveAttribute('start', '3')
  await page.keyboard.press('ControlOrMeta+z')
  await expect(ordered.locator('ol')).toHaveAttribute('start', '1')
  await page.keyboard.press('ControlOrMeta+z')
  await expect(list).toBeVisible()
  await list.locator('li p').nth(1).click()
  await expect
    .poll(() =>
      page.evaluate(() => window.__spike!.editor.state.selection.$from.parent.textContent),
    )
    .toContain('Installer la salle')
  const caret = await page.evaluate(() => window.__spike!.editor.state.selection.from)
  await page.keyboard.press('ControlOrMeta+Enter')
  await expect(menu).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.tiptap[data-rich-zone-profile="document"]')).toBeFocused()
  expect(await page.evaluate(() => window.__spike!.editor.state.selection.from)).toBe(caret)
  await trigger.click()
  await expect(menu).toBeVisible()
  await page.keyboard.press('Tab')
  await expect(menu).toBeHidden()
  await expect(list.getByRole('button', { name: 'Supprimer · Liste à puces' })).toBeFocused()
  await trigger.click({ button: 'right' })
  await expect(menu).toBeVisible()
  await numbered.click()
  await expect(ordered).toBeVisible()
  await expect(menu).toBeHidden()
})
