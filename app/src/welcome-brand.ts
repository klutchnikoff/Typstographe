import ligature from '../../assets/branding/splash.svg?raw'
import { createLigatureAnimation } from '../../assets/branding/motion.mjs'

export function welcomeBrand() {
  const element = document.createElement('div')
  element.className = 'welcome-brand'
  element.dataset.state = 'settled'
  element.setAttribute('role', 'img')
  element.setAttribute('aria-label', 'Typstographe')
  element.innerHTML = ligature
  return { element, ...createLigatureAnimation(element) }
}
