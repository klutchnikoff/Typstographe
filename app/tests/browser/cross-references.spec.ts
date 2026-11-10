import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page, request }) => {
  await request.post('/__spike/invoke', { data: { command: 'reset', peer: 'main', args: {} } })
  await page.goto('/?client=main')
  await page.waitForFunction(() => window.__spike?.ready)
})

for (const scenario of ['clean', 'dirty', 'literal'] as const) {
  test(`raccourci de renvoi et état d’enregistrement (${scenario})`, async ({ page }) => {
    const body = page.getByRole('textbox', { name: 'Corps du document', exact: true })
    const fileMenu = page.getByRole('button', { name: 'Fichier', exact: true })
    await page.evaluate(async () => {
      const { editor, provider } = window.__spike!
      editor.commands.setContent('<p>Texte enregistré</p>')
      await provider.flush()
    })
    await fileMenu.click()
    await page.locator('[data-command="document.save"]').click()
    await expect(page.locator('#message')).toContainText('Session enregistrée')
    await page.evaluate(() => {
      const { editor } = window.__spike!
      editor.commands.setTextSelection(editor.state.doc.firstChild!.nodeSize - 1)
      editor.view.focus()
    })
    if (scenario === 'dirty') await page.keyboard.type(' modifié')
    await page.keyboard.type('&&')
    const picker = page.locator('#cross-reference-properties')
    const search = picker.getByRole('combobox')
    await expect(search).toBeFocused()
    if (scenario === 'clean') await search.fill('recherche à abandonner')
    await search.press(scenario === 'literal' ? 'Enter' : 'Escape')
    await expect(picker).toBeHidden()
    await expect(body).toBeFocused()
    await expect(body.locator('p').first()).toHaveText(
      scenario === 'dirty'
        ? 'Texte enregistré modifié'
        : scenario === 'literal'
          ? 'Texte enregistré&&'
          : 'Texte enregistré',
    )

    const closing =
      scenario === 'clean'
        ? page.waitForRequest(
            (request) =>
              request.url().endsWith('/__spike/invoke') &&
              request.postDataJSON()?.command === 'close_document',
          )
        : undefined
    await fileMenu.click()
    await page.locator('[data-command="document.close"]').click()
    if (closing) await closing
    else
      await expect(
        page.getByRole('dialog', { name: 'Enregistrer les modifications ?' }),
      ).toBeVisible()
  })
}

