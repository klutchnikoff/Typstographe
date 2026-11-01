import type { Editor } from '@tiptap/core'
import type { Bootstrap, Provider, Transport } from './provider'
import { ParagraphSelection } from './paragraph-selection'

/** Actual desktop WebView, native menus and IPC; never loaded in a normal build. */
export async function paragraphInputDiagnostic(
  mode: string,
  transport: Transport,
  provider: Provider,
  editor: Editor,
) {
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
  const report: { success: boolean; cases: unknown[]; error?: string } = {
    success: false,
    cases: [],
  }
  let navigating = false
  let openingGeneration: string | undefined
  const state = () => ({
    selection: editor.state.selection.toJSON(),
    parent: editor.state.selection.$from.parent.type.name,
    offset: editor.state.selection.$from.parentOffset,
    editable: editor.isEditable,
    composing: editor.view.composing,
    providerComposing: provider.composing,
    historyBusy: provider.historyBusy,
    inert: !!editor.view.dom.closest('[inert]'),
    focused: editor.view.hasFocus(),
    rejected: provider.rejected,
    message: document.getElementById('message')?.textContent,
  })
  const log = (phase: string, detail: unknown) =>
    transport.invoke('diagnostic_event', {
      target: provider.id,
      step: 'progress',
      payload: { phase, detail },
    })
  try {
    const bootstrap = await transport.invoke<Bootstrap>('join')
    if (!bootstrap.filePath) {
      navigating = true
      openingGeneration = bootstrap.generation
      await transport.invoke('open_file', {
        path: bootstrap.sessionPath + '/input.typsto',
        revision: provider.revision,
      })
      return
    }
    await wait(300)
    await provider.flush()
    for (const test of ['enter-at-end', 'backspace-at-start', 'backspace-at-separator']) {
      await provider.clearHistory()
      let index = -1,
        start = -1
      editor.state.doc.forEach((node, pos, at) => {
        if (index < 0 && node.type.name === 'paragraph' && node.content.size) {
          index = at
          start = pos
        }
      })
      const first = editor.state.doc.child(index)
      const secondText = editor.state.doc.child(index + 1).textContent
      const target =
        test === 'enter-at-end' ? start + first.nodeSize - 1 : start + first.nodeSize + 1
      editor.commands.setTextSelection(target)
      editor.view.focus()
      if (test === 'backspace-at-separator')
        editor.view.dispatch(
          editor.state.tr.setSelection(
            new ParagraphSelection(editor.state.doc.resolve(start + first.nodeSize)),
          ),
        )
      // Unlike the old browser recipes, let the native focus/selection settle.
      await wait(700)
      const before = state()
      const beforeDocument = editor.state.doc
      const key = test === 'enter-at-end' ? 'Enter' : 'Backspace'
      let event:
        | { key: string; code: string; keyCode: number; isComposing: boolean; isTrusted: boolean }
        | undefined
      const observed = (value: KeyboardEvent) => {
        event = {
          key: value.key,
          code: value.code,
          keyCode: value.keyCode,
          isComposing: value.isComposing,
          isTrusted: value.isTrusted,
        }
      }
      editor.view.dom.addEventListener('keydown', observed, { once: true, capture: true })
      if (mode.endsWith('-manual')) {
        document.getElementById('message')!.textContent =
          `Native input test: ${test} — press ${key}`
        await log('await-native-key', { test, key, before })
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('No physical key received')), 60000)
          editor.view.dom.addEventListener(
            'keydown',
            () => {
              clearTimeout(timeout)
              resolve()
            },
            { once: true },
          )
        })
      } else
        editor.view.dom.dispatchEvent(
          new KeyboardEvent('keydown', {
            key,
            code: key === 'Enter' ? 'Enter' : 'Backspace',
            keyCode: key === 'Enter' ? 13 : 8,
            bubbles: true,
            cancelable: true,
          }),
        )
      await wait(150)
      await provider.flush()
      const after = state()
      const changed =
        test === 'enter-at-end'
          ? editor.state.doc.child(index).lastChild?.type.name === 'softBreak'
          : editor.state.doc.child(index).textContent === first.textContent + secondText
      const result = { test, changed, before, event, after, document: editor.getJSON() }
      report.cases.push(result)
      await log('case', result)
      if (!changed) throw new Error(`Native input did not apply: ${test}`)
      if (test !== 'backspace-at-separator' && !beforeDocument.eq(editor.state.doc)) {
        await provider.history('undo')
        await wait(100)
      }
    }
    report.success = true
  } catch (error) {
    // Opening an archive reloads the WebView; the obsolete invocation may be refused.
    if (navigating) {
      const current = await transport.invoke<Bootstrap>('join').catch(() => null)
      if (current?.opened && current.generation !== openingGeneration) return
      navigating = false
    }
    report.error = String(error)
    await log('failed', {
      error: String(error),
      stack: error instanceof Error ? error.stack : null,
      state: state(),
    })
  } finally {
    if (!navigating) await transport.invoke('diagnostic_finish', { report })
  }
}
