import { tr } from './i18n'
import { icon } from './icons'
import type { Field } from './shell'
import type { MetadataCommands } from './metadata-commands'
import { bindMetadataInput } from './metadata-input'

export type DateValue = { kind: 'calendar'; iso: string } | { kind: 'custom'; text: string } | null

type Binding = { commands: MetadataCommands; read: (field: Field) => unknown }
const controls = new WeakMap<
  HTMLElement,
  { refresh: (value: unknown) => void; destroy: () => void }
>()

/** Shared date control: mode changes are recoverable drafts, never destructive conversions. */
export function metadataDate(
  definition: Field,
  value: unknown,
  change: (field: string, value: unknown) => void,
  binding?: Binding,
) {
  const root = document.createElement('div')
  root.className = 'metadata-field-controls metadata-date-controls'
  root.dataset.metadataDate = definition.parameter
  const mode = document.createElement('select')
  mode.setAttribute('aria-label', tr('Mode de la date'))
  for (const [id, label] of [
    ['calendar', 'Date'],
    ['custom', 'Texte personnalisé'],
  ]) {
    const option = document.createElement('option')
    option.value = id
    option.textContent = tr(label)
    mode.append(option)
  }
  const input = document.createElement('input')
  input.id = `metadata-field-${definition.field}`
  const today = document.createElement('button'),
    clear = document.createElement('button')
  today.type = clear.type = 'button'
  today.textContent = tr('Aujourd’hui')
  clear.className = 'metadata-date-clear'
  clear.title = tr('Supprimer la date')
  clear.setAttribute('aria-label', clear.title)
  clear.innerHTML = icon('trash-2')
  clear.querySelector('svg')?.setAttribute('aria-hidden', 'true')
  root.append(input, mode, today, clear)
  const format = (value: unknown) => {
    const date = value as DateValue
    mode.value = date?.kind ?? 'calendar'
    input.type = mode.value === 'calendar' ? 'date' : 'text'
    clear.disabled = date === null || date === undefined
    return date?.kind === 'calendar' ? date.iso : (date?.text ?? '')
  }
  const parse = (): DateValue =>
    mode.value === 'calendar'
      ? { kind: 'calendar', iso: input.value }
      : { kind: 'custom', text: input.value }
  const validate = (value: unknown) => {
    const date = value as DateValue
    if (date?.kind === 'calendar') {
      const iso = date.iso
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(iso) ||
        iso.startsWith('0000') ||
        !Number.isFinite(Date.parse(`${iso}T00:00:00Z`)) ||
        new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) !== iso
      )
        return tr('Saisissez une date complète et valide, ou supprimez la date.')
    } else if (
      date &&
      (!date.text.trim() ||
        new TextEncoder().encode(date.text).length > 16000 ||
        /\p{Cc}/u.test(date.text))
    )
      return tr('Saisissez une date personnalisée sur une seule ligne, ou supprimez la date.')
  }
  let native: ReturnType<typeof bindMetadataInput> | undefined
  const target = { kind: 'metadata', field: definition.field } as const
  const read = () => binding!.read(definition)
  const set = (value: DateValue) => {
    if (binding) binding.commands.set(target, value, read)
    else {
      input.value = format(value)
      change(definition.field, value)
    }
  }
  mode.onchange = () => {
    const value: DateValue =
      mode.value === 'calendar' ? { kind: 'calendar', iso: '' } : { kind: 'custom', text: '' }
    input.value = format(value)
    // No publication until the replacement value is valid. Annuler restores the confirmed value.
    if (binding)
      binding.commands.stage(target, value, read, tr('Renseignez la nouvelle date ou annulez.'))
    input.focus()
  }
  today.onclick = () => {
    const now = new Date(),
      iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    set({ kind: 'calendar', iso })
  }
  clear.onclick = () => {
    set(null)
    input.focus()
  }
  input.value = format(value)
  if (!binding)
    input.oninput = () => {
      const value = parse()
      if (!validate(value)) {
        clear.disabled = false
        change(definition.field, value)
      }
    }
  // The field row must be attached before binding (status and keyboard scope belong to it).
  controls.set(root, {
    refresh(value) {
      if (native) native.refresh()
      else input.value = format(value)
    },
    destroy() {
      native?.destroy()
      controls.delete(root)
    },
  })
  return {
    controls: root,
    input,
    bind() {
      if (binding)
        native = bindMetadataInput(input, binding.commands, target, read, parse, format, validate)
    },
  }
}
export const metadataDateControl = (root: HTMLElement) => controls.get(root)