test('&& : Échap annule, Entrée écrit les signes ou valide après navigation', async ({ page }) => {
  const body = page.getByRole('textbox', { name: 'Corps du document', exact: true })
  await page.evaluate(async () => {
    const { editor, provider } = window.__spike!
    editor.commands.setContent('<h1>Méthode</h1><h1>Résultats</h1><p>Voir </p>')
    let caret = 0
    editor.state.doc.forEach((node, pos) => {
      if (node.textContent.trim() === 'Voir') caret = pos + node.nodeSize - 1
    })
    editor.commands.setTextSelection(caret)
    editor.view.focus()
    await provider.flush()
  })
  const line = body.locator('p').first()
  const original = await line.textContent()
  const picker = page.locator('#cross-reference-properties')
  const search = picker.getByRole('combobox')
  await page.keyboard.type('&')
  await expect(line).toHaveText(`${original}&`)
  await expect(picker).toBeHidden()
  await page.evaluate(() => window.__spike!.provider.flush())
  await page.keyboard.type('&')
  await expect(search).toBeFocused()
  await search.press('Escape')
  await expect(picker).toBeHidden()
  await expect(line).toHaveText(original!)
  await expect(body).toBeFocused()

  await page.keyboard.type('&&')
  await expect(search).toBeFocused()
  await expect(picker.getByRole('option')).toHaveCount(2)
  await search.press('Enter')
  await expect(picker).toBeHidden()
  await expect(line).toHaveText(`${original}&&`)
  await expect(body).toBeFocused()
  await body.press('ControlOrMeta+z')
  await expect(line).toHaveText(original!)
  await expect(body).toBeEditable()
  await expect(body).toBeFocused()

  await page.keyboard.type('&&')
  await expect(search).toBeFocused()
  await search.press('ArrowDown')
  await search.press('Enter')
  const badge = line.locator('.inline-object[data-kind="crossReference"] .inline-object-label')
  await expect(badge).toHaveText('Résultats')
  await expect(picker).toBeHidden()
  await body.press('ControlOrMeta+z')
  await expect(line).toHaveText(original!)
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
  await expect(band.getByRole('button', { name: 'Appliquer', exact: true })).toBeHidden()
  await search.fill('methde')
  await expect(band.getByRole('option', { selected: true })).toContainText('Méthode')
  await search.clear()
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
  await band.getByRole('button', { name: 'Appliquer', exact: true }).click()
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
  await expect(search).toBeFocused()
  await band.getByRole('checkbox', { name: 'Libellé complet', exact: true }).uncheck()
  await band.getByRole('button', { name: 'Appliquer', exact: true }).click()
  await expect(band).toBeHidden()
  await expect(badge).toHaveText(/^page\s+1$/)
  await badge.click()
  await band.getByRole('checkbox', { name: 'Page', exact: true }).uncheck()
  await expect(band.getByRole('button', { name: 'Appliquer', exact: true })).toBeDisabled()
  await search.press('Escape')
  await expect(band).toBeHidden()
  await expect(badge).toHaveText(/^page\s+1$/)
  const before = await page.evaluate(() => JSON.stringify(window.__spike!.editor.getJSON()))
  await page.evaluate(() => {
    const e = window.__spike!.editor
    e.view.dispatch(e.state.tr.delete(0, e.state.doc.firstChild!.nodeSize))
  })
  expect(await page.evaluate(() => JSON.stringify(window.__spike!.editor.getJSON()))).toBe(before)
  expect(await page.evaluate(() => window.__spike!.provider.rejected)).toBeFalsy()
  await page.evaluate(() => {
    const { editor } = window.__spike!
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'crossReference') editor.commands.setTextSelection(pos)
    })
    editor.view.focus()
  })
  await page.keyboard.press('Delete')
  await expect(badge.locator('..')).toHaveClass(/ProseMirror-selectednode/)
  await page.keyboard.press('Delete')
  await expect(badge).toHaveCount(0)
  await expect(page.locator('.tiptap h1').first()).toHaveText('Méthode')
  await page.keyboard.press('ControlOrMeta+z')
  await expect(badge).toHaveText(/^page\s+1$/)
  await expect
    .poll(() => page.evaluate(() => JSON.stringify(window.__spike!.editor.getJSON())))
    .toBe(before)
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
  const quote = page.locator('.tiptap blockquote')
  const line = quote.locator('p').first()
  const before = await line.boundingBox()
  await page.locator('[data-command="insert.reference"]').click()
  const band = page.locator('#cross-reference-properties')
  const search = band.getByRole('combobox')
  await expect(search).toBeFocused()
  expect(await line.boundingBox()).toEqual(before)
  await band.getByRole('option', { name: /Cadre/ }).click()
  await expect(band).toBeHidden()
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
  await expect(band.getByRole('option', { selected: true })).toContainText('Première cible')
  await page.evaluate(() => {
    const editor = window.__spike!.editor
    editor.commands.deleteRange({ from: 0, to: editor.state.doc.firstChild!.nodeSize })
  })
  await expect(band.getByRole('option', { selected: true })).toHaveCount(0)
  await expect(band).toContainText('Cible introuvable')
  await band.getByRole('combobox').press('Enter')
  await expect(band).toBeVisible()
  await expect(page.locator('.inline-object[data-kind="crossReference"]')).toHaveCount(0)
  await band.getByRole('combobox').press('Escape')
  expect(await page.evaluate(() => window.__spike!.provider.rejected)).toBeFalsy()
})
