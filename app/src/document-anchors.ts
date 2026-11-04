import UniqueID from '@tiptap/extension-unique-id'
import { isChangeOrigin } from '@tiptap/extension-collaboration'
import { Fragment, Slice, type Node as PMNode } from '@tiptap/pm/model'
import { Plugin } from '@tiptap/pm/state'
import { Extension } from '@tiptap/core'
import { editingProvider } from './editing-history'
import { tr } from './i18n'
import { anchorKinds, newAnchor } from './anchor-identity'

/** A copied forest receives fresh identities; its internal references follow the copies. */
export function copiedContent(slice: Slice): Slice {
  const ids = new Map<string, string>()
  slice.content.descendants((node) => {
    if (anchorKinds.includes(node.type.name) && node.attrs.anchor)
      ids.set(node.attrs.anchor, newAnchor())
  })
  const copy = (node: PMNode): PMNode => {
    if (node.isText) return node
    const attrs = { ...node.attrs }
    if (anchorKinds.includes(node.type.name)) attrs.anchor = ids.get(attrs.anchor) || newAnchor()
    if (node.type.name === 'crossReference' && ids.has(attrs.target))
      attrs.target = ids.get(attrs.target)
    return node.type.create(attrs, Fragment.fromArray(node.content.content.map(copy)), node.marks)
  }
  return new Slice(
    Fragment.fromArray(slice.content.content.map(copy)),
    slice.openStart,
    slice.openEnd,
  )
}

/** Reuse Tiptap's split/join/undo identity handling, with documentary copy semantics. */
export const DocumentAnchors = UniqueID.extend({
  onCreate() {
    // Our provider is synchronized before mounting, including the native ySync binding.
    // Allocate before the editor's public create notification, not on the next remote update.
    if (!this.options.updateDocument) return
    const transaction = this.editor.state.tr
    transaction.doc.descendants((node, pos) => {
      if (anchorKinds.includes(node.type.name) && !node.attrs.anchor)
        transaction.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          anchor: this.options.generateID({ node, pos }),
        })
    })
    this.storage.needsInitialIdGeneration = false
    if (transaction.docChanged)
      this.editor.view.dispatch(transaction.setMeta('addToHistory', false))
  },
  addProseMirrorPlugins() {
    if (this.options.updateDocument) this.storage.needsInitialIdGeneration = true
    const plugins = (this.parent?.() || []).map(
      (plugin) =>
        new Plugin({
          ...plugin.spec,
          props: {
            ...plugin.props,
            transformPasted: (slice, view) => (view.dragging?.move ? slice : copiedContent(slice)),
          },
        }),
    )
    if (this.options.updateDocument)
      plugins.push(
        new Plugin({
          appendTransaction: (transactions, _previous, current) => {
            // Other shared editor policies can append a continuation paragraph after UniqueID.
            if (!transactions.some((t) => t.docChanged && !isChangeOrigin(t))) return null
            const transaction = current.tr
            current.doc.descendants((node, pos) => {
              if (anchorKinds.includes(node.type.name) && !node.attrs.anchor)
                transaction.setNodeMarkup(pos, undefined, {
                  ...node.attrs,
                  anchor: this.options.generateID({ node, pos }),
                })
            })
            return transaction.docChanged ? transaction : null
          },
        }),
      )
    return plugins
  },
}).configure({
  attributeName: 'anchor',
  types: anchorKinds,
  generateID: newAnchor,
  filterTransaction: (transaction) => !isChangeOrigin(transaction),
})

/** Refuse destructive typing before publication; the owner repeats this validation. */
export const ReferenceIntegrity = Extension.create({
  name: 'referenceIntegrity',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        filterTransaction: (transaction) => {
          if (!transaction.docChanged || isChangeOrigin(transaction)) return true
          const ids = new Set<string>(),
            references: string[] = []
          transaction.doc.descendants((node) => {
            if (['heading', 'figure', 'tableFigure'].includes(node.type.name) && node.attrs.anchor)
              ids.add(node.attrs.anchor)
            if (node.type.name === 'crossReference') references.push(node.attrs.target)
          })
          if (references.every((id) => ids.has(id))) return true
          queueMicrotask(() =>
            editingProvider(this.editor)?.onError(
              new Error(
                tr(
                  'La cible est encore utilisée par un renvoi. Supprimez ou modifiez ses renvois avant de la retirer.',
                ),
              ),
            ),
          )
          return false
        },
      }),
    ]
  },
})
