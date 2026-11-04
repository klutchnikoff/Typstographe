/** Documentary identity vocabulary; never includes titles, positions or counters. */
export const anchorKinds = [
  'paragraph',
  'heading',
  'figure',
  'tableFigure',
  'quote',
  'bulletList',
  'orderedList',
  'descriptionList',
  'postscript',
  'attachment',
  'mathBlock',
]
export const newAnchor = () => crypto.randomUUID()

/** Planned widget splices have not passed through UniqueID's appendTransaction yet. */
export function plannedAnchors(transaction: import('@tiptap/pm/state').Transaction) {
  const seen = new Set<string>()
  transaction.doc.descendants((node, pos) => {
    if (!anchorKinds.includes(node.type.name) || !node.attrs.anchor) return
    let id = node.attrs.anchor as string
    if (seen.has(id)) {
      id = newAnchor()
      transaction.setNodeMarkup(
        pos,
        undefined,
        { ...node.attrs, anchor: id, ...(node.type.name === 'mathBlock' ? { alias: '' } : {}) },
        node.marks,
      )
    }
    seen.add(id)
  })
  return transaction
}
