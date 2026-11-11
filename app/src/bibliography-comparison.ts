import { fieldLabel } from './bibliography-fields'
import type { ImportMatch, Notice } from './bibliography-types'
import { tr } from './i18n'
import { stableJSON } from './provider'

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value !== 'object') return String(value)
  return (Array.isArray(value) ? value : Object.values(value))
    .map(displayValue)
    .filter(Boolean)
    .join(' · ')
}

export function noticeTitle(record: Notice) {
  return displayValue(record.entry.title) || record.key
}

function valueAt(record: Notice, path: string): unknown {
  if (path === '/key') return record.key
  if (path === '/retained_parents') return record.retained_parents
  return path
    .slice(1)
    .split('/')
    .reduce<unknown>(
      (value, key) =>
        value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined,
      record.entry,
    )
}

const comparisonFields: [string, string][] = [
  ['/key', 'Clé de citation'],
  ['/title', 'Titre'],
  ['/author', 'Auteurs'],
  ['/date', 'Date de publication'],
  ['/serial-number/doi', 'DOI'],
  ['/serial-number/arxiv', 'arXiv'],
  ['/parent/0/title', 'Titre de la publication'],
  ['/page-range', 'Pages'],
]

export function compareNotices(
  incoming: Notice,
  target: Notice | undefined,
  match: ImportMatch | undefined,
  file: boolean,
) {
  const table = document.createElement('table')
  table.className = 'bibliography-import-comparison'
  const header = table.createTHead().insertRow()
  const existingLabel = match?.in_project ? 'Notice du projet' : 'Autre notice du fichier'
  for (const label of [
    'Champ',
    ...(target ? [existingLabel] : []),
    file ? 'Notice du fichier' : 'Notice reçue',
  ]) {
    const cell = document.createElement('th')
    cell.scope = 'col'
    cell.textContent = tr(label)
    header.append(cell)
  }
  const fields = new Map(comparisonFields)
  for (const path of [...(match?.added_fields ?? []), ...(match?.differing_fields ?? [])]) {
    if (!fields.has(path))
      fields.set(path, path === '/retained_parents' ? 'Publications associées' : fieldLabel(path))
  }
  const body = table.createTBody()
  for (const [path, label] of fields) {
    const project = target ? valueAt(target, path) : undefined
    const received =
      path === '/retained_parents' && target?.entry.type !== incoming.entry.type
        ? [incoming.retained_parents, incoming.entry.parent]
        : valueAt(incoming, path)
    const before = displayValue(project)
    const after = displayValue(received)
    if (!before && !after) continue
    const row = body.insertRow()
    const field = document.createElement('th')
    field.scope = 'row'
    field.textContent = tr(label)
    row.append(field)
    if (target) row.insertCell().textContent = before || '—'
    const cell = row.insertCell()
    cell.textContent = after || '—'
    if (match?.added_fields.includes(path)) {
      const effect = document.createElement('small')
      effect.textContent = tr('Champ à compléter')
      cell.append(effect)
    } else if (target && stableJSON(project) !== stableJSON(received)) {
      row.classList.add('bibliography-comparison-difference')
    }
  }
  return table
}

export function comparisonReason(match: ImportMatch) {
  if (match.signals.includes('doi')) return 'Les deux notices ont le même DOI.'
  if (match.signals.includes('arxiv')) return 'Les deux notices ont le même identifiant arXiv.'
  if (match.signals.length)
    return 'Les informations bibliographiques indiquent une correspondance possible.'
  return 'La clé de citation est déjà utilisée. Comparez les notices avant de choisir.'
}
