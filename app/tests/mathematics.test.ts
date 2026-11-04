import { afterEach, expect, it } from 'vitest'
import { createRichZone } from '../src/rich-zone'
import { normalizeWhitespace } from '../src/document-whitespace'
import { mathContent } from '../src/mathematics'
import { findMatches } from '../src/proofing'
import { bindEditorTarget } from '../src/editor-targets'
import { copiedContent } from '../src/document-anchors'
import { Slice, Fragment } from '@tiptap/pm/model'
import { referenceTargets } from '../src/cross-reference-index'
const editors: ReturnType<typeof createRichZone>[] = []
afterEach(() => editors.splice(0).forEach((e) => e.destroy()))
function fixture(content = [{ type: 'paragraph' }] as any[]) {
  const e = createRichZone({
    profile: 'document',
    label: 'Math test',
    content: { type: 'doc', content },
  })
  bindEditorTarget(e, { kind: 'body' })
  editors.push(e)
  return e
}
function type(editor: ReturnType<typeof fixture>, text: string) {
  for (const c of text) {
    const { from, to } = editor.state.selection
    let handled = false
    editor.view.someProp('handleTextInput', (fn) => {
      if (fn(editor.view, from, to, c, () => editor.state.tr.insertText(c))) {
        handled = true
        return true
      }
      return false
    })
    if (!handled) editor.view.dispatch(editor.state.tr.insertText(c))
  }
}
function enter(e: ReturnType<typeof fixture>, key = 'Enter') {
  e.view.someProp('handleKeyDown', (fn) =>
    fn(e.view, new KeyboardEvent('keydown', { key, bubbles: true })),
  )
}
it('single and double dollar delimiters select languages for inline source without a rendered preview', () => {
  for (const [input, language, source] of [
    ['$cos(x)$', 'typst', 'cos(x)'],
    ['$$\\cos(x)$$', 'latex', '\\cos(x)'],
  ]) {
    const e = fixture()
    type(e, input)
    expect(e.state.doc.firstChild!.firstChild!.type.name).toBe('mathInline')
    expect(e.state.doc.firstChild!.firstChild!.attrs.language).toBe(language)
    expect(e.state.doc.firstChild!.firstChild!.textContent).toBe(source)
    type(e, ' suite')
    expect(e.state.doc.firstChild!.lastChild!.text).toBe(' suite')
    expect(e.view.dom.querySelector('img,svg,canvas')).toBeNull()
  }
})
it('a standalone marker followed by Enter creates one math widget with a final continuation, including after a simple return', () => {
  for (const marker of ['$', '$$']) {
    const e = fixture()
    type(e, marker)
    enter(e)
    expect(e.state.doc.firstChild!.type.name).toBe('mathBlock')
    expect(e.state.doc.firstChild!.attrs.language).toBe(marker === '$' ? 'typst' : 'latex')
    expect(e.state.selection.$from.parent.type.name).toBe('mathBlock')
    type(e, 'x')
    enter(e)
    type(e, '  + y')
    expect(e.state.doc.firstChild!.textContent).toBe('x\n  + y')
    enter(e, 'Tab')
    expect(e.state.selection.$from.parent.type.name).toBe('paragraph')
  }
  const e = fixture([
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Avant' },
        { type: 'softBreak' },
        { type: 'text', text: '$' },
      ],
    },
  ])
  e.commands.setTextSelection(8)
  enter(e)
  expect(e.state.doc.content.content.map((n) => n.type.name)).toEqual([
    'paragraph',
    'mathBlock',
    'paragraph',
  ])
})
it('code whitespace survives normalization and prose search offsets remain correct around inline source', () => {
  const code = mathContent(true, 'latex', 'a  & b\\\\\n  c & d')
  const e = fixture([
    code,
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Avant ' },
        mathContent(false, 'typst', 'cos(x)'),
        { type: 'text', text: ' après' },
      ],
    },
  ])
  const repaired = normalizeWhitespace(e.state.tr)
  expect(repaired.doc.firstChild!.textContent).toBe('a  & b\\\\\n  c & d')
  expect(findMatches(e.state.doc, 'cos', true)).toEqual([])
  const hit = findMatches(e.state.doc, 'après', true)[0]
  expect(e.state.doc.textBetween(hit.from, hit.to)).toBe('après')
})
it('equation targets use aliases but references keep identities, with copied aliases cleared', () => {
  const eq = mathContent(true, 'typst', 'x')
  eq.attrs = { ...eq.attrs, anchor: 'eq-one', alias: 'energy' }
  const e = fixture([eq, { type: 'paragraph' }])
  expect(referenceTargets(e)[0].title).toBe('eq:energy · x')
  const slice = copiedContent(new Slice(Fragment.from(e.state.doc.firstChild!), 0, 0))
  expect(slice.content.firstChild!.attrs.alias).toBe('')
  expect(slice.content.firstChild!.attrs.anchor).not.toBe('eq-one')
})

it('HTML round-trips languages, source, accessible descriptions and equation aliases', () => {
  const block = mathContent(true, 'latex', 'a  & b\\\\\n  c & d')
  block.attrs = { ...block.attrs, anchor: 'matrix-one', alias: 'matrix', alt: 'A matrix' }
  const first = fixture([
    block,
    { type: 'paragraph', content: [mathContent(false, 'typst', 'alpha + beta')] },
  ])
  const second = fixture()
  second.commands.setContent(first.getHTML())
  expect(second.state.doc.firstChild!.textContent).toBe('a  & b\\\\\n  c & d')
  expect(second.state.doc.firstChild!.attrs).toMatchObject({
    language: 'latex',
    anchor: 'matrix-one',
    alias: 'matrix',
    alt: 'A matrix',
  })
  expect(second.state.doc.child(1).firstChild!.type.name).toBe('mathInline')
})

it('typing shortcuts remain literal when the active type does not expose mathematics', async () => {
  const { bindCommandCapabilities } = await import('../src/command-context')
  const e = fixture()
  bindCommandCapabilities(e, [], () => [])
  type(e, '$cos(x)$')
  expect(e.state.doc.firstChild!.textContent).toBe('$cos(x)$')
  expect(e.state.doc.firstChild!.firstChild!.isText).toBe(true)
  const block = fixture()
  bindCommandCapabilities(block, [], () => [])
  type(block, '$$')
  enter(block)
  expect(block.state.doc.content.content.some((n) => n.type.name === 'mathBlock')).toBe(false)
})
