import type { Transport } from './provider'
import { navigationGroup } from './keyboard-navigation'
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
const displayedLimit = 8
const searchDelay = 500

/** Online acquisition, separate from project search and from publication. */
export function onlineBibliography(options: {
  transport: Transport
  current: () => boolean
  composing: () => boolean
  query: string
  choose: (candidate: OnlineCandidate) => void
}) {
  let alive = true,
    ticket = 0,
    selected: OnlineCandidate | undefined,
    accepted: string | undefined,
    results: OnlineCandidate[] = [],
    timer: number | undefined
  const destroy = () => {
    if (!alive) return
    alive = false
    ticket++
    window.clearTimeout(timer)
    navigation.destroy()
    element.remove()
  }
  const element = document.createElement('section'),
    query = document.createElement('input'),
    list = document.createElement('div'),
    status = document.createElement('p'),
    error = document.createElement('p')
  element.id = 'bibliography-online'
  element.className = 'bibliography-source bibliography-online'
  query.id = 'bibliography-online-query'
  query.type = 'search'
  query.value = options.query
  query.dataset.initialFocus = ''
  query.setAttribute('role', 'combobox')
  query.setAttribute('aria-autocomplete', 'list')
  query.setAttribute('aria-expanded', 'true')
  query.setAttribute('aria-controls', 'bibliography-online-results')
  list.id = 'bibliography-online-results'
  list.className = 'bibliography-list'
  list.setAttribute('role', 'listbox')
  list.setAttribute('aria-label', tr('Résultats en ligne'))
  status.role = 'status'
  status.className = 'sr-only'
  error.setAttribute('role', 'status')
  error.className = 'bibliography-online-error'
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
  hint.className = 'sr-only'
  hint.id = 'bibliography-online-hint'
  query.setAttribute('aria-describedby', hint.id)
  element.append(
    labeledField(tr('Titre, auteur, année, DOI ou URL Cairn'), query),
    sources,
    hint,
    status,
    list,
    error,
  )
  const navigation = navigationGroup(list, {
    axis: 'vertical',
    input: query,
    onSelect: (row) => {
      selected = results.find((c) => c.id === row.dataset.candidate)
    },
    onActivate: () => choose(),
  })
  function report(text: string, announceOnly = false) {
    status.classList.toggle('sr-only', !text || announceOnly)
    status.textContent = text
  }
  function choose() {
    if (!selected || !alive || !options.current()) return
    options.choose(selected)
  }
  const enabledSources = () => [...choices].filter(([, check]) => check.checked).map(([p]) => p)
  function invalidate(composing = false) {
    window.clearTimeout(timer)
    ticket++
    selected = undefined
    accepted = undefined
    results = []
    list.replaceChildren()
    report('')
    error.textContent = ''
    list.removeAttribute('aria-busy')
    navigation.refresh(true)
    if (query.value.trim() && enabledSources().length && !composing && !options.composing())
      timer = window.setTimeout(() => void run(), searchDelay)
  }
  async function run() {
    if (!alive || !options.current() || element.inert || options.composing()) return
    const term = query.value.trim(),
      sources = enabledSources()
    if (!term || !sources.length) return
    const id = ++ticket
    selected = undefined
    results = []
    list.replaceChildren()
    accepted = undefined
    navigation.refresh(true)
    list.setAttribute('aria-busy', 'true')
    report(tr('Recherche en cours…'))
    error.textContent = ''
    try {
      const result = await options.transport.invoke<OnlineResults>('bibliography_online', {
        request: {
          query: term,
          sources,
          // One extra result establishes that the list is incomplete.
          limit: displayedLimit + 1,
        },
      })
      if (!alive || !options.current() || id !== ticket) return
      const truncated = result.candidates.length > displayedLimit
      results = result.candidates.slice(0, displayedLimit)
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
      if (truncated)
        report(
          tr('Seuls les {count} premiers résultats sont affichés. Affinez votre recherche.', {
            count: displayedLimit,
          }),
        )
      else if (results.length) report(tr('{count} notices', { count: results.length }), true)
      else report(tr('Aucune notice trouvée.'))
      error.textContent = result.issues.map(issueText).join('\n')
    } catch (failure) {
      if (alive && options.current() && id === ticket) {
        report('')
        error.textContent = errorText(failure)
      }
    } finally {
      if (alive && id === ticket) list.removeAttribute('aria-busy')
    }
  }
  query.oninput = (event) => invalidate(event instanceof InputEvent && event.isComposing)
  query.addEventListener('compositionend', () => invalidate())
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
      }
    },
    true,
  )
  if (query.value.trim()) invalidate()
  return {
    element,
    destroy,
    focus: () => query.focus(),
    lock(locked: boolean) {
      element.inert = locked
    },
    accept(id: string) {
      accepted = id
    },
    focusResult() {
      const row = [...list.querySelectorAll<HTMLButtonElement>('[data-candidate]')].find(
        (button) => button.dataset.candidate === accepted,
      )
      ;(row || query).focus()
    },
  }
}
