import { test, expect } from '@playwright/test'
import { copyFileSync, readFileSync, mkdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'
import { anchorKinds } from '../../src/anchor-identity'

test('paragraph input uses the actual archived Yjs state, not a reconstructed document', async ({
  page,
  request,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await request.post('/__spike/invoke', { data: { command: 'reset', peer: 'main', args: {} } })
  await page.goto('/?client=main&welcome=1')
  await page.waitForFunction(() => window.__spike?.ready)
  const initial = await page.evaluate(() => ({
    root: window.__spike!.provider.sessionPath,
    generation: window.__spike!.provider.generation,
    revision: window.__spike!.provider.revision,
  }))
  const file = join(initial.root, 'input.typsto')
  mkdirSync(initial.root, { recursive: true })
  copyFileSync(resolve('../examples/article-working.typsto'), file)
  const hash = () => createHash('sha256').update(readFileSync(file)).digest('hex')
  const originalHash = hash()
  const reload = page.waitForEvent('domcontentloaded')
  const opened = await request.post('/__spike/invoke', {
    data: { command: 'open_file', peer: 'main', args: { path: file, revision: initial.revision } },
  })
  expect((await opened.json()).error).toBeUndefined()
  await reload
  await page.waitForFunction(
    () => window.__spike?.ready || document.getElementById('message')?.classList.contains('error'),
  )
  const startup = await page.locator('#message').evaluate((element) => ({
    error: element.classList.contains('error'),
    message: element.textContent || '',
  }))
  expect(startup.error, startup.message).toBe(false)
  expect(await page.evaluate(() => window.__spike!.provider.generation)).not.toBe(
    initial.generation,
  )
  const original = await page.evaluate(async (anchorKinds) => {
    const { editor, provider } = window.__spike!
    await provider.flush()
    await provider.clearHistory()
    let index = -1,
      pos = -1
    editor.state.doc.forEach((node, at, n) => {
      if (index < 0 && node.type.name === 'paragraph' && node.content.size) {
        index = n
        pos = at
      }
    })
    const first = editor.state.doc.child(index)
    const missingAnchors: string[] = []
    editor.state.doc.descendants((node) => {
      if (anchorKinds.includes(node.type.name) && !node.attrs.anchor)
        missingAnchors.push(node.type.name)
    })
    editor.view.focus()
    editor.commands.setTextSelection(pos + first.nodeSize - 1)
    return {
      index,
      pos,
      boundary: pos + first.nodeSize,
      first: first.textContent,
      second: editor.state.doc.child(index + 1).textContent,
      document: editor.getJSON(),
      missingAnchors,
    }
  }, anchorKinds)
  expect(original.missingAnchors).toEqual([])
  const body = page.getByRole('textbox', { name: 'Corps du document', exact: true })
  // Native selection/focus notifications can arrive after the initial click.
  await page.waitForTimeout(200)
  await page.keyboard.press('Enter')
  await expect(body.locator(':scope > p').first().locator('br[data-soft-break]')).toHaveCount(1)
  await page.keyboard.press('ArrowDown')
  await expect(body.locator('.paragraph-marker[data-active]')).toHaveCount(1)
  expect(await page.evaluate(() => window.__spike!.editor.getJSON())).toEqual(original.document)
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
  expect(await page.evaluate(() => window.__spike!.editor.getJSON())).toEqual(original.document)
  for (const origin of ['paragraph-start', 'separator']) {
    if (origin === 'separator') await body.locator('.paragraph-marker').first().click()
    await page.waitForTimeout(200)
    await page.keyboard.press('Backspace')
    await expect
      .poll(() =>
        page.evaluate(
          (index) => window.__spike!.editor.state.doc.child(index).textContent,
          original.index,
        ),
      )
      .toBe(original.first + original.second)
    await expect(body.locator(':scope > p').first().locator('br[data-soft-break]')).toHaveCount(1)
    await page.evaluate(async () => {
      await window.__spike!.provider.flush()
    })
    expect(await page.evaluate(() => window.__spike!.provider.rejected)).toBeFalsy()
    await page.keyboard.press('ControlOrMeta+z')
    if (origin === 'separator')
      await expect(body.locator('.paragraph-marker[data-active]')).toHaveCount(1)
    else
      await expect
        .poll(() => page.evaluate(() => window.__spike!.editor.state.selection.$from.parentOffset))
        .toBe(0)
    expect(await page.evaluate(() => window.__spike!.editor.getJSON())).toEqual(original.document)
  }
  expect(hash()).toBe(originalHash)
  expect(errors).toEqual([])
})
