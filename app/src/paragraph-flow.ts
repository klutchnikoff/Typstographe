import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection, type Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { ParagraphSelection, paragraphBoundary } from './paragraph-selection'
import { joinParagraphs } from './paragraph-join'
import { dispatchImmediateEdit } from './immediate-edit'
import { lineBreak } from './document-whitespace'
import { syncNativeTextSelection } from './native-selection'
import { ySyncPluginKey } from '@tiptap/y-tiptap'

const pendingLine = new PluginKey<number | null>('pending-paragraph-line')
export function temporaryParagraphLine(tr: Transaction, pos: number) {
  return tr.setMeta(pendingLine, pos)
}
/** Navigation, pointer placement and temporary composition lines share one flow policy. */
export const ParagraphFlow = Extension.create({
  name: 'paragraphFlow',
  priority: 1150,
  addProseMirrorPlugins() {
    const editor = this.editor
    return [
      new Plugin<number | null>({
        key: pendingLine,
        state: {
          init: () => null,
          apply(tr, previous) {
            const meta = tr.getMeta(pendingLine)
            const pos =
              meta !== undefined ? meta : previous === null ? null : tr.mapping.map(previous)
            if (pos === null || !lineBreak(tr.doc.nodeAt(pos))) return null
            const $pos = tr.doc.resolve(pos)
            return $pos.parent.type.name === 'paragraph' &&
              $pos.parentOffset + 1 === $pos.parent.content.size
              ? pos
              : null
          },
        },
        appendTransaction(_transactions, _previous, current) {
          const pos = pendingLine.getState(current)
          if (pos == null) return null
          if (
            current.selection instanceof TextSelection &&
            current.selection.empty &&
            current.selection.head === pos + 1
          )
            return null
          return current.tr
            .delete(pos, pos + 1)
            .setMeta(pendingLine, null)
            .setMeta('addToHistory', false)
        },
        props: {
          handleKeyDown(view, event) {
            if (
              view.composing ||
              event.isComposing ||
              event.altKey ||
              event.ctrlKey ||
              event.metaKey
            )
              return false
            // Native selectionchange can lag behind an extended arrow selection.
            // ProseMirror's DOM replays synthesize Enter/Backspace, never arrows.
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key))
              syncNativeTextSelection(editor)
            const selection = view.state.selection
            if (selection instanceof ParagraphSelection) {
              if (event.key === 'Enter') return true
              if (event.key === 'Backspace' || event.key === 'Delete')
                return joinParagraphs(editor, true, false)
              const direction = ['ArrowRight', 'ArrowDown'].includes(event.key)
                ? 1
                : ['ArrowLeft', 'ArrowUp'].includes(event.key)
                  ? -1
                  : 0
              if (!direction) return false
              const head = selection.head + direction
              const anchor = event.shiftKey ? selection.head - direction : head
              view.dispatch(
                view.state.tr
                  .setSelection(TextSelection.create(view.state.doc, anchor, head))
                  .scrollIntoView(),
              )
              return true
            }
            if (!(selection instanceof TextSelection) || (!event.shiftKey && !selection.empty))
              return false
            const { $head } = selection
            if ($head.parent.type.name !== 'paragraph') return false
            const backwards = ['ArrowLeft', 'ArrowUp', 'Backspace'].includes(event.key)
            const forwards = ['ArrowRight', 'ArrowDown'].includes(event.key)
            if (!backwards && !forwards) return false
            const vertical = ['ArrowUp', 'ArrowDown'].includes(event.key)
            if (
              vertical
                ? !view.endOfTextblock(backwards ? 'up' : 'down')
                : $head.parentOffset !== (backwards ? 0 : $head.parent.content.size)
            )
              return false
            const boundary = backwards ? $head.before() : $head.after()
            const $boundary = view.state.doc.resolve(boundary)
            if (!paragraphBoundary($boundary)) return false
            if (event.key === 'Backspace')
              return selection.empty ? joinParagraphs(editor, true, false) : false
            const next = event.shiftKey
              ? TextSelection.create(
                  view.state.doc,
                  selection.anchor,
                  boundary + (backwards ? -1 : 1),
                )
              : new ParagraphSelection($boundary)
            view.dispatch(view.state.tr.setSelection(next).scrollIntoView())
            return true
          },
          handleTextInput(view, _from, _to, text) {
            if (!(view.state.selection instanceof ParagraphSelection) || view.composing || !text)
              return false
            const pos = view.state.selection.head
            const marks = view.state.storedMarks || []
            const paragraph = view.state.schema.nodes.paragraph.create(
              null,
              view.state.schema.text(text, marks),
            )
            const tr = view.state.tr.insert(pos, paragraph)
            tr.setSelection(TextSelection.create(tr.doc, pos + 1 + text.length))
            return dispatchImmediateEdit(editor, tr)
          },
          decorations(state) {
            const markers: Decoration[] = []
            state.doc.descendants((node, pos) => {
              if (node.type.name !== 'paragraph' || !paragraphBoundary(state.doc.resolve(pos)))
                return
              const previous = state.doc.resolve(pos).nodeBefore!
              const active =
                state.selection instanceof ParagraphSelection && state.selection.head === pos
              if (!previous.content.size) return
              if (
                pos + node.nodeSize === state.doc.content.size &&
                !node.content.size &&
                !active &&
                state.selection.from !== pos + 1
              )
                return
              markers.push(
                Decoration.widget(
                  pos,
                  (view, getPos) => {
                    const marker = document.createElement('div')
                    marker.className = 'paragraph-marker'
                    marker.textContent = '¶'
                    marker.setAttribute('aria-hidden', 'true')
                    if (active) marker.dataset.active = ''
                    marker.onmousedown = (event) => {
                      if (event.button !== 0) return
                      event.preventDefault()
                      const at = getPos()
                      if (at === undefined) return
                      const $at = view.state.doc.resolve(at)
                      if (!paragraphBoundary($at)) return
                      view.dispatch(view.state.tr.setSelection(new ParagraphSelection($at)))
                      view.focus()
                    }
                    return marker
                  },
                  {
                    side: -1,
                    key: `paragraph-marker-${active ? 'active' : 'idle'}`,
                    ignoreSelection: true,
                  },
                ),
              )
            })
            return DecorationSet.create(state.doc, markers)
          },
        },
      }),
      preserveSharedParagraphCaret(),
    ]
  },
})

