import { bibliographyQuery } from './bibliography-query'
import type { Provider, Transport } from './provider'
import type { Source, Report, Decision, Notice } from './bibliography-types'
import { tr } from './i18n'
import { diagnosticText, fieldLabel } from './bibliography-fields'
import { navigationGroup } from './keyboard-navigation'
import { labeledField } from './form-field'

export interface ImportDraft {
  source: Source
  report: Report
  decisions: Decision[]
  ready: string
  reviewed?: Notice[]
}
type PlanItem = Report['plan']['items'][number]
const labels: Record<string, string> = {
  new: 'Nouvelle notice',
  unchanged: 'Notice conservée',
  enrich: 'Notice enrichie',
  conflict: 'Décision nécessaire',
  skip: 'Notice ignorée',
}
const planLabel = (item: PlanItem) => tr(labels[item.action] || 'Vérifier cette notice.')
const title = (record: Notice) => displayValue(record.entry.title) || record.key

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value !== 'object') return String(value)
  if (Array.isArray(value)) return value.map(displayValue).filter(Boolean).join(' · ')
  return Object.values(value).map(displayValue).filter(Boolean).join(' · ')
}
function atPath(record: Notice, path: string) {
  return path === '/retained_parents'
    ? record.retained_parents
    : path
        .slice(1)
        .split('/')
        .reduce<unknown>(
          (value, key) =>
            value && typeof value === 'object'
              ? (value as Record<string, unknown>)[key]
              : undefined,
          record.entry,
        )
}

function comparison(
  root: HTMLElement,
  item: PlanItem,
  existing: Notice | undefined,
  incoming: Notice,
  file: boolean,
) {
  root.replaceChildren()
  if (!existing) return
  const paths = [...new Set([...item.added_fields, ...item.differing_fields])]
  if (!paths.length) return
  const table = document.createElement('table')
  table.className = 'bibliography-import-comparison'
  const header = table.createTHead().insertRow()
  for (const label of ['Champ', 'Dans le projet', file ? 'Dans le fichier' : 'Source en ligne']) {
    const cell = document.createElement('th')
    cell.scope = 'col'
    cell.textContent = tr(label)
    header.append(cell)
  }
  const body = table.createTBody()
  for (const path of paths) {
    const row = body.insertRow()
    row.insertCell().textContent = fieldLabel(path)
    row.insertCell().textContent = displayValue(atPath(existing, path)) || '—'
    const incomingCell = row.insertCell()
    incomingCell.textContent = displayValue(atPath(incoming, path)) || '—'
    const effect = document.createElement('small')
    effect.textContent = tr(
      item.added_fields.includes(path) ? 'Champ complété' : 'Valeur du projet conservée',
    )
    incomingCell.append(effect)
  }
  root.append(table)
}

