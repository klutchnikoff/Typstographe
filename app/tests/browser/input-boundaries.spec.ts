import { expect, test } from '@playwright/test'

const lastItem = 'Un rendu stable facilite la relecture et la transmission du document.'
const nextParagraph = 'Le tableau suivant rassemble les éléments de la démonstration.'
const fixture = `<p>Avant la liste.</p><ul><li><p>${lastItem}</p></li></ul><p>${nextParagraph}</p><figure data-table><table><tbody><tr><td><p>Cellule</p></td></tr></tbody></table><figcaption data-table-caption>Légende</figcaption></figure><h1>Conclusion</h1><p>Dernier paragraphe.</p>`

test.beforeEach(async ({ page, request }) => {
  await request.post('/__spike/invoke', { data: { command: 'reset', peer: 'main', args: {} } })
  await page.goto('/?client=main')
  await page.waitForFunction(() => window.__spike?.ready)
  await page.evaluate(async (content) => {
    const { editor, provider } = window.__spike!
    editor.commands.setContent(content)
    await provider.flush()
    await provider.clearHistory()
  }, fixture)
})

test('native Backspace deletes the first character of prose and headings, including after widgets', async ({
  page,
}) => {
  const body = page.getByRole('textbox', { name: 'Corps du document', exact: true })
  for (const text of ['Avant la liste.', nextParagraph, 'Conclusion', 'Dernier paragraphe.']) {
    await page.evaluate((text) => {
      const { editor } = window.__spike!
      editor.view.focus()
      editor.state.doc.descendants((node, pos) => {
        if (node.isTextblock && node.textContent === text) editor.commands.setTextSelection(pos + 2)
      })
    }, text)
    await page.keyboard.press('Backspace')
    await expect(body).not.toContainText(text)
    await expect(body).toContainText(text.slice(1))
    await page.evaluate(async () => {
      await window.__spike!.provider.flush()
      if (window.__spike!.provider.rejected) throw new Error('The edit was rejected')
    })
    await page.keyboard.press('ControlOrMeta+z')
    await expect(body).toContainText(text)
    await expect
      .poll(() => page.evaluate(() => window.__spike!.editor.state.selection.$from.parentOffset))
      .toBe(1)
  }
})

for (const input of ['keyboard', 'native'] as const) {
  test(`${input} Enter creates an item before exiting the list, without phantom lines`, async ({
    page,
  }) => {
    const body = page.getByRole('textbox', { name: 'Corps du document', exact: true })
    await page.evaluate((text) => {
      const { editor } = window.__spike!
      editor.view.focus()
      editor.state.doc.descendants((node, pos) => {
        if (node.isTextblock && node.textContent === text)
          editor.commands.setTextSelection(pos + 1 + node.content.size)
      })
    }, lastItem)
    // Native editing services can edit the DOM before ProseMirror reads the input.
    // Exercise that path as well as the regular hardware-keyboard shortcut.
    if (input === 'native') await page.evaluate(() => document.execCommand('insertParagraph'))
    else await page.keyboard.press('Enter')
    await expect(body.locator('.widget-bulletList li')).toHaveCount(2)
    await expect(body.locator('.widget-bulletList li').last()).toBeEmpty()
    await expect
      .poll(() => page.evaluate(() => window.__spike!.editor.state.selection.$from.depth))
      .toBe(3)
    await page.keyboard.press('Enter')
    await expect(body.locator('.widget-bulletList li')).toHaveCount(1)
    await expect
      .poll(() => page.evaluate(() => window.__spike!.editor.state.selection.$from.depth))
      .toBe(1)
    const emptyLine = body.locator(':scope > p').nth(1)
    await expect(emptyLine).toBeEmpty()
    const confirmed = await page.evaluate(async () => {
      await window.__spike!.provider.flush()
      return window.__spike!.editor.getJSON()
    })
    for (let n = 0; n < 4; n++) await page.keyboard.press('Enter')
    await expect(body.locator(':scope > p')).toHaveCount(5)
    await expect(emptyLine.locator('br:not(.ProseMirror-trailingBreak)')).toHaveCount(0)
    await page.keyboard.press('ArrowRight')
    expect(await page.evaluate(() => window.__spike!.editor.getJSON())).toEqual(confirmed)
    await expect(body.locator(':scope > p')).toHaveCount(5)
    await expect(body).toContainText(nextParagraph)
  })
}
