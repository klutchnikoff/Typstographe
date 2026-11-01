import { afterEach, expect, it, vi } from 'vitest'
import type { Editor } from '@tiptap/core'
import { createRichZone } from '../src/rich-zone'
import { richFieldStatistics } from '../src/rich-field-statistics'

let editor: Editor
afterEach(() => {
  editor?.destroy()
  document.body.replaceChildren()
})
it('private counters ignore formatting, late responses and removed fields, then retry a failed read', async () => {
  const element = document.createElement('div'),
    heading = document.createElement('span')
  document.body.append(element, heading)
  editor = createRichZone({ profile: 'rich-text', element, label: 'Résumé' })
  if (!editor.isInitialized)
    await new Promise<void>((resolve) => editor.once('create', () => resolve()))
  const requests: { resolve: (value: { field_label: string }) => void; reject: () => void }[] = []
  const invoke = vi.fn(
    () =>
      new Promise<{ field_label: string }>((resolve, reject) => requests.push({ resolve, reject })),
  )
  richFieldStatistics(editor, heading, 'Résumé', { invoke: invoke as any })
  editor.commands.setContent('<p>Un <strong>résumé</strong></p><p>Suite</p>')
  expect(invoke.mock.calls.at(-1)).toEqual([
    'count_text',
    { text: 'Un résumé\nSuite', selection: null, fieldLabel: 'Résumé' },
  ])
  requests[1].resolve({ field_label: 'Current counts' })
  await Promise.resolve()
  requests[0].resolve({ field_label: 'Old counts' })
  await Promise.resolve()
  expect(heading.textContent).toBe('Current counts')
  editor.commands.selectAll()
  editor.commands.toggleItalic()
  expect(invoke).toHaveBeenCalledTimes(2)
  editor.commands.setContent('<p>Autre</p>')
  requests[2].reject()
  await Promise.resolve()
  await Promise.resolve()
  expect(heading.textContent).toBe('Résumé')
  editor.commands.toggleBold()
  expect(invoke).toHaveBeenCalledTimes(4)
  editor.destroy()
  requests[3].resolve({ field_label: 'Detached counts' })
  await Promise.resolve()
  expect(heading.textContent).toBe('Résumé')
})
