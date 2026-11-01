import { icon } from './icons'
import { actionRow } from './keyboard-navigation'
import { tr } from './i18n'

/** Reusable record surface: a separate edit target, drag handle and action slot.
 * Draft ownership and typed publication remain with the collection controller.
 */
export function recordCard(id: string, label: string) {
  const element = document.createElement('div')
  element.className = 'metadata-record collection-card'
  element.dataset.recordId = id
  const header = document.createElement('div')
  header.className = 'collection-card-heading'
  const handle = document.createElement('button')
  handle.type = 'button'
  handle.className = 'collection-card-handle'
  handle.innerHTML = icon('grip-vertical')
  handle.setAttribute('aria-label', tr('Réordonner · {name}', { name: label }))
  const open = document.createElement('button')
  open.type = 'button'
  open.className = 'collection-card-open'
  open.dataset.recordOpen = ''
  open.setAttribute('aria-haspopup', 'dialog')
  open.setAttribute('aria-label', `${tr('Modifier')} · ${label}`)
  const caption = document.createElement('span')
  caption.className = 'metadata-record-caption'
  const detail = document.createElement('small')
  detail.className = 'metadata-record-detail'
  open.append(caption, detail)
  const actions = actionRow()
  header.append(handle, open, actions)
  element.append(header)
  return { element, header, handle, open, caption, detail, actions }
}
