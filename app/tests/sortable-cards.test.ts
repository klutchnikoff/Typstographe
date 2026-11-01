import { afterEach, expect, it, vi } from 'vitest'
import { recordCard } from '../src/record-card'
import { sortableCards } from '../src/sortable-cards'
import { keyboardScope } from '../src/keyboard-navigation'

const cleanup: (() => void)[] = []
afterEach(() => {
  cleanup.splice(0).forEach((destroy) => destroy())
  document.body.replaceChildren()
})
function fixture() {
  const root = document.createElement('div')
  document.body.append(root)
  let ids = ['a', 'b', 'c']
  for (const id of ids) root.append(recordCard(id, id).element)
  const error = vi.fn()
  const move = vi.fn(async (id: string, before: string | undefined, _base: string[]) => {
    ids = ids.filter((item) => item !== id)
    ids.splice(before ? ids.indexOf(before) : ids.length, 0, id)
  })
  const view = sortableCards(root, { order: () => [...ids], move, error })
  cleanup.push(view.destroy)
  view.refresh()
  const key = (id: string, value: string) => {
    const button = root.querySelector<HTMLButtonElement>(
      `[data-record-id="${id}"] .collection-card-handle`,
    )!
    button.focus()
    button.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: value.replace('Shift+', ''),
        shiftKey: value.startsWith('Shift+'),
        bubbles: true,
        cancelable: true,
      }),
    )
    return button
  }
  return {
    root,
    view,
    error,
    move,
    key,
    order: () => [...ids],
    change: (next: string[]) => (ids = next),
    visible: () => [...root.children].map((element) => (element as HTMLElement).dataset.recordId),
  }
}

it('keyboard movement previews privately and commits exactly one move at confirmation', async () => {
  const f = fixture()
  const button = f.key('b', ' ')
  f.key('b', 'ArrowUp')
  expect(f.visible()).toEqual(['b', 'a', 'c'])
  expect(f.order()).toEqual(['a', 'b', 'c'])
  expect(f.move).not.toHaveBeenCalled()
  expect(button.getAttribute('aria-pressed')).toBe('true')
  f.key('b', 'Enter')
  await vi.waitFor(() => expect(f.order()).toEqual(['b', 'a', 'c']))
  expect(f.move).toHaveBeenCalledExactlyOnceWith('b', 'a', ['a', 'b', 'c'])
  expect(document.activeElement).toBe(button)
})

it.each(['Escape', 'Tab', 'Shift+Tab'])(
  'leaving a staged move with %s restores order without publication',
  (key) => {
    const f = fixture()
    f.key('a', ' ')
    f.key('a', 'ArrowDown')
    f.key('a', key)
    expect(f.visible()).toEqual(['a', 'b', 'c'])
    expect(f.move).not.toHaveBeenCalled()
    expect(f.view.active()).toBe(false)
  },
)

it('a concurrent change invalidates the private order and never publishes the old move', () => {
  const f = fixture()
  f.key('a', ' ')
  f.key('a', 'ArrowDown')
  f.change(['c', 'b', 'a'])
  f.view.refresh()
  expect(f.view.active()).toBe(false)
  expect(f.visible()).toEqual(['c', 'b', 'a'])
  expect(f.move).not.toHaveBeenCalled()
  expect(document.querySelector('[role=status]')!.textContent).toContain('La liste a changé')
})

it('Escape cancels the grabbed item without closing the enclosing metadata panel', () => {
  const f = fixture(),
    parent = document.createElement('section'),
    close = vi.fn()
  f.root.before(parent)
  parent.append(f.root)
  keyboardScope(parent, { close })
  f.key('b', ' ')
  f.key('b', 'ArrowUp')
  f.key('b', 'Escape')
  expect(f.visible()).toEqual(['a', 'b', 'c'])
  expect(f.move).not.toHaveBeenCalled()
  expect(close).not.toHaveBeenCalled()
})

it('refusing a move restores confirmed order and keeps the handle usable', async () => {
  const f = fixture()
  f.move.mockRejectedValueOnce(new Error('refused'))
  const button = f.key('b', ' ')
  f.key('b', 'ArrowUp')
  f.key('b', 'Enter')
  await vi.waitFor(() => expect(f.error).toHaveBeenCalledOnce())
  expect(f.visible()).toEqual(['a', 'b', 'c'])
  expect(button.disabled).toBe(false)
  expect(document.activeElement).toBe(button)
})
