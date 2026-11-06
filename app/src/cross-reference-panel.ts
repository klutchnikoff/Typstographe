import type { Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'
import type { BandHost } from './band-layout'
import { contextPanel } from './context-panel'
import { navigationGroup } from './keyboard-navigation'
import { editingAvailability } from './command-availability'
import { editingProvider } from './editing-history'
import { documentContent } from './shared-inline-marks'
import { applyObjectEdit, inlineTarget, treeTarget } from './object-commands'
import { referenceTargets, referenceLabel, type CrossReference } from './cross-reference-index'
import { errorText } from './command-error'
import { icon } from './icons'
import { tr } from './i18n'

/** Cross-reference content only: placement, focus, navigation, cancellation and recovery are shared. */
export function crossReferencePanel(editor: Editor, bands: BandHost) {
  let opened: { node?: PMNode; reference: CrossReference } | undefined
  let pending = false
  const panel = contextPanel({
    id: 'cross-reference-properties',
    closeLabel: tr('Annuler'),
    close: () => {
      if (!pending) bands.close()
    },
    canConfirm: () => !!opened && valid(),
  })
  const input = document.createElement('input')
  input.type = 'search'
  input.placeholder = tr('Rechercher un titre ou une légende…')
  input.setAttribute('aria-label', tr('Rechercher une cible'))
  input.dataset.initialFocus = ''
  const results = document.createElement('div')
  results.className = 'command-palette-results'
  results.setAttribute('aria-label', tr('Cibles du document'))
  const components = document.createElement('fieldset')
  components.className = 'reference-components'
  const legend = document.createElement('legend')
  legend.textContent = tr('Contenu du renvoi')
  components.append(legend)
  const checkbox = (text: string) => {
    const label = document.createElement('label'),
      control = document.createElement('input')
    control.type = 'checkbox'
    label.append(control, document.createTextNode(text))
    components.append(label)
    return control
  }
  const full = checkbox(tr('Libellé complet')),
    page = checkbox(tr('Page'))
  const example = document.createElement('p')
  example.className = 'band-hint'
  example.setAttribute('role', 'status')
  panel.body.append(input, results, components, example)
  const navigation = navigationGroup(results, {
    input,
    axis: 'vertical',
    enter: false,
    onSelect: (item) => {
      if (opened) {
        opened.reference.target = item.dataset.target!
        refreshChoice()
        panel.draftChanged()
      }
    },
  })
  function valid() {
    const r = opened?.reference
    return (
      !pending &&
      !editor.view.composing &&
      !!r &&
      (r.include_label || r.include_page) &&
      referenceTargets(editor).some((t) => t.id === r.target) &&
      [...results.children].some((item) => (item as HTMLElement).dataset.target === r.target)
    )
  }
  function refreshChoice() {
    if (!opened) return
    const r = opened.reference
    full.checked = r.include_label
    page.checked = r.include_page
    apply.disabled = !valid()
    example.textContent =
      !r.include_label && !r.include_page
        ? tr('Sélectionnez le libellé, la page ou les deux.')
        : referenceLabel(editor, r)
  }
  function search(reset = true) {
    if (!opened) return
    const normalize = (s: string) =>
      s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase()
    const query = normalize(input.value).trim().split(/\s+/).filter(Boolean)
    const matches = referenceTargets(editor).filter((t) =>
      query.every((word) => normalize(t.title).includes(word)),
    )
    results.replaceChildren()
    if (reset && !matches.some((t) => t.id === opened!.reference.target))
      opened.reference.target = matches[0]?.id || ''
    for (const t of matches) {
      const button = document.createElement('button')
      button.type = 'button'
      button.tabIndex = -1
      button.dataset.target = t.id
      button.setAttribute('aria-selected', String(t.id === opened.reference.target))
      button.innerHTML = icon(
        t.kind === 'heading' ? 'heading-1' : t.kind === 'figure' ? 'image' : 'table-2',
      )
      const text = document.createElement('span')
      text.textContent = t.title
      button.append(text)
      results.append(button)
    }
    navigation.refresh(true)
    refreshChoice()
    if (!matches.some((t) => t.id === opened!.reference.target)) {
      apply.disabled = true
      example.textContent = tr('Cible introuvable')
    }
    if (!matches.length) example.textContent = tr('Aucune cible ne correspond.')
    bands.reveal()
  }
  full.onchange = page.onchange = () => {
    if (opened) {
      opened.reference.include_label = full.checked
      opened.reference.include_page = page.checked
      refreshChoice()
      panel.draftChanged()
    }
  }
  input.oninput = () => search()
  panel.action({
    label: tr('Annuler'),
    run: () => {
      if (!pending) bands.close()
    },
  })
  const apply = panel.action({ label: tr('Insérer'), primary: true, run: () => panel.submit() })
  panel.confirm = () => {
    void confirm()
  }
  async function confirm() {
    const current = opened,
      target = bands.target
    if (!current || !target || !valid()) return
    const node = editor.state.doc.nodeAt(target.from)
    if (current.node && (!node || !current.node.eq(node))) {
      panel.error.textContent = tr(
        'Ce bloc a été modifié ailleurs. Fermez puis rouvrez ses paramètres.',
      )
      return
    }
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
    apply.disabled = true
    panel.body.inert = true
    try {
      await applyObjectEdit(editor, transaction, commands, {
        focus: false,
        current: () => opened === current,
      })
      panel.committed()
      bands.close(true, editor.state.selection.getBookmark())
    } catch (error) {
      if (opened === current) panel.error.textContent = errorText(error)
    } finally {
      pending = false
      panel.body.inert = false
      if (opened === current) refreshChoice()
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
    search(false)
    return true
  }
  editor.on('transaction', ({ transaction }) => {
    if (opened && (transaction.docChanged || transaction.getMeta('cross-reference-index')))
      search(false)
  })
  return {
    open(pos?: number) {
      if (pending || !editingAvailability(editor).enabled) return
      const node = pos === undefined ? undefined : editor.state.doc.nodeAt(pos)
      if (pos !== undefined && node?.type.name !== 'crossReference') return
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
      const from = pos ?? editor.state.selection.from,
        to = node ? from + node.nodeSize : editor.state.selection.to
      bands.close(false)
      opened = current
      input.value = ''
      panel.error.textContent = ''
      panel.title.textContent = node ? tr('Modifier le renvoi') : tr('Insérer un renvoi')
      apply.textContent = node ? tr('Valider') : tr('Insérer')
      bands.open(panel, { from, to, placement: 'text' }, () => {
        opened = undefined
      })
      opened = current
      search()
    },
  }
}
