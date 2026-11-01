import { afterEach, expect, it } from 'vitest'
import { createRichZone } from '../src/rich-zone'
import { ParagraphSelection } from '../src/paragraph-selection'
import { Selection } from '@tiptap/pm/state'
import type { Editor } from '@tiptap/core'
const editors: Editor[] = []
afterEach(() => editors.splice(0).forEach((e) => e.destroy()))
function press(e: Editor, key: string) {
  return e.view.someProp('handleKeyDown', (handler) =>
    handler(e.view, new KeyboardEvent('keydown', { key })),
  )
}
for (const profile of ['document', 'rich-text'] as const) {
  const create = () => {
    const editor = createRichZone({ profile, label: 'Flow', content: '<p>Avant</p><p>Après</p>' })
    editors.push(editor)
    editor.commands.setTextSelection(1)
    return editor
  }
  it(`${profile}: the separator is a mapped, serializable caret stop, without modifying content`, () => {
    const e = create(),
      before = e.getJSON()
    e.commands.setTextSelection(6)
    expect(press(e, 'ArrowRight')).toBe(true)
    expect(e.state.selection).toBeInstanceOf(ParagraphSelection)
    expect(e.state.selection.head).toBe(7)
    const selection = e.state.selection
    expect(Selection.fromJSON(e.state.doc, selection.toJSON()).eq(selection)).toBe(true)
    expect(selection.getBookmark().resolve(e.state.doc).eq(selection)).toBe(true)
    expect(press(e, 'Enter')).toBe(true)
    expect(e.getJSON()).toEqual(before)
    press(e, 'ArrowRight')
    expect(e.state.selection.head).toBe(8)
    press(e, 'Enter')
    expect(e.getJSON()).toEqual(before)
    press(e, 'Backspace')
    expect(e.state.doc.firstChild!.content.content.map((n) => n.type.name)).toEqual([
      'text',
      'softBreak',
      'text',
    ])
    expect(e.state.selection.head).toBe(7)
  })
  it(`${profile}: an empty writing line before a separator is removed when left, but authored text survives`, () => {
    const e = create(),
      before = e.getJSON()
    e.commands.setTextSelection(6)
    press(e, 'Enter')
    expect(e.state.doc.firstChild!.lastChild!.type.name).toBe('softBreak')
    expect(e.state.selection.head).toBe(7)
    press(e, 'Enter')
    expect(e.state.selection.head).toBe(7)
    press(e, 'ArrowRight')
    expect(e.state.selection).toBeInstanceOf(ParagraphSelection)
    expect(e.getJSON()).toEqual(before)
    press(e, 'ArrowLeft')
    press(e, 'Enter')
    e.commands.insertContent('Suite')
    press(e, 'ArrowRight')
    expect(e.state.doc.firstChild!.textContent).toBe('AvantSuite')
    expect(e.state.doc.firstChild!.child(1).type.name).toBe('softBreak')
  })
}
