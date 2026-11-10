import type { Editor } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import type { BandHost } from './band-layout'
import { editingAvailability } from './command-availability'
import { commandCapabilities } from './command-context'
import { convertList } from './editing'
import { tr } from './i18n'
import { composing } from './keyboard-navigation'
import { applyObjectEdit, treeTarget } from './object-commands'
import { contextMenuKey, type ObjectAction, type ObjectMenu } from './object-menu'
import { correctionAtPosition, openCorrection } from './proofing'
import { documentContent } from './shared-inline-marks'
import { hasQuickListMenu, widgetLabel, widgetPosition } from './widget-frame'
import { widgetTarget } from './widgets'

export function editorObjectActions(
  editor: Editor,
  menu: ObjectMenu,
  bands: BandHost,
  openTable: () => boolean,
  openNumbering: (pos: number) => void,
) {
  const dom = editor.view.dom
  const controller = new AbortController()
  const { signal } = controller

  function openList(pos: number, fromTrigger = true) {
    const node = editor.state.doc.nodeAt(pos)
    if (!node || !hasQuickListMenu(node.type.name) || !editingAvailability(editor, false).enabled)
      return false
    const triggerAt = (from: number) => {
      const element = editor.view.nodeDOM(from)
      return element instanceof HTMLElement
        ? element.querySelector<HTMLElement>('[data-list-menu]')
        : null
    }
    if (fromTrigger && menu.closeFrom(triggerAt(pos))) return true
    bands.close(false)
    const session = menu.open({
      label: tr('Type de liste'),
      range: { from: pos, to: pos + node.nodeSize },
      origin: fromTrigger ? ({ from }) => triggerAt(from) : undefined,
      anchor: ({ from }) => {
        const trigger = triggerAt(from)?.getBoundingClientRect()
        const viewport = dom.closest('#editor-scroll')?.getBoundingClientRect()
        if (
          fromTrigger ||
          !viewport ||
          (trigger && trigger.bottom >= viewport.top && trigger.top <= viewport.bottom)
        )
          return trigger ?? null
        const { left, top, bottom } = editor.view.coordsAtPos(editor.state.selection.head)
        return new DOMRect(left, top, 0, bottom - top)
      },
    })
    const catalogue = commandCapabilities(editor)
    const actions: ObjectAction[] = (['bulletList', 'orderedList'] as const)
      .filter((kind) => {
        const id = catalogue?.entries.find((entry) => entry.node === kind)?.id
        return kind === node.type.name || !id || catalogue?.available()?.includes(id) !== false
      })
      .map((kind) => ({
        label: widgetLabel(kind),
        radio: true,
        checked: kind === node.type.name,
        async run({ range, current }) {
          if (kind === node.type.name) return
          const replacement = convertList(node, kind)
          const selection = editor.state.selection
          const inside = selection.from > range.from && selection.to < range.to
          const transaction = editor.state.tr.replaceWith(
            range.from,
            range.to,
            editor.schema.nodeFromJSON(replacement),
          )
          transaction.setSelection(
            TextSelection.create(
              transaction.doc,
              inside ? selection.anchor : range.from + 3,
              inside ? selection.head : range.from + 3,
            ),
          )
          await applyObjectEdit(
            editor,
            transaction,
            [
              {
                id: 'block.replace',
                params: {
                  target: treeTarget(editor, range.from),
                  node: documentContent(replacement),
                },
              },
            ],
            { focus: false, current },
          )
        },
      }))
    if (node.type.name === 'orderedList')
      actions.push({
        label: `${tr('Numéro initial')}…`,
        run({ range, dismiss }) {
          dismiss()
          openNumbering(range.from)
        },
      })
    session.show([{ label: tr('Type de liste'), actions }])
    return true
  }
  function openWidget() {
    if (openTable()) return true
    const widget = widgetTarget(editor)
    return !!widget && openList(widget.pos, false)
  }
  function listAt(element: Element) {
    const widget = element.closest<HTMLElement>('[data-editor-widget]')
    return widget && hasQuickListMenu(widget.dataset.editorWidget || '')
      ? widgetPosition(widget)
      : undefined
  }
  const selectedText = () => {
    const selection = document.getSelection()
    return !!selection?.toString() && dom.contains(selection.anchorNode)
  }
  let secondary: { element: EventTarget | null; selected: boolean } | undefined
  dom.addEventListener(
    'pointerdown',
    (event) => {
      const right = event.button === 2 || (event.button === 0 && event.ctrlKey)
      secondary = right ? { element: event.target, selected: selectedText() } : undefined
    },
    { capture: true, signal },
  )
  dom.addEventListener(
    'contextmenu',
    (event) => {
      const hadSelection =
        secondary?.element === event.target ? secondary?.selected : selectedText()
      secondary = undefined
      if (
        event.defaultPrevented ||
        hadSelection ||
        editor.view.composing ||
        !(event.target instanceof Element)
      )
        return
      const mark = event.target.closest<HTMLElement>('.spelling-error')
      if (mark) {
        const position =
          editor.view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ??
          editor.view.posAtDOM(mark, 0)
        const issue = correctionAtPosition(editor, position, mark.dataset.word)
        if (issue && editingAvailability(editor, false).enabled) {
          bands.close(false)
          if (openCorrection(editor, issue)) event.preventDefault()
        }
        return
      }
      if (event.target.closest('.widget-bar')) {
        const pos = listAt(event.target)
        if (pos !== undefined && openList(pos)) event.preventDefault()
      }
    },
    { signal },
  )
  dom.addEventListener(
    'click',
    (event) => {
      if (!(event.target instanceof Element) || !event.target.closest('[data-list-menu]')) return
      const pos = listAt(event.target)
      if (pos !== undefined) openList(pos)
    },
    { signal },
  )
  dom.addEventListener(
    'keydown',
    (event) => {
      if (composing(event) || !contextMenuKey(event) || event.defaultPrevented) return
      if (event.target instanceof Element && event.target.closest('.table-handle')) return
      const trigger =
        event.target instanceof Element ? event.target.closest('[data-list-menu]') : null
      const pos = trigger ? listAt(trigger) : undefined
      const opened = pos === undefined ? openCorrection(editor) || openWidget() : openList(pos)
      if (opened) {
        event.preventDefault()
        event.stopPropagation()
      }
    },
    { capture: true, signal },
  )
  editor.on('destroy', () => controller.abort())
  return { openWidget }
}
