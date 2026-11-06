import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { uiRefresh } from '../src/ui-refresh'
import { CommandRegistry, runCommand } from '../src/public-commands'

let frames: Map<number, FrameRequestCallback>, next: number
const paint = () => {
  const callbacks = [...frames.values()]
  frames.clear()
  callbacks.forEach((cb) => cb(0))
}
beforeEach(() => {
  vi.useFakeTimers()
  frames = new Map()
  next = 0
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frames.set(++next, cb)
    return next
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    frames.delete(id)
  })
})
afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('coalesces event and confirmation changes, allowing a frame before publishing their latest state', async () => {
  let state = 'before'
  const update = vi.fn(() => state),
    ui = uiRefresh(update)
  ui.request()
  state = 'transaction'
  ui.request()
  state = 'selection'
  ui.request()
  await Promise.resolve()
  expect(update).not.toHaveBeenCalled()
  expect(frames.size).toBe(1)
  paint()
  await Promise.resolve()
  expect(update).not.toHaveBeenCalled() // rAF microtasks still precede paint.
  state = 'confirmed'
  ui.request()
  await vi.advanceTimersByTimeAsync(0)
  expect(update).toHaveBeenCalledOnce()
  expect(update).toHaveReturnedWith('confirmed')
  expect(vi.getTimerCount()).toBe(0)
  ui.request()
  paint()
  await vi.advanceTimersByTimeAsync(0)
  expect(update).toHaveBeenCalledTimes(2)
})
it('retains an invalidation raised during publication for a later frame', async () => {
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
  paint()
  await vi.advanceTimersByTimeAsync(0)
  expect(seen).toEqual([1])
  expect(frames.size).toBe(1)
  paint()
  await vi.advanceTimersByTimeAsync(0)
  expect(seen).toEqual([1, 2])
})
it('cancels publication before a frame or between its frame and task when closing', async () => {
  for (const afterFrame of [false, true]) {
    const update = vi.fn(),
      ui = uiRefresh(update)
    ui.request()
    if (afterFrame) paint()
    ui.stop()
    ui.request()
    paint()
    await vi.advanceTimersByTimeAsync(200)
    expect(update).not.toHaveBeenCalled()
    expect(frames.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  }
})
it('eventually updates a suspended window and cancels its outstanding frame', async () => {
  const update = vi.fn(),
    ui = uiRefresh(update)
  ui.request()
  await vi.advanceTimersByTimeAsync(99)
  expect(update).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1)
  expect(update).toHaveBeenCalledOnce()
  expect(frames.size).toBe(0)
  paint()
  await vi.advanceTimersByTimeAsync(200)
  expect(update).toHaveBeenCalledOnce()
})
it('delayed visual availability cannot authorize a command refused by the current context', async () => {
  let enabled = true
  const commands = new CommandRegistry(),
    run = vi.fn(),
    update = vi.fn()
  commands.set('test', { id: 'test', label: 'test', enabled: () => enabled, run })
  const ui = uiRefresh(update)
  ui.request()
  enabled = false
  expect(runCommand(commands.get('test')!)).toBe(false)
  expect(run).not.toHaveBeenCalled()
  expect(update).not.toHaveBeenCalled()
  paint()
  await vi.advanceTimersByTimeAsync(0)
  expect(update).toHaveBeenCalledOnce()
})
