import type { Editor } from '@tiptap/core'
import { yUndoPlugin, ySyncPluginKey, yUndoPluginKey, undo, redo } from '@tiptap/y-tiptap'
import { Plugin, Selection, type EditorState } from '@tiptap/pm/state'
import type { UndoManager } from 'yjs'
import type { Provider } from './provider'
import { bindEditingContext } from './editing-context'
import { restoreHistorySelection } from './history-selection'

const zones = new WeakMap<Provider, Map<Editor, { editable: boolean }>>()
const owners = new WeakMap<Editor, Provider>()
const sharedOwners = new WeakMap<Editor, Editor>()
/** Private rich fields share their draft history, without becoming native document views. */
export const bindSharedHistory = (editor: Editor, owner: Editor) => sharedOwners.set(editor, owner)
export const editingProvider = (editor: Editor) => owners.get(editor)
/** A native-bound zone has NO Yjs UndoManager; all its entry points use Rust. */
export function bindEditingHistory(editor: Editor, provider: Provider) {
  owners.set(editor, provider)
  bindEditingContext(editor, provider)
  let entries = zones.get(provider)
  if (!entries) {
    entries = new Map()
    zones.set(provider, entries)
    let focused: Editor | undefined
    provider.onHistorySelection = (state) => {
      if (focused && !focused.isDestroyed) restoreHistorySelection(focused, state)
    }
    provider.onHistoryLock = (locked) => {
      if (locked) {
        focused = [...entries!.keys()].find((zone) => !zone.isDestroyed && zone.view.hasFocus())
      } else if (
        focused &&
        !focused.isDestroyed &&
        entries!.get(focused)?.editable &&
        focused.view.hasFocus()
      ) {
        // A fast lock may leave WebKit's activeElement in place even though its
        // native text input is no longer active. Refocusing must be a real change.
        focused.view.dom.blur()
      }
      for (const [zone, state] of entries!) {
        if (zone.isDestroyed) continue
        if (locked) state.editable = zone.isEditable
        zone.setEditable(locked ? false : state.editable, false)
      }
      if (
        !locked &&
        focused &&
        !focused.isDestroyed &&
        (document.activeElement === document.body || document.activeElement === focused.view.dom)
      )
        focused.view.focus()
    }
  }
  entries.set(editor, { editable: editor.isEditable })
  editor.on('destroy', () => entries!.delete(editor))
}
export function historyFor(editor: Editor) {
  while (sharedOwners.has(editor)) editor = sharedOwners.get(editor)!
  const provider = owners.get(editor)
  if (!provider) return yUndoPluginKey.getState(editor.state)?.undoManager
  return {
    stopCapturing: () => provider.stopCapturing(),
    clear: () => {
      void provider.clearHistory().catch(provider.onError)
    },
    undo: () => {
      void provider.history('undo').catch(provider.onError)
    },
    redo: () => {
      void provider.history('redo').catch(provider.onError)
    },
    get undoStack() {
      return { length: Number(provider.canHistory()) }
    },
    get redoStack() {
      return { length: Number(provider.canHistory(true)) }
    },
  }
}

const exactSelections = Symbol('private-field-selections')
type FieldSelection = Pick<EditorState, 'doc' | 'selection' | 'storedMarks'>

/** Reuse Y-Tiptap's relative selection protocol without owning/destroying its
 * manager. Each private field contributes its binding's selection to stack items.
 */
export function sharedHistorySelection(manager: UndoManager) {
  type Event = { stackItem: UndoManager['undoStack'][number] }
  const upstream = yUndoPlugin({ undoManager: manager })
  let previous: FieldSelection | undefined
  return new Plugin({
    ...upstream.spec,
    state: {
      ...upstream.spec.state!,
      apply: (tr, value, oldState, state) => {
        previous = {
          doc: oldState.doc,
          selection: oldState.selection,
          storedMarks: oldState.storedMarks,
        }
        return upstream.spec.state!.apply(tr, value, oldState, state)
      },
    },
    view: (view) => {
      const binding = ySyncPluginKey.getState(view.state)?.binding
      const added = ({ stackItem }: Event) => {
        if (!binding) return
        stackItem.meta.set(binding, yUndoPluginKey.getState(view.state)?.prevSel)
        let exact = stackItem.meta.get(exactSelections) as Map<object, FieldSelection> | undefined
        if (!exact) stackItem.meta.set(exactSelections, (exact = new Map()))
        if (previous) exact.set(binding, previous)
      }
      const popped = ({ stackItem }: Event) => {
        if (binding)
          binding.beforeTransactionSelection =
            stackItem.meta.get(binding) || binding.beforeTransactionSelection
      }
      manager.on('stack-item-added', added)
      manager.on('stack-item-popped', popped)
      return {
        destroy() {
          manager.off('stack-item-added', added)
          manager.off('stack-item-popped', popped)
        },
      }
    },
  })
}

/** Private fields have a frozen local base. On an exact restored document use
 * its exact selection; concurrent changes keep Y-Tiptap's relative restoration.
 */
export function changeSharedHistory(editor: Editor, forward: boolean) {
  const manager = yUndoPluginKey.getState(editor.state)?.undoManager as UndoManager | undefined
  const item = (forward ? manager?.redoStack : manager?.undoStack)?.at(-1)
  const binding = ySyncPluginKey.getState(editor.state)?.binding
  const exact = item?.meta.get(exactSelections)?.get(binding) as FieldSelection | undefined
  const changed = forward ? redo(editor.state) : undo(editor.state)
  if (changed && exact?.doc.eq(editor.state.doc))
    editor.view.dispatch(
      editor.state.tr
        .setSelection(Selection.fromJSON(editor.state.doc, exact.selection.toJSON()))
        .setStoredMarks(exact.storedMarks),
    )
  return changed
}
