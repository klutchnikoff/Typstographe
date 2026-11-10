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
  await expect(settings.getByRole('textbox', { name: 'Description accessible' })).toBeFocused()
  await expect(settings.getByRole('textbox', { name: 'Label facultatif' })).toHaveCount(0)
  await page.keyboard.press('Escape')
  const alias = widget.getByRole('textbox', { name: 'Label facultatif' })
  await alias.fill('fraction')
  await alias.press('Enter')
  await expect(page.locator('.tiptap')).toBeFocused()
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

test('toolbar insertion enters Typst inline source and only exposes editable mathematical settings', async ({
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
  await expect(properties.getByRole('combobox', { name: 'Langage mathématique' })).toHaveCount(0)
  await properties.getByRole('textbox', { name: 'Description accessible' }).fill('x au carré')
  await properties.getByRole('button', { name: 'Valider', exact: true }).click()
  await expect(properties).toBeHidden()
  await expect(page.locator('.math-source-inline')).toHaveAttribute('data-math-source', 'typst')
  await page.keyboard.press('Tab')
  await page.keyboard.type(' après')
  await page.evaluate(() => window.__spike!.provider.flush())
  expect(await page.evaluate(() => window.__spike!.provider.rejected)).toBeFalsy()
  await expect(source).toHaveText('x^2')
})

test('a writing line between equation widgets shows ¶ and supports deletion, undo and continued typing', async ({
  page,
}) => {
  await page.evaluate(async () => {
    const { editor, provider } = window.__spike!
    editor.commands.setContent({
      type: 'doc',
      content: [
        {
          type: 'mathBlock',
          attrs: { anchor: 'first-equation' },
          content: [{ type: 'text', text: 'x^2' }],
        },
        {
          type: 'mathBlock',
          attrs: { anchor: 'second-equation' },
          content: [{ type: 'text', text: 'y^2' }],
        },
        { type: 'paragraph' },
      ],
    })
    editor.commands.setTextSelection(editor.state.doc.firstChild!.nodeSize - 1)
    editor.view.focus()
    await provider.flush()
    await provider.clearHistory()
  })
  const body = page.getByRole('textbox', { name: 'Corps du document', exact: true })
  const widgets = body.locator('[data-editor-widget="mathBlock"]')
  await page.keyboard.press('Tab')
  const marker = body.locator(':scope > p > .paragraph-marker')
  await expect(marker).toHaveText('¶')
  await marker.click()
  const caret = await page.evaluate(() => {
    const { editor } = window.__spike!
    const selection = window.getSelection()!
    const range = selection.getRangeAt(0).cloneRange()
    const paragraph = editor.view.dom.querySelector('p')!
    const marker = paragraph.querySelector('.paragraph-marker')!
    return {
      inParagraph: paragraph.contains(selection.anchorNode),
      beforeMarker: range.comparePoint(marker, 0) >= 0,
      offset: editor.state.selection.$from.parentOffset,
    }
  })
  expect(caret).toEqual({ inParagraph: true, beforeMarker: true, offset: 0 })
  const withLine = await page.evaluate(() => window.__spike!.editor.getJSON())
  await page.keyboard.press('Enter')
  expect(await page.evaluate(() => window.__spike!.editor.getJSON())).toEqual(withLine)
  await page.keyboard.press('Backspace')
  await expect(marker).toHaveCount(0)
  await expect(body.locator(':scope > p')).toHaveCount(1)
  await expect(widgets.nth(0).locator('.math-source')).toHaveText('x^2')
  await expect(widgets.nth(1).locator('.math-source')).toHaveText('y^2')
  await page.evaluate(() => window.__spike!.provider.flush())
  await page.keyboard.press('ControlOrMeta+z')
  await expect(marker).toHaveText('¶')
  await page.keyboard.press('Delete')
  await expect(marker).toHaveCount(0)
  await expect(body.locator(':scope > p')).toHaveCount(1)
  await page.evaluate(() => window.__spike!.provider.flush())
  await page.keyboard.press('ControlOrMeta+z')
  await expect(marker).toHaveText('¶')
  await page.keyboard.type('Entre les deux équations.')
  await expect(marker).toHaveCount(0)
  await expect(body.locator(':scope > p').first()).toHaveText('Entre les deux équations.')
  await page.evaluate(() => window.__spike!.provider.flush())
  expect(await page.evaluate(() => window.__spike!.provider.rejected)).toBeFalsy()
  await expect(widgets.nth(0).locator('.math-source')).toHaveText('x^2')
  await expect(widgets.nth(1).locator('.math-source')).toHaveText('y^2')
  // The final writing slot remains available even after Backspace.
  await page.evaluate(() => {
    const { editor } = window.__spike!
    editor.commands.setTextSelection(editor.state.doc.content.size - 1)
  })
  await page.keyboard.press('Backspace')
  await expect(body.locator(':scope > p')).toHaveCount(2)
})

test('typing after an equation reference never swaps its label or changes its width between previews', async ({
  page,
}) => {
  await page.evaluate(async () => {
    const { editor, provider } = window.__spike!
    editor.commands.setContent({
      type: 'doc',
      content: [
        {
          type: 'mathBlock',
          attrs: { language: 'typst', anchor: 'equation-stability', alias: 'stability', alt: '' },
          content: [{ type: 'text', text: 'x^2' }],
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'crossReference',
              attrs: { target: 'equation-stability', include_label: true, include_page: false },
            },
            { type: 'text', text: ' Texte.' },
          ],
        },
      ],
    })
    await provider.flush()
  })
  const badge = page.locator('.inline-object[data-kind="crossReference"] .inline-object-label')
  await expect(badge).toHaveText('(1)')
  await page.evaluate(() => {
    const e = window.__spike!.editor
    e.state.doc.descendants((node, pos) => {
      if (node.type.name === 'crossReference') e.commands.setTextSelection(pos + node.nodeSize)
    })
    e.view.focus()
    const samples: { text: string; width: number }[] = []
    const record = () => {
      const label = e.view.dom.querySelector<HTMLElement>(
        '.inline-object[data-kind="crossReference"] .inline-object-label',
      )
      if (label)
        samples.push({ text: label.textContent || '', width: label.getBoundingClientRect().width })
    }
    const observer = new MutationObserver(record)
    observer.observe(e.view.dom, { subtree: true, childList: true, characterData: true })
    record()
    ;(window as any).__referenceBadgeSamples = samples
    ;(window as any).__stopReferenceBadgeObserver = () => observer.disconnect()
  })
  await page.keyboard.type(' Une rédaction continue', { delay: 25 })
  await page.evaluate(() => window.__spike!.provider.flush())
  await expect(page.locator('#render-status')).toBeHidden()
  const samples = await page.evaluate(() => {
    ;(window as any).__stopReferenceBadgeObserver()
    return (window as any).__referenceBadgeSamples as { text: string; width: number }[]
  })
  expect(samples.length).toBeGreaterThan(2)
  expect([...new Set(samples.map((s) => s.text))]).toEqual(['(1)'])
  expect(
    Math.max(...samples.map((s) => s.width)) - Math.min(...samples.map((s) => s.width)),
  ).toBeLessThan(0.1)
  expect(await page.evaluate(() => window.__spike!.provider.rejected)).toBeFalsy()
  // Keeping the last confirmed value must not freeze a legitimately new number.
  await page.evaluate(async () => {
    const { editor, provider } = window.__spike!
    editor.commands.insertContentAt(0, {
      type: 'mathBlock',
      attrs: { language: 'typst', alias: 'earlier', alt: '' },
      content: [{ type: 'text', text: 'y^2' }],
    })
    await provider.flush()
  })
  await expect(badge).toHaveText('(2)')
  // Match the preview policy when a later equation contains incomplete source.
  await page.evaluate(async () => {
    const { editor, provider } = window.__spike!,
      node = editor.state.doc.firstChild!
    editor.view.dispatch(editor.state.tr.insertText('frac(', 1, 1 + node.content.size))
    await provider.flush()
  })
  await expect(page.locator('#render-status')).toContainText('Contenu à corriger')
  await expect(badge).toHaveText('(2)')
})

