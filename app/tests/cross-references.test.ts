import { bindEditorTarget } from '../src/editor-targets'
import { afterEach, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { Fragment, Slice } from '@tiptap/pm/model'
import { richZoneExtensions } from '../src/rich-zone'
import { copiedContent, ReferenceIntegrity } from '../src/document-anchors'
import {
  referenceTargets,
  referenceLabel,
  setResolvedReferences,
} from '../src/cross-reference-index'
import { activeInlineObject } from '../src/inline-object-focus'
import { widgetBatch } from '../src/object-commands'
import { planBlockInsertion } from '../src/editing'

const editors: Editor[] = []
afterEach(() => editors.splice(0).forEach((editor) => editor.destroy()))
function fixture() {
  const editor = new Editor({
    extensions: [...richZoneExtensions('document'), ReferenceIntegrity],
    content: {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { anchor: 'heading-method', level: 1 },
          content: [{ type: 'text', text: 'Méthode' }],
        },
        {
          type: 'paragraph',
          attrs: { anchor: 'prose' },
          content: [
            { type: 'text', text: 'Voir ' },
            {
              type: 'crossReference',
              attrs: { target: 'heading-method', include_label: true, include_page: false },
            },
          ],
        },
        { type: 'paragraph', attrs: { anchor: 'last-slot' } },
      ],
    },
  })
  bindEditorTarget(editor, { kind: 'body' })
  editors.push(editor)
  return editor
}
it('copies renew anchors and remap only references to targets included in the copy', () => {
  const editor = fixture(),
    doc = editor.state.doc
  const copy = copiedContent(new Slice(Fragment.fromArray([doc.child(0), doc.child(1)]), 0, 0))
  expect(copy.content.child(0).attrs.anchor).not.toBe('heading-method')
  expect(copy.content.child(1).lastChild!.attrs.target).toBe(copy.content.child(0).attrs.anchor)
  const referenceOnly = copiedContent(new Slice(Fragment.fromArray([doc.child(1)]), 0, 0))
  expect(referenceOnly.content.child(0).lastChild!.attrs.target).toBe('heading-method')
  expect(editor.state.doc).toBe(doc)
})
it('badges use the actual rendered content only while its document is current', () => {
  const editor = fixture(),
    reference = { target: 'heading-method', include_label: true, include_page: false }
  expect(referenceLabel(editor, reference)).toBe('Renvoi · Méthode')
  setResolvedReferences(editor, [{ ...reference, display: 'section 2' }])
  expect(referenceLabel(editor, reference)).toBe('section 2')
  editor.commands.insertContentAt(2, 'Autre ')
  expect(referenceTargets(editor)[0]).toMatchObject({
    id: 'heading-method',
    title: 'MAutre éthode',
  })
  expect(referenceLabel(editor, reference)).toContain('Renvoi · ')
})
it('referenced targets are protected before typing is published; removing the entire forest is valid', () => {
  const editor = fixture(),
    before = editor.state.doc
  editor.view.dispatch(editor.state.tr.delete(0, before.child(0).nodeSize))
  expect(editor.state.doc).toBe(before)
  editor.view.dispatch(
    editor.state.tr.delete(0, before.child(0).nodeSize + before.child(1).nodeSize),
  )
  expect(editor.state.doc.textContent).toBe('')
})
it('cross-reference badges inherit the shared exact activation boundary and HTML round trip', () => {
  const editor = fixture(),
    first = editor.state.doc.child(0)
  const pos = first.nodeSize + 1 + 'Voir '.length
  editor.commands.setTextSelection(pos)
  expect(activeInlineObject(editor.state)).toBeUndefined()
  editor.commands.setTextSelection(pos + 1)
  expect(activeInlineObject(editor.state)?.node.type.name).toBe('crossReference')
  expect(editor.view.dom.querySelector('.inline-object-active')).not.toBeNull()
  const restored = new Editor({
    extensions: richZoneExtensions('document'),
    content: editor.getHTML(),
  })
  editors.push(restored)
  expect(referenceTargets(restored)[0].id).toBe('heading-method')
  expect(restored.state.doc.child(1).lastChild!.attrs).toMatchObject({
    target: 'heading-method',
    include_label: true,
    include_page: false,
  })
})

it('planned widget insertion splits an anchored paragraph without duplicating its identity', () => {
  const editor = fixture(),
    paragraph = editor.state.doc.child(0).nodeSize
  editor.commands.setTextSelection(paragraph + 3)
  const plan = planBlockInsertion(editor, {
    type: 'quote',
    content: [{ type: 'paragraph' }, { type: 'quoteAttribution' }],
  })!
  const commands = widgetBatch(editor, plan)
  expect(commands).toHaveLength(1)
  expect(commands[0].params.index).toBe(1)
  const ids: string[] = []
  plan.doc.descendants((node) => {
    if (node.attrs.anchor) ids.push(node.attrs.anchor)
  })
  expect(new Set(ids).size).toBe(ids.length)
  expect(ids).toContain('prose')
  expect(plan.doc.firstChild!.attrs.anchor).toBe('heading-method')
})
