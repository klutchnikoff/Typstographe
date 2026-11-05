import { expect, it, vi } from 'vitest'
import { browserTurn } from '../src/browser-turn'

it('yields a full task and closes both ports before resuming CPU work', async () => {
  const ports: {
    onmessage?: () => void
    close: ReturnType<typeof vi.fn>
    postMessage: ReturnType<typeof vi.fn>
  }[] = []
  vi.stubGlobal(
    'MessageChannel',
    class {
      port1 = { close: vi.fn(), postMessage: vi.fn(), onmessage: undefined }
      port2 = { close: vi.fn(), postMessage: vi.fn() }
      constructor() {
        ports.push(this.port1, this.port2)
      }
    },
  )
  try {
    const resumed = vi.fn()
    const pending = browserTurn().then(resumed)
    await Promise.resolve()
    expect(resumed).not.toHaveBeenCalled()
    expect(ports[1].postMessage).toHaveBeenCalledOnce()
    ports[0].onmessage!()
    expect(ports.every((p) => p.close.mock.calls.length === 1)).toBe(true)
    await pending
    expect(resumed).toHaveBeenCalledOnce()
  } finally {
    vi.unstubAllGlobals()
  }
})
