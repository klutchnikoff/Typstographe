import { tr } from './i18n'
import { actionRow } from './keyboard-navigation'
import type { Preferences } from './preferences-panel'
import type { DocumentType, Model } from './shell'
import type { Settings } from './state'

const isoDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

/** Initial metadata of a new document: type defaults, the user profile and today's date. */
export function newDocumentMetadata(
  type: DocumentType,
  profile: Preferences['profile'],
  now = new Date(),
): Settings['metadata'] {
  const metadata = structuredClone(type.metadata)
  for (const f of type.fields)
    if (f.field in profile) metadata.fields[f.parameter] = profile[f.field]
  const date = type.fields.find((f) => f.kind === 'date')
  if (date) metadata.fields[date.parameter] = isoDate(now)
  return metadata
}

/** Fills `overlay` with the type and model choice and opens it as a modal dialog. */
export function newDocumentDialog(
  overlay: HTMLDialogElement,
  documentTypes: DocumentType[],
  submit: (type: DocumentType, model: Model) => void,
) {
  overlay.replaceChildren()
  const heading = document.createElement('h2')
  heading.textContent = tr('Nouveau document')
  const types = documentTypes.filter((t) => t.canCreate)
  const type = document.createElement('select')
  type.setAttribute('aria-label', tr('Type de document'))
  for (const t of types) type.add(new Option(t.label, t.id))
  const model = document.createElement('select')
  model.setAttribute('aria-label', tr('Modèle'))
  const fill = () => {
    model.replaceChildren()
    for (const m of types.find((t) => t.id === type.value)!.models)
      model.add(new Option(m.label, m.id))
  }
  type.onchange = fill
  fill()
  const controls = actionRow()
  const cancel = document.createElement('button')
  cancel.textContent = tr('Annuler')
  cancel.onclick = () => overlay.close()
  const confirm = document.createElement('button')
  confirm.className = 'primary'
  confirm.dataset.default = ''
  confirm.textContent = tr('Créer')
  confirm.onclick = () => {
    const t = types.find((t) => t.id === type.value)!
    submit(
      t,
      t.models.find((m) => m.id === model.value)!,
    )
  }
  controls.append(cancel, confirm)
  overlay.append(heading, type, model, controls)
  overlay.showModal()
}
