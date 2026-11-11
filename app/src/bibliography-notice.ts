import { bibliographyFields } from './bibliography-fields'
import { onlineProvenance } from './bibliography-online'
import { labeledField } from './form-field'
import { profiles, type Draft } from './bibliography-types'
import { tr } from './i18n'

export function bibliographyNotice(
  root: HTMLElement,
  draft: Draft,
  options: {
    changed: () => void
    profile: (id: string) => void
    expanded: Map<string, boolean>
  },
) {
  if (draft.acquisition) {
    const origin = document.createElement('p')
    origin.className = 'bibliography-online-notice'
    origin.textContent = `${tr('Source')} · ${onlineProvenance(draft.acquisition.origin)}`
    root.append(origin)
  }
  const profile = document.createElement('select')
  for (const id of draft.profiles) profile.add(new Option(tr(profiles[id] || id), id))
  profile.value = draft.profile
  profile.id = 'bibliography-profile'
  profile.onchange = () => {
    const next = profile.value
    profile.value = draft.profile
    options.profile(next)
  }
  const fields = bibliographyFields(
    root,
    draft.fields,
    draft.values,
    options.changed,
    options.expanded,
  )
  fields.section('work', tr('Notice')).prepend(labeledField(tr('Type de notice'), profile))
  const key = document.createElement('input')
  key.id = 'bibliography-key'
  key.value = draft.key
  key.placeholder = draft.working.key
  key.oninput = () => {
    draft.key = key.value
    options.changed()
  }
  const identifiers = fields.section('identifiers', tr('Identifiants et liens'))
  identifiers.append(labeledField(tr('Clé de citation'), key))
  return { cleanup: fields.cleanup }
}
