import { icon } from './icons'
import { tr } from './i18n'

/** Every rail action keeps its accessible name in both display modes. */
export function railButton(label: string, glyph: string) {
  const button = document.createElement('button')
  button.type = 'button'
  button.title = label
  button.setAttribute('aria-label', label)
  const text = document.createElement('span')
  text.className = 'side-rail-label'
  text.textContent = label
  button.innerHTML = icon(glyph)
  button.append(text)
  return button
}

export function sideRailMode(side: HTMLElement, toggle: () => void) {
  const control = railButton('', 'chevron-right')
  control.classList.add('side-rail-toggle')
  control.dataset.command = 'ui.sidebar_labels'
  control.onclick = toggle
  return {
    control,
    update(expanded: boolean) {
      side.dataset.expanded = String(expanded)
      side.parentElement!.style.setProperty('--side-rail-width', expanded ? '172px' : '36px')
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
