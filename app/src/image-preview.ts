import { tr } from './i18n'
import { composing } from './keyboard-navigation'

let nextPreview = 0

/** One passive magnifier per gallery; pointer and keyboard share its delay and lifetime. */
export function imagePreview(
  host: HTMLElement,
  layer: HTMLElement,
  options: { trigger: string; frame: string },
) {
  const popup = document.createElement('div')
  popup.className = 'image-preview'
  popup.id = `image-preview-${++nextPreview}`
  popup.role = 'tooltip'
  popup.hidden = true
  const image = document.createElement('img')
  image.alt = ''
  popup.append(image)
  layer.append(popup)
  let anchor: HTMLElement | undefined
  let hovered: HTMLElement | undefined
  let mode: 'pointer' | 'focus' = 'pointer'
  let delay: ReturnType<typeof setTimeout> | undefined
  let departure: ReturnType<typeof setTimeout> | undefined
  let ready = false
  let overPopup = false
  let previousDescription: string | null = null

  const trigger = (target: EventTarget | null) => {
    const element = target instanceof Element ? target.closest<HTMLElement>(options.trigger) : null
    return element && host.contains(element) ? element : undefined
  }
  const frame = () => anchor?.querySelector<HTMLElement>(options.frame)
  const clearDeparture = () => {
    clearTimeout(departure)
    departure = undefined
  }
  function reset() {
    clearTimeout(delay)
    delay = undefined
    clearDeparture()
    if (anchor && !popup.hidden) {
      if (previousDescription === null) anchor.removeAttribute('aria-describedby')
      else anchor.setAttribute('aria-describedby', previousDescription)
    }
    popup.hidden = true
    image.removeAttribute('src')
    anchor = undefined
    ready = false
    overPopup = false
  }
  function position() {
    const bounds = frame()?.getBoundingClientRect()
    const gallery = host.getBoundingClientRect()
    if (
      !bounds ||
      !anchor?.isConnected ||
      bounds.width === 0 ||
      bounds.right <= gallery.left ||
      bounds.left >= gallery.right
    ) {
      reset()
      return
    }
    const margin = 12,
      gap = 8
    const scale = Math.min(
      2,
      (window.innerWidth - margin * 2) / bounds.width,
      (window.innerHeight - margin * 2) / bounds.height,
    )
    const width = bounds.width * scale,
      height = bounds.height * scale
    const clamp = (value: number, maximum: number) => Math.max(margin, Math.min(value, maximum))
    const above = bounds.top - gap - height
    const below = bounds.bottom + gap
    const top =
      above >= margin
        ? above
        : below + height <= window.innerHeight - margin
          ? below
          : clamp(above, window.innerHeight - margin - height)
    popup.style.width = `${width}px`
    popup.style.height = `${height}px`
    popup.style.left = `${clamp(bounds.left + (bounds.width - width) / 2, window.innerWidth - margin - width)}px`
    popup.style.top = `${top}px`
  }
  function show() {
    const source = frame()?.querySelector<HTMLImageElement>('img')
    if (!ready || !source?.complete || !source.naturalWidth || !anchor) return
    position()
    if (!anchor) return
    image.src = source.currentSrc || source.src
    popup.setAttribute(
      'aria-label',
      tr('Aperçu agrandi · {name}', {
        name: anchor.getAttribute('aria-label') || '',
      }),
    )
    if (popup.hidden) {
      previousDescription = anchor.getAttribute('aria-describedby')
      anchor.setAttribute(
        'aria-describedby',
        [previousDescription, popup.id].filter(Boolean).join(' '),
      )
    }
    popup.hidden = false
  }
  function schedule(next: HTMLElement, input: typeof mode) {
    clearDeparture()
    if (anchor === next) {
      if (input === 'pointer') mode = input
      return
    }
    reset()
    anchor = next
    mode = input
    delay = setTimeout(() => {
      ready = true
      show()
    }, 600)
  }
  function depart() {
    clearDeparture()
    // Allow crossing the small gap between the thumbnail and the floating page.
    departure = setTimeout(() => {
      if (
        !overPopup &&
        hovered !== anchor &&
        !(mode === 'focus' && anchor?.contains(document.activeElement))
      )
        reset()
    }, 150)
  }
  const pointerOver = (event: PointerEvent) => {
    if (event.pointerType === 'touch') return
    const next = trigger(event.target)
    if (!next || (event.relatedTarget instanceof Node && next.contains(event.relatedTarget))) return
    hovered = next
    schedule(next, 'pointer')
  }
  const pointerOut = (event: PointerEvent) => {
    const previous = trigger(event.target)
    if (
      !previous ||
      (event.relatedTarget instanceof Node && previous.contains(event.relatedTarget))
    )
      return
    hovered = undefined
    depart()
  }
  const focusIn = (event: FocusEvent) => {
    const next = trigger(event.target)
    if (next) schedule(next, hovered === next ? 'pointer' : 'focus')
  }
  const focusOut = (event: FocusEvent) => {
    if (anchor && event.relatedTarget instanceof Node && anchor.contains(event.relatedTarget))
      return
    if (mode === 'focus' && !overPopup && hovered !== anchor) reset()
  }
  const enterPopup = () => {
    overPopup = true
    clearDeparture()
  }
  const leavePopup = () => {
    overPopup = false
    depart()
  }
  const update = () => {
    if (!popup.hidden) position()
  }
  const loaded = () => {
    if (ready) show()
  }
  const escape = (event: KeyboardEvent) => {
    if (
      event.defaultPrevented ||
      composing(event) ||
      event.key !== 'Escape' ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    )
      return
    const open = !popup.hidden
    reset()
    if (open) {
      // A passive tooltip has no focus scope. Resolve it before the modal's
      // document-level Escape handler, preserving both the dialog and its focus.
      event.preventDefault()
      event.stopImmediatePropagation()
    }
  }
  host.addEventListener('pointerover', pointerOver)
  host.addEventListener('pointerout', pointerOut)
  host.addEventListener('focusin', focusIn)
  host.addEventListener('focusout', focusOut)
  host.addEventListener('load', loaded, true)
  popup.addEventListener('pointerenter', enterPopup)
  popup.addEventListener('pointerleave', leavePopup)
  layer.addEventListener('scroll', update, true)
  window.addEventListener('resize', update)
  window.addEventListener('keydown', escape, true)
  return {
    reset,
    destroy() {
      reset()
      host.removeEventListener('pointerover', pointerOver)
      host.removeEventListener('pointerout', pointerOut)
      host.removeEventListener('focusin', focusIn)
      host.removeEventListener('focusout', focusOut)
      host.removeEventListener('load', loaded, true)
      popup.removeEventListener('pointerenter', enterPopup)
      popup.removeEventListener('pointerleave', leavePopup)
      layer.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
      window.removeEventListener('keydown', escape, true)
      popup.remove()
    },
  }
}
