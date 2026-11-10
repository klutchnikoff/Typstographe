import type { Transaction } from '@tiptap/pm/state'

export interface EditorRange {
  from: number
  to: number
}

/** A changed target must never silently resolve to a different object. */
export function unchangedRange(transaction: Transaction, range: EditorRange) {
  const start = transaction.mapping.mapResult(range.from, 1)
  const end = transaction.mapping.mapResult(range.to, -1)
  if (
    start.deleted ||
    end.deleted ||
    end.pos < start.pos ||
    !transaction.before.slice(range.from, range.to).eq(transaction.doc.slice(start.pos, end.pos))
  )
    return undefined
  return { from: start.pos, to: end.pos }
}

/** Shared placement for action menus and interactive selectors. */
export function placePopover(element: HTMLElement, anchor: DOMRect) {
  const viewport = document.documentElement
  const margin = 8
  if (anchor.bottom < 0 || anchor.top > viewport.clientHeight) return false
  const { width, height } = element.getBoundingClientRect()
  const right = viewport.clientWidth - width - margin
  const bottom = viewport.clientHeight - height - margin
  let x = anchor.left
  let y = anchor.bottom + 5
  if (y > bottom) {
    const above = anchor.top - height - 5
    if (above >= margin) y = above
    else {
      const before = anchor.left - width - 5
      const after = anchor.right + 5
      if (after <= right) x = after
      else if (before >= margin) x = before
      y = anchor.top
    }
  }
  element.style.left = `${Math.max(margin, Math.min(right, x))}px`
  element.style.top = `${Math.max(margin, Math.min(bottom, y))}px`
  return true
}