/** The source list and selected decision share one review, for a file or a lookup. */
export function importReview(
  draft: ImportDraft,
  existing: Notice[],
  changed: () => void,
  file = true,
) {
  const element = document.createElement('section'),
    source = document.createElement('section'),
    list = document.createElement('div')
  element.id = file ? 'bibliography-file-review' : 'bibliography-acquisition-review'
  element.className = 'bibliography-import-item'
  source.className = 'bibliography-source'
  list.className = 'bibliography-list'
  list.setAttribute('role', 'listbox')
  list.setAttribute('aria-label', tr('Notices du fichier'))
  let selected: string | undefined = (
    draft.report.plan.items.find((item) => item.action === 'conflict') || draft.report.plan.items[0]
  )?.incoming
  const buttons = new Map<string, HTMLButtonElement>()
  const navigation = navigationGroup(list, {
    axis: 'vertical',
    onActivate: (row) => {
      selected = row.dataset.incoming
      render()
      update()
      buttons.get(selected!)?.focus()
    },
  })
  if (file) {
    const filename = document.createElement('strong')
    filename.textContent = draft.source.name
    source.append(filename, list)
    for (const record of draft.report.records) {
      const row = document.createElement('button')
      row.type = 'button'
      row.className = 'bibliography-list-row'
      row.dataset.incoming = record.id
      const name = document.createElement('span')
      name.textContent = title(record)
      row.append(name, document.createElement('span'))
      buttons.set(record.id, row)
      list.append(row)
    }
    navigation.refresh()
  }
  const differences = document.createElement('div')
  const status = document.createElement('p')
  status.className = 'bibliography-plan-action'
  function update() {
    for (const item of draft.report.plan.items) {
      const button = buttons.get(item.incoming)
      if (button) {
        button.lastElementChild!.textContent = planLabel(item)
        button.setAttribute('aria-selected', String(item.incoming === selected))
      }
    }
    const item = draft.report.plan.items.find((item) => item.incoming === selected)
    const incoming = draft.report.records.find((record) => record.id === selected)
    if (!item || !incoming) return
    status.textContent = planLabel(item)
    const records = [...existing, ...draft.report.records]
    const match =
      item.target === incoming.id ? undefined : records.find((record) => record.id === item.target)
    comparison(differences, item, match, incoming, file)
  }
  function render() {
    const heading = document.createElement('h3')
    heading.textContent = tr('Vérifier l’import')
    element.replaceChildren(heading)
    const record = draft.report.records.find((item) => item.id === selected)
    const item = draft.report.plan.items.find((item) => item.incoming === selected)
    if (record && item) {
      const summary = draft.report.summaries?.find((value) => value.record_id === record.id)
      const name = document.createElement('p')
      name.textContent = [title(record), summary?.authors, summary?.year]
        .filter(Boolean)
        .join(' · ')
      const group = document.createElement('fieldset')
      const legend = document.createElement('legend')
      legend.textContent = tr('Décision')
      group.append(legend)
      const decision = draft.decisions.find((value) => value.incoming === record.id)
      const key = document.createElement('input'),
        target = document.createElement('select')
      key.id = 'bibliography-distinct-key'
      target.id = 'bibliography-same-target'
      key.setAttribute('aria-label', `${tr('Clé de citation')} · ${record.key}`)
      target.setAttribute('aria-label', `${tr('Notice correspondante')} · ${record.key}`)
      key.value = decision?.kind === 'distinct' ? decision.key : record.key
      target.add(new Option('—', ''))
      for (const candidate of [...existing, ...draft.report.records].filter(
        (value) => value.id !== record.id,
      ))
        target.add(new Option(candidate.key, candidate.id))
      target.value =
        decision?.kind === 'same'
          ? decision.target
          : item.target !== record.id
            ? item.target || ''
            : ''
      const keyField = labeledField(tr('Clé de citation'), key)
      const targetField = labeledField(tr('Notice correspondante'), target)
      const choose = () => {
        const kind = group.querySelector<HTMLInputElement>('input:checked')?.value
        keyField.hidden = kind !== 'distinct'
        targetField.hidden = kind !== 'same'
        return kind
      }
      const onChange = () => {
        const kind = choose()
        draft.decisions = draft.decisions.filter((value) => value.incoming !== record.id)
        if (kind === 'skip') draft.decisions.push({ kind, incoming: record.id })
        if (kind === 'distinct') draft.decisions.push({ kind, incoming: record.id, key: key.value })
        if (kind === 'same')
          draft.decisions.push({ kind, incoming: record.id, target: target.value })
        draft.ready = ''
        changed()
      }
      const choices = [
        ['auto', 'Selon le rapprochement'],
        ['same', 'Même référence que…'],
        ['distinct', 'Conserver séparément'],
        ...(file ? [['skip', 'Ignorer cette notice']] : []),
      ]
      for (const [kind, label] of choices) {
        const radio = document.createElement('input')
        radio.type = 'radio'
        radio.name = 'bibliography-import-decision'
        radio.value = kind
        radio.checked = kind === (decision?.kind || (item.action === 'conflict' ? '' : 'auto'))
        radio.onchange = onChange
        const option = document.createElement('label')
        option.append(radio, tr(label))
        group.append(option)
      }
      key.oninput = target.onchange = onChange
      choose()
      element.append(name, status, differences, group, keyField, targetField)
    }
    const diagnostics = document.createElement('ul')
    diagnostics.className = 'bibliography-diagnostics'
    for (const diagnostic of draft.report.diagnostics.filter(
      (value) => !record || !value.key || value.key === record.key,
    )) {
      const row = document.createElement('li')
      row.textContent = `${diagnostic.key} · ${diagnosticText(diagnostic.code)}${diagnostic.field ? ` (${fieldLabel(diagnostic.field)})` : ''}`
      diagnostics.append(row)
    }
    if (diagnostics.childElementCount) element.append(diagnostics)
    const original = document.createElement('details'),
      summary = document.createElement('summary'),
      raw = document.createElement('pre')
    summary.textContent = tr('Source originale (lecture seule)')
    raw.textContent = draft.source.contents
    original.append(summary, raw)
    element.append(original)
  }
  render()
  update()
  return {
    element,
    source,
    update,
    focus: () =>
      (buttons.get(selected!) || element.querySelector<HTMLInputElement>('input'))?.focus(),
    destroy: () => navigation.destroy(),
  }
}

export async function reviewImport(provider: Provider, transport: Transport, draft: ImportDraft) {
  return bibliographyQuery<{ plan: Report['plan'] }>(
    provider,
    transport,
    'bibliography.review_import',
    {
      source: draft.source,
      expected: draft.report.library_fingerprint,
      decisions: draft.decisions,
      ...(draft.reviewed ? { reviewed: draft.reviewed } : {}),
    },
  )
}
