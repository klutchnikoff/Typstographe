import { expect, it, vi } from 'vitest'
import { uiRefresh } from '../src/ui-refresh'

it('publishes the final state of an event without waiting for a timer or frame', async () => {
  let state = 'before'
  const update = vi.fn(() => state)
  const ui = uiRefresh(update)
  ui.request()
  state = 'transaction'
  ui.request()
  state = 'selection'
  ui.request()
  expect(update).not.toHaveBeenCalled()
  await Promise.resolve()
  expect(update).toHaveBeenCalledTimes(1)
  expect(update).toHaveReturnedWith('selection')
  state = 'confirmed'
  ui.request()
  await Promise.resolve()
  expect(update).toHaveBeenCalledTimes(2)
  expect(update).toHaveLastReturnedWith('confirmed')
})

it('retains a new invalidation raised during publication', async () => {
  const seen: number[] = []
  let value = 1
  const ui = uiRefresh(() => {
    seen.push(value)
    if (value === 1) {
      value = 2
      ui.request()
      ui.request()
    }
  })
  ui.request()
  await Promise.resolve()
  await Promise.resolve()
  expect(seen).toEqual([1, 2])
})

it('does not publish a pending or later update after the view closes', async () => {
  const update = vi.fn()
  const ui = uiRefresh(update)
  ui.request()
  ui.stop()
  await Promise.resolve()
  ui.request()
  await Promise.resolve()
  expect(update).not.toHaveBeenCalled()
})
