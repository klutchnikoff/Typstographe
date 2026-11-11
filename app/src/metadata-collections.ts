import { hydrateForm } from './form-recovery'
import type { RecoveredItem } from './recovered-work'
import { stableJSON } from './provider'
import { bindFormOwner } from './form-drafts'
import type { Editor } from '@tiptap/core'
import type { Provider } from './provider'
import type { Catalogue } from './shell'
import { metadataSection } from './metadata-fields'
import { createRichZone } from './rich-zone'
import { contextPanel, type ContextPanel } from './context-panel'
import { formDialog } from './form-dialog'
import { actionRow } from './keyboard-navigation'
import { icon } from './icons'
import { tr } from './i18n'
import { metadataCommands } from './metadata-commands'
import { createRecordFields } from './metadata-record-fields'
import { removeRecordCommands } from './metadata-record-commands'
import { recordCard } from './record-card'
import { sortableCards } from './sortable-cards'
import {
  prepareRecordEdit,
  setRecordField,
  recordMap,
  recordIds,
  readRecord,
  recordSummary,
  type StructuredMetadata,
  type MetadataPanel,
  type RecordCollection,
  type SharedRecord,
} from './metadata-records'
import { errorText } from './command-error'
import type { StructuredCommand } from './structured-commands'

type View = {
  record: SharedRecord
  element: HTMLElement
  open: HTMLButtonElement
  refresh: () => void
  destroy: () => void
}

