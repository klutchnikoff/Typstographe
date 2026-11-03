import { tr } from './i18n'
import { bindMetadataInput } from './metadata-input'
import type { FieldTarget, MetadataCommands } from './metadata-commands'
import type { ModelOption, ModelPolicy } from './shell'

/** A single native choice control for general and capability presentation options. */
export function modelOptionControl(
  parent: HTMLElement,
  id: ModelOption,
  label: string,
  items: { value: string; label: string }[],
  target: FieldTarget,
  commands: MetadataCommands,
  read: () => unknown,
  policy: () => ModelPolicy | undefined,
  boolean = false,
) {
  const row = document.createElement('div'),
    title = document.createElement('label'),
    control = document.createElement('div'),
    select = document.createElement('select')
  row.className = 'field'
  row.style.display = 'contents'
  select.id = `document-option-${id === 'landscape' ? 'orientation' : id}`
  select.setAttribute('aria-label', label)
  title.htmlFor = select.id
  title.textContent = label
  control.className = 'document-option-control'
  control.append(select)
  const custom = document.createElement('input')
  custom.type = 'text'
  custom.maxLength = 2
  custom.setAttribute('aria-label', tr('Marqueur personnalisé'))
  custom.hidden = true
  if (id === 'bullet-marker') control.append(custom)
  row.append(title, control)
  parent.append(row)
  let allowed: { value: string; label: string }[] = []
  let retained: string | undefined
  const customSelection = (event: Event) => {
    if (select.value === '__custom__') event.stopImmediatePropagation()
  }
  select.addEventListener('input', customSelection, { capture: true })
  const binding = bindMetadataInput(
    select,
    commands,
    target,
    read,
    () =>
      select.value === '__custom__'
        ? read()
        : select.value === ''
          ? null
          : boolean
            ? select.value === 'true'
            : select.value,
    (value) =>
      allowed.some((item) => item.value === String(value)) || retained === String(value)
        ? String(value)
        : id === 'bullet-marker' && value !== null && policy()?.options[id]?.regime === 'free'
          ? '__custom__'
          : '',
  )
  const customBinding =
    id === 'bullet-marker'
      ? bindMetadataInput(
          custom,
          commands,
          target,
          read,
          () => custom.value || null,
          (value) => (value && value !== 'auto' ? String(value) : ''),
        )
      : undefined
  const showCustom = () => {
    custom.hidden = select.value !== '__custom__'
    if (!custom.hidden) {
      custom.focus()
      // Native selects may restore their own focus after dispatching change (WebKit).
      requestAnimationFrame(() => {
        if (
          custom.isConnected &&
          !custom.hidden &&
          select.value === '__custom__' &&
          document.activeElement === select
        )
          custom.focus()
      })
    }
  }
  select.addEventListener('change', showCustom)
  function refresh() {
    const option = policy()?.options[id]
    const hidden = !option || option.regime === 'imposed'
    title.hidden = control.hidden = hidden
    select.disabled = hidden
    allowed =
      !option || option.regime === 'imposed'
        ? []
        : option.regime === 'restricted'
          ? option.allowed.map((value) => ({
              value: String(value),
              label: items.find((item) => item.value === String(value))?.label || String(value),
            }))
          : option.domain
            ? option.domain.map((value) => ({
                value: String(value),
                label: items.find((item) => item.value === String(value))?.label || String(value),
              }))
            : items
    const fallback = option && option.regime !== 'imposed' ? String(option.default) : ''
    const stored = read()
    retained =
      stored !== null &&
      stored !== undefined &&
      !hidden &&
      !allowed.some((item) => item.value === String(stored)) &&
      !(id === 'bullet-marker' && option?.regime === 'free')
        ? String(stored)
        : undefined
    const choices = [
      {
        value: '',
        label: `${tr('Selon le modèle')} (${items.find((item) => item.value === fallback)?.label || fallback})`,
      },
      ...allowed,
    ]
    if (id === 'bullet-marker' && option?.regime === 'free')
      choices.push({ value: '__custom__', label: tr('Marqueur personnalisé') })
    if (retained !== undefined)
      choices.push({
        value: retained,
        label: `${items.find((item) => item.value === retained)?.label || retained} · ${tr('Choix conservé, non disponible')}`,
      })
    const signature = JSON.stringify(choices)
    if (select.dataset.choices !== signature) {
      select.replaceChildren(
        ...choices.map((item) => {
          const option = new Option(item.label, item.value)
          option.disabled = item.value === retained
          return option
        }),
      )
      select.dataset.choices = signature
    }
    binding.refresh()
    custom.hidden = hidden || select.value !== '__custom__'
    custom.disabled = hidden
    customBinding?.refresh()
  }
  refresh()
  return {
    select,
    refresh,
    destroy: () => {
      binding.destroy()
      customBinding?.destroy()
      select.removeEventListener('input', customSelection, { capture: true })
      select.removeEventListener('change', showCustom)
      row.remove()
    },
  }
}
