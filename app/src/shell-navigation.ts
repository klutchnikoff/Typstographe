import { openBibliography } from './bibliography-manager'
import { icon } from './icons'
import { tr } from './i18n'
import { composing, navigationGroup } from './keyboard-navigation'
import { runCommand } from './public-commands'
import type { ShellCommands } from './shell-commands'
import type { ShellContext } from './shell-context'
import { documentTitle, type ShellDocuments } from './shell-documents'
import type { SidePanels } from './shell-panels'
import { documentType, settingsFor } from './state'

function button(label: string, action: () => void, glyph?: string) {
  const element = document.createElement('button')
  element.type = 'button'
  if (glyph) element.innerHTML = icon(glyph)
  element.append(label)
  element.onclick = action
  return element
}

function projectsPanel(root: HTMLElement, ctx: ShellContext, openProject: (path: string) => void) {
  const { commands, state } = ctx
  const actions = document.createElement('div')
  actions.className = 'project-panel-actions'
  const create = button(tr('Nouveau'), () => runCommand(commands.get('document.new')!), 'plus')
  create.classList.add('primary')
  actions.append(
    create,
    button(tr('Ouvrir…'), () => runCommand(commands.get('document.open')!), 'folder'),
  )
  const search = document.createElement('input')
  search.type = 'search'
  search.placeholder = tr('Rechercher un projet…')
  search.setAttribute('aria-label', tr('Rechercher un projet'))
  const list = document.createElement('div')
  list.className = 'project-catalogue'
  const status = document.createElement('p')
  status.setAttribute('role', 'status')
  root.append(actions, search, list, status)
  const navigation = navigationGroup(list, {
    axis: 'vertical',
    items: '[data-project-open]',
  })
  const normalized = (value: string) =>
    value.toLocaleLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
  function render() {
    const { pinned = [], recent } = state.preferences
    const query = normalized(search.value.trim())
    list.replaceChildren()
    for (const [label, paths] of [
      ['Épinglés', pinned],
      ['Récents', recent.filter((path) => !pinned.includes(path))],
    ] as const) {
      const matches = [...new Set(paths)].filter((path) =>
        normalized(documentTitle(path)).includes(query),
      )
      if (!matches.length) continue
      const heading = document.createElement('h3')
      heading.textContent = tr(label)
      list.append(heading)
      for (const path of matches) {
        const row = document.createElement('div')
        row.className = 'project-catalogue-row'
        const name = documentTitle(path)
        const open = button(name, () => openProject(path))
        open.dataset.projectOpen = path
        open.title = path
        if (state.active && state.path === path) open.setAttribute('aria-current', 'true')
        const isPinned = pinned.includes(path)
        const pin = document.createElement('button')
        pin.type = 'button'
        pin.dataset.projectPin = path
        pin.innerHTML = icon('pin')
        pin.title = tr(isPinned ? 'Désépingler' : 'Épingler')
        pin.setAttribute('aria-label', tr('Épingler {name}', { name }))
        pin.setAttribute('aria-pressed', String(isPinned))
        pin.onclick = () => {
          const current = state.preferences.pinned || []
          state.preferences.pinned = isPinned
            ? current.filter((item) => item !== path)
            : [...current, path]
          render()
          const replacement = [
            ...list.querySelectorAll<HTMLButtonElement>('[data-project-pin]'),
          ].find((item) => item.dataset.projectPin === path)
          ;(replacement || search).focus({ preventScroll: true })
          ctx.guarded(() => ctx.persistPreferences())
        }
        row.append(open, pin)
        list.append(row)
      }
    }
    status.textContent = list.childElementCount
      ? ''
      : tr(query ? 'Aucun projet trouvé.' : 'Aucun projet récent ou épinglé.')
    status.hidden = !status.textContent
    navigation.refresh(true)
  }
  search.oninput = render
  search.onkeydown = (event) => {
    if (composing(event) || event.ctrlKey || event.metaKey || event.altKey) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      navigation.focus()
    } else if (event.key === 'Enter') {
      event.preventDefault()
      list.querySelector<HTMLButtonElement>('[data-project-open]')?.click()
    }
  }
  document.addEventListener('projects:changed', render)
  render()
  search.focus({ preventScroll: true })
  return () => {
    document.removeEventListener('projects:changed', render)
    navigation.destroy()
  }
}

