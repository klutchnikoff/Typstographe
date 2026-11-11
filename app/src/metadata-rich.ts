import { richFieldStatistics } from './rich-field-statistics'
import { registerRecoveryOpener } from './form-recovery'
import { editingProvider } from './editing-history'
import { bindFormOwner, formOwner } from './form-drafts'
import { historyFor } from './editing-history'
import { capabilityAvailability } from './command-availability'
import { runFormatting } from './formatting'
import type { RecordRoot } from './editor-targets'
import type { Editor } from '@tiptap/core'
import * as Y from 'yjs'
import { createRichZone, richZoneProfiles, type EditorialProfile } from './rich-zone'
import { linkPanel } from './link-panel'
import { icon } from './icons'
import { navigationGroup } from './keyboard-navigation'
import { tr } from './i18n'
import type { Catalogue } from './shell'
import type { Transport } from './provider'

/** Named rich zone with a Yjs binding and the same link selector as the body. */
export function metadataRich(
  parent: HTMLElement,
  label: string,
  fragment: Y.XmlFragment,
  profile: EditorialProfile,
  main: Editor,
  catalogue: Catalogue,
  language: string,
  target: RecordRoot,
  statistics?: Pick<Transport, 'invoke'>,
) {
  const inline = !richZoneProfiles[profile].multiline
  const root = document.createElement('div')
  root.className = `metadata-rich ${inline ? 'metadata-rich-inline' : ''}`
  const heading = document.createElement('div')
  heading.className = 'metadata-rich-heading'
  const title = document.createElement('span')
  title.textContent = label
  const tools = document.createElement('div')
  tools.className = 'metadata-rich-tools'
  navigationGroup(tools, { axis: 'horizontal' })
  const input = document.createElement('div')
  heading.append(title, tools)
  root.append(heading, input)
  parent.append(root)
  const history = historyFor(main)
  let links: ReturnType<typeof linkPanel>
  const buttons = new Map<string, HTMLButtonElement>()
  let editor!: Editor
  for (const [mark, text, glyph] of [
    ['bold', 'Gras', 'bold'],
    ['italic', 'Italique', 'italic'],
    ['link', 'Lien', 'link'],
  ]) {
    const button = document.createElement('button')
    button.type = 'button'
    button.title = `${tr(text)} · ${label}`
    button.setAttribute('aria-label', button.title)
    button.innerHTML = icon(glyph)
    button.onmousedown = (event) => event.preventDefault()
    button.onclick = () => {
      history?.stopCapturing()
      if (
        !capabilityAvailability(editor, `text.${mark}`, mark === 'link' ? 'link' : 'style').enabled
      )
        return
      if (mark === 'link') links.open()
      else runFormatting(editor, mark === 'bold' ? 'text.bold' : 'text.italic')
    }
    tools.append(button)
    buttons.set(mark, button)
  }
  const refresh = (current: Editor) => {
    for (const [mark, button] of buttons) {
      button.setAttribute('aria-pressed', String(current.isActive(mark)))
      button.disabled = !capabilityAvailability(
        current,
        `text.${mark}`,
        mark === 'link' ? 'link' : 'style',
      ).enabled
    }
  }
  editor = createRichZone({
    profile,
    element: input,
    label,
    language,
    binding: { kind: 'fragment', fragment, historyOwner: main, target },
    openLink: (pos) => links.open(pos),
    onTransaction: ({ editor: current }) => refresh(current),
  })
  const recoveryOwner = editingProvider(main) || formOwner(main)
  if (recoveryOwner) bindFormOwner(editor, recoveryOwner)
  if (statistics) richFieldStatistics(editor, title, label, statistics)
  const host = parent.closest<HTMLElement>('dialog, #metadata-content') || parent
  links = linkPanel(editor, host, catalogue, undefined, `link-properties-${crypto.randomUUID()}`)
  if (recoveryOwner)
    registerRecoveryOpener(recoveryOwner, editor, (pos, draft) => {
      const data = (draft.data as any)?.data
      if (!draft.form.startsWith('link-properties-') && data?.kind !== 'link') return false
      const { range } = draft.context as { range: { from: number; to: number } }
      return links.resume({ from: pos, to: pos + range.to - range.from })
    })
  refresh(editor)
  return {
    updateLanguage(value: string) {
      editor.view.dom.lang = value
    },
    focus: () => editor.commands.focus(),
    destroy: () => editor.destroy(),
  }
}
