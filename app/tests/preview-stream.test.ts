import { expect, it, vi } from 'vitest'
import { previewStream } from '../src/preview-stream'
import type { Preview } from '../src/preview-frame'
import type { Transport } from '../src/provider'

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((yes) => {
    resolve = yes
  })
  return { promise, resolve }
}
function packet(
  version: number,
  id: string,
  base: string | null,
  epoch = 'epoch',
  generation = 'doc',
) {
  const json = new TextEncoder().encode(
    JSON.stringify({
      preview: {
        revision: version,
        source: 'text',
        elapsedMs: 1,
        pageSizes: [],
        delta: { generation, epoch, version, id, base, keys: [] },
      },
      pages: [],
    }),
  )
  const bytes = new Uint8Array(8 + json.length)
  bytes.set([84, 79, 71, 49])
  new DataView(bytes.buffer).setUint32(4, json.length, true)
  bytes.set(json, 8)
  return bytes.buffer
}
function setup() {
  let version = 1,
    generation = 'doc'
  const requests: Record<string, any>[] = [],
    jobs: ReturnType<typeof deferred<ArrayBuffer>>[] = []
  const transport: Transport = {
    invoke: vi.fn(async (command, args) => {
      if (command === 'preview_bind') return 'epoch'
      if (command === 'preview_delta') {
        requests.push(args!)
        const job = deferred<ArrayBuffer>()
        jobs.push(job)
        return job.promise
      }
      return null
    }),
  } as unknown as Transport
  const stream = previewStream(
    transport,
    () => generation,
    () => version,
  )
  return {
    stream,
    transport,
    requests,
    jobs,
    version: (v: number) => {
      version = v
    },
    generation: (v: string) => {
      generation = v
    },
  }
}
it('acknowledges only displayed frames, never discarded or merely returned replies', async () => {
  const s = setup()
  const first = s.stream.request({}, 1)
  await vi.waitFor(() => expect(s.jobs).toHaveLength(1))
  s.jobs[0].resolve(packet(1, 'first', null))
  const reply = await first
  const discarded = s.stream.request({}, 1)
  await vi.waitFor(() => expect(s.jobs).toHaveLength(2))
  expect(s.requests[1].request.base).toBeNull()
  s.jobs[1].resolve(packet(1, 'discarded', null))
  await discarded
  s.stream.published(reply.result)
  const next = s.stream.request({}, 1)
  await vi.waitFor(() => expect(s.jobs).toHaveLength(3))
  expect(s.requests[2].request.base).toBe('first')
  s.jobs[2].resolve(packet(1, 'next', 'first'))
  await next
})
it('invalidates an active native job once and rejects its obsolete response', async () => {
  const s = setup(),
    pending = s.stream.request({}, 1)
  await vi.waitFor(() => expect(s.jobs).toHaveLength(1))
  s.version(2)
  s.stream.invalidate()
  s.version(3)
  s.stream.invalidate()
  expect(
    vi.mocked(s.transport.invoke).mock.calls.filter(([c]) => c === 'preview_invalidate'),
  ).toEqual([['preview_invalidate', { scope: { generation: 'doc', epoch: 'epoch', version: 2 } }]])
  const assertion = expect(pending).rejects.toBe('stale')
  s.jobs[0].resolve(packet(1, 'old', null))
  await assertion
})
it('forgets a base when the document changes and rejects mismatched response epochs', async () => {
  const s = setup()
  s.stream.published({
    delta: { generation: 'doc', epoch: 'epoch', version: 1, id: 'old', base: null, keys: [] },
  } as unknown as Preview)
  s.generation('other')
  const pending = s.stream.request({}, 1)
  await vi.waitFor(() => expect(s.jobs).toHaveLength(1))
  expect(s.requests[0].request.base).toBeNull()
  const assertion = expect(pending).rejects.toBe('stale')
  s.jobs[0].resolve(packet(1, 'old', null, 'wrong', 'other'))
  await assertion
  expect(
    vi.mocked(s.transport.invoke).mock.calls.filter(([c]) => c === 'preview_bind'),
  ).toHaveLength(1)
})
