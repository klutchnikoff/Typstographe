import { tr } from './i18n'
import { returnFocusOnClose } from './dialog-focus'
import {
  documentTypePicker,
  type CreationCatalogue,
  type ModelThumbnail,
} from './document-type-picker'
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
    if (f.kind === 'text' && !f.resource && f.field in profile)
      metadata.fields[f.parameter] = profile[f.field]
  const date = type.fields.find((f) => f.kind === 'date')
  if (date) metadata.fields[date.parameter] = { kind: 'calendar', iso: isoDate(now) }
  return metadata
}

/** Fills `overlay` with the type and model choice and opens it as a modal dialog. */
export function newDocumentDialog(
  overlay: HTMLDialogElement,
  catalogue: CreationCatalogue,
  submit: (type: DocumentType, model: Model) => void,
  thumbnail?: ModelThumbnail,
  returnFocus?: () => HTMLElement | undefined,
) {
  const previous =
    document.activeElement instanceof HTMLElement ? document.activeElement : undefined
  overlay.replaceChildren()
  const heading = document.createElement('h2')
  heading.textContent = tr('Nouveau document')
  heading.id = 'new-document-title'
  overlay.setAttribute('aria-labelledby', heading.id)
  const header = document.createElement('div')
  header.className = 'new-document-heading'
  const instruction = document.createElement('p')
  instruction.textContent = tr('Choisissez ce que vous souhaitez rédiger, puis sa présentation.')
  header.append(heading, instruction)
  const controls = actionRow()
  const cancel = document.createElement('button')
  cancel.textContent = tr('Annuler')
  cancel.onclick = () => overlay.close()
  const confirm = document.createElement('button')
  confirm.className = 'primary'
  confirm.dataset.default = ''
  confirm.textContent = tr('Créer')
  let choice: { type: DocumentType; model: Model } | null = null
  const picker = documentTypePicker(
    catalogue,
    (value) => {
      choice = value
      confirm.disabled = value === null
    },
    thumbnail,
  )
  confirm.onclick = () => {
    if (choice) submit(choice.type, choice.model)
  }
  controls.append(cancel, confirm)
  overlay.append(header, picker, controls)
  const detachFocus = returnFocusOnClose(overlay, () => returnFocus?.() || previous)
  overlay.addEventListener(
    'close',
    () => {
      detachFocus()
      picker.destroy()
      overlay.removeAttribute('aria-labelledby')
    },
    { once: true },
  )
  overlay.showModal()
}
