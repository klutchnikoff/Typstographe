import type { Editor } from '@tiptap/core'
import type { SelectionBookmark } from '@tiptap/pm/state'

/** Restore the documentary caret before synchronizing the DOM selection.
 * In particular, WebKit ignores scrolling while its selection is still in a form.
 * Keep this synchronous: a deferred focus could overwrite later user navigation.
 */
export function focusEditorSelection(editor: Editor, bookmark?: SelectionBookmark) {
  if (editor.isDestroyed || editor.view.composing) return
  if (bookmark) {
    const selection = bookmark.resolve(editor.state.doc)
    if (!selection.eq(editor.state.selection))
      editor.view.dispatch(editor.state.tr.setSelection(selection))
  }
  editor.view.focus()
  editor.commands.scrollIntoView()
}
