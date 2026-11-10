import type { Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'
import type { BandHost } from './band-layout'
import { contextPanel } from './context-panel'
import { floatingEditorPanel } from './floating-editor-panel'
import type { ObjectMenu } from './object-menu'
import { navigationGroup } from './keyboard-navigation'
import { editingAvailability } from './command-availability'
import { editingProvider } from './editing-history'
import { documentContent } from './shared-inline-marks'
import { applyObjectEdit, inlineTarget, treeTarget } from './object-commands'
import { resolvedReference, type CrossReference } from './cross-reference-index'
import { crossReferenceSearch, type SearchTarget } from './cross-reference-search'
import { errorText } from './command-error'
import { icon } from './icons'
import { tr } from './i18n'

export function crossReferencePanel(
  editor: Editor,
  bands: BandHost,
  menu: ObjectMenu,
  host: HTMLElement,
) {
  let opened: { node?: PMNode; reference: CrossReference } | undefined
  let session: ReturnType<ReturnType<typeof floatingEditorPanel>['open']> | undefined
  let pending = false
  let find = crossReferenceSearch(editor)
  let matches: SearchTarget[] = []
  const panel = contextPanel({
    id: 'cross-reference-properties',
    closeLabel: tr('Annuler'),
    close: () => floating.close(true),
    canConfirm: valid,
    tabExit: () => floating.close(true),
  })
  const floating = floatingEditorPanel(editor, host, panel)
  panel.element.classList.add('reference-selector')
  const input = document.createElement('input')
  input.type = 'search'
  input.placeholder = tr('Titre, label ou numéro…')
  input.setAttribute('aria-label', tr('Rechercher une cible'))
  input.dataset.initialFocus = ''
  const searchBox = document.createElement('div')
  searchBox.className = 'floating-editor-search'
  searchBox.innerHTML = icon('search')
  const filterHint = document.createElement('span')
  filterHint.id = 'reference-filter-hint'
  filterHint.className = 'reference-filter-hint'
  filterHint.textContent = tr('$ pour les équations')
  input.setAttribute('aria-describedby', filterHint.id)
  searchBox.append(input, filterHint)
  const results = document.createElement('div')
  results.className = 'floating-editor-results'
  results.setAttribute('aria-label', tr('Cibles du document'))
  const components = document.createElement('fieldset')
  components.className = 'reference-components'
  const legend = document.createElement('legend')
  legend.className = 'sr-only'
  legend.textContent = tr('Contenu du renvoi')
  components.append(legend)
  const checkbox = (text: string) => {
    const label = document.createElement('label')
    const control = document.createElement('input')
    control.type = 'checkbox'
    label.append(control, document.createTextNode(text))
    components.append(label)
    return control
  }
  const full = checkbox(tr('Libellé complet')),
    page = checkbox(tr('Page'))
  const footer = document.createElement('div')
  footer.className = 'reference-footer'
  const example = document.createElement('output')
  example.className = 'reference-example'
  example.setAttribute('role', 'status')
  const enter = document.createElement('span')
  enter.className = 'reference-enter'
  enter.textContent = `↵ ${tr('Insérer')}`
  footer.append(example, enter)
  panel.body.append(searchBox, results, components, footer)
  const apply = panel.action({
    label: tr('Appliquer'),
    primary: true,
    parent: footer,
    run: () => panel.submit(),
  })
  const navigation = navigationGroup(results, {
    input,
    axis: 'vertical',
    initial: false,
    enter: false,
    onSelect: (item) => {
      if (!opened) return
      opened.reference.target = item.dataset.target!
      refreshChoice()
      panel.draftChanged()
    },
    onActivate: () => panel.submit(),
  })

  function valid() {
    const r = opened?.reference
    return (
      !pending &&
      !editor.view.composing &&
      !!session?.current() &&
      !!r &&
      (r.include_label || r.include_page) &&
      matches.some((target) => target.id === r.target)
    )
  }
  function refreshChoice() {
    if (!opened) return
    const r = opened.reference
    full.checked = r.include_label
    page.checked = r.include_page
    apply.disabled = !valid()
    enter.hidden = !!opened.node || apply.disabled
    const target = matches.find((t) => t.id === r.target)
    const label = target ? resolvedReference(editor, r) : undefined
    const hasComponent = r.include_label || r.include_page
    example.classList.toggle('reference-badge-example', !!label && hasComponent)
    example.textContent = !hasComponent
      ? tr('Sélectionnez le libellé, la page ou les deux.')
      : !target
        ? r.target
          ? tr('Cible introuvable')
          : tr('Aucune cible ne correspond.')
        : (label ?? (r.include_label && !r.include_page ? target.title : tr('Aperçu en attente…')))
    floating.place()
  }
  function search(queryChanged = false) {
    if (!opened) return
    const r = opened.reference
    matches = find(input.value, queryChanged ? undefined : r.target)
    if (queryChanged || !r.target) r.target = matches[0]?.id || ''
    let selected: HTMLButtonElement | undefined
    const rows = matches.map((target) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'reference-result'
      button.dataset.target = target.id
      button.innerHTML = icon(
        target.kind === 'mathBlock'
          ? 'sigma'
          : target.kind === 'heading'
            ? 'heading-1'
            : target.kind === 'figure'
              ? 'image'
              : 'table-2',
      )
      const info = document.createElement('span')
      const label = document.createElement('strong')
      label.className = 'floating-editor-result-line'
      label.textContent = target.label || target.title
      info.append(label)
      if (target.label && target.label !== target.title) {
        const detail = document.createElement('small')
        detail.className = 'floating-editor-result-line'
        detail.textContent = target.title
        info.append(detail)
      }
      button.append(info)
      if (target.page) {
        const page = document.createElement('small')
        page.className = 'reference-result-page'
        page.textContent = target.page
        button.append(page)
      }
      if (target.id === r.target) selected = button
      return button
    })
    results.replaceChildren(...rows)
    navigation.refresh()
    navigation.select(selected)
    if (selected) {
      const offset = selected.offsetTop
      if (
        offset < results.scrollTop ||
        offset + selected.offsetHeight > results.scrollTop + results.clientHeight
      )
        results.scrollTop = offset
    }
    refreshChoice()
  }
  full.onchange = page.onchange = () => {
    if (!opened) return
    opened.reference.include_label = full.checked
    opened.reference.include_page = page.checked
    refreshChoice()
    panel.draftChanged()
  }
  // Draft hydration replays the saved search after restoring its chosen target.
  input.oninput = (event) => search(event.isTrusted)
  panel.confirm = () => void confirm()
  async function confirm() {
    const current = opened,
      anchor = session
    if (!current || !anchor || !valid()) return
    const target = anchor.range
    const attrs = { ...current.reference }
    const replacement = editor.schema.nodes.crossReference.create(
      attrs,
      undefined,
      current.node?.marks,
    )
    const transaction = current.node
      ? editor.state.tr.setNodeMarkup(target.from, undefined, { ...current.node.attrs, ...attrs })
      : editor.state.tr.replaceWith(target.from, target.to, replacement)
    transaction.setSelection(
      TextSelection.create(transaction.doc, target.from + replacement.nodeSize),
    )
    const commands = editingProvider(editor)
      ? [
          current.node
            ? { id: 'node.set_attrs', params: { target: treeTarget(editor, target.from), attrs } }
            : {
                id: 'inline.replace',
                params: {
                  target: inlineTarget(editor, target.from, target.to),
                  node: documentContent(replacement.toJSON()),
                },
              },
        ]
      : undefined
    pending = true
    anchor.pending(true)
    apply.disabled = true
    panel.element.setAttribute('aria-busy', 'true')
    try {
      await applyObjectEdit(editor, transaction, commands, {
        focus: false,
        current: anchor.current,
      })
      if (anchor.open()) {
        panel.committed()
        floating.close(true, true)
      }
    } catch (error) {
      if (anchor.open()) panel.error.textContent = errorText(error)
    } finally {
      pending = false
      anchor.pending(false)
      panel.element.removeAttribute('aria-busy')
      if (anchor.open()) search()
    }
  }

  panel.recoveryData = () => (opened ? { new: !opened.node, reference: opened.reference } : null)
  panel.restoreRecoveryData = (data) => {
    if (
      !opened ||
      !data?.reference ||
      typeof data.reference.target !== 'string' ||
      typeof data.reference.include_label !== 'boolean' ||
      typeof data.reference.include_page !== 'boolean'
    )
      return false
    opened.reference = { ...data.reference }
    search()
    return true
  }
  editor.on('transaction', ({ transaction }) => {
    if (
      floating.isOpen &&
      !pending &&
      (transaction.docChanged || transaction.getMeta('cross-reference-index'))
    ) {
      find = crossReferenceSearch(editor)
      search()
    }
  })
  return {
    get isOpen() {
      return floating.isOpen
    },
    focus: floating.focus,
    close: floating.close,
    open(pos?: number) {
      if (pending || !editingAvailability(editor).enabled) return false
      const node = pos === undefined ? undefined : editor.state.doc.nodeAt(pos)
      if (pos !== undefined && node?.type.name !== 'crossReference') return false
      const from = pos ?? editor.state.selection.from,
        to = node ? from + node.nodeSize : editor.state.selection.to
      const current = {
        node: node || undefined,
        reference: node
          ? {
              target: node.attrs.target,
              include_label: node.attrs.include_label,
              include_page: node.attrs.include_page,
            }
          : { target: '', include_label: true, include_page: false },
      }
      bands.close(false)
      menu.close()
      floating.close()
      opened = current
      input.value = ''
      panel.error.textContent = ''
      panel.title.textContent = node ? tr('Modifier le renvoi') : tr('Insérer un renvoi')
      apply.hidden = !node
      find = crossReferenceSearch(editor)
      if (!current.reference.target) current.reference.target = find('')[0]?.id || ''
      full.checked = current.reference.include_label
      page.checked = current.reference.include_page
      session = floating.open({ from, to, object: !!node })
      search()
      return floating.isOpen
    },
  }
}
