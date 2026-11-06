import { afterEach, expect, it, vi } from 'vitest'
import type { Editor } from '@tiptap/core'
import { createRichZone } from '../src/rich-zone'
import { documentStatistics } from '../src/document-statistics'

let editor: Editor
afterEach(() => {
  editor?.destroy()
  document.body.replaceChildren()
  document.documentElement.lang = ''
})

it('counts changed text and selections, ignores formatting and caret moves, and rejects stale replies', async () => {
  const element = document.createElement('div'),
    output = document.createElement('span')
  document.body.append(element, output)
  editor = createRichZone({ profile: 'rich-text', element, label: 'Texte' })
  if (!editor.isInitialized)
    await new Promise<void>((resolve) => editor.once('create', () => resolve()))
  const requests: {
    resolve: (value: { label: string; hint: string }) => void
    reject: () => void
  }[] = []
  const invoke = vi.fn(() => new Promise((resolve, reject) => requests.push({ resolve, reject })))
  const counts = documentStatistics({ invoke: invoke as any }, output)
  editor.commands.setContent('<p>Écrire ici</p><p>Suite</p>')
  counts.refresh(editor)
  expect(invoke.mock.calls.at(-1)).toEqual([
    'count_text',
    { text: 'Écrire ici\nSuite', selection: null },
  ])
  editor.commands.setTextSelection(3)
  editor.commands.toggleBold()
  counts.refresh(editor)
  expect(invoke).toHaveBeenCalledTimes(1)
  editor.commands.setTextSelection({ from: 1, to: 7 })
  counts.refresh(editor)
  expect(invoke.mock.calls.at(-1)).toEqual([
    'count_text',
    { text: 'Écrire ici\nSuite', selection: 'Écrire' },
  ])
  requests[1].resolve({ label: 'Selection', hint: 'Current detail' })
  await Promise.resolve()
  requests[0].resolve({ label: 'Old document', hint: 'Old detail' })
  await Promise.resolve()
  expect(output.textContent).toBe('Selection')
  expect(output.title).toBe('Current detail')

  document.documentElement.lang = 'en'
  counts.refresh(editor)
  expect(invoke).toHaveBeenCalledTimes(3)
  requests[2].reject()
  await Promise.resolve()
  await Promise.resolve()
  counts.refresh(editor)
  expect(invoke).toHaveBeenCalledTimes(4)
  editor.commands.insertContent('Autre')
  counts.refresh(editor)
  requests[3].reject()
  await Promise.resolve()
  await Promise.resolve()
  counts.refresh(editor)
  // An old failure must not invalidate a newer pending count.
  expect(invoke).toHaveBeenCalledTimes(5)
  counts.stop()
  requests[4].resolve({ label: 'Closed', hint: 'Closed' })
  await Promise.resolve()
  counts.refresh(editor)
  expect(invoke).toHaveBeenCalledTimes(5)
  expect(output.textContent).toBe('Selection')
})
