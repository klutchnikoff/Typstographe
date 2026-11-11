import type { Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import type { SettingField } from './capability-settings'
import { ParameterFields } from './parameter-fields'
import { editingProvider } from './editing-history'
import { executeStructured } from './structured-commands'
import { applyObjectEdit, treeTarget } from './object-commands'
import { errorText } from './command-error'
import { tr } from './i18n'

export const NODE_ATTRIBUTE_COMMITTED = 'node-attribute:committed'
let nextId = 0
/** One header field, bound to its catalogue parameter.
 * A local draft commits on Enter/blur, cancels on Escape and never overwrites a
 * concurrent attribute change. Native input keys stay outside ProseMirror.
 */
export function nodeAttributeField(
  editor: Editor,
  getPos: () => number | undefined,
  initial: PMNode,
  field: SettingField,
  done: () => void,
  context: () => void,
) {
  const dom = document.createElement('div')
  dom.className = 'widget-attribute-field'
  dom.contentEditable = 'false'
  const fields = new ParameterFields(dom, () => {}, `widget-${++nextId}-`)
  fields.render([field], { [field.name]: initial.attrs[field.attribute] ?? field.schema.default })
  const input = dom.querySelector('input')
  if (!input) throw new Error('A header attribute requires a single-line text field.')
  if (field.schema.pattern) input.spellcheck = false
  let node = initial,
    alive = true,
    composing = false,
    conflict = false,
    epoch = 0
  let pending: Promise<boolean> | undefined, submitted: string | undefined
  const value = () => String(node.attrs[field.attribute] ?? field.schema.default ?? '')
  const error = (message = '') => {
    input.setCustomValidity(message)
    if (message) input.setAttribute('aria-invalid', 'true')
    else input.removeAttribute('aria-invalid')
    if (message) input.setAttribute('aria-description', message)
    else input.removeAttribute('aria-description')
  }
  const cancel = () => {
    epoch++
    input.value = value()
    conflict = false
    error()
  }
  const update = (next: PMNode) => {
    const before = value(),
      nextValue = String(next.attrs[field.attribute] ?? field.schema.default ?? '')
    node = next
    if (input.value === before || input.value === nextValue) {
      if (input.value !== nextValue) input.value = nextValue
      conflict = false
      error()
    } else if (before !== nextValue && nextValue !== submitted) {
      conflict = true
      error(tr('Le document a changé. Réessayez.'))
    }
  }
  const commit = (): Promise<boolean> => {
    if (pending) return pending
    if (!alive || editor.isDestroyed || composing) return Promise.resolve(false)
    if (input.value === value()) {
      conflict = false
      error()
      return Promise.resolve(true)
    }
    if (conflict) return Promise.resolve(false)
    const result = fields.read()
    if ('error' in result) {
      error(result.error)
      return Promise.resolve(false)
    }
    const expected = node,
      capturedEpoch = epoch,
      pos = getPos(),
      attrs = result.attrs
    if (pos === undefined) return Promise.resolve(false)
    submitted = input.value
    const current = () => {
      const pos = getPos()
      return (
        alive &&
        capturedEpoch === epoch &&
        !editor.isDestroyed &&
        pos !== undefined &&
        !!editor.state.doc.nodeAt(pos)?.eq(expected)
      )
    }
    pending = (async () => {
      try {
        const provider = editingProvider(editor)
        if (provider)
          await executeStructured(
            editor,
            provider,
            provider.transport,
            [{ id: 'node.set_attrs', params: { target: treeTarget(editor, pos), attrs } }],
            current,
            undefined,
            { guardSelection: false, lockEditors: false },
          )
        else
          await applyObjectEdit(
            editor,
            editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs }),
            undefined,
            { focus: false, current },
          )
        if (
          alive &&
          value() === String(attrs[field.attribute]) &&
          value() !== String(expected.attrs[field.attribute] ?? field.schema.default ?? '')
        ) {
          editor.view.dom.dispatchEvent(
            new CustomEvent(NODE_ATTRIBUTE_COMMITTED, {
              detail: { position: getPos(), attribute: field.attribute },
            }),
          )
        }
        return alive && input.value === value()
      } catch (failure) {
        if (alive && capturedEpoch === epoch) error(errorText(failure))
        return false
      } finally {
        pending = undefined
        submitted = undefined
      }
    })()
    return pending
  }
  input.addEventListener('input', () => {
    if (!conflict) error()
  })
  input.addEventListener('compositionstart', () => {
    composing = true
  })
  input.addEventListener('compositionend', () => {
    composing = false
  })
  input.addEventListener('change', () => {
    void commit()
  })
  input.addEventListener('keydown', (event) => {
    if (composing || event.isComposing || event.keyCode === 229) return
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      cancel()
      done()
    } else if (event.key === 'Enter') {
      event.preventDefault()
      event.stopPropagation()
      void commit().then((ok) => {
        if (ok && alive && document.activeElement === input) {
          if (event.ctrlKey || event.metaKey) context()
          else done()
        }
      })
    }
  })
  return {
    dom,
    update,
    commit,
    cancel,
    stopEvent: (event: Event) =>
      event.target instanceof globalThis.Node && dom.contains(event.target),
    destroy: () => {
      alive = false
    },
  }
}
