import type { Transport } from './provider'
import { formDialog } from './form-dialog'
import { navigationGroup, actionRow } from './keyboard-navigation'
import { labeledField } from './form-field'
import { tr } from './i18n'
import { errorText } from './command-error'
import {
  providerLabel,
  type OnlineProvider,
  type OnlineCandidate,
  type OnlineResults,
  type OnlineIssue,
} from './bibliography-online-types'
export function onlineWarning(code: string) {
  return tr(
    (
      {
        chapter_title_matches_book:
          'Le titre du chapitre est identique à celui de l’ouvrage : vérifiez-le.',
        incomplete_metadata: 'Certaines métadonnées sont manquantes.',
        unsupported_type: 'Vérifier le type de cette notice.',
        parent_unavailable: 'Les informations de la publication n’ont pas pu être récupérées.',
      } as Record<string, string>
    )[code] || 'Vérifier cette notice.',
  )
}
export function onlineProvenance(candidate: OnlineCandidate) {
  return [
    providerLabel(candidate.provider),
    candidate.provider === 'cairn' && candidate.entry.parent
      ? tr('Informations de publication complétées via DOI.')
      : '',
    ...candidate.warnings.map(onlineWarning),
  ]
    .filter(Boolean)
    .join(' ')
}
function issueText(issue: OnlineIssue) {
  const label =
    (
      {
        invalid_query: 'Précisez un titre, un auteur, un DOI ou une URL Cairn.',
        unsupported_query: 'Cairn attend un DOI, une URL d’article ou un identifiant de notice.',
        network: 'Connexion au service impossible.',
        timeout: 'Le service n’a pas répondu à temps.',
        rate_limited: 'Le service demande de patienter avant une nouvelle recherche.',
        unavailable: 'Le service est temporairement indisponible.',
        invalid_response:
          'La réponse du service est illisible ou ne correspond pas à la notice demandée.',
        too_large: 'La réponse du service est trop volumineuse.',
        unsupported_response: 'Ce DOI ne fournit pas de notice dans un format pris en charge.',
        identifier_required:
          'Les métadonnées de cette URL Cairn sont inaccessibles. Saisissez le DOI ou l’identifiant Cairn.',
      } as Record<string, string>
    )[issue.code] || 'Connexion au service impossible.'
  return `${providerLabel(issue.provider)} — ${tr(label)}`
}
/** Explicit online acquisition, separate from project search and from publication.
 * Typing only invalidates old results; it never starts a network request.
 */
