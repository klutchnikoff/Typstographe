import { keyboardScope, navigationGroup } from './keyboard-navigation'
import { tr } from './i18n'
import { welcomeBrand } from './welcome-brand'

export const byId = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T

/** The static chrome the shell controllers attach to. */
export interface ShellLayout {
  header: HTMLElement
  menu: HTMLElement
  workspace: HTMLElement
  welcome: HTMLElement
  brand: ReturnType<typeof welcomeBrand>
  side: HTMLElement
  panel: HTMLElement
  overlay: HTMLDialogElement
  context: HTMLElement
}

/** Builds the application chrome around the editor page prepared by `main.ts`. */
export function mountShellLayout(options: {
  active: boolean
  diagnostic: boolean
  isTauri: boolean
}): ShellLayout {
  document.querySelector('.badge')?.remove()
  byId('presence').hidden = !options.diagnostic
  byId('synchronization').hidden = !options.active
  const header = document.querySelector('header')!
  const oldTools = header.querySelector<HTMLElement>('.session-tools')
  if (oldTools) oldTools.hidden = true
  const menu = document.createElement('nav')
  menu.className = 'app-menu'
  header.append(menu)
  if (options.isTauri && navigator.platform.startsWith('Mac')) {
    menu.hidden = true
    const brand = header.querySelector('.identity')
    if (brand) document.querySelector('#toolbar')!.prepend(brand)
    header.hidden = true
  }
  const workspace = document.querySelector('main')!
  workspace.dataset.documentActive = String(options.active)
  const welcome = document.createElement('section')
  welcome.className = 'welcome'
  welcome.hidden = options.active
  welcome.innerHTML =
    '<div class="welcome-card"><div class="welcome-actions"><button id="create-document" class="primary">Nouveau document</button><button id="open-document">Ouvrir…</button><button id="resume-document">Reprendre la session</button></div></div>'
  const brand = welcomeBrand()
  welcome.querySelector('.welcome-card')!.prepend(brand.element)
  workspace.prepend(welcome)
  byId<HTMLButtonElement>('resume-document').hidden = true
  for (const [id, label] of [
    ['create-document', 'Nouveau document'],
    ['open-document', 'Ouvrir…'],
    ['resume-document', 'Reprendre la session'],
  ])
    byId(id).textContent = tr(label)

  const side = document.createElement('aside')
  side.className = 'side-rail'
  side.setAttribute('aria-label', tr('Panneaux de l’application'))
  workspace.append(side)
  navigationGroup(side, { axis: 'vertical', items: ':scope > button' })
  const panel = document.createElement('aside')
  panel.className = 'side-panel'
  panel.id = 'side-panel'
  panel.setAttribute('role', 'region')
  panel.hidden = true
  panel.innerHTML =
    '<div class="panel-title"><h2 id="side-title"></h2><button id="close-side" aria-label="Fermer le panneau">×</button></div><div id="side-content"></div>'
  workspace.append(panel)
  const overlay = document.createElement('dialog')
  overlay.className = 'app-dialog'
  document.body.append(overlay)
  keyboardScope(overlay, {
    close: () => overlay.close(),
    priority: 30,
    confirm: () => overlay.querySelector<HTMLButtonElement>('[data-default]')?.click(),
    tab: true,
  })
  const context = document.createElement('section')
  context.className = 'document-settings'
  context.innerHTML =
    '<div class="metadata-tabs"><strong id="document-type-label"></strong><div id="metadata-tabs"></div></div><div id="metadata-content" hidden></div>'
  document.querySelector('.document-info')!.replaceWith(context)
  navigationGroup(menu, { axis: 'horizontal' })
  return { header, menu, workspace, welcome, brand, side, panel, overlay, context }
}
