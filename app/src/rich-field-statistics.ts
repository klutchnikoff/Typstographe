import type { Editor } from '@tiptap/core'
import type { Transport } from './provider'

/** Private field counters use the same Rust Unicode rules as document statistics. */
export function richFieldStatistics(
  editor: Editor,
  heading: HTMLElement,
  label: string,
  transport: Pick<Transport, 'invoke'>,
) {
  let ticket = 0,
    previous: string | undefined
  const refresh = () => {
    const text = editor.state.doc.textBetween(0, editor.state.doc.content.size, '\n', '\n')
    if (text === previous) return
    previous = text
    const current = ++ticket
    void transport
      .invoke<{ field_label: string }>('count_text', {
        text,
        selection: null,
        fieldLabel: label,
      })
      .then((result) => {
        if (current === ticket) heading.textContent = result.field_label
      })
      .catch(() => {
        if (current !== ticket) return
        heading.textContent = label
        previous = undefined
      })
  }
  editor.on('update', refresh)
  editor.on('destroy', () => {
    ticket++
    editor.off('update', refresh)
  })
  refresh()
}
