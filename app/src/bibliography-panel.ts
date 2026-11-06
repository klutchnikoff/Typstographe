import { metadataCommands } from './metadata-commands'
import { modelOptionControl } from './model-option-control'
import type { Editor } from '@tiptap/core'
import type { Provider, Transport } from './provider'
import type { DocumentType, ModelPolicy } from './shell'
import { settingsFor } from './state'
import { referenceRecords, type BibliographicRecord } from './citation-index'
import { bibliographyQuery } from './bibliography-query'
import { contextPanel } from './context-panel'
import { actionRow } from './keyboard-navigation'
import { icon } from './icons'
import { tr } from './i18n'
import { errorText } from './command-error'

/** Transitional header adapter; the approved full notice manager is the following C.3 lot. */
export function bibliographyPanel(
  parent: HTMLElement,
  provider: Provider,
  editor: Editor,
  transport: Transport,
  kind: DocumentType,
  policy: () => ModelPolicy | undefined,
) {
  const commands = metadataCommands(editor, provider),
    descriptor = kind.structured!.bibliography!
  const root = document.createElement('div')
  root.className = 'bibliography-settings'
  parent.append(root)
  const style = modelOptionControl(
    root,
    'citation-style',
    tr('Style bibliographique'),
    [
      { value: 'chicago-author-date', label: tr('Chicago auteur–date') },
      { value: 'apa', label: 'APA' },
      { value: 'ieee', label: tr('IEEE (numérique)') },
    ],
    { kind: 'metadata', field: descriptor.style_field },
    commands,
    () => settingsFor(provider).metadata.fields[descriptor.style],
    policy,
  )
  const rows = document.createElement('div'),
    actions = actionRow(),
    status = document.createElement('p'),
    input = document.createElement('input'),
    add = document.createElement('button')
  rows.className = 'bibliography-files'
  status.role = 'alert'
  input.type = 'file'
  input.accept = '.bib,.yaml,.yml'
  input.hidden = true
  input.setAttribute('aria-label', tr('Fichiers bibliographiques'))
  add.type = 'button'
  add.textContent = tr('Ajouter des fichiers')
  add.onclick = () => {
    input.value = ''
    input.click()
  }
  actions.append(add)
  let alive = true,
    busy = false
  type Inspection = { fingerprint: string; records: BibliographicRecord[] }
  type Prepared = {
    fingerprint: string
    library_fingerprint: string
    records: BibliographicRecord[]
    diagnostics: { code: string; key: string; field: string | null; detail: string }[]
    plan: { blocked: boolean; items: unknown[] }
  }
  type Pending = { expected: string; change: Record<string, unknown>; blocked: boolean }
  let pending: Pending | undefined
  const close = () => {
    if (busy) return
    pending = undefined
    panel.element.hidden = true
    add.focus()
  }
  const panel = contextPanel({
    id: 'bibliography-confirmation',
    closeLabel: tr('Annuler'),
    close,
    canConfirm: () => !!pending && !pending.blocked && !busy,
  })
  panel.action({ label: tr('Annuler'), run: close })
  panel.action({
    label: tr('Valider'),
    primary: true,
    run: async () => {
      const chosen = pending
      if (!chosen || chosen.blocked || busy) return
      busy = true
      refresh()
      panel.error.textContent = ''
      try {
        await commands.run(
          [
            {
              id: 'bibliography.apply',
              params: { expected: chosen.expected, change: chosen.change },
            },
          ],
          () => alive && pending === chosen,
        )
        busy = false
        close()
        refresh()
      } catch (error) {
        if (alive) panel.error.textContent = errorText(error)
      } finally {
        busy = false
        if (alive) refresh()
      }
    },
  })
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file || busy) return
    busy = true
    refresh()
    status.textContent = ''
    try {
      if (file.size > 2 * 1024 * 1024)
        throw new Error(tr('Fichier trop volumineux (2 Mio maximum).'))
      const source = {
        id: crypto.randomUUID(),
        name: file.name,
        format: file.name.toLowerCase().endsWith('.bib') ? 'biblatex' : 'hayagriva',
        contents: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
          await file.arrayBuffer(),
        ),
      }
      const prepared = await bibliographyQuery<Prepared>(
        provider,
        transport,
        'bibliography.prepare_import',
        source,
      )
      if (!alive) return
      pending = {
        expected: prepared.library_fingerprint,
        blocked: prepared.plan.blocked,
        change: { kind: 'import', source, preparation: prepared.fingerprint, decisions: [] },
      }
      panel.title.textContent = tr('Vérifier l’import')
      const summary = document.createElement('p')
      summary.textContent = `${file.name} · ${prepared.records.length}`
      const report = document.createElement('ul')
      for (const diagnostic of prepared.diagnostics) {
        const row = document.createElement('li')
        row.textContent = `${diagnostic.key} · ${diagnostic.code}${diagnostic.field ? ` · ${diagnostic.field}` : ''} · ${tr(diagnostic.code === 'conversion_review' ? 'Vérifier les champs convertis.' : diagnostic.code === 'genre_mapping' ? 'Vérifier le genre de cette notice.' : 'Une valeur reste uniquement dans la source originale.')}`
        report.append(row)
      }
      panel.body.replaceChildren(summary, report)
      panel.error.textContent = prepared.plan.blocked
        ? tr('Cet import nécessite une décision de rapprochement.')
        : ''
      panel.element.hidden = false
      panel.focus()
    } catch (error) {
      if (alive) status.textContent = errorText(error)
    } finally {
      busy = false
      if (alive) refresh()
    }
  }
  async function remove(record: BibliographicRecord) {
    if (busy) return
    busy = true
    refresh()
    try {
      const library = await bibliographyQuery<Inspection>(
        provider,
        transport,
        'bibliography.inspect',
      )
      if (!alive) return
      const current = library.records.find((r) => r.id === record.id)
      // Obtain the record guard from the common preparation-independent fingerprint query.
      const info = await bibliographyQuery<{ record: BibliographicRecord; fingerprint: string }>(
        provider,
        transport,
        'bibliography.record',
        { id: record.id },
      )
      if (!alive || !current) return
      pending = {
        expected: library.fingerprint,
        change: { kind: 'remove', id: record.id, expected: info.fingerprint },
        blocked: false,
      }
      panel.title.textContent = tr('Retirer')
      panel.body.textContent = record.key
      panel.error.textContent = ''
      panel.element.hidden = false
      panel.focus()
    } catch (error) {
      if (alive) status.textContent = errorText(error)
    } finally {
      busy = false
      if (alive) refresh()
    }
  }
  root.append(rows, actions, input, panel.element, status)
  function refresh() {
    add.disabled = busy
    style.refresh()
    style.select.disabled ||= busy
    rows.replaceChildren()
    for (const record of referenceRecords(provider)) {
      const row = document.createElement('div'),
        label = document.createElement('span'),
        buttons = actionRow(),
        removeButton = document.createElement('button')
      row.className = 'bibliography-file-row'
      row.dataset.recordId = record.id
      label.textContent = record.key
      removeButton.type = 'button'
      removeButton.innerHTML = icon('trash-2')
      removeButton.title = tr('Retirer')
      removeButton.setAttribute('aria-label', `${tr('Retirer')} · ${record.key}`)
      removeButton.disabled = busy
      removeButton.onclick = () => void remove(record)
      buttons.append(removeButton)
      row.append(label, buttons)
      rows.append(row)
    }
  }
  refresh()
  return {
    refresh,
    destroy() {
      alive = false
      style.destroy()
      root.remove()
    },
  }
}
