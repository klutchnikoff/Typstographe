import type { Editor } from '@tiptap/core'
import type { SelectionBookmark, Transaction } from '@tiptap/pm/state'
import { focusEditorSelection } from './editor-focus'
import { composing, keyboardScope, navigationGroup, visible } from './keyboard-navigation'
import { icon } from './icons'
import { placePopover, unchangedRange, type EditorRange } from './editor-popover'
import './object-menu.css'

export interface MenuExecution {
  range: EditorRange
  current: () => boolean
  dismiss: () => void
}
export interface ObjectAction {
  label: string
  checked?: boolean
  radio?: boolean
  disabled?: boolean
  danger?: boolean
  run: (execution: MenuExecution) => void | Promise<void>
}
export interface ObjectMenuGroup {
  label?: string
  note?: string
  actions: ObjectAction[]
}
interface MenuOptions {
  label: string
  range: EditorRange
  anchor: (range: EditorRange) => DOMRect | null
  origin?: (range: EditorRange) => HTMLElement | null
  closed?: () => void
}
export function contextMenuKey(event: KeyboardEvent) {
  return (
    !composing(event) &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))
  )
}
export function editorRangeRect(editor: Editor, range: EditorRange) {
  const domRange = document.createRange()
  const start = editor.view.domAtPos(range.from, 1)
  const end = editor.view.domAtPos(range.to, -1)
  domRange.setStart(start.node, start.offset)
  domRange.setEnd(end.node, end.offset)
  return domRange.getBoundingClientRect()
}

