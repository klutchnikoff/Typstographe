import type { Browse } from './bibliography-types'
import { navigationGroup, actionRow } from './keyboard-navigation'
import { icon } from './icons'
import { tr } from './i18n'

/** Compact list presentation and keyboard ownership; no requests or document edits. */
export function bibliographyBrowser(parent: HTMLElement, activate: (id: string) => void) {
  const layout = document.createElement('div'),
    left = document.createElement('aside'),
    detail = document.createElement('section'),
    right = document.createElement('div'),
    project = document.createElement('div'),
    alternative = document.createElement('div'),
    list = document.createElement('div'),
    search = document.createElement('input'),
    status = document.createElement('p'),
    add = document.createElement('button'),
    load = document.createElement('button'),
    file = document.createElement('input'),
    online = document.createElement('button')
  layout.className = 'bibliography-layout'
  left.className = 'bibliography-browser'
  detail.className = 'bibliography-detail'
  project.className = alternative.className = 'bibliography-source'
  detail.append(right)
  list.className = 'bibliography-list'
  list.id = 'bibliography-list'
  list.role = 'listbox'
  list.setAttribute('aria-label', tr('Notices'))
  search.type = 'search'
  search.placeholder = tr('Rechercher par titre ou auteur…')
  search.setAttribute('aria-label', tr('Rechercher une référence'))
  search.role = 'combobox'
  search.setAttribute('aria-controls', list.id)
  search.setAttribute('aria-expanded', 'true')
  search.dataset.initialFocus = ''
  status.className = 'sr-only'
  status.setAttribute('role', 'status')
  add.type = load.type = 'button'
  add.innerHTML = icon('plus')
  add.append(tr('Nouvelle notice'))
  load.innerHTML = icon('paperclip')
  load.append(tr('Importer un fichier…'))
  file.type = 'file'
  file.accept = '.bib,.yaml,.yml'
  file.hidden = true
  file.setAttribute('aria-label', tr('Fichiers bibliographiques'))
  const toolbar = actionRow()
  toolbar.classList.add('bibliography-toolbar')
  const back = document.createElement('button')
  back.type = online.type = 'button'
  online.innerHTML = icon('search')
  online.append(tr('Rechercher en ligne'))
  back.className = 'bibliography-back'
  back.innerHTML = icon('chevron-right')
  back.append(tr('Retour aux notices du projet'))
  toolbar.append(add, load, online, back, file)
  project.append(search, status, list)
  left.append(project, alternative)
  layout.append(left, detail)
  parent.classList.add('bibliography-workspace')
  parent.append(toolbar, layout)
  back.hidden = alternative.hidden = true
  const navigation = navigationGroup(list, {
    axis: 'vertical',
    input: search,
    onActivate: (row) => {
      activate(row.dataset.recordId!)
    },
  })
  return {
    right,
    back,
    list,
    search,
    add,
    load,
    file,
    online,
    source(element?: HTMLElement) {
      const alternate = !!element
      project.hidden = alternate
      alternative.hidden = !alternate
      add.hidden = load.hidden = online.hidden = alternate
      back.hidden = !alternate
      if (alternative.firstElementChild !== (element || null))
        alternative.replaceChildren(...(element ? [element] : []))
    },
    render(result: Browse, selected?: string) {
      const noMatches = !result.entries.length && !!search.value.trim()
      status.classList.toggle('sr-only', !noMatches)
      status.textContent = noMatches
        ? tr('Aucune notice trouvée.')
        : tr('{count} / {total} notices', { count: result.entries.length, total: result.total })
      list.replaceChildren()
      for (const record of result.entries) {
        const row = document.createElement('button'),
          name = document.createElement('span'),
          title = document.createElement('span')
        row.type = 'button'
        row.dataset.recordId = record.id
        row.className = 'bibliography-list-row'
        row.setAttribute('aria-selected', String(record.id === selected))
        name.textContent = `${record.names} · ${record.year ?? '—'}`
        title.textContent = record.title || record.key
        row.setAttribute(
          'aria-label',
          `${record.names} · ${record.year ?? '—'} · ${record.title || record.key}${record.incomplete ? ` · ${tr('Notice incomplète')}` : ''}`,
        )
        row.append(name, title)
        list.append(row)
      }
      navigation.refresh()
    },
    select(id?: string) {
      for (const row of list.querySelectorAll<HTMLElement>('[data-record-id]'))
        row.setAttribute('aria-selected', String(row.dataset.recordId === id))
    },
    destroy() {
      navigation.destroy()
      layout.remove()
      toolbar.remove()
    },
  }
}
