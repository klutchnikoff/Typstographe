import { historyFor } from './editing-history'
import { Extension, Node, markInputRule, type Editor, type JSONContent } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, TextSelection } from '@tiptap/pm/state'
import { widgetTarget, widgetAnnotation, resumeAfterWidget } from './widgets'
import { lineBreak } from './document-whitespace'
import { runObjectEdit } from './object-commands'
import { joinParagraphs } from './paragraph-join'
import { listKey } from './list-transforms'
import { temporaryParagraphLine } from './paragraph-flow'

/** Shared Typst-style inline input, also used by named editorial zones. */
export const TypstInlineInput = Extension.create({
  name: 'typstInlineInput',
  priority: 1000,
  addInputRules() {
    return [markInputRule({ find: /(?:^|\s)(\*([^*]+)\*)$/, type: this.editor.schema.marks.bold })]
  },
})
export const SoftBreak = Node.create({
  name: 'softBreak',
  group: 'inline',
  inline: true,
  selectable: false,
  parseHTML: () => [{ tag: 'br[data-soft-break]' }],
  renderHTML: () => ['br', { 'data-soft-break': '' }],
})

export type ListKind = 'bulletList' | 'orderedList' | 'descriptionList'
export const listKinds: ListKind[] = ['bulletList', 'orderedList', 'descriptionList']
const paragraph = (content: JSONContent[] = []): JSONContent => ({ type: 'paragraph', content })
export function listContent(kind: ListKind, content: JSONContent[] = []): JSONContent {
  return {
    type: kind,
    content: [
      kind === 'descriptionList'
        ? {
            type: 'descriptionItem',
            content: [{ type: 'descriptionTerm' }, { type: 'descriptionDefinition', content }],
          }
        : { type: 'listItem', content: [paragraph(content)] },
    ],
  }
}
type Range = { from: number; to: number }
export function canInsertBlock(editor: Editor, range: Range = editor.state.selection) {
  if (range.from < 0 || range.to < range.from || range.to > editor.state.doc.content.size)
    return false
  return [range.from, range.to].every((pos) => {
    const $pos = editor.state.doc.resolve(pos)
    return (
      $pos.depth === 0 ||
      ($pos.depth === 1 && ['paragraph', 'heading'].includes($pos.parent.type.name))
    )
  })
}
/** One insertion policy for every widget: split at the cursor, no empty line before, one after. */
export function planBlockInsertion(
  editor: Editor,
  content: JSONContent,
  range: Range = editor.state.selection,
) {
  if (!canInsertBlock(editor, range)) return undefined
  const tr = editor.state.tr
  const $from = tr.doc.resolve(range.from),
    $to = tr.doc.resolve(range.to)
  const node = editor.schema.nodeFromJSON(content)
  const nodes: PMNode[] = []
  const start = $from.depth ? $from.before() : range.from
  const end = $to.depth ? $to.after() : range.to
  if ($from.depth) {
    let left = $from.parent.content.cut(0, $from.parentOffset)
    if (['softBreak', 'hardBreak'].includes(left.lastChild?.type.name || ''))
      left = left.cut(0, left.size - 1)
    if (left.size) nodes.push($from.parent.copy(left))
  }
  const inserted = start + nodes.reduce((sum, part) => sum + part.nodeSize, 0)
  nodes.push(node)
  let right = $to.depth ? $to.parent.content.cut($to.parentOffset) : null
  if (right && ['softBreak', 'hardBreak'].includes(right.firstChild?.type.name || ''))
    right = right.cut(1)
  if (right?.size) nodes.push($to.parent.copy(right))
  historyFor(editor)?.stopCapturing()
  tr.replaceWith(start, end, nodes)
  resumeAfterWidget(tr, inserted + node.nodeSize)
  tr.setSelection(TextSelection.near(tr.doc.resolve(inserted + 1)))
  return tr
}
export function insertBlock(
  editor: Editor,
  content: JSONContent,
  range: Range = editor.state.selection,
  immediate = false,
) {
  const tr = planBlockInsertion(editor, content, range)
  if (!tr) return false
  if (!immediate) return runObjectEdit(editor, tr)
  editor.view.dispatch(tr.scrollIntoView())
  historyFor(editor)?.stopCapturing()
  editor.view.focus()
  return true
}
export function convertList(node: PMNode, kind: ListKind): JSONContent {
  const items: JSONContent[][] = []
  node.forEach((item) => {
    const inline: JSONContent[] = []
    item.forEach((part, _, index) => {
      if (index && part.content.size && inline.length)
        inline.push({ type: 'text', text: node.type.name === 'descriptionList' ? ' : ' : ' ' })
      inline.push(...(part.content.toJSON() || []))
    })
    items.push(inline)
  })
  return {
    type: kind,
    attrs: kind === 'orderedList' ? { start: node.attrs.start || 1 } : {},
    content: items.map((content) => listContent(kind, content).content![0]),
  }
}
export function insertList(editor: Editor, kind: ListKind) {
  const target = widgetTarget(editor)
  if (target && listKinds.includes(target.node.type.name as ListKind)) {
    const replacement =
      target.node.type.name === kind
        ? target.node.content.content.flatMap((item, index) =>
            item.type.name === 'descriptionItem'
              ? [
                  paragraph(
                    convertList(target.node, 'bulletList').content![index].content![0].content,
                  ),
                ]
              : item.content.toJSON(),
          )
        : convertList(target.node, kind)
    const nodes = (Array.isArray(replacement) ? replacement : [replacement]).map((node) =>
      editor.schema.nodeFromJSON(node),
    )
    return runObjectEdit(
      editor,
      editor.state.tr.replaceWith(target.pos, target.pos + target.node.nodeSize, nodes),
    )
  }
  const { from, to, $from, $to } = editor.state.selection
  const content: JSONContent[] = []
  if (from !== to) {
    const selected = editor.state.doc.slice(from, to).content
    if ($from.sameParent($to)) content.push(...(selected.toJSON() || []))
    else
      selected.forEach((node) => {
        if (content.length) content.push({ type: 'softBreak' })
        content.push(...(node.isText ? [node.toJSON()] : node.content.toJSON() || []))
      })
  }
  return insertBlock(editor, listContent(kind, content))
}
export function insertQuote(editor: Editor) {
  const { from, to } = editor.state.selection
  const content: JSONContent[] = []
  if (from !== to)
    editor.state.doc.slice(from, to).content.forEach((node) => {
      if (node.isText || node.isInline) {
        if (!content.length) content.push(paragraph())
        content[content.length - 1].content!.push(node.toJSON())
      } else if (node.isTextblock) content.push(paragraph(node.content.toJSON() || []))
    })
  return insertBlock(editor, {
    type: 'quote',
    content: [...(content.length ? content : [paragraph()]), { type: 'quoteAttribution' }],
  })
}
/** Reuse only inline line breaks; a paragraph boundary is a separate caret stop. */
function lineAhead(editor: Editor) {
  const { empty, $from } = editor.state.selection
  if (!empty) return null
  if (lineBreak($from.nodeAfter)) return $from.pos + $from.nodeAfter!.nodeSize
  return null
}
function atDocumentStart(editor: Editor) {
  const { empty, $from } = editor.state.selection
  return (
    empty &&
    $from.pos === 1 &&
    $from.depth === 1 &&
    ['paragraph', 'heading'].includes($from.parent.type.name)
  )
}
export const DocumentInput = Extension.create({
  name: 'documentInput',
  priority: 1100,
  addOptions: () => ({ trailingParagraph: true }),
  addKeyboardShortcuts() {
    return {
      Backspace: () =>
        !this.editor.view.composing &&
        (listKey(this.editor, 'Backspace') ||
          joinParagraphs(this.editor, true, this.options.trailingParagraph)),
      Delete: () =>
        listKey(this.editor, 'Delete') ||
        joinParagraphs(this.editor, false, this.options.trailingParagraph),
      'Shift-Enter': () => {
        if (this.editor.view.composing) return false
        if (atDocumentStart(this.editor)) return true
        const { empty, $from } = this.editor.state.selection
        const ahead = lineAhead(this.editor)
        if (ahead !== null) {
          this.editor.commands.setTextSelection(ahead)
          return true
        }
        if (empty && (lineBreak($from.nodeBefore) || !$from.parent.content.size)) return true
        return this.editor.commands.setHardBreak()
      },
      Enter: () => {
        if (this.editor.view.composing) return false
        if (listKey(this.editor, 'Enter')) return true
        if (atDocumentStart(this.editor)) return true
        const { selection } = this.editor.state,
          { $from } = selection
        const widget = widgetTarget(this.editor)
        if (widget && widgetAnnotation(widget)?.kind === $from.parent.type.name) {
          if (selection.empty && (!$from.parent.content.size || lineBreak($from.nodeBefore))) {
            const tr = this.editor.state.tr
            if (lineBreak($from.nodeBefore)) tr.delete($from.pos - 1, $from.pos)
            this.editor.view.dispatch(
              resumeAfterWidget(
                tr,
                tr.mapping.map(widget.pos + widget.node.nodeSize),
              ).scrollIntoView(),
            )
            return true
          }
          if (selection.empty && lineBreak($from.nodeAfter))
            return this.editor.commands.setTextSelection($from.pos + 1)
          return this.editor.commands.insertContent({ type: 'softBreak' })
        }
        if ($from.parent.type.name !== 'paragraph') return false
        const parent = $from.node($from.depth - 1).type.name
        if (!['doc', 'quote', 'tableCell', 'tableHeader'].includes(parent)) return false
        if (selection.empty && $from.parentOffset === 0) return true
        const ahead = lineAhead(this.editor)
        if (ahead !== null) {
          this.editor.commands.setTextSelection(ahead)
          return true
        }
        if (selection.empty && lineBreak($from.nodeBefore)) {
          // A pending empty writing line already sits immediately before ¶.
          if (
            $from.parentOffset === $from.parent.content.size &&
            this.editor.state.doc.resolve($from.after()).nodeAfter?.type.name === 'paragraph'
          )
            return true
          const pos = $from.pos - 1
          const tr = this.editor.state.tr
            .delete(pos, $from.pos)
            .split(pos, 1, [{ type: this.editor.schema.nodes.paragraph }])
          tr.setSelection(TextSelection.create(tr.doc, pos + 2))
          tr.ensureMarks(this.editor.state.storedMarks || $from.marks())
          this.editor.view.dispatch(tr.scrollIntoView())
          return true
        }
        const tr = this.editor.state.tr.replaceSelectionWith(
          this.editor.schema.nodes.softBreak.create(),
          true,
        )
        if (selection.empty && $from.parentOffset === $from.parent.content.size) {
          const next = this.editor.state.doc.resolve($from.after()).nodeAfter
          if (next?.type.name === 'paragraph' && next.content.size)
            temporaryParagraphLine(tr, $from.pos)
        }
        this.editor.view.dispatch(tr.scrollIntoView())
        return true
      },
    }
  },
  addProseMirrorPlugins() {
    const editor = this.editor
    return [
      new Plugin({
        props: {
          handleTextInput(view, from, to, text) {
            if (view.composing || text !== ' ' || from !== to) return false
            const $from = view.state.doc.resolve(from)
            if ($from.parent.type.name !== 'paragraph' || widgetTarget(editor)) return false
            let start = $from.start()
            $from.parent.forEach((node, offset) => {
              if (
                offset < $from.parentOffset &&
                ['softBreak', 'hardBreak'].includes(node.type.name)
              )
                start = $from.start() + offset + node.nodeSize
            })
            const prefix = view.state.doc.textBetween(start, from)
            const match = /^(?:-|([1-9]\d*)\.)$/.exec(prefix)
            if (!match) return false
            const kind = match[1] ? 'orderedList' : 'bulletList'
            if (!editor.schema.nodes[kind]) return false
            const content = listContent(kind)
            if (match[1]) content.attrs = { start: Number(match[1]) }
            return insertBlock(editor, content, { from: start, to: from }, true)
          },
        },
      }),
    ]
  },
})
