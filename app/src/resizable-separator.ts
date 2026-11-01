/** Pointer capture and keyboard resizing share one commit/cancel contract. */
export function resizableSeparator(
  element: HTMLElement,
  options: {
    value: () => number
    bounds: () => { min: number; max: number }
    pointer: (event: PointerEvent) => number
    change: (value: number, commit: boolean) => void
    step: number
    defaultValue: number
    direction?: number
  },
) {
  let drag: { id: number; start: number } | undefined
  const change = (value: number, commit: boolean) => {
    const { min, max } = options.bounds()
    options.change(Math.max(min, Math.min(max, value)), commit)
  }
  const finish = (commit: boolean) => {
    if (!drag) return
    const { id, start } = drag
    drag = undefined
    document.documentElement.classList.remove('resizing-columns')
    if (commit) change(options.value(), true)
    else change(start, false)
    if (element.hasPointerCapture(id)) element.releasePointerCapture(id)
    document.removeEventListener('keydown', escape, true)
    window.removeEventListener('blur', cancel)
  }
  const cancel = () => finish(false)
  const escape = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopImmediatePropagation()
    cancel()
  }
  element.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !event.isPrimary || drag) return
    event.preventDefault()
    element.focus({ preventScroll: true })
    drag = { id: event.pointerId, start: options.value() }
    element.setPointerCapture(event.pointerId)
    document.documentElement.classList.add('resizing-columns')
    document.addEventListener('keydown', escape, true)
    window.addEventListener('blur', cancel)
  })
  element.addEventListener('pointermove', (event) => {
    if (event.pointerId === drag?.id) change(options.pointer(event), false)
  })
  element.addEventListener('pointerup', (event) => {
    if (event.pointerId === drag?.id) finish(true)
  })
  for (const kind of ['pointercancel', 'lostpointercapture'])
    element.addEventListener(kind, (event) => {
      if ((event as PointerEvent).pointerId === drag?.id) cancel()
    })
  element.addEventListener('keydown', (event) => {
    if (event.isComposing || event.altKey || event.metaKey || event.ctrlKey) return
    const { min, max } = options.bounds()
    const value =
      event.key === 'Home'
        ? min
        : event.key === 'End'
          ? max
          : event.key === 'ArrowLeft'
            ? options.value() - options.step * (options.direction || 1)
            : event.key === 'ArrowRight'
              ? options.value() + options.step * (options.direction || 1)
              : undefined
    if (value === undefined) return
    event.preventDefault()
    change(value, true)
  })
  element.addEventListener('dblclick', () => change(options.defaultValue, true))
}
