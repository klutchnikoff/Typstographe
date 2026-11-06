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

for (const kind of ['mathBlock', 'quote', 'bulletList', 'tableFigure'] as const) {
  it(`${kind}: a blank line beside a widget is visible and removable without editing either neighbour`, () => {
    const widget =
      kind === 'mathBlock'
        ? { type: kind, content: [{ type: 'text', text: 'x^2' }] }
        : kind === 'quote'
          ? {
              type: kind,
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'Quote' }] },
                { type: 'quoteAttribution' },
              ],
            }
          : kind === 'bulletList'
            ? {
                type: kind,
                content: [
                  {
                    type: 'listItem',
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item' }] }],
                  },
                ],
              }
            : {
                type: kind,
                content: [
                  {
                    type: 'table',
                    content: [
                      {
                        type: 'tableRow',
                        content: [
                          {
                            type: 'tableCell',
                            content: [
                              { type: 'paragraph', content: [{ type: 'text', text: 'Cell' }] },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                  { type: 'tableCaption' },
                ],
              }
    for (const side of ['before', 'between', 'after'] as const) {
      for (const key of ['Backspace', 'Delete']) {
        const paragraph = { type: 'paragraph', content: [{ type: 'text', text: 'Prose' }] }
        const left = side === 'before' ? paragraph : widget
        const right = side === 'after' ? paragraph : widget
        const e = createRichZone({
          profile: 'document',
          label: 'Flow',
          content: {
            type: 'doc',
            content: [left, { type: 'paragraph' }, right, { type: 'paragraph' }],
          },
        })
        editors.push(e)
        const size = e.state.doc.firstChild!.nodeSize
        e.commands.setTextSelection(size + 1)
        const before = e.getJSON()
        expect(e.view.dom.querySelector('p > .paragraph-marker')?.textContent).toBe('¶')
        press(e, 'Enter')
        expect(e.getJSON()).toEqual(before)
        expect(press(e, key)).toBe(true)
        expect(e.state.doc.childCount).toBe(3)
        expect(e.state.doc.child(0).toJSON()).toEqual(before.content![0])
        expect(e.state.doc.child(1).toJSON()).toEqual(before.content![2])
        expect(e.state.doc.lastChild!.content.size).toBe(0)
        e.commands.undo()
        expect(e.getJSON()).toEqual(before)
      }
    }
  })
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
