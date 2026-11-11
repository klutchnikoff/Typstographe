import { Extension, Node, mergeAttributes, type Editor, type JSONContent } from '@tiptap/core'
import { Plugin, TextSelection } from '@tiptap/pm/state'
import { resumeAfterWidget } from './widgets'
import type { WidgetPresentations } from './widget-frame'
import { widgetFrame as frame, type WidgetAction } from './widget-frame'
import { insertBlock } from './editing'
import { capabilityAvailability } from './command-availability'
import { tr } from './i18n'
import { nodeAttributeField } from './node-attribute-field'
import { focusEditorSelection } from './editor-focus'

export const isMath = (kind: string) => kind === 'mathInline' || kind === 'mathBlock'
const delimiters = (language: string) => (language === 'latex' ? '$$' : '$')
export function mathContent(block: boolean, language = 'typst', source = ''): JSONContent {
  return {
    type: block ? 'mathBlock' : 'mathInline',
    attrs: { language, alt: '', ...(block ? { alias: '' } : {}) },
    ...(source ? { content: [{ type: 'text', text: source }] } : {}),
  }
}
function escaped(text: string, offset: number) {
  let slashes = 0
  while (offset > 0 && text[--offset] === '\\') slashes++
  return slashes % 2 === 1
}
function quoted(text: string) {
  let inside = false
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\\') i++
    else if (text[i] === '"') inside = !inside
  }
  return inside
}
function sourceReturn(editor: Editor) {
  if (editor.view.composing) return false
  const { $from } = editor.state.selection
  if (!isMath($from.parent.type.name)) return false
  if ($from.parent.type.name === 'mathInline') {
    const pos = $from.before(),
      outside = editor.state.doc.resolve(pos),
      node = $from.parent
    const before = outside.parent.content.cut(0, outside.parentOffset)
    const after = outside.parent.content.cut(outside.parentOffset + node.nodeSize)
    const lineBreak = (kind?: string) => kind === 'softBreak' || kind === 'hardBreak'
    if (
      !node.content.size &&
      outside.depth === 1 &&
      outside.parent.type.name === 'paragraph' &&
      (!before.size || lineBreak(before.lastChild?.type.name)) &&
      (!after.size || lineBreak(after.firstChild?.type.name))
    )
      return insertBlock(
        editor,
        mathContent(true, node.attrs.language),
        { from: pos, to: pos + node.nodeSize },
        true,
      )
    editor.commands.setTextSelection($from.after())
    return true
  }
  return editor.commands.insertContent({ type: 'text', text: '\n' })
}
export function mathExtensions(properties: WidgetAction, presentations: WidgetPresentations) {
  return [
    ...[false, true].map((block) =>
      Node.create({
        name: block ? 'mathBlock' : 'mathInline',
        group: block ? 'block' : 'inline',
        inline: !block,
        content: 'text*',
        marks: '',
        code: true,
        whitespace: 'pre',
        isolating: true,
        defining: true,
        addAttributes: () => ({
          language: { default: 'typst' },
          alt: { default: '' },
          ...(block ? { alias: { default: '' } } : {}),
        }),
        parseHTML: () => [{ tag: `${block ? 'pre' : 'span'}[data-math-source]` }],
        renderHTML: ({ HTMLAttributes }) => [
          block ? 'pre' : 'span',
          mergeAttributes(HTMLAttributes, {
            'data-math-source': '',
            class: block ? 'math-source-block' : 'math-source-inline',
          }),
          0,
        ],
        addNodeView:
          () =>
          ({ node, getPos, editor }) => {
            const contentDOM = document.createElement(block ? 'pre' : 'code')
            contentDOM.className = 'math-source'
            contentDOM.setAttribute('aria-label', tr('Code mathématique'))
            contentDOM.setAttribute('spellcheck', 'false')
            let alias: ReturnType<typeof nodeAttributeField> | undefined
            const action: WidgetAction = (pos, kind, remove) => {
              if (remove || !alias) {
                if (remove) alias?.cancel()
                properties(pos, kind, remove)
              } else
                void alias.commit().then((ok) => {
                  const current = getPos()
                  if (ok && current !== undefined && !editor.isDestroyed)
                    properties(current, kind, remove)
                })
            }
            const widget = block
              ? frame('mathBlock', getPos, action, undefined, presentations.mathBlock)
              : undefined
            const dom = widget?.dom || document.createElement('span')
            if (!block) dom.className = 'math-source-inline'
            const language = document.createElement('span')
            language.className = 'math-language'
            if (widget) widget.dom.querySelector('.widget-kind')?.after(language)
            const aliasField = presentations.mathBlock?.settings.headerField
            if (widget && aliasField) {
              const done = () => {
                const pos = getPos()
                if (pos === undefined || editor.isDestroyed) return
                editor.commands.setTextSelection(pos + 1)
                focusEditorSelection(editor)
              }
              alias = nodeAttributeField(editor, getPos, node, aliasField, done, () => {
                const pos = getPos()
                if (pos !== undefined) action(pos, 'mathBlock')
              })
              widget.dom.querySelector('.widget-kind')?.after(alias.dom)
            }
            const update = (next: typeof node) => {
              if (next.type !== node.type || next.attrs.language !== node.attrs.language)
                return false
              alias?.update(next)
              dom.dataset.mathSource = next.attrs.language
              language.textContent = next.attrs.language === 'latex' ? 'LaTeX' : 'Typst'
              dom.dataset.delimiter = delimiters(next.attrs.language)
              if (!block) {
                delimiter.textContent = closing.textContent = dom.dataset.delimiter
              }
              return true
            }
            const delimiter = document.createElement('span')
            delimiter.className = 'math-delimiter'
            delimiter.contentEditable = 'false'
            delimiter.setAttribute('aria-hidden', 'true')
            const closing = delimiter.cloneNode() as HTMLElement
            if (!block) dom.append(delimiter)
            update(node)
            dom.append(contentDOM)
            if (!block) dom.append(closing)
            return {
              dom,
              ...(widget
                ? widget.content(contentDOM)
                : {
                    contentDOM,
                    ignoreMutation: (record: import('@tiptap/pm/view').ViewMutationRecord) =>
                      record.type !== 'selection' && !contentDOM.contains(record.target),
                  }),
              update,
              stopEvent: (event: Event) => alias?.stopEvent(event) ?? false,
              destroy: () => alias?.destroy(),
            }
          },
      }),
    ),
    Extension.create({
      name: 'mathInput',
      priority: 1800,
      addKeyboardShortcuts() {
        const editor = this.editor
        return {
          Enter: () => {
            if (editor.view.composing) return false
            const { $from, empty } = editor.state.selection
            if (isMath($from.parent.type.name)) return sourceReturn(editor)
            if (!empty || $from.depth !== 1 || $from.parent.type.name !== 'paragraph') return false
            const before = $from.parent.textBetween(0, $from.parentOffset, '\n', '\n')
            const marker = /(?:^|\n)(\${1,2})$/.exec(before)
            if (!marker) return false
            const after = $from.parent.textBetween(
              $from.parentOffset,
              $from.parent.content.size,
              '\n',
              '\n',
            )
            if (after && !after.startsWith('\n')) return false
            if (!capabilityAvailability(editor, 'math.block', 'block').enabled) return false
            return insertBlock(
              editor,
              mathContent(true, marker[1] === '$$' ? 'latex' : 'typst'),
              { from: $from.pos - marker[1].length, to: $from.pos },
              true,
            )
          },
          'Shift-Enter': () => sourceReturn(editor),
          Tab: () => {
            if (editor.view.composing) return false
            const { $from } = editor.state.selection
            if (!isMath($from.parent.type.name)) return false
            if ($from.parent.type.name === 'mathInline')
              editor.commands.setTextSelection($from.after())
            else
              editor.view.dispatch(
                resumeAfterWidget(editor.state.tr, $from.after()).scrollIntoView(),
              )
            return true
          },
          Backspace: () => {
            if (editor.view.composing) return false
            const { $from, empty } = editor.state.selection
            if (empty && $from.parent.type.name === 'mathInline' && !$from.parent.content.size) {
              const pos = $from.before(),
                tr = editor.state.tr.delete(pos, $from.after())
              tr.setSelection(TextSelection.create(tr.doc, pos))
              editor.view.dispatch(tr.scrollIntoView())
              return true
            }
            return empty && isMath($from.parent.type.name) && $from.parentOffset === 0
          },
          Delete: () => {
            if (editor.view.composing) return false
            const { $from, empty } = editor.state.selection
            return (
              empty &&
              isMath($from.parent.type.name) &&
              $from.parentOffset === $from.parent.content.size
            )
          },
        }
      },
      addProseMirrorPlugins() {
        const editor = this.editor
        return [
          new Plugin({
            props: {
              handleTextInput(view, from, to, text) {
                if (view.composing || text !== '$' || from !== to) return false
                const $from = view.state.doc.resolve(from),
                  parent = $from.parent
                if (parent.type.name === 'mathInline') {
                  if ($from.parentOffset !== parent.content.size) return false
                  const source = parent.textContent,
                    pos = $from.before()
                  if (parent.attrs.language === 'typst' && !source) {
                    const tr = view.state.tr.setNodeMarkup(pos, undefined, {
                      ...parent.attrs,
                      language: 'latex',
                    })
                    tr.setSelection(TextSelection.create(tr.doc, pos + 1))
                    view.dispatch(tr)
                    return true
                  }
                  if (
                    escaped(source, source.length) ||
                    (parent.attrs.language === 'typst' && quoted(source))
                  )
                    return false
                  if (parent.attrs.language === 'latex') {
                    if (!source.endsWith('$') || escaped(source, source.length - 1)) return false
                    const tr = view.state.tr.delete(from - 1, from)
                    tr.setSelection(TextSelection.create(tr.doc, tr.mapping.map($from.after())))
                    view.dispatch(tr.scrollIntoView())
                    return true
                  }
                  view.dispatch(
                    view.state.tr.setSelection(TextSelection.create(view.state.doc, $from.after())),
                  )
                  return true
                }
                if (
                  !parent.inlineContent ||
                  parent.type.spec.code ||
                  !capabilityAvailability(editor, 'math.inline', 'inline').enabled
                )
                  return false
                const prefix = parent.textBetween(0, $from.parentOffset, '\n', '\ufffc')
                if (escaped(prefix, prefix.length)) return false
                // Enter a semantic code zone immediately: prose rules must never
                // reinterpret operators, underscores or repeated source spaces.
                const node = editor.schema.nodeFromJSON(mathContent(false))
                const tr = view.state.tr.replaceWith(from, to, node)
                tr.setSelection(TextSelection.create(tr.doc, from + 1))
                view.dispatch(tr.scrollIntoView())
                return true
              },
              handlePaste(view, event) {
                const { $from } = view.state.selection
                if (!$from.parent.type.spec.code || !isMath($from.parent.type.name)) return false
                const text = event.clipboardData?.getData('text/plain')
                if (text === undefined) return false
                event.preventDefault()
                view.dispatch(
                  view.state.tr
                    .insertText(
                      $from.parent.type.name === 'mathInline'
                        ? text.replace(/[\r\n]+/g, ' ')
                        : text,
                    )
                    .scrollIntoView(),
                )
                return true
              },
            },
          }),
        ]
      },
    }),
  ]
}
