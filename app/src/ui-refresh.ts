/** Publish the latest UI state once after the current synchronous event settles. */
export function uiRefresh(update: () => void) {
  let queued = false,
    stopped = false
  return {
    request() {
      if (queued || stopped) return
      queued = true
      queueMicrotask(() => {
        queued = false
        if (!stopped) update()
      })
    },
    stop() {
      stopped = true
    },
  }
}
