import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page, request }) => {
  await request.post('/__spike/invoke', { data: { command: 'reset', peer: 'main', args: {} } })
  await page.goto('/?client=main')
  await page.waitForFunction(() => window.__spike?.ready)
})

test('renvoi : sélection clavier, trois formes Typst, annulation, frontière du badge et protection de cible', async ({
  page,
}) => {
  await page.evaluate(async () => {
    const { editor, provider } = window.__spike!
    editor.commands.setContent('<h1>Méthode</h1><h1>Résultats</h1><p>Voir la méthode.</p>')
    await provider.flush()
    let paragraph = 0
    editor.state.doc.forEach((node, pos) => {
      if (node.textContent === 'Voir la méthode.') paragraph = pos
    })
    editor.commands.setTextSelection(paragraph + 6)
    editor.view.focus()
  })
  await page.locator('[data-command="insert.reference"]').click()
  const band = page.locator('#cross-reference-properties')
  const search = band.getByRole('combobox', { name: 'Rechercher une cible' })
  await expect(search).toBeFocused()
  await expect(band.getByRole('option').first().locator('svg')).toHaveCount(1)
  await search.press('ArrowDown')
  await expect(band.getByRole('option', { selected: true })).toContainText('Résultats')
  await expect(search).toBeFocused()
  await search.press('ArrowUp')
  await search.press('Enter')
  const badge = page.locator('.inline-object[data-kind="crossReference"] .inline-object-label')
  await expect(band).toBeHidden()
  await expect(badge).toHaveText('Méthode')
  expect(await page.evaluate(() => window.__spike!.provider.rejected)).toBeFalsy()
  await badge.click()
  await band.getByRole('checkbox', { name: 'Page', exact: true }).check()
  await band.getByRole('button', { name: 'Valider', exact: true }).click()
  await expect(badge).toHaveText(/Méthode \(page\s+1\)/)
  await page.evaluate(() => {
    const { editor } = window.__spike!
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'crossReference') editor.commands.setTextSelection(pos)
    })
    editor.view.focus()
  })
  await page.keyboard.press('Control+Enter')
  await expect(band).toBeHidden()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Control+Enter')
  await expect(band).toBeVisible()
  await band.getByRole('checkbox', { name: 'Libellé complet', exact: true }).uncheck()
  await band.getByRole('button', { name: 'Valider', exact: true }).click()
  await expect(badge).toHaveText(/page\s+1/)
  await badge.click()
  await band.getByRole('checkbox', { name: 'Page', exact: true }).uncheck()
  await expect(band.getByRole('button', { name: 'Valider', exact: true })).toBeDisabled()
  await search.press('Escape')
  await expect(band).toBeHidden()
  await expect(badge).toHaveText(/page\s+1/)
  const before = await page.evaluate(() => JSON.stringify(window.__spike!.editor.getJSON()))
  await page.evaluate(() => {
    const e = window.__spike!.editor
    e.view.dispatch(e.state.tr.delete(0, e.state.doc.firstChild!.nodeSize))
  })
  expect(await page.evaluate(() => JSON.stringify(window.__spike!.editor.getJSON()))).toBe(before)
  expect(await page.evaluate(() => window.__spike!.provider.rejected)).toBeFalsy()
})

test('le même sélecteur fonctionne dans une citation sans couper sa ligne et restaure le focus', async ({
  page,
}) => {
  await page.evaluate(async () => {
    const { editor, provider } = window.__spike!
    editor.commands.setContent(
      '<h1>Cadre</h1><blockquote><p>Avant après</p><cite data-attribution>Source</cite></blockquote>',
    )
    await provider.flush()
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'paragraph' && node.textContent === 'Avant après')
        editor.commands.setTextSelection(pos + 6)
    })
    editor.view.focus()
  })
  await page.locator('[data-command="insert.reference"]').click()
  const band = page.locator('#cross-reference-properties')
  const search = band.getByRole('combobox')
  await expect(search).toBeFocused()
  await search.press('Enter')
  await expect(band).toBeHidden()
  const quote = page.locator('.tiptap blockquote')
  await expect(quote.locator('.inline-object[data-kind="crossReference"]')).toHaveCount(1)
  expect(
    await page.evaluate(() => {
      let result: string[] = []
      window.__spike!.editor.state.doc.descendants((node) => {
        if (node.type.name === 'quote')
          result = node.content.content.map((child) => child.type.name)
      })
      return result
    }),
  ).toEqual(['paragraph', 'quoteAttribution'])
  await expect(page.getByRole('textbox', { name: 'Corps du document', exact: true })).toBeFocused()
})

test('une cible supprimée pendant la saisie ne choisit pas silencieusement un autre élément', async ({
  page,
}) => {
  await page.evaluate(async () => {
    const { editor, provider } = window.__spike!
    editor.commands.setContent('<h1>Première cible</h1><h1>Autre cible</h1><p>Texte</p>')
    await provider.flush()
    editor.commands.setTextSelection(editor.state.doc.content.size - 1)
    editor.view.focus()
  })
  await page.locator('[data-command="insert.reference"]').click()
  const band = page.locator('#cross-reference-properties')
  await expect(band.getByRole('button', { name: 'Insérer', exact: true })).toBeEnabled()
  await page.evaluate(() => {
    const editor = window.__spike!.editor
    editor.commands.deleteRange({ from: 0, to: editor.state.doc.firstChild!.nodeSize })
  })
  await expect(band.getByRole('button', { name: 'Insérer', exact: true })).toBeDisabled()
  await expect(band).toContainText('Cible introuvable')
  await band.getByRole('combobox').press('Enter')
  await expect(band).toBeVisible()
  await expect(page.locator('.inline-object[data-kind="crossReference"]')).toHaveCount(0)
  await band.getByRole('combobox').press('Escape')
  expect(await page.evaluate(() => window.__spike!.provider.rejected)).toBeFalsy()
})
