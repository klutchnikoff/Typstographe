import type { Editor } from '@tiptap/core'
import type { Transport } from './provider'

/** Count only changed visible content; late replies must never replace newer counts. */
export function documentStatistics(transport: Pick<Transport, 'invoke'>, output: HTMLElement) {
  let ticket = 0,
    stopped = false,
    previous: { text: string; selection: string | null; locale: string } | undefined
  const leaf = (node: import('@tiptap/pm/model').Node) =>
    node.type.name === 'footnote'
      ? `\n${node.attrs.text || ''}\n`
      : node.type.name === 'softBreak'
        ? '\u2028'
        : '\n'
  return {
    refresh(editor: Editor) {
      if (stopped) return
      const text = editor.state.doc.textBetween(0, editor.state.doc.content.size, '\n', leaf)
      const { from, to, empty } = editor.state.selection
      const selection = empty ? null : editor.state.doc.textBetween(from, to, '\n', leaf)
      const locale = document.documentElement.lang
      if (previous?.text === text && previous.selection === selection && previous.locale === locale)
        return
      previous = { text, selection, locale }
      const current = ++ticket
      void transport
        .invoke<{ label: string; hint: string }>('count_text', { text, selection })
        .then((counts) => {
          if (current !== ticket || stopped) return
          output.textContent = counts.label
          output.title = counts.hint
        })
        .catch(() => {
          if (current === ticket) previous = undefined
        })
    },
    stop() {
      stopped = true
      ticket++
    },
  }
}
