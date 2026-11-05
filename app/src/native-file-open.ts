/** Drain native requests only when the UI can present its ordinary close decision. */
export function nativeFileOpen({
  next,
  open,
  paused,
  report,
}: {
  next: () => Promise<string | null>
  open: (path: string) => Promise<boolean>
  paused: () => boolean
  report: (error: unknown) => void
}) {
  let busy = false
  let opening = false
  let disposed = false
  let pending: string | null = null
  return {
    async check() {
      if (busy || opening || disposed || paused()) return
      busy = true
      try {
        while (!disposed && !paused()) {
          pending ??= await next()
          if (!pending || disposed || paused()) break
          const path = pending
          pending = null
          opening = await open(path)
          // A successful native open reloads the view. The next view will drain
          // remaining requests; this one must not start a competing replacement.
          if (opening) break
        }
      } catch (error) {
        report(error)
      } finally {
        busy = false
      }
    },
    dispose() {
      disposed = true
    },
  }
}
