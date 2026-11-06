/** Coalesce secondary UI work after a rendering opportunity for the edited text. */
export function uiRefresh(update: () => void) {
  let queued = false,
    stopped = false,
    frame: number | undefined,
    task: ReturnType<typeof setTimeout> | undefined,
    fallback: ReturnType<typeof setTimeout> | undefined
  const cancel = () => {
    if (frame !== undefined) cancelAnimationFrame(frame)
    clearTimeout(task)
    clearTimeout(fallback)
    frame = task = fallback = undefined
  }
  const publish = () => {
    cancel()
    queued = false
    if (!stopped) update()
  }
  return {
    request() {
      if (queued || stopped) return
      queued = true
      frame = requestAnimationFrame(() => {
        frame = undefined
        // A microtask here would still run before paint. Resume in a new task.
        task = setTimeout(publish, 0)
      })
      // Hidden/suspended windows still need eventual menu/status updates.
      fallback = setTimeout(publish, 100)
    },
    stop() {
      stopped = true
      cancel()
      queued = false
    },
  }
}