test('the only equation label is visible in the header and the accessible description remains editable', async ({
  page,
}) => {
  await page.keyboard.type('$$')
  await page.keyboard.press('Enter')
  await page.keyboard.type('\\frac{a}{b}')
  await page.evaluate(() => window.__spike!.provider.flush())
  const widget = page.locator('[data-editor-widget="mathBlock"]')
  const label = widget.locator('.widget-bar').getByRole('textbox', { name: 'Label facultatif' })
  await expect(widget.locator('.widget-bar label')).toHaveText('Label facultatif')
  await expect(widget.locator('.widget-bar label')).toBeVisible()
  await expect(label.locator('..').locator('span')).toHaveText('eq:')
  await label.fill('fraction')
  await label.press('Enter')
  await expect
    .poll(() => page.evaluate(() => window.__spike!.editor.state.doc.firstChild!.attrs.alias))
    .toBe('fraction')
  await expect.poll(() => page.evaluate(() => window.__spike!.editor.view.hasFocus())).toBe(true)
  expect(
    await page.evaluate(() => window.__spike!.editor.state.selection.$from.parent.type.name),
  ).toBe('mathBlock')
  await widget.getByRole('button', { name: 'Paramètres · Équation', exact: true }).click()
  const panel = page.locator('#properties')
  await expect(panel.getByRole('combobox', { name: 'Langage mathématique' })).toHaveCount(0)
  await expect(panel.getByRole('textbox', { name: 'Label facultatif' })).toHaveCount(0)
  await panel.getByRole('textbox', { name: 'Description accessible' }).fill('a divisé par b')
  await label.fill('header-update')
  await label.press('Enter')
  await expect(panel.getByRole('textbox', { name: 'Description accessible' })).toHaveValue(
    'a divisé par b',
  )
  await panel.getByRole('button', { name: 'Valider', exact: true }).click()
  await expect(panel).toBeHidden()
  await expect(label).toHaveValue('header-update')
  expect(await page.evaluate(() => window.__spike!.editor.state.doc.firstChild!.attrs.alt)).toBe(
    'a divisé par b',
  )
  await expect(widget).toHaveAttribute('data-math-source', 'latex')
  await expect(widget.locator('.math-source')).toHaveText('\\frac{a}{b}')
  await label.fill('cancelled')
  await label.press('Escape')
  await expect(label).toHaveValue('header-update')
  expect(await page.evaluate(() => window.__spike!.provider.rejected)).toBeFalsy()
})

