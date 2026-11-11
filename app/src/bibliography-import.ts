import { bibliographyQuery } from './bibliography-query'
import type { Provider, Transport } from './provider'
import type { Source, Report, Decision, Notice } from './bibliography-types'
import { tr } from './i18n'
import { diagnosticText, fieldLabel } from './bibliography-fields'
import { compareNotices, comparisonReason, noticeTitle } from './bibliography-comparison'
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

export const alreadyInProject = 'Cette notice est déjà dans le projet.'

export function importSummary(plan: Report['plan']) {
  const count = (action: string) => plan.items.filter((item) => item.action === action).length
  const duplicates = count('duplicate')
  if (!duplicates) return ''
  const added = count('new'),
    enriched = count('enrich')
  if (duplicates === 1 && plan.items.length === 1) return tr(alreadyInProject)
  return [
    added &&
      tr(added === 1 ? '{count} notice ajoutée' : '{count} notices ajoutées', { count: added }),
    enriched &&
      tr(enriched === 1 ? '{count} notice enrichie' : '{count} notices enrichies', {
        count: enriched,
      }),
    tr(duplicates === 1 ? '{count} notice déjà présente' : '{count} notices déjà présentes', {
      count: duplicates,
    }),
  ]
    .filter(Boolean)
    .join(' · ')
}

