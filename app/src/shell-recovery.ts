import { tr } from './i18n'
import { privateRecovery } from './private-recovery'
import { recoveryTransitions } from './recovery-transition'
import type { ShellCommands } from './shell-commands'
import type { ShellContext } from './shell-context'
import type { ShellDocuments } from './shell-documents'
import { byId } from './shell-layout'
import type { SidePanels } from './shell-panels'
import { workList, type WorkEntry } from './work-list'

export type ShellRecovery = ReturnType<typeof shellRecovery>

/** Private work recovery: the welcome screen list, restore, import, and the recorder. */
export function shellRecovery(
  ctx: ShellContext,
  welcome: HTMLElement,
  panels: SidePanels,
  documents: ShellDocuments,
) {
  const { editor, provider, transport, state } = ctx
  const resumeWork = (entry: WorkEntry) =>
    documents.confirmDiscard(() =>
      ctx.guarded(() =>
        ctx.switchDocument((revision) =>
          transport.invoke('work_restore', { id: entry.id, revision }),
        ),
      ),
    )
  const home = document.createElement('section')
  home.className = 'recovery-home'
  const heading = document.createElement('h2')
  heading.textContent = tr('Travail à reprendre')
  const list = document.createElement('div')
  home.append(heading, list)
  welcome.querySelector('.welcome-card')!.append(home)
  const refresh = async () => {
    if (!provider.nativeEditing) return
    await workList(list, transport, resumeWork, ctx.reportError)
    home.hidden = list.hidden
  }
  const show = () =>
    ctx.guarded(async () => {
      if (state.active)
        await workList(
          panels.show(tr('Travail à reprendre'), 'recovery.list'),
          transport,
          resumeWork,
          ctx.reportError,
        )
      else await refresh()
    })
  const importWork = () =>
    ctx.guarded(async () => {
      const selected = await transport.invoke<string | null>('choose_work_file', { save: false })
      if (selected)
        documents.confirmDiscard(() =>
          ctx.guarded(() =>
            ctx.switchDocument((revision) =>
              transport.invoke('work_import', { path: selected, revision }),
            ),
          ),
        )
    })
  return {
    refresh,
    registerList({ add }: ShellCommands) {
      add('recovery.list', tr('Travail à reprendre'), show)
      byId('resume-document').onclick = show
    },
    registerImport({ add }: ShellCommands) {
      add('recovery.import', tr('Ouvrir un brouillon de secours…'), importWork)
    },
    /** The welcome screen counterpart of `recovery.import`. */
    mountImportButton() {
      const button = document.createElement('button')
      button.textContent = tr('Ouvrir un brouillon de secours…')
      button.onclick = importWork
      home.append(button)
    },
    /** Starts recording private drafts and guarding document switches (native editing). */
    async start() {
      state.recovery = provider.nativeEditing
        ? privateRecovery(editor, provider, () => state.active, ctx.reportError)
        : undefined
      if (provider.nativeEditing) state.transitions = await recoveryTransitions(provider, transport)
      if (state.active && !state.path) state.recovery?.changed()
    },
  }
}
