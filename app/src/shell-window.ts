import { getCurrentWindow } from '@tauri-apps/api/window'
import { runCommand } from './public-commands'
import type { ShellContext } from './shell-context'
import type { ShellDocuments } from './shell-documents'

/** Window close requests, native menu commands, IME state and document replacement. */
export async function mountWindowEvents(ctx: ShellContext, documents: ShellDocuments) {
  const { provider, transport, commands, state, options } = ctx
  const closeView = () =>
    documents.confirmDiscard(() =>
      ctx.guarded(async () => {
        if (options.isTauri) {
          if (state.disposition === 'discard')
            await transport.invoke('work_abandon', { generation: provider.generation })
          else await state.recovery?.force()
          await getCurrentWindow().destroy()
        } else
          await ctx.switchDocument((revision) => transport.invoke('close_document', { revision }))
      }),
    )
  await transport.listen<{ window: string }>('app:request-close', (value) => {
    if (value.window === provider.id) closeView()
  })
  if (options.isTauri) {
    for (const [event, composing] of [
      ['compositionstart', true],
      ['compositionend', false],
    ] as const)
      document.addEventListener(
        event,
        () => {
          void transport.invoke('agent_input', { composing })
        },
        true,
      )
    if (!options.diagnostic)
      await getCurrentWindow().onCloseRequested((event) => {
        event.preventDefault()
        closeView()
      })
    await transport.listen<string>('app:command', (id) => {
      if (document.querySelector('dialog[open]')) return
      const command = commands.get(id)
      if (command) runCommand(command)
    })
  }
  await transport.listen('app:document', () => {
    state.recovery?.stop()
    window.location.reload()
  })
}
