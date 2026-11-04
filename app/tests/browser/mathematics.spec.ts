import { expect, test } from '@playwright/test'
import { confirmNewDocument } from './document-lifecycle'
test.beforeEach(async ({ page, request }) => {
  await request.post('/__spike/invoke', { data: { command: 'reset', peer: 'main', args: {} } })
  await page.goto('/?client=main&welcome=1')
  await page.waitForFunction(() => window.__spike?.ready)
  await page.getByRole('button', { name: 'Nouveau document', exact: true }).first().click()
  await page.locator('dialog [data-type="article"]').click()
  await confirmNewDocument(page)
  await page.evaluate(async () => {
    const { editor, provider } = window.__spike!
    editor.commands.setContent('<p></p>')
    editor.commands.setTextSelection(1)
    editor.view.focus()
    await provider.flush()
  })
})
test('Typst and LaTeX inline input keep editable source, native publication and following text offsets', async ({
  page,
}) => {
  await page.keyboard.type('Voir $cos(x)$ et $$\\cos(x)$$ ensuite.')
  await page.evaluate(() => window.__spike!.provider.flush())
  const sources = page.locator('.math-source-inline')
  await expect(sources).toHaveCount(2)
  await expect(sources.nth(0)).toHaveAttribute('data-math-source', 'typst')
  await expect(sources.nth(1)).toHaveAttribute('data-math-source', 'latex')
  expect(await page.evaluate(() => window.__spike!.provider.rejected)).toBeFalsy()
  await page.evaluate(() => {
    const { editor } = window.__spike!
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'mathInline' && node.attrs.language === 'latex')
        editor.commands.setTextSelection(pos + 1)
    })
    editor.view.focus()
  })
  await page.keyboard.type('2 + ')
  await page.evaluate(() => window.__spike!.provider.flush())
  await expect(sources.nth(1).locator('.math-source')).toHaveText('2 + \\cos(x)')
  expect(await page.evaluate(() => window.__spike!.provider.rejected)).toBeFalsy()
  await page.keyboard.press('Control+z')
  await page.evaluate(() => window.__spike!.provider.flush())
  await expect(sources.nth(1).locator('.math-source')).toHaveText('\\cos(x)')
})
test('standalone markers create raw-code widgets, preserve multiline spacing and support eq:/dollar reference filters', async ({
  page,
}) => {
  await page.keyboard.type('$$')
  await page.keyboard.press('Enter')
  const widget = page.locator('[data-editor-widget="mathBlock"]')
  await expect(widget).toHaveCount(1)
  await expect(widget).toHaveAttribute('data-math-source', 'latex')
  await page.keyboard.type('\\frac{a}{b}')
  await page.keyboard.press('Enter')
  await page.keyboard.type('  + c')
  await page.evaluate(() => window.__spike!.provider.flush())
  await expect(widget.locator('.math-source')).toHaveText('\\frac{a}{b}\n  + c')
  expect(await page.evaluate(() => window.__spike!.provider.rejected)).toBeFalsy()
  await page.keyboard.press('Control+Enter')
  const settings = page.locator('#properties')
  await expect(settings).toBeVisible()
  const alias = settings.getByRole('textbox', { name: 'Label facultatif' })
  await alias.fill('fraction')
  await expect(settings.locator('.prefixed-parameter > span')).toHaveText('eq:')
  await settings.getByRole('button', { name: 'Valider', exact: true }).click()
  await expect(settings).toBeHidden()
  await page.keyboard.press('Tab')
  await page.locator('[data-command="insert.reference"]').click()
  const band = page.locator('#cross-reference-properties')
  const search = band.getByRole('combobox', { name: 'Rechercher une cible' })
  await search.fill('$fraction')
  await expect(band.getByRole('option')).toHaveCount(1)
  await expect(band.getByRole('option')).toContainText('eq:fraction')
  await search.press('Enter')
  const badge = page.locator('.inline-object[data-kind="crossReference"] .inline-object-label')
  await expect(badge).toHaveText('(1)')
  expect(await page.evaluate(() => window.__spike!.provider.rejected)).toBeFalsy()
  // The common target protection applies to equations, too.
  const before = await page.evaluate(() => JSON.stringify(window.__spike!.editor.getJSON()))
  await page.evaluate(() => {
    const e = window.__spike!.editor
    e.view.dispatch(e.state.tr.delete(0, e.state.doc.firstChild!.nodeSize))
  })
  expect(await page.evaluate(() => JSON.stringify(window.__spike!.editor.getJSON()))).toBe(before)
})

test('toolbar insertion enters inline source and its shared properties can change language', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Mathématiques', exact: true }).click()
  await page.locator('[data-command="math.inline"]').click()
  await expect
    .poll(() =>
      page.evaluate(() => ({
        parent: window.__spike!.editor.state.selection.$from.parent.type.name,
        focused: window.__spike!.editor.isFocused,
      })),
    )
    .toEqual({ parent: 'mathInline', focused: true })
  await page.keyboard.type('x^2')
  const source = page.locator('.math-source-inline .math-source')
  await expect(source).toHaveText('x^2')
  await page.keyboard.press('Control+Enter')
  const properties = page.locator('#properties')
  await expect(properties).toBeVisible()
  await properties
    .getByRole('combobox', { name: 'Langage mathématique' })
    .selectOption(JSON.stringify('latex'))
  await properties.getByRole('button', { name: 'Valider', exact: true }).click()
  await expect(properties).toBeHidden()
  await expect(page.locator('.math-source-inline')).toHaveAttribute('data-math-source', 'latex')
  await page.keyboard.press('Tab')
  await page.keyboard.type(' après')
  await page.evaluate(() => window.__spike!.provider.flush())
  expect(await page.evaluate(() => window.__spike!.provider.rejected)).toBeFalsy()
  await expect(source).toHaveText('x^2')
})
