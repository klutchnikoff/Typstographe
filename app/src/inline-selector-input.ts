import type { Editor } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import type { Registry } from './commands'
import { commandAvailability } from './public-commands'

export type SelectorTrigger = '@@' | '&&'
export const inlineSelectorInputKey = new PluginKey('inlineSelectorInput')

/** A single sign is ordinary text. Only a second typed sign at the same caret
 * consumes it, so pasted text and a caret moved next to old text stay literal. */
export function bindInlineSelectorInput(
  editor: Editor,
  commands: Registry,
  open: (trigger: SelectorTrigger) => boolean,
) {
  let first: { sign: '@' | '&'; end: number } | undefined
  const reset = () => {
    first = undefined
    return false
  }
  editor.on('transaction', ({ transaction }) => {
    if (transaction.docChanged || transaction.selectionSet || transaction.storedMarksSet) reset()
  })
  editor.registerPlugin(
    new Plugin({
      key: inlineSelectorInputKey,
      props: {
        handleDOMEvents: {
          pointerdown: reset,
          blur: reset,
          compositionstart: reset,
          paste: reset,
          keydown: (_view, event) => {
            if (
              first &&
              event.key !== first.sign &&
              !['Shift', 'Control', 'Alt', 'AltGraph', 'Meta'].includes(event.key)
            )
              reset()
            return false
          },
        },
        handleTextInput(view, from, to, sign, insert) {
          const previous = first
          reset()
          if (sign !== '@' && sign !== '&') return false
          const command = commands.get(sign === '@' ? 'insert.citation' : 'insert.reference')
          const { selection, storedMarks } = view.state
          if (
            !command ||
            view.composing ||
            !(selection instanceof TextSelection) ||
            !selection.empty ||
            from !== to ||
            selection.from !== from ||
            selection.$from.parent.type.spec.code ||
            !commandAvailability(command).enabled
          )
            return false
          if (previous?.sign === sign && previous.end === from) {
            const marks = storedMarks ?? selection.$from.marks()
            // The sign was typed literally, but it is now part of the shortcut.
            // Do not capture its removal as an undoable edit that could bring it back.
            view.dispatch(
              view.state.tr
                .delete(from - 1, from)
                .setStoredMarks(marks)
                .setMeta(inlineSelectorInputKey, 'consume')
                .setMeta('addToHistory', false),
            )
            const trigger = sign === '@' ? '@@' : '&&'
            if (!open(trigger)) view.dispatch(view.state.tr.insertText(trigger).scrollIntoView())
          } else {
            view.dispatch(insert().setMeta(inlineSelectorInputKey, 'start'))
            const end = view.state.selection.from
            if (
              end > 0 &&
              view.state.selection.empty &&
              view.state.doc.textBetween(end - 1, end) === sign
            )
              first = { sign, end }
          }
          return true
        },
      },
    }),
  )
}
