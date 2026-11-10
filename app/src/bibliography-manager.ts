import { onlineBibliography } from './bibliography-online'
import type { OnlineCandidate } from './bibliography-online-types'
import { prepareAcquisition, AcquisitionReview } from './bibliography-acquisition'
import { bibliographyConfirmation } from './bibliography-confirmation'
import { bibliographyNotice } from './bibliography-notice'
import type { Editor } from '@tiptap/core'
import type { Provider, Transport } from './provider'
import { stableJSON } from './provider'
import { metadataCommands } from './metadata-commands'
import { formDialog } from './form-dialog'
import { bibliographyRequests } from './bibliography-requests'
import { diagnosticText } from './bibliography-fields'
import { importReview, reviewImport, type ImportDraft } from './bibliography-import'
import type { Browse, Form, Draft, Notice, Source, Report } from './bibliography-types'
import { referenceRecords } from './citation-index'
import { documentContent } from './shared-inline-marks'
import { consumeRecovered, type RecoveredItem } from './recovered-work'
import { bibliographyBrowser } from './bibliography-browser'
import { tr } from './i18n'
import { errorText } from './command-error'
import { prepareBibliographyPublication, type CitationDraft } from './bibliography-publication'
interface Options {
  create?: boolean
  online?: boolean
  query?: string
  cite?: CitationDraft
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
    draft: Draft | undefined,
    imported: ImportDraft | undefined,
    baseline = '',
    recovered = options.recovered,
    cite = options.cite
  let online: ReturnType<typeof onlineBibliography> | undefined
  let reviewing: ReturnType<typeof importReview> | undefined
  let acquisitionReviewOpen = false
  let afterReview: (() => void) | undefined
  let cleanupFields = () => {}
  const expandedSections = new Map<string, boolean>()
  let lastLibrary = stableJSON(referenceRecords(provider))
  const requests = bibliographyRequests(provider, editor, transport)
  const { current, query: api } = requests
  const initialFocus = document.activeElement as HTMLElement
  const form = formDialog({
    id: 'bibliography-manager',
    title: tr('Bibliothèque du projet'),
    cancel: () => {
      if (!busy && !confirmation.close()) leave(destroy)
    },
    escape: () => {
      if (!busy && !form.composing && !confirmation.close()) {
        if (creatingNotice()) cancelCreation()
        else leave(destroy)
      }
    },
    returnFocus: () => (initialFocus?.isConnected ? initialFocus : editor.view.dom),
  })
  form.dialog.classList.add('bibliography-dialog')
  const browser = bibliographyBrowser(form.body, (id) => {
    if (!browsing && !busy && !confirmation.opened) {
      if (draft?.base.id === id) focusNotice()
      else leave(() => void select(id, true))
    }
  })
  const { right, list, search, add, load, file } = browser
  const confirmation = bibliographyConfirmation(right, () => refreshActions())
  const remove = form.action({
    label: tr('Supprimer'),
    danger: true,
    parent: right,
    run: () => void removeNotice(),
  })
  remove.classList.add('bibliography-remove-notice')
  const cancel = form.action({
    label: tr('Annuler'),
    run: () =>
      creatingNotice() ? cancelCreation() : imported ? discard(returnToProject) : leave(destroy),
  })
  const backToResults = form.action({
    label: tr('Retour aux résultats'),
    run: () =>
      leave(() => {
        show()
        online?.focusResult()
      }),
  })
  const backToNotice = form.action({
    label: tr('Modifier la notice'),
    run: () => {
      acquisitionReviewOpen = false
      show()
      focusNotice()
    },
  })
  const save = form.action({
    label: tr('Valider'),
    primary: true,
    run: () => (afterReview ? void saveAndContinue(afterReview) : void publish()),
  })
  const message = (error: unknown) => {
    if (current())
      form.error.textContent = error instanceof Error ? error.message : errorText(error)
  }
  const data = () => ({ draft, imported, cite, acquisitionReviewOpen, query: search.value })
  const dirty = () => !!imported || (!!draft && stableJSON(draft) !== baseline)
  const creatingNotice = () => !!draft?.creating && !draft.acquisition
  function cancelCreation() {
    discard(returnToProject)
  }
  function changed() {
    form.draftChanged()
    refreshActions()
  }
  function refreshActions() {
    const locked = busy || confirmation.opened
    const edited = dirty()
    const plan = imported || (acquisitionReviewOpen ? draft?.acquisition : undefined)
    const action = draft?.acquisition?.report.plan.items[0]?.action
    remove.hidden = !draft || draft.creating || !!plan
    remove.disabled = locked
    save.hidden = !imported && (!draft || !(draft.creating || cite || edited))
    save.disabled =
      save.hidden ||
      locked ||
      (!!plan && (plan.report.plan.blocked || plan.ready !== stableJSON(plan.decisions)))
    save.textContent = tr(
      imported
        ? 'Importer'
        : !acquisitionReviewOpen && draft?.acquisition && action !== 'new'
          ? 'Vérifier le rapprochement'
          : cite
            ? draft?.acquisition
              ? 'Ajouter et citer'
              : draft?.creating
                ? 'Créer et citer'
                : 'Valider et citer'
            : draft?.creating
              ? 'Ajouter au projet'
              : 'Valider',
    )
    cancel.textContent = tr(imported ? 'Annuler l’import' : 'Annuler')
    cancel.disabled = backToResults.disabled = backToNotice.disabled = locked
    cancel.hidden =
      !creatingNotice() && (!edited || (!!online && !!draft && !acquisitionReviewOpen))
    backToResults.hidden = !online || !draft || acquisitionReviewOpen
    backToNotice.hidden = !acquisitionReviewOpen
    browser.online.disabled = load.disabled = add.disabled = locked || browsing
    browser.back.disabled = locked
    right.inert = locked
    online?.lock(locked)
    confirmation.lock(busy)
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
  function showSource(element = online?.element) {
    browser.source(element)
    const searching = !!online && element === online.element
    form.title.textContent = tr(searching ? 'Recherche en ligne' : 'Bibliothèque du projet')
    form.dialog.classList.toggle('bibliography-searching', searching)
  }
  function clear() {
    form.discardRecovery()
    draft = undefined
    imported = undefined
    acquisitionReviewOpen = false
    afterReview = undefined
    baseline = ''
    reviewing?.destroy()
    reviewing = undefined
    cleanupFields()
    cleanupFields = () => {}
    right.replaceChildren()
    showSource()
    refreshActions()
  }
  function onEditorDestroy() {
    destroy()
  }
  function destroy() {
    editor.off('destroy', onEditorDestroy)
    if (!alive) return
    alive = false
    online?.destroy()
    reviewing?.destroy()
    confirmation.close(false)
    cleanupFields()
    requests.destroy()
    provider.doc.getMap('settings').unobserveDeep(observe)
    browser.destroy()
    managers.delete(provider)
    form.destroy()
  }
  function leave(action: () => void) {
    if (busy || form.composing || confirmation.opened) return
    if (!dirty()) {
      clear()
      action()
      return
    }
    confirmation.open(
      'bibliography-leave',
      tr('Conserver les modifications ?'),
      tr('Cette saisie n’a pas encore été appliquée au document.'),
      [
        { label: 'Abandonner', danger: true, run: () => discard(action) },
        { label: 'Continuer l’édition', run: () => confirmation.close() },
        {
          label: 'Valider et poursuivre',
          primary: true,
          run: () => {
            confirmation.close(false)
            void saveAndContinue(action)
          },
        },
      ],
      1,
    )
  }
  async function saveAndContinue(action: () => void) {
    const saved = await publish(false)
    if (!current()) return
    if (saved) action()
    else if (acquisitionReviewOpen) afterReview = action
  }
  function discard(action: () => void) {
    if (busy || form.composing) return
    confirmation.close(false)
    if (recovered) void consumeRecovered(provider, recovered.id).catch(message)
    recovered = undefined
    clear()
    action()
  }
  async function browse(preferred?: string) {
    const latest = requests.latest('browse')
    browsing = true
    refreshActions()
    list.inert = true
    list.setAttribute('aria-busy', 'true')
    try {
      const result = await api<Browse>('bibliography.browse', { query: search.value })
      if (!latest()) return
      list.inert = false
      list.setAttribute('aria-busy', 'false')
      browser.render(result, draft?.base.id)
      const id = preferred || result.entries[0]?.id
      if (!busy && !draft && !imported && !online && id) await select(id, false)
    } catch (error) {
      if (latest()) {
        list.inert = false
        list.setAttribute('aria-busy', 'false')
        list.replaceChildren()
        message(error)
      }
    } finally {
      if (latest()) {
        browsing = false
        refreshActions()
      }
    }
  }
  function show() {
    browser.select(draft?.base.id)
    cleanupFields()
    cleanupFields = () => {}
    right.replaceChildren()
    right.parentElement!.scrollTop = 0
    form.error.textContent = ''
    reviewing?.destroy()
    reviewing = undefined
    const review = imported || (acquisitionReviewOpen ? draft?.acquisition : undefined)
    if (review) {
      reviewing = importReview(
        review,
        referenceRecords(provider),
        () => {
          changed()
          void resolve()
        },
        !!imported,
      )
      right.append(reviewing.element)
      showSource(imported ? reviewing.source : online?.element)
      refreshActions()
      return
    }
    showSource()
    if (!draft) {
      right.textContent = tr(
        online
          ? 'Sélectionnez un résultat pour vérifier la notice.'
          : 'Créez ou importez une notice pour commencer.',
      )
      refreshActions()
      return
    }
    const selected = draft
    right.append(remove)
    const { cleanup } = bibliographyNotice(right, selected, {
      changed,
      profile: (profile) => void changeProfile(profile),
      expanded: expandedSections,
    })
    cleanupFields = cleanup
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
        working: record.record,
        profile: fields.profile,
        profiles: fields.profiles,
        fingerprint: record.fingerprint,
        fields: fields.fields,
        values: {},
        key: record.record.key,
        creating: false,
      }
      show()
      baseline = stableJSON(draft)
      track()
    } catch (error) {
      message(error)
    } finally {
      busy = false
      right.inert = false
      refreshActions()
      if (focus && current()) focusNotice()
    }
  }
  function focusNotice() {
    const input = right.querySelector<HTMLInputElement>('input[data-initial-focus], input')
    for (
      let parent = input?.parentElement;
      parent && parent !== right;
      parent = parent.parentElement
    )
      if (parent instanceof HTMLDetailsElement) parent.open = true
    input?.focus({ preventScroll: true })
  }
  function openOnline() {
    online = onlineBibliography({
      transport,
      current,
      composing: () => form.composing,
      query: options.query || search.value,
      choose: (candidate) => {
        if (draft?.acquisition?.origin.id === candidate.id && !acquisitionReviewOpen) focusNotice()
        else leave(() => void acquire(candidate))
      },
    })
    show()
    online.focus()
  }
  function returnToProject() {
    online?.destroy()
    online = undefined
    show()
    search.focus()
    void browse()
  }
  async function acquire(candidate: OnlineCandidate) {
    if (busy || !current()) return
    busy = true
    right.inert = true
    refreshActions()
    try {
      const prepared = await prepareAcquisition(api, candidate)
      if (!current()) return
      clear()
      draft = prepared
      show()
      baseline = stableJSON(draft)
      track()
      online?.accept(candidate.id)
    } catch (error) {
      message(error)
    } finally {
      busy = false
      right.inert = false
      refreshActions()
      if (current()) focusNotice()
    }
  }
  async function create(profile = 'journal_article') {
    if (busy) return
    busy = true
    right.inert = true
    refreshActions()
    try {
      const record = await api<{ record: Notice; fingerprint: string }>(
        'bibliography.prepare_record',
        { id: crypto.randomUUID(), profile },
      )
      const fields = await api<Form>('bibliography.form', { record: record.record })
      if (!current()) return
      clear()
      draft = {
        base: record.record,
        working: record.record,
        profile: fields.profile,
        profiles: fields.profiles,
        fingerprint: record.fingerprint,
        fields: fields.fields,
        values: {},
        key: '',
        creating: true,
      }
      show()
      baseline = stableJSON(draft)
      track()
    } catch (error) {
      message(error)
    } finally {
      busy = false
      right.inert = false
      refreshActions()
      if (current()) focusNotice()
    }
  }
  async function changeProfile(profile: string) {
    const selected = draft
    if (!selected || busy || form.composing || !current()) return
    busy = true
    right.inert = true
    refreshActions()
    form.error.textContent = ''
    const frozen = stableJSON(selected)
    try {
      const prepared = await api<Form>('bibliography.prepare_form', {
        record: selected.working,
        ...(selected.acquisition ? { scope: 'import' } : {}),
        values: selected.values,
        key: selected.key || null,
        profile,
      })
      if (!current() || draft !== selected || stableJSON(selected) !== frozen) return
      selected.working = prepared.record
      selected.profile = prepared.profile
      selected.profiles = prepared.profiles
      selected.fields = prepared.fields
      selected.values = {}
      show()
      changed()
    } catch (error) {
      if (current()) message(error)
    } finally {
      busy = false
      right.inert = false
      refreshActions()
      right
        .querySelector<HTMLSelectElement>('#bibliography-profile')
        ?.focus({ preventScroll: true })
    }
  }
  async function publish(finish = true): Promise<boolean> {
    if (busy || form.composing || !current()) return false
    const selected = draft,
      review = imported,
      confirming = acquisitionReviewOpen
    if (!selected && !review) return false
    const citation = selected ? cite : undefined
    const frozen = stableJSON({ draft, imported, cite }),
      focused = document.activeElement as HTMLElement
    busy = true
    right.inert = true
    refreshActions()
    form.error.textContent = ''
    try {
      const batch = await prepareBibliographyPublication(
        api,
        structuredClone(selected),
        structuredClone(review),
        structuredClone(citation),
        confirming,
      )
      if (!batch) return false
      if (
        citation &&
        stableJSON(documentContent(editor.getJSON())) !== stableJSON(citation.document)
      )
        throw new Error(
          tr('La cible de citation a changé ; votre notice est conservée dans ce formulaire.'),
        )
      if (!current() || draft !== selected || imported !== review) return false
      await metadataCommands(editor, provider).run(
        batch,
        () =>
          current() &&
          stableJSON({ draft, imported, cite }) === frozen &&
          draft === selected &&
          imported === review &&
          (!citation ||
            stableJSON(documentContent(editor.getJSON())) === stableJSON(citation.document)),
      )
      form.committed()
      recovered = undefined
      const id = selected
          ? selected.acquisition?.report.plan.items[0]?.target || selected.base.id
          : review?.report.plan.items.find((item) => item.action === 'new')?.target ||
            review?.report.plan.items.find((item) => item.target)?.target,
        position = citation?.position
      const fromOnline = !!online
      if (finish || citation) {
        online?.destroy()
        online = undefined
      }
      clear()
      busy = false
      if (citation) {
        destroy()
        if (position !== undefined) editor.commands.setTextSelection(position + 1)
        options.done?.()
        editor.view.focus()
      } else if (finish) {
        await browse(id || undefined)
        if (!draft) show()
        if (fromOnline && current()) search.focus({ preventScroll: true })
      }
      return true
    } catch (error) {
      if (error instanceof AcquisitionReview && selected && current() && draft === selected) {
        selected.acquisition = error.review
        acquisitionReviewOpen = true
        show()
        if (error.review.report.plan.blocked)
          form.error.textContent = tr('Cet import nécessite une décision de rapprochement.')
        changed()
      } else message(error)
      return false
    } finally {
      busy = false
      right.inert = false
      refreshActions()
      if (current() && acquisitionReviewOpen && !confirming) reviewing?.focus()
      else if (current() && focused?.isConnected) focused.focus({ preventScroll: true })
    }
  }
  function removeNotice() {
    const selected = draft
    if (!selected || selected.creating || busy || confirmation.opened) return
    const error = confirmation.open(
      'bibliography-remove',
      tr('Supprimer cette notice ?'),
      selected.base.key,
      [
        { label: 'Annuler', run: () => confirmation.close() },
        {
          label: 'Supprimer',
          danger: true,
          primary: true,
          run: () => void removeSelected(selected, error!),
        },
      ],
      0,
    )
  }
  async function removeSelected(selected: Draft, error: HTMLElement) {
    if (busy || !current() || draft !== selected) return
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
      confirmation.close(false)
      clear()
      busy = false
      await browse()
      search.focus({ preventScroll: true })
    } catch (failure) {
      if (current()) error.textContent = errorText(failure)
    } finally {
      busy = false
      refreshActions()
      if (confirmation.opened && error.isConnected)
        error.parentElement?.querySelector<HTMLButtonElement>('button.primary')?.focus()
    }
  }
  async function resolve() {
    const activeReview = () => imported || (acquisitionReviewOpen ? draft?.acquisition : undefined)
    const selected = activeReview()
    if (!selected) return
    const latest = requests.latest('review')
    refreshActions()
    try {
      const result = await reviewImport(provider, transport, selected)
      if (latest() && activeReview() === selected) {
        selected.report.plan = result.plan
        reviewing?.update()
        selected.ready = stableJSON(selected.decisions)
        form.error.textContent = result.plan.blocked
          ? tr('Cet import nécessite une décision de rapprochement.')
          : ''
        changed()
      }
    } catch (error) {
      if (latest() && activeReview() === selected) message(error)
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
              queueMicrotask(() => {
                if (current()) reviewing?.focus()
              })
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
    acquisitionReviewOpen = !!(saved.acquisitionReviewOpen && draft?.acquisition)
    search.value = saved.query || ''
    show()
    baseline = ''
    track()
    form.error.textContent = tr('Saisie récupérée · à valider')
    void browse()
    if (imported || acquisitionReviewOpen) void resolve()
  }
  browser.online.onclick = () => leave(openOnline)
  browser.back.onclick = () => (imported ? discard(returnToProject) : leave(returnToProject))
  add.onclick = () => leave(() => void create())
  load.onclick = () => {
    file.click()
  }
  search.oninput = () => void browse()
  provider.doc.getMap('settings').observeDeep(observe)
  editor.on('destroy', onEditorDestroy)
  managers.set(provider, {
    focus: () => (online ? online.focus() : imported ? reviewing?.focus() : search.focus()),
    resume: (item) => leave(() => resume(item)),
  })
  form.open()
  show()
  if (recovered) resume(recovered)
  else if (options.online) openOnline()
  else if (options.create) void create().then(() => browse())
  else void browse()
}
