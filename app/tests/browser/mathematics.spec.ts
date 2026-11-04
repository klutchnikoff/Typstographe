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
