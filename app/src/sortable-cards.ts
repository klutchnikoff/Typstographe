import Sortable from 'sortablejs'
import { composing, keyboardScope } from './keyboard-navigation'
import { tr } from './i18n'
let sequence = 0

/** DOM order is a private preview. Only the final drop publishes one typed move. */
export function sortableCards(
  root: HTMLElement,
  options: {
    order(): string[]
    move(id: string, before: string | undefined, base: string[]): Promise<unknown>
    error(reason: unknown): void
  },
) {
  let base: string[] | undefined, staged: string[] | undefined, grabbed: string | undefined
  let keyboard = false,
    busy = false,
    alive = true
  const status = document.createElement('span')
  status.className = 'sr-only'
  status.setAttribute('role', 'status')
  root.after(status)
  const hint = document.createElement('span')
  hint.className = 'sr-only'
  hint.id = `sortable-card-hint-${++sequence}`
  hint.textContent = tr(
    'Glisser pour réordonner. Au clavier : Espace, flèches, puis Entrée ou Échap.',
  )
  status.after(hint)
  const handles = () => [...root.querySelectorAll<HTMLButtonElement>('.collection-card-handle')]
  const handle = (id: string) =>
    handles().find(
      (button) => button.closest<HTMLElement>('[data-record-id]')?.dataset.recordId === id,
    )
  const unchanged = () => !!base && JSON.stringify(base) === JSON.stringify(options.order())
  const sort = (ids: string[]) => {
    const focused = document.activeElement as HTMLElement | null
    sortable.sort(ids)
    if (focused?.isConnected && root.contains(focused)) focused.focus({ preventScroll: true })
  }
  function refresh() {
    if (base && !unchanged()) cancel(tr('La liste a changé. Recommencez le déplacement.'))
    for (const button of handles()) {
      button.disabled = busy || options.order().length < 2
      const selected = keyboard && button === handle(grabbed || '')
      button.setAttribute('aria-pressed', String(selected))
      button.setAttribute('aria-describedby', hint.id)
      button.title = hint.textContent
    }
  }
  function cancel(message = tr('Déplacement annulé.')) {
    base = staged = undefined
    grabbed = undefined
    keyboard = false
    root.classList.remove('collection-sorting')
    sort(options.order())
    status.textContent = message
  }
  async function commit(id: string, ids: string[]) {
    const expected = base
    const valid = unchanged()
    cancel('')
    if (!expected || !valid) {
      status.textContent = tr('La liste a changé. Recommencez le déplacement.')
      return
    }
    if (JSON.stringify(ids) === JSON.stringify(expected)) return
    busy = true
    sortable.option('disabled', true)
    refresh()
    const index = ids.indexOf(id)
    try {
      await options.move(id, ids[index + 1], expected)
      if (alive)
        status.textContent = tr('Nouvelle position : {position} sur {count}.', {
          position: index + 1,
          count: ids.length,
        })
    } catch (error) {
      if (alive) options.error(error)
    } finally {
      busy = false
      if (alive) {
        sortable.option('disabled', false)
        sort(options.order())
        refresh()
        if (document.activeElement === document.body || root.contains(document.activeElement))
          handle(id)?.focus({ preventScroll: true })
      }
    }
  }
  const sortable = new Sortable(root, {
    draggable: '.collection-card',
    handle: '.collection-card-handle',
    dataIdAttr: 'data-record-id',
    animation: 0,
    forceFallback: true,
    fallbackOnBody: true,
    fallbackTolerance: 4,
    ghostClass: 'collection-card-ghost',
    chosenClass: 'collection-card-chosen',
    onStart(event) {
      base = options.order()
      grabbed = event.item.dataset.recordId
      root.classList.add('collection-sorting')
    },
    onEnd(event) {
      if (!base) {
        sort(options.order())
        return
      }
      void commit(event.item.dataset.recordId!, sortable.toArray())
    },
  })
  const keydown = (event: KeyboardEvent) => {
    if (
      event.defaultPrevented ||
      composing(event) ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      (event.shiftKey && event.key !== 'Tab') ||
      busy
    )
      return
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
      '.collection-card-handle',
    )
    if (!button || button.disabled) return
    const id = button.closest<HTMLElement>('[data-record-id]')!.dataset.recordId!
    const consume = () => {
      event.preventDefault()
      event.stopPropagation()
    }
    if (event.key === ' ' || event.key === 'Enter') {
      consume()
      if (keyboard) void commit(id, staged!)
      else {
        base = options.order()
        staged = [...base]
        grabbed = id
        keyboard = true
        root.classList.add('collection-sorting')
        status.textContent = tr('Déplacement activé. Utilisez les flèches, puis Entrée ou Échap.')
      }
      refresh()
    } else if (keyboard && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      consume()
      const current = staged!.indexOf(id),
        next = current + (event.key === 'ArrowUp' ? -1 : 1)
      if (next < 0 || next >= staged!.length) return
      staged!.splice(current, 1)
      staged!.splice(next, 0, id)
      sort(staged!)
      status.textContent = tr('Nouvelle position : {position} sur {count}.', {
        position: next + 1,
        count: staged!.length,
      })
    } else if (keyboard && (event.key === 'Escape' || event.key === 'Tab')) {
      if (event.key === 'Escape') consume()
      cancel()
      refresh()
    }
  }
  root.addEventListener('keydown', keydown)
  keyboardScope(root, {
    active: () => keyboard,
    close: () => {
      cancel()
      refresh()
    },
  })
  return {
    active: () => !!base,
    cancel() {
      if (base) {
        cancel()
        refresh()
      }
    },
    refresh,
    destroy() {
      alive = false
      sortable.destroy()
      root.removeEventListener('keydown', keydown)
      status.remove()
      hint.remove()
    },
  }
}
