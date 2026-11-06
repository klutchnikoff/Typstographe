import { requestPreview, type Delta, type Preview } from './preview-frame'
import type { Transport } from './provider'

/** A base is acknowledged only after its pages have actually been published. */
export function previewStream(
  transport: Transport,
  generation: () => string,
  version: () => number,
) {
  let attachment: { generation: string; epoch: Promise<string> } | undefined
  let displayed: Delta | undefined
  let active:
    | { scope: { generation: string; epoch: string; version: number }; invalidated: boolean }
    | undefined
  const reset = () => {
    attachment = undefined
    displayed = undefined
  }
  return {
    reset,
    published(value: Pick<Preview, 'delta'>) {
      displayed = value.delta
    },
    invalidate() {
      const job = active
      if (!job || job.invalidated) return
      job.invalidated = true
      void transport
        .invoke('preview_invalidate', { scope: { ...job.scope, version: version() } })
        .catch(() => {})
    },
    async request(snapshot: unknown, localVersion: number) {
      const gen = generation()
      if (attachment?.generation !== gen) {
        displayed = undefined
        attachment = {
          generation: gen,
          epoch: transport.invoke<string>('preview_bind', { generation: gen }),
        }
      }
      const bound = attachment
      let job: typeof active
      try {
        const epoch = await bound.epoch
        if (bound !== attachment || gen !== generation() || localVersion !== version())
          throw 'stale'
        job = { scope: { generation: gen, epoch, version: localVersion }, invalidated: false }
        active = job
        const base =
          displayed?.generation === gen && displayed.epoch === epoch ? displayed.id : null
        const reply = await requestPreview(transport, snapshot, 'rgba', { scope: job.scope, base })
        if (bound !== attachment || gen !== generation() || localVersion !== version())
          throw 'stale'
        const delta = reply.result.delta
        if (
          delta &&
          (delta.generation !== gen || delta.epoch !== epoch || delta.version !== localVersion)
        ) {
          reset()
          throw 'stale'
        }
        return reply
      } catch (error) {
        if (!job && attachment === bound) reset()
        if (String(error) === 'preview-epoch') {
          reset()
          throw 'stale'
        }
        throw error
      } finally {
        if (active === job) active = undefined
      }
    },
  }
}