export function importNeedsDecision(draft: ImportDraft) {
  return draft.report.plan.items.some(
    (item) =>
      item.action !== 'duplicate' &&
      item.matches?.some((match) => match.in_project) &&
      !draft.decisions.some((decision) => decision.incoming === item.incoming),
  )
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
  const pending = draft.report.plan.items.filter((item) => item.action !== 'duplicate')
  let selected = (pending.find((item) => item.action === 'conflict') || pending[0])?.incoming
  const buttons = new Map<string, HTMLButtonElement>()
  const navigation = navigationGroup(list, {
    axis: 'vertical',
    onActivate: (row) => {
      selected = row.dataset.incoming!
      render()
      update()
      buttons.get(selected!)?.focus()
    },
  })
  if (file) {
    const filename = document.createElement('strong')
    filename.textContent = draft.source.name
    source.append(filename, list)
    const duplicates = draft.report.plan.items.length - pending.length
    if (duplicates) {
      const note = document.createElement('small')
      note.textContent = tr(
        duplicates === 1 ? '{count} notice déjà présente' : '{count} notices déjà présentes',
        { count: duplicates },
      )
      source.insertBefore(note, list)
    }
    const pendingIds = new Set(pending.map((item) => item.incoming))
    for (const record of draft.report.records) {
      if (!pendingIds.has(record.id)) continue
      const row = document.createElement('button')
      row.type = 'button'
      row.className = 'bibliography-list-row'
      row.dataset.incoming = record.id
      const name = document.createElement('span')
      name.textContent = noticeTitle(record)
      row.append(name, document.createElement('span'))
      buttons.set(record.id, row)
      list.append(row)
    }
    navigation.refresh()
  }
  const records = new Map(
    [...existing, ...draft.report.records].map((record) => [record.id, record]),
  )
  let renderItem: (() => void) | undefined
  function update() {
    for (const item of draft.report.plan.items) {
      const button = buttons.get(item.incoming)
      if (!button) continue
      const decision = draft.decisions.find((choice) => choice.incoming === item.incoming)
      button.lastElementChild!.textContent = tr(
        item.action === 'conflict' || (!decision && item.matches?.some((match) => match.in_project))
          ? 'À vérifier'
          : decision?.kind === 'keep'
            ? 'Conserver'
            : item.action === 'enrich'
              ? 'Compléter'
              : item.action === 'skip'
                ? 'Ignorer'
                : 'Importer',
      )
      button.setAttribute('aria-selected', String(item.incoming === selected))
    }
    if (!renderItem) render()
    renderItem?.()
  }

  function render() {
    element.replaceChildren()
    renderItem = undefined
    const record = draft.report.records.find((item) => item.id === selected)
    const item = draft.report.plan.items.find((item) => item.incoming === selected)
    if (!record || !item) return

    const heading = document.createElement('h3')
    const explanation = document.createElement('p')
    const comparison = document.createElement('div')
    const candidates = document.createElement('select')
    candidates.id = 'bibliography-comparison-target'
    const candidateField = labeledField(tr('Notice à comparer'), candidates)
    const group = document.createElement('fieldset')
    const legend = document.createElement('legend')
    legend.textContent = tr('Que faire de cette notice ?')
    group.append(legend)
    const key = document.createElement('input')
    key.id = 'bibliography-distinct-key'
    key.setAttribute('aria-label', `${tr('Nouvelle clé de citation')} · ${record.key}`)
    const keyField = labeledField(tr('Nouvelle clé de citation'), key)
    const keyError = document.createElement('small')
    keyError.setAttribute('aria-live', 'polite')
    keyField.append(keyError)

    const choices = [
      ['keep', 'Conserver la notice du projet'],
      ['distinct', 'Ajouter avec une nouvelle clé'],
      ['same', 'Enrichir la notice du projet'],
      ['auto', 'Ajouter cette notice'],
      ['skip', 'Ignorer cette notice'],
    ]
    const options = new Map(
      choices.map(([kind, label]) => {
        const row = document.createElement('label')
        const radio = document.createElement('input')
        const caption = document.createElement('span')
        caption.textContent = tr(label)
        radio.type = 'radio'
        radio.name = 'bibliography-import-decision'
        radio.value = kind
        row.append(radio, caption)
        group.append(row)
        return [kind, { row, radio, caption }] as const
      }),
    )
    const choice = () => draft.decisions.find((value) => value.incoming === record.id)
    const initial = choice()
    key.value = initial?.kind === 'distinct' ? initial.key : record.key
    let targetId =
      initial?.kind === 'same' || initial?.kind === 'keep' ? initial.target : item.target || ''
    let shownTargets = ''
    function choose(kind: string) {
      draft.decisions = draft.decisions.filter((value) => value.incoming !== record!.id)
      if (kind === 'skip') draft.decisions.push({ kind, incoming: record!.id })
      if (kind === 'distinct')
        draft.decisions.push({ kind, incoming: record!.id, key: key.value.trim() })
      if (kind === 'keep' || kind === 'same')
        draft.decisions.push({ kind, incoming: record!.id, target: targetId })
      draft.ready = ''
      renderItem?.()
      changed()
    }
    for (const [kind, { radio }] of options) radio.onchange = () => choose(kind)
    key.oninput = () => choose('distinct')
    candidates.onchange = () => {
      targetId = candidates.value
      const current = choice()
      if (current?.kind === 'keep' || current?.kind === 'same') choose('auto')
      else renderItem?.()
    }

    renderItem = () => {
      const plan = draft.report.plan.items.find((entry) => entry.incoming === record.id)
      if (!plan) return
      const matches = (plan.matches ?? []).filter((match) => records.has(match.target))
      const projectMatch = matches.some((match) => match.in_project)
      const showMatches = projectMatch || plan.action !== 'new' || !!choice()
      const available = showMatches ? matches : []
      const targets = available.map((match) => match.target).join(' ')
      if (targets !== shownTargets) {
        shownTargets = targets
        candidates.replaceChildren(new Option(tr('Choisir une notice…'), ''))
        for (const { target } of available) {
          const candidate = records.get(target)!
          candidates.add(new Option(`${noticeTitle(candidate)} · ${candidate.key}`, target))
        }
      }
      if (!available.some((match) => match.target === targetId))
        targetId = available.length === 1 ? available[0].target : ''
      candidates.value = targetId
      candidateField.hidden = available.length < 2
      const match = available.find((candidate) => candidate.target === targetId)
      const target = match && records.get(match.target)
      heading.textContent = tr(
        available.length || plan.action === 'conflict'
          ? 'Comparer avant d’importer'
          : 'Vérifier l’import',
      )
      explanation.textContent = tr(
        match && target
          ? comparisonReason(match)
          : available.length
            ? 'Plusieurs notices peuvent correspondre. Choisissez laquelle comparer.'
            : plan.action === 'conflict'
              ? 'Choisissez comment importer cette notice.'
              : '',
      )
      if (match?.identical)
        explanation.append(' ', tr('Les champs bibliographiques sont identiques.'))
      explanation.hidden = !explanation.textContent
      comparison.replaceChildren(compareNotices(record, target, match, file))

      const current = choice()
      const needsChoice = projectMatch || plan.action === 'conflict'
      const plannedChoice = needsChoice
        ? undefined
        : plan.action === 'enrich'
          ? 'same'
          : plan.action === 'unchanged'
            ? 'keep'
            : 'auto'
      for (const [kind, option] of options) {
        const visible =
          kind === 'keep'
            ? !!target
            : kind === 'distinct'
              ? available.length > 0 || needsChoice || current?.kind === 'distinct'
              : kind === 'same'
                ? !!match?.added_fields.length
                : kind === 'skip'
                  ? file && !projectMatch
                  : available.length === 0 && !needsChoice
        option.row.hidden = !visible
        option.radio.disabled = !visible
        option.radio.checked = visible && kind === (current?.kind || plannedChoice)
      }
      if (match) {
        options.get('keep')!.caption.textContent = tr(
          match.in_project
            ? 'Conserver la notice du projet'
            : 'Conserver l’autre notice du fichier',
        )
        options.get('same')!.caption.textContent = tr(
          match.in_project ? 'Enrichir la notice du projet' : 'Enrichir l’autre notice du fichier',
        )
      }
      group.hidden = !file && !available.length && !needsChoice
      keyField.hidden = current?.kind !== 'distinct'
      keyError.textContent =
        current?.kind === 'distinct' && plan.conflicts.includes('key_collision')
          ? tr('Cette clé est déjà utilisée.')
          : ''
    }

    element.append(heading, explanation, candidateField, comparison, group, keyField)
    const diagnostics = document.createElement('ul')
    diagnostics.className = 'bibliography-diagnostics'
    for (const diagnostic of draft.report.diagnostics.filter(
      (value) => !value.key || value.key === record.key,
    )) {
      const row = document.createElement('li')
      row.textContent = `${diagnosticText(diagnostic.code)}${diagnostic.field ? ` (${fieldLabel(diagnostic.field)})` : ''}`
      diagnostics.append(row)
    }
    if (diagnostics.childElementCount) {
      const original = document.createElement('details')
      const summary = document.createElement('summary')
      const raw = document.createElement('pre')
      summary.textContent = tr('Voir la source importée')
      raw.textContent = draft.source.contents
      original.append(summary, raw)
      element.append(diagnostics, original)
    }
  }
  render()
  update()
  return {
    element,
    source,
    update,
    focus: () =>
      (
        buttons.get(selected!) ||
        element.querySelector<HTMLInputElement>('input[type=radio]:enabled')
      )?.focus(),
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
