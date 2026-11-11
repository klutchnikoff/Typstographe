import { afterEach, expect, it } from 'vitest'
import * as Y from 'yjs'
import type { Editor } from '@tiptap/core'
import { createRichZone } from '../src/rich-zone'
import { ParagraphSelection } from '../src/paragraph-selection'
import { historyFor } from '../src/editing-history'
const editors: Editor[] = [],
  docs: Y.Doc[] = []
afterEach(() => {
  editors
    .splice(0)
    .reverse()
    .forEach((e) => e.destroy())
  docs.splice(0).forEach((d) => d.destroy())
  document.body.replaceChildren()
})
async function fixture() {
  const doc = new Y.Doc()
  docs.push(doc)
  const root = doc.getXmlFragment('default')
  const a = new Y.XmlElement('paragraph'),
    b = new Y.XmlElement('paragraph')
  root.insert(0, [a, b])
  // Same physical layout as Rust/Yrs: each marked run is its own XmlText.
  const plain = new Y.XmlText('Un '),
    italic = new Y.XmlText('texte'),
    tail = new Y.XmlText(' lisible')
  a.insert(0, [plain, italic, tail, new Y.XmlElement('footnote'), new Y.XmlText('.')])
  italic.format(0, 5, { italic: {} })
  ;(a.toArray()[3] as Y.XmlElement).setAttribute('text', 'Une note')
  b.insert(0, [new Y.XmlText('Le second '), new Y.XmlText('paragraphe.')])
  const element = document.createElement('div')
  document.body.append(element)
  const e = createRichZone({
    profile: 'document',
    label: 'Shared runs',
    element,
    binding: { kind: 'document', document: doc },
  })
  editors.push(e)
  if (!e.isInitialized) await new Promise<void>((resolve) => e.once('create', () => resolve()))
  return { e, doc, root, second: b }
}
function press(e: Editor, key: string) {
  return e.view.someProp('handleKeyDown', (handler) =>
    handler(e.view, new KeyboardEvent('keydown', { key, keyCode: key === 'Enter' ? 13 : 8 })),
  )
}
it('structural input accepts adjacent shared text runs and preserves marks, notes and unaffected block identity', async () => {
  const { e, root, second } = await fixture()
  const original = e.state.doc.firstChild!
  e.commands.setTextSelection(original.nodeSize - 2)
  expect(() => press(e, 'Enter')).not.toThrow()
  const content = e.state.doc.firstChild!.content.content
  expect(content.at(-2)!.type.name).toBe('softBreak')
  e.commands.insertContent('Suite')
  expect(e.state.doc.firstChild!.textContent).toBe(original.textContent.slice(0, -1) + 'Suite.')
  const italic = e.state.doc.firstChild!.content.content.find((n) => n.text === 'texte')!
  expect(italic.marks.map((m) => m.type.name)).toEqual(['italic'])
  expect(
    e.state.doc.firstChild!.content.content.find((n) => n.type.name === 'footnote')?.attrs.text,
  ).toBe('Une note')
  expect(root.toArray()[1]).toBe(second)
})
it('joining paragraphs from the persisted Yrs layout remains undoable without replacing the whole document', async () => {
  const { e } = await fixture()
  const original = e.getJSON()
  const boundary = e.state.doc.firstChild!.nodeSize
  e.view.dispatch(e.state.tr.setSelection(new ParagraphSelection(e.state.doc.resolve(boundary))))
  historyFor(e)!.clear()
  historyFor(e)!.stopCapturing()
  expect(() => press(e, 'Backspace')).not.toThrow()
  expect(e.state.doc.firstChild!.textContent).toBe('Un texte lisible.Le second paragraphe.')
  expect(
    e.state.doc.firstChild!.content.content.filter((n) => n.type.name === 'softBreak'),
  ).toHaveLength(1)
  e.commands.undo()
  expect(e.getJSON()).toEqual(original)
  // This fixture uses the library's own Yjs undo owner. The application's
  // native owner restores the separator caret in the persisted/native recipes.
  e.commands.redo()
  expect(e.state.doc.firstChild!.textContent).toBe('Un texte lisible.Le second paragraphe.')
})
