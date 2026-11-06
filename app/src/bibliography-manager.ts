import type { Editor, JSONContent } from '@tiptap/core'
import type { Provider, Transport } from './provider'
import { stableJSON } from './provider'
import { metadataCommands } from './metadata-commands'
import { formDialog } from './form-dialog'
import { bibliographyQuery } from './bibliography-query'
import { bibliographyFields, diagnosticText } from './bibliography-fields'
import {
  importReview,
  refreshImportPlan,
  reviewImport,
  type ImportDraft,
} from './bibliography-import'
import type { Browse, Form, Draft, Notice, Source, Report } from './bibliography-types'
import { genres } from './bibliography-types'
import { navigationGroup, actionRow } from './keyboard-navigation'
import { labeledField } from './form-field'
import { referenceRecords } from './citation-index'
import { documentContent } from './shared-inline-marks'
import { positionAtPath } from './editor-targets'
import { consumeRecovered, type RecoveredItem } from './recovered-work'
import { icon } from './icons'
import { tr } from './i18n'
import { errorText } from './command-error'
import type { StructuredCommand } from './structured-commands'
interface Cite {
  node?: JSONContent
  target: Record<string, unknown>
  document: JSONContent
  position: number
}
interface Options {
  create?: boolean
  cite?: Cite
  done?: () => void
  recovered?: RecoveredItem
}
interface OpenManager {
  focus(): void
  resume(item: RecoveredItem): void
}
const managers = new WeakMap<Provider, OpenManager>()
export function resumeBibliography(
  provider: Provider,
  editor: Editor,
  transport: Transport,
  item: RecoveredItem,
) {
  openBibliography(editor, provider, transport, { recovered: item })
  return true
}
/** A private form over frozen native data; every publication uses the shared document engine. */
export function openBibliography(
  editor: Editor,
  provider: Provider,
  transport: Transport,
  options: Options = {},
) {
  if (managers.has(provider)) {
    if (options.recovered) managers.get(provider)!.resume(options.recovered)
    else managers.get(provider)!.focus()
    return
  }
  let alive = true,
    busy = false,
    browsing = false,
    ticket = 0,
    reviewTicket = 0,
    draft: Draft | undefined,
    imported: ImportDraft | undefined,
    baseline = '',
    recovered = options.recovered,
    cite = options.cite
  let cleanupFields = () => {}
  let rows: Browse['entries'] = [],
    total = 0,
    lastLibrary = stableJSON(referenceRecords(provider))
  const generation = provider.generation,
    identity = provider.doc.getMap('settings').get('identity')
  const initialFocus = document.activeElement as HTMLElement
  const form = formDialog({
    id: 'bibliography-manager',
    title: tr('Bibliothèque du projet'),
    cancel: () => leave(() => destroy()),
    returnFocus: () => (initialFocus?.isConnected ? initialFocus : editor.view.dom),
  })
  form.dialog.classList.add('bibliography-dialog')
  const layout = document.createElement('div'),
    left = document.createElement('aside'),
    right = document.createElement('section'),
    list = document.createElement('div'),
    search = document.createElement('input'),
    count = document.createElement('p'),
    add = document.createElement('button'),
    load = document.createElement('button'),
    file = document.createElement('input')
  layout.className = 'bibliography-layout'
  left.className = 'bibliography-browser'
  right.className = 'bibliography-detail'
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
  add.type = load.type = 'button'
  add.innerHTML = icon('plus')
  add.setAttribute('aria-label', tr('Créer une notice'))
  load.textContent = tr('Importer…')
  file.type = 'file'
  file.accept = '.bib,.yaml,.yml'
  file.hidden = true
  file.setAttribute('aria-label', tr('Fichiers bibliographiques'))
  const top = actionRow()
  top.append(load, add)
  left.append(search, count, top, list, file)
  layout.append(left, right)
  form.body.append(layout)
  const remove = form.action({
    label: tr('Supprimer'),
    danger: true,
    run: () => void removeNotice(),
  })
  const cancel = form.action({ label: tr('Annuler'), run: () => leave(() => destroy()) })
  const save = form.action({ label: tr('Valider'), primary: true, run: () => void publish() })
  const close = form.action({ label: tr('Fermer'), run: () => leave(() => destroy()) })
  const navigation = navigationGroup(list, {
    axis: 'vertical',
    input: search,
    onActivate: (row) => {
      if (!browsing && !busy) leave(() => void select(row.dataset.recordId!, true))
    },
  })
  const api = <T>(operation: string, params: Record<string, unknown> = {}) =>
    bibliographyQuery<T>(provider, transport, operation, params, documentContent(editor.getJSON()))
  const current = () =>
    alive &&
    !editor.isDestroyed &&
    generation === provider.generation &&
    identity === provider.doc.getMap('settings').get('identity')
  const message = (error: unknown) => {
    form.error.textContent = error instanceof Error ? error.message : errorText(error)
  }
  const data = () => ({ draft, imported, cite, query: search.value })
  const dirty = () => !!imported || (!!draft && stableJSON(draft) !== baseline)
  function changed() {
    form.draftChanged()
    refreshActions()
  }
  function refreshActions() {
    remove.hidden = !draft || draft.creating || !!imported
    remove.disabled = busy
    save.hidden = !draft && !imported
    save.disabled =
      busy ||
      (!!imported &&
        (imported.report.plan.blocked || imported.ready !== stableJSON(imported.decisions)))
    save.textContent = tr(
      imported
        ? 'Importer'
        : cite
          ? draft?.creating
            ? 'Créer et citer'
            : 'Valider et citer'
          : 'Valider',
    )
    cancel.disabled = close.disabled = busy
    cancel.hidden = !dirty()
    close.hidden = dirty()
    load.disabled = add.disabled = busy || browsing
    form.element.querySelector<HTMLButtonElement>('.panel-title button')!.disabled = busy
  }
  function track() {
    form.detachRecovery()
    form.recoveryData = data
    form.trackRecovery(provider, { kind: 'bibliography' })
    if (recovered) {
      form.bindRecoverySource(recovered.id)
      const sourceId = recovered.id
      form.recoveryApplied = () => consumeRecovered(provider, sourceId)
    }
    changed()
  }
  function clear() {
    form.discardRecovery()
    draft = undefined
    imported = undefined
    baseline = ''
    cleanupFields()
    cleanupFields = () => {}
    right.replaceChildren()
    refreshActions()
  }
  function onEditorDestroy() {
    destroy()
  }
  function destroy() {
    editor.off('destroy', onEditorDestroy)
    if (!alive) return
    alive = false
    cleanupFields()
    ticket++
    reviewTicket++
    provider.doc.getMap('settings').unobserveDeep(observe)
    navigation.destroy()
    managers.delete(provider)
    form.destroy()
  }
  function leave(action: () => void) {
    if (busy || form.composing) return
    if (!dirty()) {
      clear()
      action()
      return
    }
    const previousFocus = document.activeElement as HTMLElement
    const question = formDialog({
      id: 'bibliography-leave',
      title: tr('Conserver les modifications ?'),
      cancel: () => question.destroy(),
      returnFocus: () => (previousFocus?.isConnected ? previousFocus : form.element),
    })
    question.body.textContent = tr('Cette saisie n’a pas encore été appliquée au document.')
    question.action({
      label: tr('Abandonner'),
      danger: true,
      run: () => {
        question.destroy()
        if (recovered) void consumeRecovered(provider, recovered.id).catch(message)
        recovered = undefined
        clear()
        action()
      },
    })
    question.action({ label: tr('Continuer l’édition'), run: () => question.destroy() })
    question.action({
      label: tr('Valider et poursuivre'),
      primary: true,
      run: async () => {
        question.destroy()
        if (await publish(false)) action()
      },
    })
    question.open()
  }
  async function browse() {
    const id = ++ticket
    browsing = true
    refreshActions()
    list.inert = true
    list.setAttribute('aria-busy', 'true')
    try {
      const result = await api<Browse>('bibliography.browse', { query: search.value })
      if (!current() || id !== ticket) return
      list.inert = false
      list.setAttribute('aria-busy', 'false')
      rows = result.entries
      total = result.total
      count.textContent = tr('{count} / {total} notices', { count: rows.length, total })
      list.replaceChildren()
      for (const record of rows) {
        const row = document.createElement('button'),
          name = document.createElement('span'),
          title = document.createElement('span')
        row.type = 'button'
        row.dataset.recordId = record.id
        row.className = 'bibliography-list-row'
        row.setAttribute('aria-selected', String(record.id === draft?.base.id))
        name.textContent = `${record.names} · ${record.year ?? '—'}${record.incomplete ? ' ◦' : ''}`
        title.textContent = record.title || record.key
        row.setAttribute(
          'aria-label',
          `${record.names} · ${record.year ?? '—'} · ${record.title || record.key}${record.incomplete ? ` · ${tr('Notice incomplète')}` : ''}`,
        )
        row.append(name, title)
        list.append(row)
      }
      navigation.refresh()
      if (!draft && !imported && rows.length) await select(rows[0].id, false)
    } catch (error) {
      if (current() && id === ticket) {
        list.inert = false
        list.setAttribute('aria-busy', 'false')
        list.replaceChildren()
        message(error)
      }
    } finally {
      if (id === ticket) {
        browsing = false
        refreshActions()
      }
    }
  }
  function show() {
    for (const row of list.querySelectorAll<HTMLElement>('[data-record-id]'))
      row.setAttribute('aria-selected', String(row.dataset.recordId === draft?.base.id))
    cleanupFields()
    cleanupFields = () => {}
    right.replaceChildren()
    form.error.textContent = ''
    if (imported) {
      importReview(right, imported, referenceRecords(provider), () => {
        changed()
        void resolve()
      })
      refreshActions()
      return
    }
    if (!draft) {
      right.textContent = tr('Créez ou importez une notice pour commencer.')
      refreshActions()
      return
    }
    const selected = draft
    const header = document.createElement('div'),
      genre = document.createElement('select')
    header.className = 'bibliography-notice-heading'
    for (const [id, name] of Object.entries(genres)) genre.add(new Option(tr(name), id))
    genre.value = draft.base.genre
    genre.disabled = !draft.creating
    genre.id = 'bibliography-genre'
    genre.onchange = () => {
      const next = genre.value
      genre.value = selected.base.genre
      leave(() => void create(next))
    }
    header.append(labeledField(tr('Genre de notice'), genre))
    right.append(header)
    cleanupFields = bibliographyFields(right, draft.fields, draft.values, changed)
    const key = document.createElement('input')
    key.id = 'bibliography-key'
    key.value = draft.key
    key.placeholder = draft.base.key
    key.oninput = () => {
      selected.key = key.value
      changed()
    }
    const identifiers = right.querySelector('details') || right
    identifiers.append(labeledField(tr('Clé de citation'), key))
    const hints = document.createElement('p')
    hints.className = 'bibliography-completeness'
    hints.textContent = tr('Les champs conseillés manquants n’empêchent pas la validation.')
    right.append(hints)
    const usage = document.createElement('button')
    usage.type = 'button'
    usage.textContent = tr('Voir les citations')
    usage.hidden = draft.creating
    usage.onclick = () => void findCitations().catch(message)
    right.append(usage)
    if (!draft.creating)
      void api<{ targets: { path: number[] }[] }>('bibliography.usage', { id: draft.base.id })
        .then((result) => {
          if (current() && draft === selected) {
            usage.textContent = tr('Voir les citations ({count})', { count: result.targets.length })
            usage.disabled = !result.targets.length
          }
        })
        .catch(message)
    refreshActions()
  }
  async function select(id: string, focus: boolean) {
    if (busy) return
    busy = true
    right.inert = true
    refreshActions()
    try {
      const record = await api<{ record: Notice; fingerprint: string }>('bibliography.record', {
        id,
      })
      const fields = await api<Form>('bibliography.form', { record: record.record })
      if (!current()) return
      clear()
      draft = {
        base: record.record,
        fingerprint: record.fingerprint,
        fields: fields.fields,
        values: {},
        key: record.record.key,
        creating: false,
      }
      show()
      baseline = stableJSON(draft)
      track()
      if (focus) right.querySelector<HTMLInputElement>('input')?.focus()
    } catch (error) {
      message(error)
    } finally {
      busy = false
      right.inert = false
      refreshActions()
      if (focus && current()) right.querySelector<HTMLInputElement>('input')?.focus()
    }
  }
  async function create(genre = 'journal_article') {
    if (busy) return
    busy = true
    right.inert = true
    refreshActions()
    try {
      const record = await api<{ record: Notice; fingerprint: string }>(
        'bibliography.prepare_record',
        { id: crypto.randomUUID(), genre },
      )
      const fields = await api<Form>('bibliography.form', { record: record.record })
      if (!current()) return
      clear()
      draft = {
        base: record.record,
        fingerprint: record.fingerprint,
        fields: fields.fields,
        values: {},
        key: '',
        creating: true,
      }
      show()
      baseline = stableJSON(draft)
      track()
      right.querySelector<HTMLInputElement>('input[data-initial-focus]')?.focus()
    } catch (error) {
      message(error)
    } finally {
      busy = false
      right.inert = false
      refreshActions()
      if (current()) right.querySelector<HTMLInputElement>('input[data-initial-focus]')?.focus()
    }
  }
  async function publish(finish = true): Promise<boolean> {
    if (busy || form.composing || !current()) return false
    const selected = draft,
      review = imported
    if (!selected && !review) return false
    const frozen = stableJSON({ draft, imported, cite }),
      focused = document.activeElement as HTMLElement
    busy = true
    right.inert = true
    refreshActions()
    form.error.textContent = ''
    try {
      const batch: StructuredCommand[] = []
      if (review) {
        if (review.report.plan.blocked || review.ready !== stableJSON(review.decisions))
          return false
        batch.push({
          id: 'bibliography.apply',
          params: {
            expected: review.report.library_fingerprint,
            change: {
              kind: 'import',
              source: review.source,
              preparation: review.report.fingerprint,
              decisions: review.decisions,
            },
          },
        })
      } else if (selected) {
        const prepared = await api<Form>('bibliography.prepare_form', {
          record: selected.base,
          values: selected.values,
          key: selected.key || null,
        })
        const inspection = await api<{ fingerprint: string }>('bibliography.inspect')
        if (
          selected.creating ||
          prepared.patches.length ||
          prepared.record.key !== selected.base.key
        )
          batch.push({
            id: 'bibliography.apply',
            params: {
              expected: inspection.fingerprint,
              change: selected.creating
                ? { kind: 'create', record: prepared.record }
                : {
                    kind: 'edit',
                    id: selected.base.id,
                    expected: selected.fingerprint,
                    patches: prepared.patches,
                    genre: null,
                    key: prepared.record.key,
                  },
            },
          })
        if (cite) {
          if (stableJSON(documentContent(editor.getJSON())) !== stableJSON(cite.document))
            throw new Error(
              tr('La cible de citation a changé ; votre notice est conservée dans ce formulaire.'),
            )
          batch.push({
            id: 'inline.replace',
            params: {
              target: cite.target,
              node: {
                type: 'citation',
                marks: cite.node?.marks,
                attrs: {
                  ...cite.node?.attrs,
                  items: [
                    ...(cite.node?.attrs?.items || []),
                    { record_id: selected.base.id, supplement: '' },
                  ],
                  form: cite.node?.attrs?.form || 'normal',
                },
              },
            },
          })
        }
      }
      if (!current() || draft !== selected || imported !== review) return false
      await metadataCommands(editor, provider).run(
        batch,
        () =>
          current() &&
          stableJSON({ draft, imported, cite }) === frozen &&
          draft === selected &&
          imported === review &&
          (!cite || stableJSON(documentContent(editor.getJSON())) === stableJSON(cite.document)),
      )
      form.committed()
      recovered = undefined
      const id = selected?.base.id,
        position = cite?.position
      clear()
      busy = false
      if (cite) {
        destroy()
        if (position !== undefined) editor.commands.setTextSelection(position + 1)
        options.done?.()
        editor.view.focus()
      } else if (finish) {
        await browse()
        if (id) await select(id, false)
      }
      return true
    } catch (error) {
      message(error)
      return false
    } finally {
      busy = false
      right.inert = false
      refreshActions()
      if (current() && focused?.isConnected) focused.focus({ preventScroll: true })
    }
  }
  async function removeNotice() {
    const selected = draft
    if (!selected || selected.creating || busy) return
    const question = formDialog({
      id: 'bibliography-remove',
      title: tr('Supprimer cette notice ?'),
      cancel: () => question.destroy(),
      returnFocus: () => remove,
    })
    question.body.textContent = selected.base.key
    question.action({ label: tr('Annuler'), run: () => question.destroy() })
    question.action({
      label: tr('Supprimer'),
      danger: true,
      primary: true,
      run: async () => {
        if (busy) return
        busy = true
        refreshActions()
        try {
          const inspection = await api<{ fingerprint: string }>('bibliography.inspect')
          await metadataCommands(editor, provider).run(
            [
              {
                id: 'bibliography.apply',
                params: {
                  expected: inspection.fingerprint,
                  change: { kind: 'remove', id: selected.base.id, expected: selected.fingerprint },
                },
              },
            ],
            () => current() && draft === selected,
          )
          form.committed()
          recovered = undefined
          question.destroy()
          clear()
          busy = false
          await browse()
        } catch (error) {
          question.error.textContent = error instanceof Error ? error.message : errorText(error)
        } finally {
          busy = false
          refreshActions()
        }
      },
    })
    question.open()
  }
  async function findCitations() {
    if (!draft) return
    const result = await api<{ targets: { path: number[] }[] }>('bibliography.usage', {
      id: draft.base.id,
    })
    const target = result.targets[0]
    if (target)
      leave(() => {
        destroy()
        const position = positionAtPath(editor, target.path)
        editor.commands.setTextSelection(position + 1)
        editor.view.focus()
      })
  }
  async function resolve() {
    const selected = imported
    if (!selected) return
    const id = ++reviewTicket
    refreshActions()
    try {
      const result = await reviewImport(provider, transport, selected)
      if (current() && imported === selected && id === reviewTicket) {
        selected.report.plan = result.plan
        refreshImportPlan(right, result.plan)
        selected.ready = stableJSON(selected.decisions)
        form.error.textContent = result.plan.blocked
          ? tr('Cet import nécessite une décision de rapprochement.')
          : ''
        changed()
      }
    } catch (error) {
      if (current() && id === reviewTicket) message(error)
    }
  }
  file.onchange = async () => {
    const selected = file.files?.[0]
    file.value = ''
    if (!selected || busy) return
    busy = true
    refreshActions()
    try {
      if (selected.size > 2 * 1024 * 1024)
        throw new Error(tr('Fichier trop volumineux (2 Mio maximum).'))
      const source: Source = {
        id: crypto.randomUUID(),
        name: selected.name,
        format: selected.name.toLowerCase().endsWith('.bib') ? 'biblatex' : 'hayagriva',
        contents: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
          await selected.arrayBuffer(),
        ),
      }
      busy = false
      refreshActions()
      if (!current()) return
      leave(() => {
        busy = true
        refreshActions()
        void api<Report>(
          'bibliography.prepare_import',
          source as unknown as Record<string, unknown>,
        )
          .then((report) => {
            if (current()) {
              clear()
              imported = { source, report, decisions: [], ready: stableJSON([]) }
              show()
              track()
              form.error.textContent = report.plan.blocked
                ? tr('Cet import nécessite une décision de rapprochement.')
                : ''
            }
          })
          .catch(message)
          .finally(() => {
            busy = false
            refreshActions()
          })
      })
    } catch (error) {
      busy = false
      refreshActions()
      if (current()) message(error)
    }
  }
  function observe() {
    if (!current()) {
      destroy()
      return
    }
    const library = stableJSON(referenceRecords(provider))
    if (library !== lastLibrary) {
      lastLibrary = library
      void browse()
      if (
        draft &&
        !draft.creating &&
        stableJSON(referenceRecords(provider).find((r) => r.id === draft!.base.id)) !==
          stableJSON(draft.base)
      )
        form.error.textContent = tr(
          'Cette notice a été modifiée ailleurs. Votre saisie est conservée.',
        )
    }
  }
  function resume(item: RecoveredItem) {
    const saved = item.payload.data?.data
    if (!saved?.draft && !saved?.imported) return
    recovered = item
    clear()
    draft = structuredClone(saved.draft)
    imported = structuredClone(saved.imported)
    cite = structuredClone(saved.cite)
    search.value = saved.query || ''
    show()
    baseline = ''
    track()
    form.error.textContent = tr('Saisie récupérée · à valider')
    void browse()
    if (imported) void resolve()
  }
  add.onclick = () => leave(() => void create())
  load.onclick = () => {
    file.click()
  }
  search.oninput = () => void browse()
  provider.doc.getMap('settings').observeDeep(observe)
  editor.on('destroy', onEditorDestroy)
  managers.set(provider, {
    focus: () => search.focus(),
    resume: (item) => leave(() => resume(item)),
  })
  form.open()
  refreshActions()
  if (recovered) resume(recovered)
  else if (options.create) void create().then(() => browse())
  else void browse()
}
