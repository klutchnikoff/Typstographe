import { metadataCommands } from './metadata-commands'
import { modelOptionControl } from './model-option-control'
import type { Editor } from '@tiptap/core'
import type { Provider, Transport } from './provider'
import type { DocumentType, ModelPolicy } from './shell'
import { settingsFor } from './state'
import { openBibliography } from './bibliography-manager'
import { icon } from './icons'
import { tr } from './i18n'
/** Bibliographic presentation belongs to the document; notices use the common manager. */
export function bibliographyPanel(
  parent: HTMLElement,
  provider: Provider,
  editor: Editor,
  transport: Transport,
  kind: DocumentType,
  policy: () => ModelPolicy | undefined,
) {
  const root = document.createElement('div')
  root.className = 'bibliography-settings'
  parent.append(root)
  const descriptor = kind.structured!.bibliography!
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
    metadataCommands(editor, provider),
    () => settingsFor(provider).metadata.fields[descriptor.style],
    policy,
  )
  const manage = document.createElement('button')
  manage.type = 'button'
  manage.className = 'bibliography-manage'
  manage.innerHTML = icon('book-open')
  manage.append(tr('Gérer les références'))
  manage.onclick = () => openBibliography(editor, provider, transport)
  root.append(manage)
  return {
    refresh: style.refresh,
    destroy() {
      style.destroy()
      root.remove()
    },
  }
}
