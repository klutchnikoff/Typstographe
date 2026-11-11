import { getMarkRange, type Editor } from '@tiptap/core'
import { capabilityAvailability, editingAvailability } from './command-availability'
import { errorText } from './command-error'
import { settingsForNode } from './capability-settings'
import { contextPanel } from './context-panel'
import type { EditorRange } from './editor-popover'
import { floatingEditorPanel } from './floating-editor-panel'
import { applyFormatting, insertLinkedText } from './formatting'
import { tr } from './i18n'
import { ParameterFields } from './parameter-fields'
import type { Catalogue } from './shell'

export function linkPanel(
  editor: Editor,
  host: HTMLElement,
  catalogue: Catalogue,
  closeOther: () => void = () => {},
  id = 'link-properties',
) {
  let session: ReturnType<ReturnType<typeof floatingEditorPanel>['open']> | undefined
  let pending = false
  const ready = () => !pending && !!session?.current() && editingAvailability(editor).enabled
  const cancel = () => {
    if (!pending) floating.close(true)
  }
  const panel = contextPanel({
    id,
    closeLabel: tr('Fermer le panneau de lien'),
    close: cancel,
    canConfirm: ready,
    tabExit: cancel,
  })
  panel.element.classList.add('link-selector')
  const address = document.createElement('div')
  const fields = new ParameterFields(address, () => {}, `${id}-`)
  const contract = settingsForNode('link', catalogue.entries)
  const caption = document.createElement('div')
  const label = document.createElement('label')
  const input = document.createElement('input')
  input.id = `${id}-text`
  input.type = 'text'
  label.htmlFor = input.id
  label.textContent = tr('Texte du lien (facultatif)')
  caption.append(label, input)
  panel.body.append(address, caption)
  const remove = panel.action({
    label: tr('Retirer le lien'),
    danger: true,
    run: () => void commit(true),
  })
  panel.action({ label: tr('Annuler'), run: cancel })
  const apply = panel.action({
    label: tr('Appliquer'),
    primary: true,
    run: () => panel.submit(),
  })
  const floating = floatingEditorPanel(editor, host, panel)
  panel.confirm = () => void commit()
  panel.body.addEventListener('input', (event) => {
    panel.error.textContent = ''
    if (event.target instanceof HTMLElement) event.target.removeAttribute('aria-invalid')
  })

  async function commit(unlink = false) {
    const anchor = session
    if (!anchor || !ready() || panel.composing) return
    const range = anchor.range
    let url = ''
    if (!unlink) {
      const field = address.querySelector('input')!
      field.value = field.value.trim()
      const result = fields.read()
      if ('error' in result) {
        field.setAttribute('aria-invalid', 'true')
        panel.error.textContent = result.error!
        return
      }
      url = String(result.attrs.href)
    }
    pending = true
    anchor.pending(true)
    panel.element.setAttribute('aria-busy', 'true')
    apply.disabled = remove.disabled = true
    try {
      if (range.from === range.to)
        await insertLinkedText(editor, range.from, input.value.trim() || url, url, anchor.current)
      else
        await applyFormatting(editor, unlink ? 'text.remove_link' : 'text.link', {
          range,
          url: unlink ? undefined : url,
          focus: false,
          current: anchor.current,
        })
      if (anchor.open()) {
        panel.committed()
        floating.close(true, true)
      }
    } catch (error) {
      if (anchor.open()) panel.error.textContent = errorText(error)
    } finally {
      pending = false
      anchor.pending(false)
      panel.element.removeAttribute('aria-busy')
      apply.disabled = remove.disabled = false
    }
  }

  function open(position?: number, restored?: EditorRange) {
    if (pending || !capabilityAvailability(editor, 'text.link', 'link').enabled) return false
    const { state } = editor
    const selection = restored || state.selection
    const linked = getMarkRange(
      state.doc.resolve(position ?? selection.from),
      state.schema.marks.link,
    )
    const existing =
      linked &&
      (position !== undefined || (linked.from <= selection.from && linked.to >= selection.to))
        ? linked
        : undefined
    if (position !== undefined && !existing) return false
    const range = existing || selection
    const href = existing
      ? state.doc.nodeAt(existing.from)?.marks.find((mark) => mark.type === state.schema.marks.link)
          ?.attrs.href
      : ''
    closeOther()
    floating.close()
    fields.render(contract.fields, { url: href })
    const url = address.querySelector('input')!
    url.dataset.initialFocus = ''
    url.inputMode = 'url'
    url.spellcheck = false
    url.autocapitalize = 'off'
    input.value = ''
    caption.hidden = range.from !== range.to
    remove.hidden = !existing
    panel.title.textContent = tr(existing ? 'Modifier le lien' : 'Insérer un lien')
    apply.textContent = tr(caption.hidden ? 'Appliquer' : 'Insérer')
    panel.error.textContent = ''
    if (restored) editor.commands.setTextSelection(restored)
    if (position === undefined) editor.commands.scrollIntoView()
    session = floating.open({ from: range.from, to: range.to })
    if (existing) url.select()
    return session.open()
  }

  return {
    get isOpen() {
      return floating.isOpen
    },
    open,
    close: floating.close,
    focus: floating.focus,
    resume(range: EditorRange) {
      return open(undefined, range) && panel.element
    },
  }
}
