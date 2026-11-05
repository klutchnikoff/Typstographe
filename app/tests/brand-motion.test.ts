import { afterEach, expect, it, vi } from 'vitest'
import scene from '../../assets/branding/splash.svg?raw'
import { createLigatureAnimation } from '../../assets/branding/motion.mjs'

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

function setup(reduced = false) {
  const query = Object.assign(new EventTarget(), { matches: reduced })
  vi.stubGlobal('matchMedia', () => query)
  const frames = new Map<number, FrameRequestCallback>()
  let next = 0
  const request = vi.fn((callback: FrameRequestCallback) => {
    frames.set(++next, callback)
    return next
  })
  vi.stubGlobal('requestAnimationFrame', request)
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  const root = document.createElement('div')
  root.innerHTML = scene
  document.body.append(root)
  return { root, request, frames, query }
}

it('shows the complete logo immediately with reduced motion, without starting a frame loop', () => {
  const { root, request } = setup(true)
  const animation = createLigatureAnimation(root)
  animation.play()
  expect(root.dataset.state).toBe('settled')
  expect(root.querySelector('[data-brand-letters]')?.getAttribute('opacity')).toBe('1')
  expect(request).not.toHaveBeenCalled()
  animation.dispose()
})

it('plays once, settles and retains one vector clip throughout the writing sequence', () => {
  const { root, frames, request } = setup()
  const animation = createLigatureAnimation(root)
  const ligature = root.querySelector('[data-brand-ligature]')!
  const originalClip = ligature.getAttribute('clip-path')
  animation.play()
  expect(root.dataset.state).toBe('writing')
  const tick = (time: number) => {
    const [id, callback] = frames.entries().next().value!
    frames.delete(id)
    callback(time)
  }
  tick(100)
  tick(100 + animation.duration)
  expect(root.dataset.state).toBe('settled')
  const count = request.mock.calls.length
  animation.play()
  expect(request).toHaveBeenCalledTimes(count)
  for (const time of [0, 620, 920, 1170, 1599, 1600, animation.duration]) {
    animation.seek(time)
    expect(ligature.getAttribute('clip-path')).toBe(originalClip)
    expect(root.querySelector('mask')).toBeNull()
  }
  animation.dispose()
  expect(frames.size).toBe(0)
})

it('isolates clip identifiers between instances and finishes when reduced motion is enabled', () => {
  const { root, query, frames } = setup()
  const first = createLigatureAnimation(root)
  const other = document.createElement('div')
  other.innerHTML = scene
  document.body.append(other)
  const second = createLigatureAnimation(other)
  expect(root.querySelector('clipPath')!.id).not.toBe(other.querySelector('clipPath')!.id)
  first.play()
  query.matches = true
  query.dispatchEvent(Object.assign(new Event('change'), { matches: true }))
  expect(root.dataset.state).toBe('settled')
  expect(frames.size).toBe(0)
  first.dispose()
  second.dispose()
})
