import type { Registry } from './commands'
import { commandEditor } from './command-context'
import { interactionAvailability, unlinkAvailability } from './command-availability'
import { runFormatting } from './formatting'
import { tr } from './i18n'
import { navigateSpelling } from './proofing'
import { navigateSearch } from './search-panel'
import type { ShellContext } from './shell-context'
import type { ShellMetadata } from './shell-metadata'
import type { SidePanels } from './shell-panels'
import type { ShellPreferences } from './shell-preferences'
import { settingsFor } from './state'

/** Shell commands that only make sense while a document is shown. */
export const DOCUMENT_COMMANDS = [
  'ui.versions',
  'ui.document',
  'document.save',
  'document.save_as',
  'document.export',
  'document.close',
  'ui.find',
  'find.next',
  'find.previous',
  'text.clear',
  'text.unlink',
  'spelling.next',
  'spelling.previous',
  'spelling.reset',
  'ui.information',
]

export type ShellCommands = ReturnType<typeof shellCommands>

/** Registers shell commands, disabled on the welcome screen when they need a document. */
export function shellCommands(commands: Registry, active: () => boolean) {
  const requiresDocument = new Set(DOCUMENT_COMMANDS)
  const add = (id: string, label: string, run: () => void, shortcut?: string) =>
    commands.set(id, {
      id,
      label,
      run,
      shortcut,
      enabled: () => !requiresDocument.has(id) || active(),
    })
  return { requiresDocument, add }
}

/** Interface, editing, proofing and synchronization commands of the shell. */
export function registerInterfaceCommands(
  ctx: ShellContext,
  { add, requiresDocument }: ShellCommands,
  panels: SidePanels,
  preferences: ShellPreferences,
  metadata: ShellMetadata,
) {
  const { editor, provider, transport, commands } = ctx
  add('ui.preferences', tr('Préférences'), preferences.show, 'Mod+,')
  add(
    'ui.sidebar_labels',
    tr('Afficher / masquer les libellés de la barre latérale'),
    preferences.toggleSidebarLabels,
  )
  add('ui.palette', tr('Palette de commandes'), panels.palette, 'Mod+Shift+P')
  add('ui.find', tr('Rechercher et remplacer'), panels.search, 'Mod+F')
  add(
    'find.next',
    tr('Occurrence suivante'),
    () => {
      navigateSearch(editor)
    },
    'Mod+G',
  )
  add(
    'find.previous',
    tr('Occurrence précédente'),
    () => {
      navigateSearch(editor, true)
    },
    'Mod+Shift+G',
  )
  add('text.clear', tr('Effacer la mise en forme'), () => {
    runFormatting(commandEditor(editor), 'text.clear')
  })
  add('text.unlink', tr('Supprimer le lien'), () => {
    runFormatting(commandEditor(editor), 'text.remove_link')
  })
  for (const [id, availability] of [
    ['text.clear', () => interactionAvailability(commandEditor(editor), 'style')],
    ['text.unlink', () => unlinkAvailability(commandEditor(editor))],
  ] as const) {
    const original = commands.get(id)!
    commands.set(id, {
      ...original,
      availability,
    })
  }
  add(
    'spelling.toggle',
    tr('Activer / désactiver la correction orthographique'),
    preferences.toggleSpelling,
  )
  add('spelling.next', tr('Erreur suivante'), () => {
    navigateSpelling(editor)
  })
  add('spelling.previous', tr('Erreur précédente'), () => {
    navigateSpelling(editor, true)
  })
  add('spelling.reset', tr('Réexaminer les mots ignorés'), () =>
    metadata.editor.set(
      { kind: 'option', name: 'spelling_ignored' },
      {},
      () => settingsFor(provider).metadata.fields.options.spelling_ignored,
    ),
  )
  add('ui.information', tr('Paramètres du document'), metadata.toggleInformation)
  preferences.trackEditorWidth()
  for (const [id, enabled, label] of [
    ['synchronization.enable', true, tr('Activer la synchronisation')],
    ['synchronization.disable', false, tr('Arrêter la synchronisation')],
  ] as const) {
    requiresDocument.add(id)
    commands.set(id, {
      id,
      label,
      enabled: () =>
        ctx.state.active &&
        provider.online &&
        !provider.rejected &&
        !provider.synchronizationBusy &&
        !!provider.synchronization &&
        provider.synchronization.enabled !== enabled &&
        (enabled || provider.synchronization.windows.length < 2),
      run: () =>
        ctx.guarded(async () => {
          try {
            await provider.setSynchronization(enabled)
          } catch (error) {
            if (String(error) === 'synchronization_other_windows')
              throw new Error(tr('Fermez les autres fenêtres avant d’arrêter la synchronisation.'))
            throw error
          }
        }),
    })
  }
  add('ui.peer', tr('Deuxième fenêtre'), () => ctx.guarded(() => transport.invoke('open_peer')))
  add('ui.connection', tr('Connexion / déconnexion'), () =>
    ctx.guarded(async () => {
      if (provider.online) await provider.disconnect()
      else await provider.reconnect()
    }),
  )
}
