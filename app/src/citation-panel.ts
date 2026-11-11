import type { Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'
import { openBibliography } from './bibliography-manager'
import { editingAvailability } from './command-availability'
import { editingProvider } from './editing-history'
import { contextPanel } from './context-panel'
import { floatingEditorPanel } from './floating-editor-panel'
import type { SelectorTrigger } from './inline-selector-input'
import { navigationGroup } from './keyboard-navigation'
import type { BandHost } from './band-layout'
import type { ObjectMenu } from './object-menu'
import type { Provider, Transport } from './provider'
import {
  referenceRecords,
  citationEntry,
  citationLabel,
  type ReferenceEntry,
  type CitationItem,
  type Citation,
} from './citation-index'
import { tr } from './i18n'
import { icon } from './icons'
import { documentContent } from './shared-inline-marks'
import { applyObjectEdit, inlineTarget, treeTarget } from './object-commands'
import { errorText } from './command-error'
import './citation-panel.css'

interface Draft extends Citation {
  node?: PMNode
  grouped: boolean
}

export function citationPanel(
  editor: Editor,
  provider: Provider,
  transport: Transport,
  bands: BandHost,
  menu: ObjectMenu,
  host: HTMLElement,
) {
  let opened: Draft | undefined
  let session: ReturnType<ReturnType<typeof floatingEditorPanel>['open']> | undefined
  let ticket = 0,
    pending = false,
    results: ReferenceEntry[] = []
  const panel = contextPanel({
    id: 'citation-properties',
    closeLabel: tr('Annuler'),
    close: () => floating.close(true),
    canConfirm: () => ready() && !!opened?.items.length,
    tabExit: () => floating.close(true),
  })
  const floating = floatingEditorPanel(editor, host, panel)
  panel.element.classList.add('citation-selector')
  const input = document.createElement('input')
  input.type = 'search'
  input.placeholder = tr('Auteur, titre, année ou clé…')
  input.setAttribute('aria-label', tr('Rechercher une référence'))
  input.dataset.initialFocus = ''
  const searchBox = document.createElement('div')
  searchBox.className = 'floating-editor-search'
  searchBox.innerHTML = icon('search')
  searchBox.append(input)
  const choices = document.createElement('div')
  choices.id = 'citation-search-results'
  choices.className = 'floating-editor-results'
  choices.setAttribute('aria-label', tr('Références'))
  const status = document.createElement('div')
  status.className = 'citation-search-status'
  status.setAttribute('role', 'status')
  const composition = document.createElement('div')
  composition.className = 'citation-composition'
  const heading = document.createElement('strong')
  heading.textContent = tr('Références de la citation')
  const chosen = document.createElement('ol')
  chosen.className = 'citation-selected'
  const formLabel = document.createElement('label')
  formLabel.className = 'citation-form'
  formLabel.textContent = tr('Forme de la citation')
  const form = document.createElement('select')
  form.setAttribute('aria-label', tr('Forme de la citation'))
  form.add(new Option(tr('Standard'), 'normal'))
  form.add(new Option(tr('Dans la phrase'), 'prose'))
  form.onchange = () => {
    if (!opened) return
    opened.form = form.value as Citation['form']
    refreshComposition()
  }
  formLabel.append(form)
  composition.append(heading, chosen, formLabel)
  const footer = document.createElement('div')
  footer.className = 'citation-footer'
  const hint = document.createElement('span')
  hint.className = 'citation-hint'
  hint.textContent = `↵ ${tr('Citer')} · ⇧↵ ${tr('Ajouter au groupe')}`
  const preview = document.createElement('output')
  preview.className = 'citation-badge-example'
  preview.setAttribute('aria-label', tr('Aperçu de la citation'))
  const actions = document.createElement('div')
  actions.className = 'citation-footer-actions'
  footer.append(hint, preview, actions)
  panel.body.append(searchBox, choices, status, composition, footer)
  panel.action({ label: tr('Annuler'), parent: actions, run: () => floating.close(true) })
  const apply = panel.action({
    label: tr('Insérer'),
    parent: actions,
    primary: true,
    run: () => panel.submit(),
  })
  panel.confirm = () => void confirm(opened?.items || [])

  const navigation = navigationGroup(choices, {
    axis: 'vertical',
    input,
    items: '[data-entry]',
    popupRole: 'grid',
    itemRole: 'gridcell',
    onActivate: (cell) => {
      const entry = results[Number(cell.dataset.entry)]
      if (!entry || !opened || !ready()) return
      if (opened.grouped) add(entry)
      else void confirm([{ record_id: entry.record_id, supplement: '' }])
    },
    onAlternateActivate: (cell) => {
      const entry = results[Number(cell.dataset.entry)]
      if (entry) add(entry)
    },
  })

  function ready() {
    return !pending && !panel.composing && !editor.view.composing && !!session?.current()
  }

  function add(entry: ReferenceEntry) {
    if (!opened || !ready() || opened.items.some((item) => item.record_id === entry.record_id))
      return
    opened.grouped = true
    opened.items.push({ record_id: entry.record_id, supplement: '' })
    input.value = ''
    renderChosen()
    panel.draftChanged()
    panel.focus()
    void search()
  }

  function renderResults(entries: ReferenceEntry[]) {
    results = entries
    choices.replaceChildren(
      ...entries.map((entry, index) => {
        const row = document.createElement('div')
        row.className = 'citation-result-row'
        row.setAttribute('role', 'row')
        const cell = document.createElement('div')
        cell.dataset.entry = String(index)
        const result = document.createElement('button')
        result.type = 'button'
        result.tabIndex = -1
        result.className = 'citation-result'
        const title = document.createElement('strong'),
          detail = document.createElement('small')
        title.className = detail.className = 'floating-editor-result-line'
        title.textContent = entry.title || entry.key
        detail.textContent = [entry.authors, entry.year, entry.key].filter(Boolean).join(' · ')
        result.append(title, detail)
        cell.append(result)
        row.append(cell)
        if (!opened?.grouped) {
          const extra = document.createElement('div')
          extra.setAttribute('role', 'gridcell')
          const append = iconAction('plus', `${tr('Ajouter au groupe')} · ${entry.label}`, () =>
            add(entry),
          )
          append.setAttribute('aria-keyshortcuts', 'Shift+Enter')
          extra.append(append)
          row.append(extra)
        }
        return row
      }),
    )
    navigation.refresh(true)
  }

  async function search() {
    const state = opened,
      anchor = session,
      current = ++ticket
    if (!state || !anchor?.current()) return
    // Retire previous results before a keystroke can activate the wrong notice.
    renderResults([])
    status.textContent = ''
    try {
      const entries = await transport.invoke<ReferenceEntry[]>('bibliography_search', {
        files: referenceRecords(provider),
        query: input.value,
      })
      if (current !== ticket || !anchor.current()) return
      const selected = new Set(state.items.map((item) => item.record_id))
      const matches = entries.filter((entry) => !selected.has(entry.record_id))
      renderResults(matches)
      if (!matches.length && (!selected.size || input.value.trim()))
        status.textContent = tr('Aucune référence ne correspond.')
      floating.place()
    } catch (error) {
      if (current === ticket && anchor.current()) panel.error.textContent = errorText(error)
    }
  }

  function iconAction(name: string, label: string, run: () => void) {
    const button = document.createElement('button')
    button.type = 'button'
    button.innerHTML = icon(name)
    button.setAttribute('aria-label', label)
    button.title = label
    button.onclick = run
    return button
  }
  function refreshComposition() {
    if (!opened) return
    composition.hidden = actions.hidden = !opened.grouped
    hint.hidden = opened.grouped
    preview.hidden = !opened.items.length
    preview.textContent = citationLabel(editor, opened.items, opened.form)
    apply.disabled = pending || !opened.items.length
    floating.place()
  }
  function renderChosen(restoreFocus?: { index: number; direction: number }) {
    const state = opened
    if (!state) return
    chosen.replaceChildren(
      ...state.items.map((item, index) => {
        const entry =
          citationEntry(editor, item.record_id) ||
          results.find((record) => record.record_id === item.record_id)
        const row = document.createElement('li')
        row.className = 'citation-selected-row'
        const label = document.createElement('span')
        label.textContent = entry?.label || '?'
        const supplement = document.createElement('input')
        supplement.placeholder = tr('p. 42')
        supplement.setAttribute('aria-label', `${tr('Pages ou chapitre')} · ${entry?.key || '?'}`)
        supplement.value = item.supplement
        supplement.oninput = () => (item.supplement = supplement.value)
        const controls = document.createElement('div')
        controls.className = 'citation-row-actions'
        if (state.items.length > 1) {
          for (const direction of [-1, 1]) {
            const destination = index + direction
            const name = tr(direction < 0 ? 'Monter' : 'Descendre')
            const move = iconAction(
              direction < 0 ? 'chevron-up' : 'chevron-down',
              `${name} · ${label.textContent}`,
              () => {
                if (!ready()) return
                state.items.splice(index, 1)
                state.items.splice(destination, 0, item)
                panel.draftChanged()
                renderChosen({ index: destination, direction })
              },
            )
            move.dataset.direction = String(direction)
            move.disabled = destination < 0 || destination >= state.items.length
            controls.append(move)
          }
        }
        const remove = iconAction(
          'x',
          `${tr('Retirer de la citation')} · ${label.textContent}`,
          () => {
            if (!ready()) return
            state.items.splice(index, 1)
            renderChosen()
            panel.draftChanged()
            panel.focus()
            void search()
          },
        )
        controls.append(remove)
        row.append(label, supplement, controls)
        return row
      }),
    )
    refreshComposition()
    if (restoreFocus) {
      const row = chosen.children[restoreFocus.index]
      const moves = row?.querySelectorAll<HTMLButtonElement>(
        'button[data-direction]:not(:disabled)',
      )
      const button =
        [...(moves || [])].find(
          (move) => Number(move.dataset.direction) === restoreFocus.direction,
        ) || moves?.[0]
      button?.focus({ preventScroll: true })
    }
  }

  panel.recoveryData = () =>
    opened
      ? { new: !opened.node, items: opened.items, form: opened.form, grouped: opened.grouped }
      : null
  panel.restoreRecoveryData = (data) => {
    if (
      !opened ||
      !Array.isArray(data?.items) ||
      !data.items.every((item: unknown) => isCitationItem(item)) ||
      (data.form !== 'normal' && data.form !== 'prose')
    )
      return false
    opened.items = structuredClone(data.items)
    opened.form = data.form
    opened.grouped = !!opened.node || !!data.grouped || !!opened.items.length
    form.value = data.form
    renderChosen()
    void search()
    return true
  }

  editor.on('transaction', ({ transaction }) => {
    if (floating.isOpen && transaction.getMeta('bibliography-index')) {
      // Refresh results and the preview without rebuilding a locator field being typed in.
      refreshComposition()
      void search()
    }
  })
  input.oninput = () => void search()

  function createNotice(online = false) {
    const state = opened,
      anchor = session
    if (!state || !anchor || !ready()) return
    const target = anchor.range
    openBibliography(editor, provider, transport, {
      create: !online,
      online,
      query: input.value,
      cite: {
        node: {
          type: 'citation',
          attrs: { items: structuredClone(state.items), form: state.form },
          marks: state.node?.marks.map((mark) => mark.toJSON()),
        },
        target: inlineTarget(editor, target.from, target.to) as unknown as Record<string, unknown>,
        document: documentContent(editor.getJSON()),
        position: target.from,
      },
      done: () => {
        if (session !== anchor) return
        panel.committed()
        floating.close(true, true)
      },
    })
  }
  panel.action({ label: tr('Créer une notice…'), run: () => createNotice() })
  panel.action({ label: tr('Rechercher en ligne'), run: () => createNotice(true) })

  async function confirm(items: CitationItem[]) {
    const state = opened,
      anchor = session
    if (!state || !anchor || !items.length || !ready()) return
    const target = anchor.range
    pending = true
    anchor.pending(true)
    panel.error.textContent = ''
    panel.element.setAttribute('aria-busy', 'true')
    panel.body.inert = true
    apply.disabled = true
    try {
      const attrs = { items: items.map((item) => ({ ...item })), form: state.form }
      const replacement = editor.schema.nodes.citation.create(attrs, undefined, state.node?.marks)
      const transaction = state.node
        ? editor.state.tr.setNodeMarkup(target.from, undefined, { ...state.node.attrs, ...attrs })
        : editor.state.tr.replaceWith(target.from, target.to, replacement)
      transaction.setSelection(
        TextSelection.create(transaction.doc, target.from + replacement.nodeSize),
      )
      const commands = editingProvider(editor)
        ? [
            state.node
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
      panel.body.inert = false
      panel.element.removeAttribute('aria-busy')
      if (anchor.open()) {
        refreshComposition()
        if (document.activeElement === document.body) panel.focus()
      }
    }
  }

  return {
    get isOpen() {
      return floating.isOpen
    },
    focus: floating.focus,
    close: floating.close,
    open(pos?: number, trigger?: SelectorTrigger) {
      if (pending || !editingAvailability(editor).enabled) return false
      const node = pos === undefined ? undefined : editor.state.doc.nodeAt(pos)
      if (pos !== undefined && node?.type.name !== 'citation') return false
      const from = pos ?? editor.state.selection.from,
        to = node ? from + node.nodeSize : editor.state.selection.to
      bands.close(false)
      menu.close()
      floating.close()
      opened = {
        node: node || undefined,
        items: structuredClone(node?.attrs.items || []),
        form: node?.attrs.form || 'normal',
        grouped: !!node,
      }
      input.value = ''
      form.value = opened.form
      panel.error.textContent = ''
      status.textContent = ''
      panel.title.textContent = tr(node ? 'Modifier la citation' : 'Citer une référence')
      apply.textContent = tr(node ? 'Appliquer' : 'Insérer')
      renderResults([])
      renderChosen()
      session = floating.open({ from, to, object: !!node, trigger })
      void search()
      return floating.isOpen
    },
  }
}

function isCitationItem(value: unknown): value is CitationItem {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<CitationItem>
  return typeof item.record_id === 'string' && typeof item.supplement === 'string'
}
