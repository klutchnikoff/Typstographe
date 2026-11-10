import { keyboardScope, navigationGroup, visible } from './keyboard-navigation'
import type { PublicCommand, Registry } from './commands'
import { returnFocusOnClose } from './dialog-focus'
import {
  commandAvailability,
  commandVisible,
  refreshCommandButton,
  runCommand,
} from './public-commands'
import { tr } from './i18n'

let nextId = 0

export function openCommandPalette(commands: Registry, fallbackFocus: () => HTMLElement) {
  const previous = document.activeElement
  const dialog = document.createElement('dialog')
  dialog.className = 'app-dialog command-palette-dialog'
  dialog.setAttribute('aria-label', tr('Palette de commandes'))
  const close = () => dialog.close()
  keyboardScope(dialog, { close, priority: 40, tab: true, tabLoop: true })
  returnFocusOnClose(dialog, () => {
    if (previous instanceof HTMLElement && previous !== document.body && visible(previous)) {
      if (previous instanceof HTMLButtonElement && previous.dataset.command) {
        // The background button may still reflect the modal policy until the next refresh.
        const command = commands.get(previous.dataset.command)
        if (command) refreshCommandButton(previous, command)
      }
      if (!previous.matches(':disabled')) return previous
    }
    return fallbackFocus()
  })
  document.body.append(dialog)
  dialog.showModal()
  const palette = commandPalette(dialog, commands, (command) => {
    close()
    runCommand(command)
  })
  dialog.addEventListener(
    'close',
    () => {
      palette.destroy()
      dialog.remove()
    },
    { once: true },
  )
}

/** The input owns focus; aria-activedescendant exposes the keyboard choice. */
export function commandPalette(
  content: HTMLElement,
  commands: Registry,
  execute: (command: PublicCommand) => void,
) {
  const input = document.createElement('input')
  input.className = 'command-palette-input'
  input.placeholder = tr('Rechercher une commande…')
  input.setAttribute('aria-label', tr('Rechercher une commande'))
  input.setAttribute('role', 'combobox')
  input.setAttribute('aria-autocomplete', 'list')
  input.setAttribute('aria-expanded', 'true')
  const results = document.createElement('div')
  results.className = 'command-palette-results'
  results.id = `command-palette-${++nextId}`
  results.setAttribute('role', 'listbox')
  results.setAttribute('aria-label', tr('Commandes'))
  input.setAttribute('aria-controls', results.id)
  const status = document.createElement('p')
  status.setAttribute('role', 'status')
  let rows: { command: PublicCommand; button: HTMLButtonElement }[] = []
  const navigation = navigationGroup(results, {
    axis: 'vertical',
    input,
    beforeNavigate: () => refreshAvailability(),
    onActivate: (button) => {
      const row = rows.find((row) => row.button === button)
      if (row && commandAvailability(row.command, 'palette').enabled) execute(row.command)
    },
  })
  const refreshAvailability = () => {
    rows.forEach(({ command, button }) => {
      refreshCommandButton(button, command, 'palette')
    })
  }
  const visibleCommands = () => [...commands.values()].filter(commandVisible)
  let displayed: PublicCommand[] = []
  const fill = () => {
    results.replaceChildren()
    rows = []
    const query = input.value.toLocaleLowerCase()
    displayed = visibleCommands()
    for (const command of displayed) {
      if (!command.label.toLocaleLowerCase().includes(query)) continue
      const button = document.createElement('button')
      button.type = 'button'
      button.id = `${results.id}-option-${rows.length}`
      button.tabIndex = -1
      button.setAttribute('role', 'option')
      button.textContent = command.label + (command.shortcut ? ` · ${command.shortcut}` : '')
      rows.push({ command, button })
      results.append(button)
    }
    refreshAvailability()
    status.textContent = rows.length ? '' : tr('Aucune commande ne correspond.')
    status.hidden = !!rows.length
    results.scrollTop = 0
    navigation.refresh(true, true)
  }
  const refresh = () => {
    if (!input.isConnected) {
      destroy()
      return
    }
    const next = visibleCommands()
    if (
      next.length !== displayed.length ||
      next.some((command, index) => command !== displayed[index])
    )
      fill()
    else {
      refreshAvailability()
      navigation.refresh()
    }
  }
  const destroy = () => {
    document.removeEventListener('commands:availability', refresh)
    navigation.destroy()
    input.oninput = null
  }
  document.addEventListener('commands:availability', refresh)
  input.oninput = fill
  content.append(input, results, status)
  fill()
  input.focus()
  return { destroy }
}
