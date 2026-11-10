import type { PublicCommand, Registry } from './commands'
import { tr } from './i18n'
import { commandAvailability, runCommand } from './public-commands'
import { richZoneOwnsShortcut } from './rich-zone'
import { railButton } from './side-rail'

/** The command shortcut notation (`Mod+Shift+S`) of a key press. */
export const shortcutKey = (event: Pick<KeyboardEvent, 'shiftKey' | 'key'>) =>
  `Mod+${event.shiftKey ? 'Shift+' : ''}${event.key.length === 1 ? event.key.toUpperCase() : event.key}`

/** Text fields keep their own undo and object shortcuts. */
export function fieldOwnsShortcut(target: EventTarget | null, command: Pick<PublicCommand, 'id'>) {
  return (
    (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) &&
    (['context.open', 'block.remove'].includes(command.id) || command.id.startsWith('history.'))
  )
}

/** The File, Edit and View menus of the window header (hidden on macOS). */
export function mountToolMenus(menu: HTMLElement, commands: Registry) {
  for (const [title, ids] of [
    [
      tr('Fichier'),
      [
        'document.new',
        'document.open',
        'document.save',
        'document.save_as',
        'document.export',
        'document.close',
      ],
    ],
    [
      tr('Édition'),
      [
        'history.undo',
        'history.redo',
        'ui.find',
        'find.next',
        'find.previous',
        'text.clear',
        'text.unlink',
        'spelling.toggle',
        'ui.palette',
      ],
    ],
    [
      tr('Affichage'),
      [
        'ui.versions',
        'ui.preferences',
        'ui.peer',
        'synchronization.enable',
        'synchronization.disable',
        'ui.connection',
      ],
    ],
  ] as const) {
    const details = document.createElement('details')
    details.className = 'tool-menu'
    const summary = document.createElement('summary')
    summary.textContent = title
    summary.setAttribute('role', 'button')
    const entries = document.createElement('div')
    entries.className = 'tool-menu-content'
    for (const id of ids) {
      const command = commands.get(id)!
      const button = document.createElement('button')
      button.textContent = command.label
      button.dataset.command = id
      button.onclick = () => {
        details.open = false
        if (id === 'ui.palette') summary.focus({ preventScroll: true })
        runCommand(command)
      }
      entries.append(button)
    }
    details.append(summary, entries)
    menu.append(details)
  }
}

/** Appends commands registered after the menus were built to the first (File) menu. */
export function appendMenuCommands(menu: HTMLElement, commands: Registry, ids: string[]) {
  for (const id of ids) {
    const button = document.createElement('button')
    button.textContent = commands.get(id)!.label
    button.dataset.command = id
    button.onclick = () => {
      menu.querySelectorAll('details').forEach((item) => (item.open = false))
      runCommand(commands.get(id)!)
    }
    menu.querySelector('.tool-menu-content')?.append(button)
  }
}

export function mountRailButtons(side: HTMLElement, commands: Registry) {
  for (const [label, name, action] of [
    [tr('Commandes'), 'wrench', 'ui.palette'],
    [tr('Rechercher'), 'search', 'ui.find'],
    [tr('Versions'), 'history', 'ui.versions'],
    [tr('Préférences'), 'settings-2', 'ui.preferences'],
  ] as const) {
    const opensPalette = action === 'ui.palette'
    const button = railButton(label, name, opensPalette ? undefined : action)
    if (opensPalette) button.setAttribute('aria-haspopup', 'dialog')
    button.dataset.command = action
    button.onclick = () => {
      // WebKit does not consistently focus a button when it is clicked.
      if (opensPalette) button.focus({ preventScroll: true })
      runCommand(commands.get(action)!)
    }
    side.append(button)
  }
}

/** Runs the enabled command bound to a `Mod+…` shortcut, before any editor handler. */
export function installShortcuts(commands: Registry) {
  document.addEventListener(
    'keydown',
    (event) => {
      if (document.querySelector('dialog[open]')) return
      if (event.isComposing) return
      if (!(event.metaKey || event.ctrlKey)) return
      const key = shortcutKey(event)
      for (const command of commands.values())
        if (command.shortcut === key && commandAvailability(command).enabled) {
          // Named rich zones own their text shortcuts and share the same undo owner.
          // Let their editor receive the key instead of focusing the document body.
          if (richZoneOwnsShortcut(event.target, command.id)) return
          if (fieldOwnsShortcut(event.target, command)) return
          event.preventDefault()
          event.stopImmediatePropagation()
          runCommand(command)
          return
        }
    },
    true,
  )
}
