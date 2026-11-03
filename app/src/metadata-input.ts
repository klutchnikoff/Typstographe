import { tr } from './i18n'
import type { FieldTarget, MetadataCommands } from './metadata-commands'
import { actionRow, keyboardScope } from './keyboard-navigation'

type Control = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
const bindings = new WeakMap<
  Control,
  { target: FieldTarget; refresh: () => void; destroy: () => void }
>()
/** Same pending value, IME isolation, refusal and explicit retry/discard for every native field. */
export function bindMetadataInput(
  input: Control,
  commands: MetadataCommands,
  target: FieldTarget,
  read: () => unknown,
  parse: () => unknown = () => input.value,
  format: (value: unknown) => string = (value) => String(value ?? ''),
  validate?: (value: unknown) => string | undefined,
) {
  let composing = false
  const status = document.createElement('div')
  status.style.gridColumn = '1 / -1'
  const error = document.createElement('p')
  error.role = 'alert'
  status.hidden = true
  const retry = document.createElement('button'),
    cancel = document.createElement('button')
  retry.type = cancel.type = 'button'
  retry.textContent = tr('Valider')
  cancel.textContent = tr('Annuler')
  const publish = (confirm = false) => {
    const value = parse(),
      reason = validate?.(value)
    if (reason) commands.stage(target, value, read, reason)
    else if (confirm) commands.confirm(target, value, read)
    else commands.set(target, value, read)
  }
  retry.onclick = () => publish(true)
  cancel.onclick = () => {
    commands.discard(target)
    input.focus()
  }
  const actions = actionRow()
  retry.className = 'primary'
  actions.append(cancel, retry)
  status.append(error, actions)
  const root = input.closest<HTMLElement>('.field') || input.parentElement!.parentElement!
  root.append(status)
  keyboardScope(root, {
    active: () => !!commands.error(target) || commands.recovering(target),
    close: () => cancel.click(),
    confirm: () => retry.click(),
  })
  const update = () => {
    if (!composing) publish()
  }
  const begin = () => {
    composing = true
    commands.composing(input, true)
  }
  const end = () => {
    composing = false
    publish()
    commands.composing(input, false)
  }
  const refresh = () => {
    const reason = commands.error(target)
    const recovering = commands.recovering(target)
    status.hidden = !reason && !recovering
    error.textContent = reason?.message || (recovering ? tr('Saisie récupérée · à valider') : '')
    error.role = reason ? 'alert' : 'status'
    input.setAttribute('aria-invalid', String(!!reason))
    if (composing) return
    const value = commands.value(target, read())
    if (input instanceof HTMLInputElement && input.type === 'checkbox')
      input.checked = Boolean(value)
    else {
      const text = format(value)
      // A trailing empty keyword line is local input, not another keyword.
      if (
        input.value === text ||
        (input.dataset.fieldKind === 'tokens' && document.activeElement === input && !reason)
      )
        return
      const start = input instanceof HTMLSelectElement ? null : input.selectionStart,
        finish = input instanceof HTMLSelectElement ? null : input.selectionEnd
      input.value = text
      if (
        document.activeElement === input &&
        start !== null &&
        finish !== null &&
        !(input instanceof HTMLSelectElement)
      )
        input.setSelectionRange(Math.min(start, text.length), Math.min(finish, text.length))
    }
  }
  input.addEventListener('input', update)
  input.addEventListener('compositionstart', begin)
  input.addEventListener('compositionend', end)
  const unsubscribe = commands.watch(refresh)
  const binding = {
    target,
    refresh,
    destroy() {
      unsubscribe()
      input.removeEventListener('input', update)
      input.removeEventListener('compositionstart', begin)
      input.removeEventListener('compositionend', end)
      if (composing) commands.composing(input, false)
      bindings.delete(input)
      status.remove()
    },
  }
  bindings.set(input, binding)
  refresh()
  return binding
}
export const metadataInputBinding = (input: Control) => bindings.get(input)
