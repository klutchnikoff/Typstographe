import { GapCursor } from '@tiptap/pm/gapcursor'
import type { Node as PMNode, ResolvedPos } from '@tiptap/pm/model'
import { Selection, type SelectionBookmark } from '@tiptap/pm/state'
import type { Mappable } from '@tiptap/pm/transform'

const flows = new Set(['doc', 'quote', 'tableCell', 'tableHeader'])
/** A paragraph separator is a view position, never an extra document node. */
export function paragraphBoundary($pos: ResolvedPos) {
  return (
    flows.has($pos.parent.type.name) &&
    $pos.nodeBefore?.type.name === 'paragraph' &&
    $pos.nodeBefore.content.size > 0 &&
    $pos.nodeAfter?.type.name === 'paragraph'
  )
}
export class ParagraphSelection extends GapCursor {
  map(doc: PMNode, mapping: Mappable): Selection {
    const $pos = doc.resolve(mapping.map(this.head, 1))
    return paragraphBoundary($pos) ? new ParagraphSelection($pos) : Selection.near($pos)
  }
  eq(other: Selection) {
    return other instanceof ParagraphSelection && other.head === this.head
  }
  toJSON() {
    return { type: 'paragraphBoundary', pos: this.head }
  }
  static fromJSON(doc: PMNode, value: { pos: number }) {
    if (!Number.isInteger(value.pos)) throw new RangeError('Invalid paragraph boundary')
    const $pos = doc.resolve(value.pos)
    if (!paragraphBoundary($pos)) throw new RangeError('Missing paragraph boundary')
    return new ParagraphSelection($pos)
  }
  getBookmark(): SelectionBookmark {
    return new ParagraphBookmark(this.head)
  }
}
class ParagraphBookmark implements SelectionBookmark {
  constructor(readonly pos: number) {}
  map(mapping: Mappable) {
    return new ParagraphBookmark(mapping.map(this.pos, 1))
  }
  resolve(doc: PMNode) {
    const $pos = doc.resolve(this.pos)
    return paragraphBoundary($pos) ? new ParagraphSelection($pos) : Selection.near($pos)
  }
}
Selection.jsonID('paragraphBoundary', ParagraphSelection)
