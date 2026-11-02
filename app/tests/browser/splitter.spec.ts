import { expect, test, type Page } from '@playwright/test'

test.beforeEach(async ({ page, request }) => {
  await request.post('/__spike/invoke', { data: { command: 'reset', peer: 'main', args: {} } })
  await page.goto('/?client=main')
  await page.waitForFunction(() => window.__spike?.ready)
  await page.evaluate(() => {
    const editor = window.__spike!.editor
    editor.commands.setContent('<p>Un texte pour sélectionner normalement.</p><p></p>')
    editor.commands.setTextSelection(4)
    editor.view.focus()
  })
  // Pointer targets depend on font metrics, including the wrapping toolbar.
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
})

async function startDrag(page: Page) {
  const point = await page.evaluate(() => {
    const splitter = document.querySelector<HTMLElement>('.splitter')!
    splitter.addEventListener(
      'pointerdown',
      (e) => (splitter.dataset.pointer = String(e.pointerId)),
      { once: true },
    )
    const rect = splitter.getBoundingClientRect()
    const text = window.__spike!.editor.view.coordsAtPos(4)
    return { x: rect.left + rect.width / 2, y: (text.top + text.bottom) / 2 }
  })
  await page.mouse.move(point.x, point.y)
  await page.mouse.down()
  await expect(page.locator('html')).toHaveClass(/resizing-columns/)
  return point
}

async function selectText(page: Page) {
  // Raw mouse coordinates do not get locator actionability checks. Wait for
  // the text target to settle after the cancelled resize (toolbar reflow), and
  // let the real mouse gesture focus the editor rather than forcing its old caret.
  await page.getByRole('textbox', { name: 'Corps du document' }).locator('p').first().hover()
  const pointAt = (pos: number) =>
    page.evaluate((pos) => {
      const rect = window.__spike!.editor.view.coordsAtPos(pos)
      return { x: rect.left, y: (rect.top + rect.bottom) / 2 }
    }, pos)
  const start = await pointAt(2)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  // Observe the browser's native anchor before extending the drag. The editor
  // state is synchronized by selectionchange; it need not already reflect a
  // pointer gesture that is still in progress. Check that state after mouseup.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const selection = window.getSelection()
        const view = window.__spike!.editor.view
        if (!selection?.anchorNode || !view.dom.contains(selection.anchorNode)) return null
        return {
          anchor: view.posAtDOM(selection.anchorNode, selection.anchorOffset),
          collapsed: selection.isCollapsed,
        }
      }),
    )
    .toEqual({ anchor: 2, collapsed: true })
  // Focusing the editor may change its layout. Resolve the endpoint only after
  // the native anchor is established, rather than reusing pre-focus coordinates.
  const end = await pointAt(9)
  await page.mouse.move(end.x, end.y, { steps: 5 })
  await page.mouse.up()
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe('n texte')
  await expect
    .poll(() =>
      page.evaluate(() => {
        const { from, to } = window.__spike!.editor.state.selection
        return { from, to }
      }),
    )
    .toEqual({ from: 2, to: 9 })
}

test('redimensionner les colonnes ne sélectionne pas le texte et conserve le curseur', async ({
  page,
}) => {
  const before = await page.evaluate(() => window.__spike!.editor.getJSON())
  const splitter = page.getByRole('separator', { name: 'Largeur des colonnes' })
  const initialWidth = Number(await splitter.getAttribute('aria-valuenow'))
  const point = await startDrag(page)
  for (const distance of [50, 100, 160]) {
    await page.mouse.move(point.x - distance, point.y, { steps: 5 })
    expect(await page.evaluate(() => window.getSelection()?.isCollapsed ?? true)).toBe(true)
    expect(
      await page.evaluate(() => {
        const selection = window.__spike!.editor.state.selection
        return { from: selection.from, to: selection.to }
      }),
    ).toEqual({ from: 4, to: 4 })
  }
  await page.mouse.up()
  await expect(page.locator('html')).not.toHaveClass(/resizing-columns/)
  const width = Number(await splitter.getAttribute('aria-valuenow'))
  expect(width).toBeLessThan(initialWidth)
  expect(await page.evaluate(() => window.__spike!.editor.getJSON())).toEqual(before)
  await splitter.press('ArrowRight')
  await expect(splitter).toHaveAttribute('aria-valuenow', String(width + 2))
  await selectText(page)
})

for (const interruption of ['pointercancel', 'lostpointercapture', 'blur'] as const) {
  // Edited-area checks run on Chromium only; keep this WebKit regression in
  // the two-engine smoke suite without requesting all graphical recipes.
  test(
    `une interruption ${interruption} rétablit la sélection normale`,
    {
      tag: interruption === 'lostpointercapture' ? ['@smoke'] : [],
    },
    async ({ page }) => {
      const splitter = page.getByRole('separator', { name: 'Largeur des colonnes' })
      const initialWidth = await splitter.getAttribute('aria-valuenow')
      const point = await startDrag(page)
      await page.mouse.move(point.x - 100, point.y, { steps: 5 })
      await expect(splitter).not.toHaveAttribute('aria-valuenow', initialWidth!)
      await page.evaluate((interruption) => {
        const splitter = document.querySelector<HTMLElement>('.splitter')!
        const pointerId = Number(splitter.dataset.pointer)
        if (interruption === 'blur') window.dispatchEvent(new Event('blur'))
        else if (interruption === 'lostpointercapture') splitter.releasePointerCapture(pointerId)
        else splitter.dispatchEvent(new PointerEvent('pointercancel', { pointerId }))
      }, interruption)
      await page.mouse.move(point.x - 110, point.y)
      // Cancellation must restore the width before mouseup, which would otherwise
      // hide a missed interruption by finishing the resize as an ordinary commit.
      await expect(page.locator('html')).not.toHaveClass(/resizing-columns/)
      await expect(splitter).toHaveAttribute('aria-valuenow', initialWidth!)
      expect(
        await page.evaluate(() => {
          const { from, to } = window.__spike!.editor.state.selection
          return { from, to }
        }),
      ).toEqual({ from: 4, to: 4 })
      await page.mouse.up()
      await selectText(page)
      await startDrag(page)
      await page.mouse.up()
      await expect(page.locator('html')).not.toHaveClass(/resizing-columns/)
    },
  )
}
