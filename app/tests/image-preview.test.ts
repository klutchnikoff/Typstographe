import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { imagePreview } from '../src/image-preview'

let destroy: () => void
beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  destroy?.()
  document.body.replaceChildren()
  vi.useRealTimers()
})
function setup() {
  const layer = document.createElement('div')
  const host = document.createElement('div')
  const button = document.createElement('button')
  button.className = 'trigger'
  button.setAttribute('aria-label', 'Article')
  button.setAttribute('aria-describedby', 'existing-description')
  const frame = document.createElement('span')
  frame.className = 'frame'
  const image = document.createElement('img')
  image.src = 'data:image/png;base64,specimen'
  Object.defineProperties(image, { complete: { value: true }, naturalWidth: { value: 512 } })
  frame.append(image)
  button.append(frame)
  host.append(button)
  layer.append(host)
  document.body.append(layer)
  host.getBoundingClientRect = () => new DOMRect(0, 400, 600, 200)
  frame.getBoundingClientRect = () => new DOMRect(20, 400, 118, 168)
  const preview = imagePreview(host, layer, { trigger: '.trigger', frame: '.frame' })
  destroy = preview.destroy
  return {
    layer,
    host,
    button,
    frame,
    preview,
    popup: layer.querySelector<HTMLElement>('.image-preview')!,
  }
}
it('waits for deliberate focus, leaves focus unchanged and restores existing descriptions', () => {
  const { button, popup, preview } = setup()
  button.focus()
  vi.advanceTimersByTime(599)
  expect(popup.hidden).toBe(true)
  vi.advanceTimersByTime(1)
  expect(popup.hidden).toBe(false)
  expect(document.activeElement).toBe(button)
  expect(popup.style.width).toBe('236px')
  expect(button.getAttribute('aria-describedby')).toContain('existing-description image-preview-')
  preview.reset()
  expect(popup.hidden).toBe(true)
  expect(button.getAttribute('aria-describedby')).toBe('existing-description')
})
it('cancels a pending preview when its gallery is replaced or destroyed', () => {
  const { button, popup, preview } = setup()
  button.focus()
  preview.reset()
  vi.advanceTimersByTime(600)
  expect(popup.hidden).toBe(true)
  button.blur()
  button.focus()
  preview.destroy()
  vi.advanceTimersByTime(600)
  expect(popup.isConnected).toBe(false)
})
it('closes the magnifier before an outer Escape handler, ignoring IME composition', () => {
  const { button, popup } = setup()
  button.focus()
  vi.advanceTimersByTime(600)
  button.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'Escape',
      isComposing: true,
      bubbles: true,
      cancelable: true,
    }),
  )
  expect(popup.hidden).toBe(false)
  const outer = vi.fn()
  document.addEventListener('keydown', outer, { once: true })
  const first = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
  button.dispatchEvent(first)
  expect(popup.hidden).toBe(true)
  expect(first.defaultPrevented).toBe(true)
  expect(outer).not.toHaveBeenCalled()
  button.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
  )
  expect(outer).toHaveBeenCalledOnce()
})
