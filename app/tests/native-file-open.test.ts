import { describe, expect, it, vi } from 'vitest'
import { nativeFileOpen } from '../src/native-file-open'

describe('native file-open delivery', () => {
  it('drains a startup request and leaves later requests for the replacement view', async () => {
    const next = vi
      .fn()
      .mockResolvedValueOnce('first.typsto')
      .mockResolvedValueOnce('second.typsto')
    const open = vi.fn().mockResolvedValue(true)
    const options = { next, open, paused: () => false, report: vi.fn() }
    const delivery = nativeFileOpen(options)
    await delivery.check()
    await delivery.check()
    expect(open.mock.calls).toEqual([['first.typsto']])
    expect(next).toHaveBeenCalledTimes(1)
    await nativeFileOpen(options).check()
    expect(open.mock.calls).toEqual([['first.typsto'], ['second.typsto']])
  })

  it('waits for an existing form before claiming a request', async () => {
    let paused = true
    const next = vi.fn().mockResolvedValue('article.typsto')
    const open = vi.fn().mockResolvedValue(true)
    const delivery = nativeFileOpen({ next, open, paused: () => paused, report: vi.fn() })
    await delivery.check()
    expect(next).not.toHaveBeenCalled()
    paused = false
    await delivery.check()
    expect(open).toHaveBeenCalledWith('article.typsto')
  })

  it('retains a claimed request when a form opens while the native reply is pending', async () => {
    let paused = false
    let resolve!: (path: string) => void
    const next = vi.fn(() => new Promise<string>((done) => (resolve = done)))
    const open = vi.fn().mockResolvedValue(true)
    const delivery = nativeFileOpen({ next, open, paused: () => paused, report: vi.fn() })
    const waiting = delivery.check()
    paused = true
    resolve('retained.typsto')
    await waiting
    expect(open).not.toHaveBeenCalled()
    paused = false
    await delivery.check()
    expect(next).toHaveBeenCalledTimes(1)
    expect(open).toHaveBeenCalledWith('retained.typsto')
  })

  it('does not present overlapping decisions and permits a later request after cancellation', async () => {
    let resolve!: (accepted: boolean) => void
    const next = vi.fn().mockResolvedValueOnce('cancelled.typsto').mockResolvedValueOnce(null)
    const open = vi.fn(() => new Promise<boolean>((done) => (resolve = done)))
    const delivery = nativeFileOpen({ next, open, paused: () => false, report: vi.fn() })
    const waiting = delivery.check()
    await vi.waitFor(() => expect(open).toHaveBeenCalledTimes(1))
    await delivery.check()
    expect(open).toHaveBeenCalledTimes(1)
    resolve(false)
    await waiting
    next.mockResolvedValueOnce('later.typsto')
    open.mockResolvedValueOnce(true)
    await delivery.check()
    expect(open).toHaveBeenLastCalledWith('later.typsto')
  })

  it('reports an invalid file and stops a disposed view before opening another document', async () => {
    const report = vi.fn()
    const error = new Error('invalid project')
    const open = vi.fn().mockRejectedValue(error)
    const delivery = nativeFileOpen({
      next: async () => 'bad.typsto',
      open,
      paused: () => false,
      report,
    })
    await delivery.check()
    expect(report).toHaveBeenCalledWith(error)
    delivery.dispose()
    await delivery.check()
    expect(open).toHaveBeenCalledTimes(1)
  })
})