test('a duplicate header label remains an editable draft without rejecting the document', async ({
  page,
}) => {
  await page.evaluate(async () => {
    const { editor, provider } = window.__spike!
    editor.commands.setContent({
      type: 'doc',
      content: [
        {
          type: 'mathBlock',
          attrs: { language: 'typst', anchor: 'equation-one', alias: 'one' },
          content: [{ type: 'text', text: 'x' }],
        },
        {
          type: 'mathBlock',
          attrs: { language: 'latex', anchor: 'equation-two', alias: 'two' },
          content: [{ type: 'text', text: 'y' }],
        },
        { type: 'paragraph' },
      ],
    })
    await provider.flush()
  })
  const label = page.locator('[data-editor-widget="mathBlock"]').nth(1).locator('.widget-bar input')
  await label.fill('one')
  await label.press('Enter')
  await expect(label).toHaveAttribute('aria-invalid', 'true')
  await expect(label).toHaveValue('one')
  expect(await page.evaluate(() => window.__spike!.editor.state.doc.child(1).attrs.alias)).toBe(
    'two',
  )
  expect(await page.evaluate(() => window.__spike!.provider.rejected)).toBeFalsy()
  await label.press('Escape')
  await expect(label).toHaveValue('two')
})

test('Escape cancels a pending header-label edit before native publication', async ({ page }) => {
  await page.keyboard.type('$')
  await page.keyboard.press('Enter')
  await page.keyboard.type('x')
  await page.evaluate(() => window.__spike!.provider.flush())
  let release!: () => void,
    waiting = false
  await page.route('**/__spike/invoke', async (route) => {
    if (route.request().postDataJSON().command === 'prepare_structured_commands') {
      waiting = true
      await new Promise<void>((resolve) => {
        release = resolve
      })
    }
    await route.continue()
  })
  const label = page.locator('[data-editor-widget="mathBlock"] .widget-bar input')
  await label.fill('cancelled')
  await label.press('Enter')
  await expect.poll(() => waiting).toBe(true)
  await label.press('Escape')
  const reply = page.waitForResponse(
    (response) => response.request().postDataJSON()?.command === 'prepare_structured_commands',
  )
  release()
  await reply
  await page.evaluate(() => Promise.resolve())
  expect(await page.evaluate(() => window.__spike!.editor.state.doc.firstChild!.attrs.alias)).toBe(
    '',
  )
  await expect(label).toHaveValue('')
  await expect(label).not.toHaveAttribute('aria-invalid', 'true')
  expect(await page.evaluate(() => window.__spike!.provider.rejected)).toBeFalsy()
})
