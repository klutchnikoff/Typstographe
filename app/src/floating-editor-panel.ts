import type { Editor } from '@tiptap/core'
import { TextSelection, type SelectionBookmark, type Transaction } from '@tiptap/pm/state'
import type { ContextPanel } from './context-panel'
import { editingProvider, historyFor } from './editing-history'
import { focusEditorSelection } from './editor-focus'
import { placePopover, unchangedRange, type EditorRange } from './editor-popover'
import { editorRoot, nodeOffset, nodePath } from './editor-targets'
import { formOwner } from './form-drafts'
import './floating-editor-panel.css'

interface FloatingTarget extends EditorRange {
  object?: boolean
}

export function floatingEditorPanel(editor: Editor, host: HTMLElement, panel: ContextPanel) {
  const { element } = panel
  element.classList.add('floating-editor-panel')
  element.setAttribute('role', 'dialog')
  host.append(element)
  const controller = new AbortController()
  const { signal } = controller
  let active:
    | { target: FloatingTarget; bookmark: SelectionBookmark; pending: boolean; valid: boolean }
    | undefined

  function close(restore = false, committed = false) {
    const previous = active
    if (!previous) return
    active = undefined
    element.hidden = true
    panel.discardRecovery()
    historyFor(editor)?.stopCapturing()
    if (restore) focusEditorSelection(editor, committed ? undefined : previous.bookmark)
  }

  function place() {
    const target = active?.target
    if (!target || !active?.valid) return
    const badge = target.object && editor.view.nodeDOM(target.from)
    const coordinates = editor.view.coordsAtPos(target.from)
    const anchor =
      badge instanceof HTMLElement
        ? (badge.querySelector('.inline-object-label') || badge).getBoundingClientRect()
        : new DOMRect(
            coordinates.left,
            coordinates.top,
            coordinates.right - coordinates.left,
            coordinates.bottom - coordinates.top,
          )
    if (!placePopover(element, anchor)) close()
  }

  function transaction({ transaction }: { transaction: Transaction }) {
    if (!active || !transaction.docChanged) return
    active.bookmark = active.bookmark.map(transaction.mapping)
    if (!active.valid) return
    const mapped = unchangedRange(transaction, active.target)
    if (mapped) {
      active.target = { ...active.target, ...mapped }
      place()
    } else {
      active.valid = false
      // The owner's accepted transaction may be changing this very range.
      if (!active.pending) close(element.contains(document.activeElement))
    }
  }

  const dismissOutside = (event: Event) => {
    if (active && event.target instanceof Node && !element.contains(event.target)) close()
  }
  document.addEventListener('pointerdown', dismissOutside, { capture: true, signal })
  document.addEventListener('focusin', dismissOutside, { signal })
  document.addEventListener('scroll', place, { capture: true, signal })
  window.addEventListener('resize', place, { signal })
  const observer = new ResizeObserver(place)
  observer.observe(element)
  editor.on('transaction', transaction)
  editor.on('destroy', () => {
    active = undefined
    panel.detachRecovery()
    observer.disconnect()
    controller.abort()
    element.remove()
  })

  return {
    get isOpen() {
      return !!active
    },
    close,
    place,
    focus() {
      if (!active) return false
      panel.focus()
      return true
    },
    open(target: FloatingTarget) {
      close()
      const state = editor.state
      active = {
        target,
        bookmark: target.object
          ? TextSelection.create(state.doc, target.to).getBookmark()
          : state.selection.getBookmark(),
        pending: false,
        valid: true,
      }
      const session = active
      historyFor(editor)?.stopCapturing()
      element.hidden = false
      const owner = editingProvider(editor) || formOwner(editor)
      if (owner)
        panel.trackRecovery(owner, {
          kind: 'band',
          root: editorRoot(editor) || { kind: 'body' },
          path: nodePath(editor, target.from),
          offset: nodeOffset(editor, target.from),
          range: { from: target.from, to: target.to },
          placement: 'text',
          original: state.doc.slice(target.from, target.to).toJSON(),
        })
      panel.focus()
      place()
      return {
        get range() {
          return session.target
        },
        current: () => active === session && session.valid,
        open: () => active === session,
        pending: (pending: boolean) => {
          session.pending = pending
        },
      }
    },
  }
}
