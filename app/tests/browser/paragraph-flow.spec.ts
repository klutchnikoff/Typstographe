import { expect, test } from '@playwright/test'

const first = 'Écrire un article suppose de donner une forme lisible à une démarche.'
const second = 'Ce document sert d’exemple de composition.'
test.beforeEach(async ({ page, request }) => {
  await request.post('/__spike/invoke', { data: { command: 'reset', peer: 'main', args: {} } })
  await page.goto('/?client=main')
  await page.waitForFunction(() => window.__spike?.ready)
  await page.evaluate(
    async ({ first, second }) => {
      const { editor, provider } = window.__spike!
      editor.commands.setContent(`<p>${first}</p><p>${second}</p>`)
      editor.view.focus()
      editor.commands.setTextSelection(first.length + 1)
      await provider.flush()
      await provider.clearHistory()
    },
    { first, second },
  )
})

test('Enter at the end of a paragraph moves directly to ¶ without adding a line', async ({
  page,
}) => {
  const body = page.getByRole('textbox', { name: 'Corps du document', exact: true })
  const original = await page.evaluate(() => window.__spike!.editor.getJSON())
  await page.keyboard.press('Enter')
  const marker = body.locator('.paragraph-marker[data-active]')
  await expect(marker).toBeVisible()
  await expect(body.locator('br[data-soft-break]')).toHaveCount(0)
  expect(await page.evaluate(() => window.__spike!.editor.getJSON())).toEqual(original)
  await page.keyboard.press('Enter')
  await expect(marker).toBeVisible()
  expect(await page.evaluate(() => window.__spike!.editor.getJSON())).toEqual(original)
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('Shift+Enter')
  await expect(body.locator('p').first().locator('br:not(.ProseMirror-trailingBreak)')).toHaveCount(
    1,
  )
})

test('the separator supports vertical and pointer navigation, no-op Enter and two-stage deletion with undo', async ({
  page,
}) => {
  const body = page.getByRole('textbox', { name: 'Corps du document', exact: true })
  const original = await page.evaluate(() => window.__spike!.editor.getJSON())
  await page.keyboard.press('ArrowDown')
  await expect(body.locator('.paragraph-marker[data-active]')).toHaveCount(1)
  await page.keyboard.press('Enter')
  await page.keyboard.press('ArrowDown')
  await expect
    .poll(() => page.evaluate(() => window.__spike!.editor.state.selection.$from.parentOffset))
    .toBe(0)
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  expect(await page.evaluate(() => window.__spike!.editor.getJSON())).toEqual(original)
  await expect(body.locator('br:not(.ProseMirror-trailingBreak)')).toHaveCount(0)
  const marker = body.locator('.paragraph-marker').first()
  await marker.click({ position: { x: 2, y: 5 } })
  await expect(body.locator('.paragraph-marker[data-active]')).toHaveCount(1)
  await expect(body).toBeFocused()
  await page.keyboard.press('Backspace')
  await expect(body.locator('p').first()).toHaveText(first + second)
  await expect(body.locator('br[data-soft-break]')).toHaveCount(1)
  await page.evaluate(async () => {
    await window.__spike!.provider.flush()
  })
  await page.keyboard.press('ControlOrMeta+z')
  await expect(body.locator('p').nth(1)).toHaveText(second)
  await expect(body.locator('.paragraph-marker[data-active]')).toHaveCount(1)
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect(body.locator('br[data-soft-break]')).toHaveCount(1)
  await page.keyboard.press('Backspace')
  await expect(body.locator('br[data-soft-break]')).toHaveCount(0)
  await expect(body.locator('p').first()).toHaveText(first + second)
})

test('moving to the separator with Enter leaves undo for the previous edit', async ({ page }) => {
  const body = page.getByRole('textbox', { name: 'Corps du document', exact: true })
  await page.evaluate(
    ({ first }) => {
      const { editor } = window.__spike!
      editor.commands.setTextSelection(first.length + 3)
    },
    { first },
  )
  await page.keyboard.type('Ajout ')
  await page.evaluate(async () => {
    const { editor, provider } = window.__spike!
    await provider.flush()
    provider.stopCapturing()
    editor.commands.setTextSelection(editor.state.doc.firstChild!.nodeSize - 1)
  })
  await page.keyboard.press('Enter')
  await expect(body.locator('.paragraph-marker[data-active]')).toBeVisible()
  await page.evaluate(async () => {
    await window.__spike!.provider.flush()
    window.__spike!.provider.stopCapturing()
  })
  await page.keyboard.press('ArrowDown')
  await page.evaluate(async () => {
    await window.__spike!.provider.flush()
  })
  await page.keyboard.press('ControlOrMeta+z')
  await expect(body.locator('p').nth(1)).toHaveText(second)
  await expect(body.locator('br:not(.ProseMirror-trailingBreak)')).toHaveCount(0)
})

test('a remote edit keeps the local separator caret attached to the same paragraph', async ({
  page,
  context,
}) => {
  await page.keyboard.press('ArrowRight')
  const body = page.getByRole('textbox', { name: 'Corps du document', exact: true })
  await expect(body.locator('.paragraph-marker[data-active]')).toHaveCount(1)
  const peer = await context.newPage()
  await peer.goto('/?client=paragraph-peer')
  await peer.waitForFunction(() => window.__spike?.ready)
  await peer.evaluate(async () => {
    const { editor, provider } = window.__spike!
    editor.commands.setTextSelection(1)
    editor.commands.insertContent('É😀 ')
    await provider.flush()
  })
  // Presence labels are decorations, not document text.
  await expect
    .poll(() => page.evaluate(() => window.__spike!.editor.state.doc.firstChild!.textContent))
    .toBe('É😀 ' + first)
  await expect(body.locator('.paragraph-marker[data-active]')).toHaveCount(1)
  await page.bringToFront()
  await page.keyboard.press('ArrowRight')
  await expect
    .poll(() =>
      page.evaluate(() => window.__spike!.editor.state.selection.$from.parent.textContent),
    )
    .toBe(second)
  await peer.close()
})
