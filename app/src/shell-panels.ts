import { openCommandPalette } from './command-palette'
import { commandEditor } from './command-context'
import { keyboardScope } from './keyboard-navigation'
import { tr } from './i18n'
import { searchState } from './proofing'
import { runCommand } from './public-commands'
import { searchPanel } from './search-panel'
import type { ShellContext } from './shell-context'
import { byId, type ShellLayout } from './shell-layout'
import { sideRailMode } from './side-rail'
import type { versionsPanel } from './versions-panel'

export type SidePanels = ReturnType<typeof sidePanels>

/**
 * Owns the side panel: only one view is shown at a time, and the views that hold
 * subscriptions (versions, recovered inputs) are released whenever it changes.
 */
export function sidePanels(ctx: ShellContext, layout: Pick<ShellLayout, 'side' | 'panel'>) {
  const { editor, commands } = ctx
  let versions: ReturnType<typeof versionsPanel> | undefined
  let releaseRecovered: (() => void) | undefined
  let releaseNavigation: (() => void) | undefined
  let section: string | undefined
  const release = () => {
    releaseNavigation?.()
    releaseNavigation = undefined
    versions?.destroy()
    versions = undefined
    releaseRecovered?.()
    releaseRecovered = undefined
    searchState(editor, '')
  }
  const close = () => {
    const trigger =
      section === 'ui.projects' || section === 'ui.document'
        ? layout.side.querySelector<HTMLButtonElement>(`[data-command="${section}"]`)
        : null
    release()
    section = undefined
    railMode.close()
    if (trigger && !trigger.disabled) trigger.focus({ preventScroll: true })
    else if (ctx.state.active) editor.commands.focus()
    else byId('create-document').focus()
  }
  const railMode = sideRailMode(layout.side, layout.panel, {
    toggle: () => runCommand(commands.get('ui.sidebar_labels')!),
    close,
    resized: (width) => {
      ctx.state.preferences.sidebar_width = width
      ctx.guarded(() => ctx.persistPreferences())
    },
  })
  byId('close-side').onclick = close
  keyboardScope(layout.panel, { close, priority: 10, tab: true })
  /** Opens the panel on `section` and returns its emptied content element. */
  function show(title: string, nextSection?: string) {
    release()
    section = nextSection
    railMode.show(section)
    byId('side-title').textContent = title
    const content = byId('side-content')
    content.replaceChildren()
    return content
  }
  return {
    railMode,
    close,
    show,
    adoptNavigation(cleanup: () => void) {
      releaseNavigation = cleanup
    },
    adoptVersions(panel: ReturnType<typeof versionsPanel>) {
      versions = panel
    },
    refreshVersions() {
      void versions?.refresh()
    },
    /** A document switch releases the views tied to the previous project. */
    dismissDocument() {
      if (['ui.document', 'ui.find', 'ui.assistance', 'ui.recovered'].includes(section || '')) {
        release()
        section = undefined
        railMode.close()
      }
    },
    adoptRecovered(next: () => void) {
      releaseRecovered = next
    },
    releaseRecovered() {
      releaseRecovered?.()
    },
    palette() {
      openCommandPalette(commands, () =>
        ctx.state.active ? commandEditor(editor).view.dom : byId('create-document'),
      )
    },
    search() {
      searchPanel(show(tr('Rechercher et remplacer'), 'ui.find'), editor)
    },
  }
}
