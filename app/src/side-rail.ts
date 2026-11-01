import { icon } from './icons'
import { tr } from './i18n'
import { resizableSeparator } from './resizable-separator'

/** Every rail action keeps its accessible name in both display modes. */
export function railButton(label: string, glyph: string, section?: string) {
  const button = document.createElement('button')
  button.type = 'button'
  button.title = label
  button.setAttribute('aria-label', label)
  const text = document.createElement('span')
  text.className = 'side-rail-label'
  text.textContent = label
  button.innerHTML = icon(glyph)
  button.append(text)
  if (section) {
    button.dataset.sideSection = section
    button.id = `side-section-${section.replaceAll('.', '-')}`
    button.setAttribute('aria-expanded', 'false')
    button.setAttribute('aria-controls', 'side-panel')
    const caret = document.createElement('span')
    caret.className = 'side-section-caret'
    caret.innerHTML = icon('chevron-down')
    button.append(caret)
  }
  return button
}

// Same breakpoint as style.css: 720 px for writing and preview beside a 320 px rail.
const NARROW_WINDOW = '(max-width: 1040px)'

/** One live content host, docked below its heading or floating over the preview. */
export function sideRailMode(
  side: HTMLElement,
  panel: HTMLElement,
  options: { toggle: () => void; close: () => void; resized: (width: number) => void },
) {
  const workspace = side.parentElement!
  let expanded = true,
    width = 320,
    active: string | undefined,
    keyboard = true,
    moveTicket = 0
  const control = railButton('', 'chevron-right')
  control.classList.add('side-rail-toggle')
  control.dataset.command = 'ui.sidebar_labels'
  control.onclick = options.toggle
  control.onmousedown = (event) => {
    if (event.button === 0) event.preventDefault()
  }
  type Scroll = { top: number; left: number; appliedTop: number; appliedLeft: number }
  let remembered = new WeakMap<HTMLElement, Scroll>()
  const forgetScroll = () => {
    moveTicket++
    remembered = new WeakMap()
  }
  panel.addEventListener('wheel', forgetScroll, { passive: true })
  panel.addEventListener('pointerdown', forgetScroll)
  const divider = document.createElement('div')
  divider.className = 'sidebar-splitter'
  divider.tabIndex = 0
  divider.setAttribute('role', 'separator')
  divider.setAttribute('aria-orientation', 'vertical')
  divider.setAttribute('aria-label', tr('Largeur de la barre latérale'))
  workspace.append(divider)
  const bounds = () => {
    const max = Math.min(520, Math.max(180, workspace.clientWidth * 0.45))
    return { min: Math.min(240, max), max }
  }
  const actualWidth = () => Math.max(bounds().min, Math.min(bounds().max, width))
  // The labelled rail yields to the document in narrow windows; the preference is kept.
  const narrowWindow = matchMedia(NARROW_WINDOW)
  const docked = () => expanded && !narrowWindow.matches
  const retainPanel = () => {
    const focused = document.activeElement as HTMLElement
    const selection =
      focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement
        ? ([focused.selectionStart, focused.selectionEnd, focused.selectionDirection] as const)
        : undefined
    const scroll = [panel, ...panel.querySelectorAll<HTMLElement>('*')]
      .filter((el) => el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth)
      .map((el) => {
        const old = remembered.get(el)
        return [
          el,
          old && el.scrollTop === old.appliedTop ? old.top : el.scrollTop,
          old && el.scrollLeft === old.appliedLeft ? old.left : el.scrollLeft,
        ] as const
      })
    return () => {
      if (panel.contains(focused) && document.activeElement !== focused) {
        focused.focus({ preventScroll: true })
        if (selection && selection[0] !== null && selection[1] !== null)
          (focused as HTMLInputElement).setSelectionRange(
            selection[0],
            selection[1],
            selection[2] || undefined,
          )
      }
      const ticket = ++moveTicket
      const restore = () => {
        if (ticket !== moveTicket) return
        for (const [el, top, left] of scroll) {
          el.scrollTop = top
          el.scrollLeft = left
          remembered.set(el, { top, left, appliedTop: el.scrollTop, appliedLeft: el.scrollLeft })
        }
      }
      restore()
      requestAnimationFrame(restore)
    }
  }
  const place = () => {
    const button = [
      ...side.querySelectorAll<HTMLButtonElement>(':scope > button[data-side-section]'),
    ].find((button) => button.dataset.sideSection === active)
    for (const item of side.querySelectorAll<HTMLButtonElement>(
      ':scope > button[data-side-section]',
    ))
      item.setAttribute('aria-expanded', String(item === button && !panel.hidden))
    const dock = docked()
    panel.dataset.docked = String(dock)
    panel.dataset.linked = String(!!button)
    panel.setAttribute('aria-labelledby', dock && button ? button.id : 'side-title')
    const parent = dock ? side : workspace
    const next = dock ? button?.nextSibling || control : null
    if (panel.parentElement === parent && (next === panel || panel.nextSibling === next)) return
    const before = next?.parentNode === parent ? next : null
    if (typeof parent.moveBefore === 'function' && panel.isConnected && parent.isConnected)
      parent.moveBefore(panel, before)
    else parent.insertBefore(panel, before)
  }

  const layout = () => {
    const dock = docked()
    side.dataset.expanded = String(dock)
    // style.css derives the rail width from these, so window resizes apply before any callback.
    workspace.dataset.rail = expanded ? 'labelled' : 'compact'
    workspace.style.setProperty('--side-rail-preferred', `${width}px`)
    divider.hidden = !dock
    // Labels cannot be shown until the window widens again.
    control.hidden = expanded && !dock
    divider.setAttribute('aria-valuemin', String(Math.round(bounds().min)))
    divider.setAttribute('aria-valuemax', String(Math.round(bounds().max)))
    divider.setAttribute('aria-valuenow', String(Math.round(actualWidth())))
    panel.style.maxWidth = dock
      ? ''
      : `${workspace.querySelector<HTMLElement>('.preview')?.clientWidth || workspace.clientWidth}px`
    place()
  }
  resizableSeparator(divider, {
    value: actualWidth,
    bounds,
    direction: -1,
    step: 16,
    defaultValue: 320,
    pointer: (event) => workspace.getBoundingClientRect().right - event.clientX,
    change: (value, commit) => {
      width = value
      layout()
      if (commit) options.resized(Math.max(240, Math.min(520, Math.round(width))))
    },
  })
  side.addEventListener(
    'click',
    (event) => {
      const button = (event.target as Element).closest<HTMLButtonElement>(
        'button[data-side-section]',
      )
      if (button?.parentElement !== side || button?.dataset.sideSection !== active || panel.hidden)
        return
      event.preventDefault()
      event.stopImmediatePropagation()
      options.close()
    },
    true,
  )
  document.addEventListener(
    'keydown',
    () => {
      keyboard = true
    },
    true,
  )
  document.addEventListener(
    'pointerdown',
    () => {
      keyboard = false
    },
    true,
  )
  let frame = 0
  const observer = new ResizeObserver(() => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(layout)
  })
  // CSS narrows the rail at once; follow it here, keeping the moved panel's focus and scroll.
  narrowWindow.addEventListener('change', () => {
    const restore = retainPanel()
    layout()
    restore()
  })
  observer.observe(workspace)
  const preview = workspace.querySelector('.preview')
  if (preview) observer.observe(preview)
  return {
    control,
    show(section?: string) {
      const entering = panel.hidden || section !== active
      if (entering) forgetScroll()
      active = section
      panel.hidden = false
      layout()
      if (
        entering &&
        !keyboard &&
        !matchMedia('(prefers-reduced-motion: reduce)').matches &&
        panel.animate
      )
        panel.animate(
          [
            { opacity: 0.6, clipPath: docked() ? 'inset(0 0 100% 0)' : 'inset(0 0 0 100%)' },
            { opacity: 1, clipPath: 'inset(0)' },
          ],
          { duration: 140, easing: 'ease-out' },
        )
    },
    close() {
      active = undefined
      panel.hidden = true
      place()
    },
    update(value: boolean, storedWidth = width) {
      // Read before changing width or docking CSS: either can reflow native fields.
      const restore = retainPanel()
      expanded = value
      width = Number.isFinite(storedWidth) ? storedWidth : 320
      layout()
      restore()
      const label = tr(expanded ? 'Masquer les libellés' : 'Afficher les libellés')
      control.title = label
      control.setAttribute('aria-label', label)
      control.setAttribute('aria-expanded', String(expanded))
      control.innerHTML = icon('chevron-right')
      const text = document.createElement('span')
      text.className = 'side-rail-label'
      text.textContent = label
      control.append(text)
    },
  }
}