function documentPanel(
  root: HTMLElement,
  ctx: ShellContext,
  documents: ShellDocuments,
  initial: 'plan' | 'versions',
) {
  const { editor, provider, transport, settings } = ctx
  const kind = documentType(provider)
  const sections = document.createElement('div')
  sections.className = 'document-navigation'
  root.append(sections)
  function disclosure(label: string, glyph: string) {
    const details = document.createElement('details')
    const summary = document.createElement('summary')
    summary.innerHTML = icon(glyph)
    const text = document.createElement('span')
    text.textContent = tr(label)
    summary.append(text)
    const caret = document.createElement('span')
    caret.className = 'document-navigation-caret'
    caret.innerHTML = icon('chevron-right')
    summary.append(caret)
    const content = document.createElement('div')
    content.className = 'document-navigation-content'
    details.append(summary, content)
    sections.append(details)
    return { details, summary, content }
  }
  const plan = disclosure('Plan', 'list')
  if (kind.structured?.bibliography) {
    const bibliography = button(
      tr('Bibliographie'),
      () => {
        bibliography.focus({ preventScroll: true })
        openBibliography(editor, provider, transport)
      },
      'book-open',
    )
    bibliography.setAttribute('aria-haspopup', 'dialog')
    sections.append(bibliography)
  }
  const resources = disclosure('Ressources', 'paperclip')
  const versions = disclosure('Versions', 'history')
  const reviews = disclosure('Relectures', 'pen-line')
  reviews.content.textContent = tr('La relecture par suggestions est prévue dans un prochain lot.')
  const navigation = navigationGroup(sections, {
    axis: 'vertical',
    items: ':scope > details > summary, :scope > button',
  })
  const outlineNavigation = navigationGroup(plan.content, { axis: 'vertical' })
  const headings = () => {
    const result: { position: number; level: number; label: string }[] = []
    editor.state.doc.forEach((node, position) => {
      if (node.type.name === 'heading' && node.textContent.trim())
        result.push({ position, level: node.attrs.level, label: node.textContent })
    })
    return result
  }
  let lastOutline: string | undefined
  function refreshPlan() {
    const current = headings()
    const outline = JSON.stringify(current.map(({ level, label }) => [level, label]))
    if (outline === lastOutline) return
    lastOutline = outline
    plan.content.replaceChildren()
    if (!current.length) plan.content.textContent = tr('Aucun titre dans le document.')
    for (const [index, { level, label }] of current.entries()) {
      const entry = button(label, () => {
        const heading = headings()[index]
        if (heading)
          editor
            .chain()
            .setTextSelection(heading.position + 1)
            .scrollIntoView()
            .focus()
            .run()
      })
      entry.style.setProperty('--outline-depth', String(level - 1))
      plan.content.append(entry)
    }
    outlineNavigation.refresh()
  }
  function refreshResources() {
    const paths = new Set<string>()
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'figure' && typeof node.attrs.src === 'string' && node.attrs.src)
        paths.add(node.attrs.src)
    })
    const values = settingsFor(provider).metadata.fields
    for (const field of kind.fields) {
      const path = values[field.parameter]
      if (field.resource && typeof path === 'string' && path) paths.add(path)
    }
    resources.content.replaceChildren()
    if (!paths.size) resources.content.textContent = tr('Aucune ressource dans le document.')
    else {
      const list = document.createElement('ul')
      for (const path of paths) {
        const item = document.createElement('li')
        item.textContent = path.split('/').at(-1) || path
        item.title = path
        list.append(item)
      }
      resources.content.append(list)
    }
  }
  let timer = 0
  const refresh = () => {
    if (plan.details.open) refreshPlan()
    if (resources.details.open) refreshResources()
  }
  const schedule = () => {
    if (!plan.details.open && !resources.details.open) return
    window.clearTimeout(timer)
    timer = window.setTimeout(refresh, 180)
  }
  plan.details.ontoggle = () => {
    if (plan.details.open) refreshPlan()
  }
  resources.details.ontoggle = () => {
    if (resources.details.open) refreshResources()
  }
  let versionsMounted = false
  const mountVersions = () => {
    if (versionsMounted || !versions.details.open || !versions.details.isConnected) return
    versionsMounted = true
    documents.mountVersions(versions.content)
  }
  versions.details.ontoggle = mountVersions
  const selected = initial === 'versions' ? versions : plan
  selected.details.open = true
  refresh()
  mountVersions()
  selected.summary.focus({ preventScroll: true })
  editor.on('update', schedule)
  settings.observeDeep(schedule)
  return () => {
    window.clearTimeout(timer)
    editor.off('update', schedule)
    settings.unobserveDeep(schedule)
    navigation.destroy()
    outlineNavigation.destroy()
  }
}

export function registerProjectNavigation(
  ctx: ShellContext,
  { add }: ShellCommands,
  panels: SidePanels,
  documents: ShellDocuments,
) {
  const showDocument = (section: 'plan' | 'versions') =>
    panels.adoptNavigation(
      documentPanel(panels.show(tr('Document'), 'ui.document'), ctx, documents, section),
    )
  add('ui.projects', tr('Projets'), () =>
    panels.adoptNavigation(
      projectsPanel(panels.show(tr('Projets'), 'ui.projects'), ctx, (path) => {
        if (ctx.state.active && ctx.state.path === path) showDocument('plan')
        else
          void documents.requestOpen(path, true).then((opened) => {
            if (opened && !ctx.options.isTauri && !ctx.provider.nativeEditing) showDocument('plan')
          })
      }),
    ),
  )
  add('ui.document', tr('Document'), () => showDocument('plan'))
  add('ui.versions', tr('Versions'), () => showDocument('versions'))
  return () => {
    if (documents.consumeCatalogueOpen()) showDocument('plan')
  }
}