export function onlineBibliography(options: {
  transport: Transport
  current: () => boolean
  query: string
  choose: (candidate: OnlineCandidate) => void
  closed: () => void
}) {
  const initial = document.activeElement as HTMLElement
  let alive = true,
    ticket = 0,
    selected: OnlineCandidate | undefined,
    results: OnlineCandidate[] = []
  const destroy = () => {
    if (!alive) return
    alive = false
    ticket++
    navigation.destroy()
    form.destroy()
    options.closed()
  }
  const form = formDialog({
    id: 'bibliography-online',
    title: tr('Rechercher des notices en ligne'),
    cancel: destroy,
    returnFocus: () => (initial?.isConnected ? initial : undefined),
  })
  form.dialog.classList.add('bibliography-online-dialog')
  const query = document.createElement('input'),
    search = document.createElement('button'),
    list = document.createElement('div'),
    status = document.createElement('p'),
    details = document.createElement('p')
  query.type = 'search'
  query.value = options.query
  query.dataset.initialFocus = ''
  query.setAttribute('role', 'combobox')
  query.setAttribute('aria-autocomplete', 'list')
  query.setAttribute('aria-expanded', 'true')
  query.setAttribute('aria-controls', 'bibliography-online-results')
  query.setAttribute('aria-label', tr('Titre, auteur, DOI ou URL Cairn'))
  search.type = 'button'
  search.textContent = tr('Rechercher en ligne')
  list.id = 'bibliography-online-results'
  list.className = 'bibliography-list'
  list.setAttribute('role', 'listbox')
  list.setAttribute('aria-label', tr('Résultats en ligne'))
  status.role = 'status'
  details.className = 'bibliography-online-notice'
  const sources = document.createElement('fieldset'),
    legend = document.createElement('legend')
  legend.textContent = tr('Sources')
  sources.append(legend)
  const choices = new Map<OnlineProvider, HTMLInputElement>()
  for (const provider of ['zbmath', 'cairn'] as const) {
    const check = document.createElement('input'),
      label = document.createElement('label')
    check.type = 'checkbox'
    check.checked = true
    check.value = provider
    label.append(check, document.createTextNode(providerLabel(provider)))
    sources.append(label)
    choices.set(provider, check)
    check.onchange = () => invalidate()
  }
  const hint = document.createElement('p')
  hint.textContent = tr('Cairn : DOI, identifiant ou URL. Repli DOI automatique si nécessaire.')
  hint.className = 'bibliography-completeness'
  const row = actionRow()
  row.append(search)
  form.body.append(
    labeledField(tr('Titre, auteur, DOI ou URL Cairn'), query),
    sources,
    hint,
    row,
    status,
    list,
    details,
  )
  form.action({ label: tr('Annuler'), run: destroy })
  const confirm = form.action({ label: tr('Vérifier la notice'), primary: true, run: choose })
  const navigation = navigationGroup(list, {
    axis: 'vertical',
    input: query,
    onSelect: (row) => {
      selected = results.find((c) => c.id === row.dataset.candidate)
      refreshSelection()
    },
    onActivate: () => choose(),
  })
  function refreshSelection() {
    confirm.disabled = !selected
    details.textContent = selected ? onlineProvenance(selected) : ''
  }
  function choose() {
    if (!selected || !alive || !options.current()) return
    const candidate = selected
    destroy()
    options.choose(candidate)
  }
  function invalidate() {
    ticket++
    selected = undefined
    results = []
    list.replaceChildren()
    details.textContent = ''
    status.textContent = ''
    form.error.textContent = ''
    list.removeAttribute('aria-busy')
    search.disabled = !query.value.trim() || ![...choices.values()].some((c) => c.checked)
    navigation.refresh(true)
    refreshSelection()
  }
  async function run() {
    if (!alive || !options.current() || !query.value.trim() || search.disabled || form.composing)
      return
    const id = ++ticket
    selected = undefined
    results = []
    list.replaceChildren()
    refreshSelection()
    navigation.refresh(true)
    search.disabled = true
    list.setAttribute('aria-busy', 'true')
    status.textContent = tr('Recherche en cours…')
    form.error.textContent = ''
    try {
      const result = await options.transport.invoke<OnlineResults>('bibliography_online', {
        request: {
          query: query.value,
          sources: [...choices].filter(([, c]) => c.checked).map(([p]) => p),
          limit: 8,
        },
      })
      if (!alive || !options.current() || id !== ticket) return
      results = result.candidates
      for (const candidate of results) {
        const button = document.createElement('button'),
          heading = document.createElement('span'),
          title = document.createElement('span')
        button.type = 'button'
        button.className = 'bibliography-list-row'
        button.dataset.candidate = candidate.id
        heading.textContent = `${candidate.authors} · ${candidate.year ?? '—'} · ${providerLabel(candidate.provider)}`
        title.textContent = candidate.title
        button.setAttribute(
          'aria-label',
          `${candidate.title} · ${providerLabel(candidate.provider)}`,
        )
        button.append(heading, title)
        list.append(button)
      }
      selected = results[0]
      navigation.refresh(true)
      refreshSelection()
      status.textContent = results.length
        ? tr('{count} notices', { count: results.length })
        : tr('Aucune notice trouvée.')
      form.error.textContent = result.issues.map(issueText).join('\n')
    } catch (error) {
      if (alive && options.current() && id === ticket) {
        status.textContent = ''
        form.error.textContent = errorText(error)
      }
    } finally {
      if (alive && id === ticket) {
        list.removeAttribute('aria-busy')
        search.disabled = false
      }
    }
  }
  query.oninput = invalidate
  query.addEventListener(
    'keydown',
    (event) => {
      if (
        event.key === 'Enter' &&
        !event.isComposing &&
        event.keyCode !== 229 &&
        !event.ctrlKey &&
        !event.metaKey &&
        !selected
      ) {
        event.preventDefault()
        event.stopImmediatePropagation()
        void run()
      }
    },
    true,
  )
  search.onclick = () => void run()
  refreshSelection()
  search.disabled = !query.value.trim()
  form.open()
  return { destroy, focus: () => query.focus() }
}
