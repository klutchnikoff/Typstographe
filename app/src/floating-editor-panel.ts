import type { Editor } from '@tiptap/core'
import { TextSelection, type SelectionBookmark, type Transaction } from '@tiptap/pm/state'
import type { ContextPanel } from './context-panel'
import { editingProvider, historyFor } from './editing-history'
import { focusEditorSelection } from './editor-focus'
import { placePopover, unchangedRange, type EditorRange } from './editor-popover'
import { editorRoot, nodeOffset, nodePath } from './editor-targets'
import { formOwner } from './form-drafts'
import { editingAvailability } from './command-availability'
import { dispatchImmediateEdit } from './immediate-edit'
import type { SelectorTrigger } from './inline-selector-input'
import { composing } from './keyboard-navigation'
import { tr } from './i18n'
import './floating-editor-panel.css'

interface FloatingTarget extends EditorRange {
  object?: boolean
  trigger?: SelectorTrigger
}
const openPanels = new WeakMap<Editor, () => void>()

export function floatingEditorPanel(editor: Editor, host: HTMLElement, panel: ContextPanel) {
  const { element } = panel
  element.classList.add('floating-editor-panel')
  element.setAttribute('role', 'dialog')
  const hint = document.createElement('div')
  hint.id = `${element.id}-literal-hint`
  hint.className = 'floating-literal-hint'
  hint.hidden = true
  panel.error.before(hint)
  host.append(element)
  const controller = new AbortController()
  const { signal } = controller
  let active:
    | {
        target: FloatingTarget
        bookmark: SelectionBookmark
        pending: boolean
        valid: boolean
        literal: boolean
      }
    | undefined

  function close(restore = false, committed = false) {
    const previous = active
    if (!previous) return
    active = undefined
    openPanels.delete(editor)
    element.hidden = true
    hint.hidden = true
    element.removeAttribute('aria-describedby')
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
    if (!active || !(event.target instanceof Element) || element.contains(event.target)) return
    const dialog = event.target.closest('dialog[open]')
    if (!dialog || dialog.contains(element)) close()
  }
  function engage() {
    if (!active?.literal) return
    active.literal = false
    hint.hidden = true
    element.removeAttribute('aria-describedby')
  }
  const searchInput = (target: EventTarget | null) =>
    target instanceof HTMLInputElement && target.matches('input[data-initial-focus]')
  element.addEventListener('input', engage, { capture: true, signal })
  element.addEventListener(
    'click',
    (event) => {
      if (
        event.target instanceof Element &&
        event.target.closest('button, input, select') &&
        !searchInput(event.target)
      )
        engage()
    },
    { capture: true, signal },
  )
  element.addEventListener(
    'keydown',
    (event) => {
      if (
        !active?.literal ||
        !searchInput(event.target) ||
        composing(event) ||
        event.altKey ||
        event.metaKey ||
        event.ctrlKey
      )
        return
      if (
        (!event.shiftKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) ||
        (event.shiftKey && event.key === 'Enter')
      ) {
        engage()
        return
      }
      if (event.key !== 'Enter' || panel.composing) return
      event.preventDefault()
      event.stopPropagation()
      if (!active.valid || !editingAvailability(editor).enabled) return
      const { from, to, trigger } = active.target
      if (!trigger) return
      const transaction = editor.state.tr.insertText(trigger, from, to)
      transaction.setSelection(TextSelection.create(transaction.doc, from + trigger.length))
      active.pending = true
      if (dispatchImmediateEdit(editor, transaction)) close(true, true)
      else active.pending = false
    },
    { capture: true, signal },
  )
  document.addEventListener('pointerdown', dismissOutside, { capture: true, signal })
  document.addEventListener('focusin', dismissOutside, { signal })
  document.addEventListener('scroll', place, { capture: true, signal })
  window.addEventListener('resize', place, { signal })
  const observer = new ResizeObserver(place)
  observer.observe(element)
  editor.on('transaction', transaction)
  editor.on('destroy', () => {
    if (active) openPanels.delete(editor)
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
      openPanels.get(editor)?.()
      const state = editor.state
      active = {
        target,
        bookmark: target.object
          ? TextSelection.create(state.doc, target.to).getBookmark()
          : state.selection.getBookmark(),
        pending: false,
        valid: true,
        literal: !!target.trigger,
      }
      const session = active
      openPanels.set(editor, close)
      historyFor(editor)?.stopCapturing()
      hint.textContent = target.trigger ? `↵ ${tr('Insérer')} ${target.trigger}` : ''
      hint.hidden = !target.trigger
      if (target.trigger) element.setAttribute('aria-describedby', hint.id)
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
