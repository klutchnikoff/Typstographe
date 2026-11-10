import { actionRow, keyboardScope } from './keyboard-navigation'
import { tr } from './i18n'

interface Action {
  label: string
  run: () => void
  danger?: boolean
  primary?: boolean
}

/** Keep the decision beside the draft, in the manager's single keyboard scope. */
export function bibliographyConfirmation(detail: HTMLElement, changed: () => void) {
  let active: { element: HTMLElement; focus: HTMLElement | null } | undefined
  let locked = false
  function close(restore = true) {
    if (!active) return false
    const { element, focus } = active
    active = undefined
    element.remove()
    changed()
    if (restore && focus?.isConnected) focus.focus({ preventScroll: true })
    return true
  }
  function open(id: string, title: string, text: string, actions: Action[], initial: number) {
    if (active) return
    const element = document.createElement('section')
    element.id = id
    element.className = 'bibliography-confirmation'
    element.setAttribute('aria-labelledby', `${id}-title`)
    const heading = document.createElement('strong')
    heading.id = `${id}-title`
    heading.textContent = title
    const message = document.createElement('p')
    message.textContent = text
    const error = document.createElement('p')
    error.setAttribute('role', 'alert')
    const row = actionRow()
    const buttons = actions.map(({ label, run, danger, primary }) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = tr(label)
      button.classList.toggle('danger', !!danger)
      button.classList.toggle('primary', !!primary)
      button.onclick = run
      return button
    })
    row.append(...buttons)
    element.append(heading, message, row, error)
    active = { element, focus: document.activeElement as HTMLElement | null }
    keyboardScope(element, { close: () => close(), active: () => !locked, priority: 45 })
    detail.before(element)
    changed()
    buttons[initial]?.focus()
    return error
  }
  return {
    get opened() {
      return !!active
    },
    open,
    close,
    lock(value: boolean) {
      locked = value
      for (const button of active?.element.querySelectorAll('button') || [])
        button.disabled = locked
    },
  }
}