/** Type-driven repeatable records. No document-type names or publication layout rules here. */
export function metadataCollections(
  parent: HTMLElement,
  provider: Provider,
  schema: StructuredMetadata,
  panel: MetadataPanel,
  catalogue: Catalogue,
  main: Editor,
  language: () => string,
) {
  const itemLabel = (definition: RecordCollection) => panel.itemLabel || definition.itemLabel
  const commands = metadataCommands(main, provider)
  const root = document.createElement('div')
  root.className = 'metadata-collections'
  parent.append(root)
  const collections = new Map<
    RecordCollection,
    {
      list: HTMLElement
      views: Map<string, View>
      add: HTMLButtonElement
      sorting: ReturnType<typeof sortableCards>
      draft?: {
        element: HTMLElement
        refresh: () => void
        destroy: () => void
        focus: () => void
      }
    }
  >()
  const fieldView = createRecordFields(provider, schema, catalogue, language)
  const button = (label: string, glyph: string, action: () => void) => {
    const element = document.createElement('button')
    element.type = 'button'
    element.title = label
    element.setAttribute('aria-label', label)
    element.innerHTML = icon(glyph)
    element.onclick = action
    return element
  }
  function recordView(definition: RecordCollection, record: SharedRecord, id: string): View {
    const state = collections.get(definition)!
    const card = recordCard(id, itemLabel(definition))
    let removing = false
    let confirmation: ContextPanel | undefined
    const isPrimary = () =>
      !!definition.language_key && record.get(definition.language_key) === language()
    const fingerprint = () => stableJSON(readRecord(record, definition))
    const removal = (detach: boolean) =>
      removeRecordCommands(provider, schema, definition, id, detach)
    const remove = button(`${tr('Supprimer')} · ${definition.itemLabel}`, 'trash-2', () => {
      state.sorting.cancel()
      if (confirmation) {
        confirmation.focus()
        return
      }
      remove.focus({ preventScroll: true })
      const batch = removal(false)
      const base = fingerprint()
      if (batch && !definition.removalNotice) publishRemoval(batch, false, base)
      else confirmRemoval(!batch, base)
    })
    card.actions.append(remove)
    card.open.onclick = () => {
      if (removing) return
      closeConfirmation(false)
      startDraft(definition, undefined, id, card.open)
    }
    state.list.append(card.element)

    function publishRemoval(
      batch: StructuredCommand[],
      detach: boolean,
      base: string,
      panel?: ContextPanel,
    ) {
      const ids = recordIds(provider, definition)
      const index = ids.indexOf(id)
      const next = ids[index + 1] || ids[index - 1]
      const plan = stableJSON(batch)
      removing = true
      render()
      void commands
        .run(
          batch,
          () =>
            card.element.isConnected &&
            (!panel || panel.element.isConnected) &&
            !isPrimary() &&
            recordMap(provider, definition).get(id) === record &&
            fingerprint() === base &&
            stableJSON(removal(detach)) === plan,
        )
        .then(() => {
          refresh()
          if (root.isConnected && document.activeElement === document.body)
            (state.views.get(next)?.open || state.add).focus({ preventScroll: true })
        })
        .catch((error: unknown) => {
          if (panel?.element.isConnected) panel.error.textContent = errorText(error)
          else provider.onError(error)
        })
        .finally(() => {
          removing = false
          if (card.element.isConnected) {
            render()
            if (!panel && document.activeElement === document.body)
              remove.focus({ preventScroll: true })
          }
        })
    }
    function closeConfirmation(focus: boolean) {
      confirmation?.element.remove()
      confirmation = undefined
      if (focus) remove.focus({ preventScroll: true })
    }
    function confirmRemoval(inUse: boolean, base: string) {
      const close = () => {
        if (!removing) closeConfirmation(true)
      }
      const form = contextPanel({
        id: `delete-record-${definition.parameter}-${id}`,
        closeLabel: tr('Annuler'),
        close,
        canConfirm: () => !removing && (associations.hidden === true || check.checked),
      })
      form.element.classList.add('metadata-record-deletion')
      form.title.textContent = `${tr('Supprimer')} · ${definition.itemLabel}`
      if (definition.removalNotice) {
        const notice = document.createElement('p')
        notice.textContent = definition.removalNotice
        form.body.append(notice)
      }
      const associations = document.createElement('div')
      const notice = document.createElement('p')
      notice.textContent = tr('Cet élément est utilisé par d’autres fiches.')
      const label = document.createElement('label')
      const check = document.createElement('input')
      check.type = 'checkbox'
      label.append(check, document.createTextNode(tr('Retirer aussi les liens vers cet élément.')))
      associations.append(notice, label)
      associations.hidden = !inUse
      form.body.append(associations)
      form.action({ label: tr('Annuler'), run: close })
      const submit = form.action({
        label: tr('Supprimer'),
        danger: true,
        primary: true,
        run: () => {
          if (removing) return
          const batch = removal(check.checked)
          if (!batch) {
            associations.hidden = false
            submit.disabled = true
            check.focus()
            return
          }
          publishRemoval(batch, check.checked, base, form)
        },
      })
      submit.disabled = inUse
      check.onchange = () => (submit.disabled = !check.checked)
      confirmation = form
      card.element.append(form.element)
      form.element.hidden = false
      form.focus()
    }
    function render() {
      const value = String(record.get(definition.title_key) ?? '')
      const title = definition.language_key
        ? catalogue.languages.find((item) => item.value === value)?.label || definition.itemLabel
        : value || definition.itemLabel
      const detail = (panel.summary || definition.summary || [])
        .map((key) => {
          const field = definition.fields.find((item) => item.key === key)
          const value = record.get(key)
          return field?.kind === 'boolean' ? (value ? field.label : '') : recordSummary(value)
        })
        .filter(Boolean)
        .join(' · ')
      card.caption.textContent = detail ? `${title} (${detail})` : title
      card.open.setAttribute(
        'aria-label',
        `${tr('Modifier')} · ${itemLabel(definition)} · ${card.caption.textContent}`,
      )
      card.handle.setAttribute(
        'aria-label',
        tr('Réordonner · {name}', { name: card.caption.textContent }),
      )
      remove.disabled = isPrimary() || removing
    }
    return {
      record,
      element: card.element,
      open: card.open,
      refresh: render,
      destroy: () => card.element.remove(),
    }
  }
  function fields(definition: RecordCollection) {
    return panel.fields
      ? panel.fields.map((key) => definition.fields.find((field) => field.key === key)!)
      : definition.fields
  }
  function cannotAdd(definition: RecordCollection) {
    return (
      !!definition.language_key &&
      recordIds(provider, definition).length >= catalogue.languages.length
    )
  }
  function addButton(definition: RecordCollection) {
    const add = button(`${tr('Ajouter')} · ${itemLabel(definition)}`, 'plus', () =>
      startDraft(definition, undefined, undefined, add),
    )
    add.dataset.recordAdd = ''
    return add
  }
  function startDraft(
    definition: RecordCollection,
    after?: string,
    editing?: string,
    trigger?: HTMLElement,
    resumed?: RecoveredItem,
  ) {
    const state = collections.get(definition)!
    state.sorting.cancel()
    if (state.draft) {
      state.draft.focus()
      return
    }
    if (!editing && cannotAdd(definition)) return
    const langKey = definition.language_key
    const used = recordIds(provider, definition).map((id) =>
      recordMap(provider, definition)
        .get(id)!
        .get(langKey || ''),
    )
    const next = catalogue.languages.find((item) => !used.includes(item.value))?.value
    const draft = prepareRecordEdit(provider, schema, definition, {
      id: editing,
      after,
      defaults: langKey ? { [langKey]: next } : {},
    })
    if (resumed) {
      const data = resumed.payload.data?.data?.record
      if (!data || typeof data.id !== 'string') {
        draft.destroy()
        return
      }
      for (const field of definition.fields)
        if (field.key in data)
          setRecordField({ doc: draft.doc }, draft.record, field.key, data[field.key])
      draft.record.set('id', data.id)
    }
    // Rich drafts have their own local history. Only confirmation publishes one document transaction.
    const owner = fields(definition).some(
      (field) => field.kind === 'rich' || field.kind === 'rich_inline',
    )
      ? createRichZone({
          profile: 'rich-text',
          label: definition.itemLabel,
          element: document.createElement('div'),
          binding: { kind: 'document', document: draft.doc },
        })
      : undefined
    if (owner) bindFormOwner(owner, provider)
    let returnFocus: HTMLElement | undefined
    const discard = (saved?: string) => {
      form.discardRecovery()
      state.draft?.destroy()
      state.draft = undefined
      refresh()
      returnFocus =
        (editing || !saved) && trigger?.isConnected
          ? trigger
          : (editing && state.views.get(editing)?.open) || state.add
      returnFocus.focus({ preventScroll: true })
    }
    const title = () => {
      const code = langKey && String(draft.record.get(langKey))
      const name = catalogue.languages.find((item) => item.value === code)?.label || code
      return `${tr(editing ? 'Modifier' : 'Ajouter')} · ${itemLabel(definition)}${editing && name ? ` · ${name}` : ''}`
    }
    const form = formDialog({
      id: `edit-record-${definition.parameter}`,
      title: title(),
      cancel: () => discard(),
      returnFocus: () => returnFocus || trigger,
    })
    form.element.classList.add('metadata-record-draft')
    form.body.classList.add('metadata-record-fields')
    if (owner) form.dialog.classList.add('rich-record-dialog')
    const views = fields(definition)
      .filter(
        (field) =>
          !(
            editing &&
            langKey &&
            field.key === langKey &&
            draft.record.get(langKey) === language()
          ),
      )
      .map((field) => fieldView(form.body, definition, draft.record, field, draft, owner || main))
    if (editing && owner)
      form.body.querySelector<HTMLElement>('[contenteditable=true]')!.dataset.initialFocus = ''
    form.recoveryData = () => ({ record: draft.value() })
    form.trackRecovery(provider, {
      kind: 'record',
      panel: panel.id,
      collection: definition.parameter,
      record: editing || null,
      after: after || null,
      base: resumed?.payload.context?.base || draft.base || draft.value(),
    })
    form.action({ label: tr('Annuler'), run: () => discard() })
    let pending = false
    const submit = form.action({
      label: tr('Valider'),
      primary: true,
      run: () => {
        if (pending) return
        const result = draft.plan()
        if (result.error) {
          form.error.textContent = tr(
            {
              changed:
                'Cet élément a été modifié ou supprimé ailleurs. Fermez puis rouvrez le formulaire.',
              'missing-reference':
                'Une référence sélectionnée a été supprimée. Vérifiez les associations avant de valider.',
              'duplicate-language': 'Cette langue est déjà présente.',
            }[result.error],
          )
          return
        }
        const focused = document.activeElement as HTMLElement | null
        pending = true
        submit.disabled = true
        form.body.inert = true
        const active = () => state.draft?.element === form.element && form.element.isConnected
        void commands
          .run(result.commands!, () => active() && result.current!())
          .then(() => {
            if (active()) {
              form.committed()
              discard(result.id)
            }
          })
          .catch((error: unknown) => {
            if (active())
              form.error.textContent = error instanceof Error ? error.message : errorText(error)
          })
          .finally(() => {
            pending = false
            submit.disabled = false
            form.body.inert = false
            if (
              active() &&
              (document.activeElement === document.body ||
                document.activeElement === form.element ||
                document.activeElement === form.dialog)
            )
              focused?.focus({ preventScroll: true })
          })
      },
    })
    const update = () => {
      form.draftChanged()
      form.title.textContent = title()
      for (const view of views) view.refresh()
    }
    draft.record.observeDeep(update)
    state.draft = {
      element: form.element,
      refresh: update,
      focus: () => form.focus(),
      destroy() {
        draft.record.unobserveDeep(update)
        for (const view of views) view.destroy()
        owner?.destroy()
        draft.destroy()
        form.destroy()
      },
    }
    refresh()
    form.open()
    if (resumed) hydrateForm(provider, form.element, resumed)
  }
  for (const definition of schema.collections.filter(
    (collection) => collection.parameter === panel.collection,
  )) {
    const section = metadataSection({
      id: definition.parameter,
      label: definition.label,
      layout: 'editorial',
    })
    section.root.classList.add('metadata-record-section')
    section.root.classList.add('metadata-card-section')
    // The tab supplies the section name; do not repeat it inside the panel.
    section.root.querySelector('legend')?.classList.add('sr-only')
    const add = addButton(definition)
    const actions = actionRow()
    actions.classList.add('metadata-record-empty-actions')
    actions.append(add)
    const list = document.createElement('div')
    list.className = 'collection-card-list'
    section.content.append(list, actions)
    root.append(section.root)
    const sorting = sortableCards(list, {
      order: () => recordIds(provider, definition),
      move: (id, before, base) =>
        commands.run(
          [
            {
              id: 'record.move',
              params: { collection: definition.parameter, id, ...(before ? { before } : {}) },
            },
          ],
          () =>
            root.isConnected && stableJSON(recordIds(provider, definition)) === stableJSON(base),
        ),
      error: provider.onError,
    })
    collections.set(definition, { list, views: new Map(), add, sorting })
  }
  function refresh() {
    for (const [definition, state] of collections) {
      const ids = recordIds(provider, definition)
      state.sorting.refresh()
      for (const [id, view] of state.views)
        if (!ids.includes(id)) {
          view.destroy()
          state.views.delete(id)
        }
      let previous: ChildNode | null = null
      const focused = document.activeElement as HTMLElement | null
      for (const id of ids) {
        let view = state.views.get(id)
        if (view && view.record !== recordMap(provider, definition).get(id)) {
          view.destroy()
          state.views.delete(id)
          view = undefined
        }
        if (!view) {
          view = recordView(definition, recordMap(provider, definition).get(id)!, id)
          state.views.set(id, view)
        }
        view.refresh()
        const next: ChildNode | null = previous ? previous.nextSibling : state.list.firstChild
        if (!state.sorting.active() && next !== view.element)
          state.list.insertBefore(view.element, next)
        previous = view.element
      }
      if (focused?.isConnected && root.contains(focused) && document.activeElement !== focused)
        focused.focus({ preventScroll: true })
      state.draft?.refresh()
      state.add.disabled = cannotAdd(definition)
      state.sorting.refresh()
    }
  }
  refresh()
  return {
    resume(item: RecoveredItem) {
      const context = item.payload.context
      if (context.panel && context.panel !== panel.id) return false
      const definition = schema.collections.find((c) => c.parameter === context?.collection)
      if (!definition || !collections.has(definition)) return false
      if (context.record) {
        const record = recordMap(provider, definition).get(context.record)
        if (!record || stableJSON(readRecord(record, definition)) !== stableJSON(context.base))
          return false
      } else if (recordMap(provider, definition).has(item.payload.data?.data?.record?.id))
        return false
      startDraft(
        definition,
        context.after || undefined,
        context.record || undefined,
        undefined,
        item,
      )
      return !!collections.get(definition)?.draft
    },
    refresh,
    destroy() {
      for (const state of collections.values()) {
        state.sorting.destroy()
        state.draft?.destroy()
        for (const view of state.views.values()) view.destroy()
      }
      root.remove()
    },
  }
}