/** Y-Tiptap restores unknown selection types as text. Keep this view-only
 * caret tied to its actual shared paragraph, never a replacement neighbour. */
function preserveSharedParagraphCaret() {
  let paragraph: unknown
  return new Plugin({
    view(view) {
      const capture = () => {
        paragraph = undefined
        if (!(view.state.selection instanceof ParagraphSelection)) return
        const node = view.state.selection.$from.nodeAfter
        const mapping = ySyncPluginKey.getState(view.state)?.binding?.mapping as
          Map<unknown, unknown> | undefined
        if (mapping)
          for (const [type, projected] of mapping)
            if (projected === node) {
              paragraph = type
              break
            }
      }
      capture()
      return { update: capture }
    },
    appendTransaction(transactions, previous, current) {
      if (
        !paragraph ||
        !(previous.selection instanceof ParagraphSelection) ||
        !transactions.some((tr) => tr.getMeta(ySyncPluginKey)?.isChangeOrigin)
      )
        return null
      const mapping = ySyncPluginKey.getState(current)?.binding?.mapping as
        Map<unknown, unknown> | undefined
      const node = mapping?.get(paragraph)
      if (!node) return null
      let at: number | undefined
      current.doc.descendants((candidate, pos) => {
        if (candidate === node && paragraphBoundary(current.doc.resolve(pos))) at = pos
      })
      if (at === undefined) return null
      const selection = new ParagraphSelection(current.doc.resolve(at))
      return selection.eq(current.selection)
        ? null
        : current.tr.setSelection(selection).setMeta(ySyncPluginKey, { isChangeOrigin: true })
    },
  })
}