export function objectMenu(editor: Editor, host: HTMLElement, onError: (error: unknown) => void) {
  const root = document.createElement('div')
  root.id = 'object-menu'
  root.className = 'object-menu'
  root.setAttribute('role', 'menu')
  root.tabIndex = -1
  root.hidden = true
  host.append(root)
  const navigation = navigationGroup(root, { axis: 'vertical', roving: true, initial: false })
  const controller = new AbortController()
  const { signal } = controller
  let active:
    | {
        options: MenuOptions
        range: EditorRange
        bookmark: SelectionBookmark
        pending: boolean
        targetValid: boolean
      }
    | undefined
  function origin(session: NonNullable<typeof active>) {
    return (session.targetValid && session.options.origin?.(session.range)) || editor.view.dom
  }
  function close(restore = false, afterEdit = false) {
    const session = active
    if (!session) return
    active = undefined
    root.hidden = true
    root.removeAttribute('aria-busy')
    root.replaceChildren()
    const trigger = origin(session)
    if (trigger.matches('[aria-haspopup="menu"]')) trigger.setAttribute('aria-expanded', 'false')
    session.options.closed?.()
    if (restore && !editor.isDestroyed) {
      const trigger = origin(session)
      if (!afterEdit && trigger !== editor.view.dom && trigger.isConnected)
        trigger.focus({ preventScroll: true })
      else focusEditorSelection(editor, afterEdit ? undefined : session.bookmark)
    }
  }
  function position() {
    if (!active?.targetValid) return
    const anchor = active.options.anchor(active.range)
    if (!anchor || !visible(host) || !placePopover(root, anchor)) close()
  }
  function transaction({ transaction }: { transaction: Transaction }) {
    const session = active
    if (!session || !transaction.docChanged) return
    const before = session.range
    session.bookmark = session.bookmark.map(transaction.mapping)
    if (!session.targetValid) return
    const range = unchangedRange(transaction, before)
    if (!range) {
      session.targetValid = false
      // A pending command may be publishing the intended change itself.
      if (!session.pending) close(root.contains(document.activeElement))
      return
    }
    session.range = range
    position()
  }
  keyboardScope(root, { priority: 45, close: () => close(true) })
  root.addEventListener('keydown', (event) => {
    if (composing(event) || event.key !== 'Tab' || event.ctrlKey || event.metaKey || event.altKey)
      return
    const session = active
    if (!session) return
    const trigger = origin(session)
    const controls = [
      ...host.querySelectorAll<HTMLElement>(
        'button, input, select, textarea, a[href], summary, [tabindex], [contenteditable="true"]',
      ),
    ].filter(
      (item) =>
        !root.contains(item) &&
        visible(item) &&
        item.tabIndex >= 0 &&
        !item.matches(':disabled, [aria-disabled="true"]'),
    )
    const next = controls[controls.indexOf(trigger) + (event.shiftKey ? -1 : 1)]
    close(true)
    if (next && next !== trigger) {
      event.preventDefault()
      next.focus()
    }
  })
  document.addEventListener(
    'pointerdown',
    (event) => {
      if (!active || !(event.target instanceof Node) || root.contains(event.target)) return
      // The trigger itself decides whether a second click closes or retargets.
      if (active.options.origin?.(active.range)?.contains(event.target)) return
      close()
    },
    { capture: true, signal },
  )
  document.addEventListener(
    'focusin',
    (event) => {
      if (
        active &&
        event.target instanceof Node &&
        !root.contains(event.target) &&
        !origin(active).contains(event.target)
      )
        close()
    },
    { signal },
  )
  window.addEventListener('resize', position, { signal })
  document.addEventListener('scroll', position, { capture: true, signal })
  editor.on('transaction', transaction)
  editor.on('destroy', () => {
    active = undefined
    controller.abort()
    navigation.destroy()
    root.remove()
  })
  return {
    close,
    closeFrom(trigger: HTMLElement | null) {
      if (!trigger || !active || origin(active) !== trigger) return false
      close(true)
      return true
    },
    focus() {
      if (!active) return false
      if (!root.contains(document.activeElement)) navigation.focus()
      return true
    },
    open(options: MenuOptions) {
      close()
      const session = {
        options,
        range: options.range,
        bookmark: editor.state.selection.getBookmark(),
        pending: false,
        targetValid: true,
      }
      active = session
      root.setAttribute('aria-label', options.label)
      root.hidden = false
      const trigger = options.origin?.(options.range)
      if (trigger?.matches('[aria-haspopup="menu"]')) trigger.setAttribute('aria-expanded', 'true')
      const current = () => active === session
      const run = async (action: ObjectAction) => {
        if (!current() || session.pending || action.disabled) return
        session.pending = true
        root.setAttribute('aria-busy', 'true')
        try {
          await action.run({
            range: session.range,
            current: () => current() && session.targetValid,
            dismiss: () => close(),
          })
          if (current()) close(true, true)
        } catch (error) {
          if (current()) {
            close(true)
            onError(error)
          }
        }
      }
      function groupElement(group: ObjectMenuGroup) {
        const section = document.createElement('div')
        section.className = 'object-menu-group'
        if (group.label) {
          section.setAttribute('role', 'group')
          section.setAttribute('aria-label', group.label)
          const label = document.createElement('div')
          label.className = 'object-menu-label'
          label.setAttribute('aria-hidden', 'true')
          label.textContent = group.label
          section.append(label)
        }
        if (group.note) {
          const note = document.createElement('div')
          note.className = 'object-menu-label'
          note.setAttribute('role', 'status')
          note.textContent = group.note
          section.append(note)
        }
        for (const action of group.actions) {
          const button = document.createElement('button')
          button.type = 'button'
          button.textContent = action.label
          button.disabled = !!action.disabled
          button.classList.toggle('danger', !!action.danger)
          button.setAttribute(
            'role',
            action.radio
              ? 'menuitemradio'
              : action.checked === undefined
                ? 'menuitem'
                : 'menuitemcheckbox',
          )
          if (action.checked !== undefined)
            button.setAttribute('aria-checked', String(action.checked))
          if (action.checked) {
            const check = document.createElement('span')
            check.setAttribute('aria-hidden', 'true')
            check.innerHTML = icon('check')
            button.append(check)
          }
          button.onclick = () => void run(action)
          section.append(button)
        }
        return section
      }
      function firstAction() {
        const first = root.querySelector<HTMLButtonElement>('button:not(:disabled, .danger)')
        ;(first ?? root).focus({ preventScroll: true })
      }
      return {
        current,
        show(groups: ObjectMenuGroup[], waiting = false) {
          if (!current()) return
          root.replaceChildren(...groups.map(groupElement))
          position()
          navigation.refresh()
          if (!current()) return
          if (waiting) root.focus({ preventScroll: true })
          else firstAction()
        },
        updateFirstGroup(group: ObjectMenuGroup) {
          if (!current() || session.pending) return
          root.firstElementChild?.replaceWith(groupElement(group))
          position()
          navigation.refresh()
          if (current() && document.activeElement === root) firstAction()
        },
      }
    },
  }
}
export type ObjectMenu = ReturnType<typeof objectMenu>
