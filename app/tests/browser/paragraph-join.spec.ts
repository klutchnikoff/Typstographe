import { expect, test } from '@playwright/test'
import { confirmNewDocument } from './document-lifecycle'

test.beforeEach(async ({ request }) => {
  await request.post('/__spike/invoke', { data: { command: 'reset', peer: 'main', args: {} } })
})
for (const key of ['Backspace', 'Delete']) {
  test(`la fusion ${key} restaure les blocs et le curseur lors d’annuler/rétablir`, async ({
    page,
    context,
  }) => {
    await page.goto('/?client=main')
    await page.waitForFunction(() => window.__spike?.ready)
    const body = page.getByRole('textbox', { name: 'Corps du document', exact: true })
    await page.evaluate(async () => {
      const { editor, provider } = window.__spike!
      editor.commands.setContent('<p>Avant😀</p><p>Après</p>')
      await provider.flush()
      await provider.clearHistory()
    })
    const peer = await context.newPage()
    await peer.goto('/?client=join-peer')
    await peer.waitForFunction(() => window.__spike?.ready)
    await body.focus()
    const original = key === 'Backspace' ? 10 : 8
    const seam = key === 'Backspace' ? 9 : 8
    await page.evaluate(
      (pos) => window.__spike!.editor.commands.setTextSelection(pos),
      key === 'Backspace' ? 10 : original,
    )
    await page.keyboard.press(key)
    await expect
      .poll(() => page.evaluate(() => window.__spike!.editor.state.doc.textContent))
      .toBe('Avant😀Après')
    await expect
      .poll(() => page.evaluate(() => window.__spike!.editor.state.selection.from))
      .toBe(seam)
    await page.evaluate(async () => {
      await window.__spike!.provider.flush()
    })
    // Collaborator caret labels are UI decorations, not authored text.
    await expect
      .poll(() => peer.evaluate(() => window.__spike!.editor.state.doc.textContent))
      .toBe('Avant😀Après')
    await page.keyboard.press('ControlOrMeta+z')
    await expect(body.locator('p')).toHaveCount(3)
    await expect(body.locator('p').nth(1)).toHaveText('Après')
    await expect
      .poll(() => page.evaluate(() => window.__spike!.editor.state.selection.from))
      .toBe(original)
    await expect(body).toBeFocused()
    await page.keyboard.press('ControlOrMeta+Shift+z')
    await expect(body.locator('p')).toHaveCount(2)
    await expect(body.locator('br[data-soft-break]')).toHaveCount(1)
    await expect
      .poll(() => page.evaluate(() => window.__spike!.editor.state.selection.from))
      .toBe(seam)
    await page.keyboard.press(key)
    await expect(body.locator('br[data-soft-break]')).toHaveCount(0)
    await expect
      .poll(() => page.evaluate(() => window.__spike!.editor.state.selection.from))
      .toBe(8)
    await expect
      .poll(() => page.evaluate(() => window.__spike!.editor.state.doc.firstChild!.textContent))
      .toBe('Avant😀Après')
    await peer.close()
  })
}

test('la même fusion et son historique restent dans le résumé riche actif', async ({ page }) => {
  await page.goto('/?client=main')
  await page.waitForFunction(() => window.__spike?.ready)
  await page.getByRole('button', { name: 'Fichier', exact: true }).click()
  await page.locator('[data-command="document.new"]').click()
  await page.locator('dialog [data-type="article"]').click()
  await confirmNewDocument(page)
  await page.locator('#metadata-tab-abstracts').click()
  await page.locator('[data-section=localizations] [data-record-open]').first().click()
  const abstract = page.getByRole('textbox', { name: 'Résumé', exact: true })
  await abstract.fill('Avant')
  await abstract.press('End')
  await abstract.press('Enter')
  await abstract.press('Enter')
  await page.keyboard.type('Après')
  await expect(abstract.locator('p')).toHaveCount(2)
  // Establish a capture boundary in this private draft, independent of native history.
  await page.getByLabel('Mots-clés', { exact: true }).focus()
  await abstract.focus()
  // Establish the same exact structural boundary as the body tests above;
  // native Home/End and select-all endpoints differ between browser engines.
  await abstract.evaluate((node) =>
    (
      node as HTMLElement & { editor: import('@tiptap/core').Editor }
    ).editor.commands.setTextSelection(8),
  )
  await abstract.press('Backspace')
  await expect(abstract.locator('p')).toHaveCount(1)
  await expect(abstract).toHaveText('AvantAprès')
  await expect(abstract.locator('br[data-soft-break]')).toHaveCount(1)
  await abstract.press('ControlOrMeta+z')
  await expect(abstract.locator('p')).toHaveCount(2)
  await expect(abstract).toBeFocused()
  await expect
    .poll(() =>
      abstract.evaluate((node) =>
        (
          node as HTMLElement & { editor: import('@tiptap/core').Editor }
        ).editor.state.selection.toJSON(),
      ),
    )
    .toEqual({ type: 'text', anchor: 8, head: 8 })
  await abstract.press('ControlOrMeta+Shift+z')
  await expect(abstract.locator('p')).toHaveCount(1)
  await expect(abstract).toHaveText('AvantAprès')
  await expect(abstract.locator('br[data-soft-break]')).toHaveCount(1)
  await expect(abstract).toBeFocused()
})
