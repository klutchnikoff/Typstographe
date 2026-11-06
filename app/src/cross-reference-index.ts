import { editingProvider } from './editing-history'
import type { Editor } from '@tiptap/core'
import { tr } from './i18n'

export interface CrossReference {
  target: string
  include_label: boolean
  include_page: boolean
}
export interface CrossReferenceTarget {
  id: string
  kind: string
  title: string
  pos: number
}
export interface ResolvedReference extends CrossReference {
  display: string
}
const targetsCache = new WeakMap<Editor['state']['doc'], CrossReferenceTarget[]>()
const indexes = new WeakMap<
  Editor,
  { generation: string | undefined; entries: ResolvedReference[] }
>()
export function referenceTargets(editor: Editor): CrossReferenceTarget[] {
  const cached = targetsCache.get(editor.state.doc)
  if (cached) return cached
  const result: CrossReferenceTarget[] = []
  editor.state.doc.descendants((node, pos) => {
    if (
      !['heading', 'figure', 'tableFigure', 'mathBlock'].includes(node.type.name) ||
      !node.attrs.anchor
    )
      return
    const content = node.type.name === 'tableFigure' ? node.lastChild! : node
    const title =
      (node.type.name === 'mathBlock' && node.attrs.alias ? `eq:${node.attrs.alias} · ` : '') +
      (content.textContent || node.attrs.alt || tr('Sans intitulé'))
    result.push({ id: node.attrs.anchor, kind: node.type.name, title, pos })
  })
  targetsCache.set(editor.state.doc, result)
  return result
}
export function referenceLabel(editor: Editor, reference: CrossReference): string {
  const target = referenceTargets(editor).find((t) => t.id === reference.target)
  const index = indexes.get(editor)
  // Keep the last confirmed layout while its replacement compiles, just like
  // the preview itself. Never invent a number or reuse another target's label.
  const resolved =
    target && index?.generation === editingProvider(editor)?.generation
      ? index?.entries.find(
          (value) =>
            value.target === reference.target &&
            value.include_label === reference.include_label &&
            value.include_page === reference.include_page,
        )
      : undefined
  if (resolved) return resolved.display
  return target ? `${tr('Renvoi')} · ${target.title}` : tr('Renvoi')
}
export function setResolvedReferences(editor: Editor, entries: ResolvedReference[]) {
  const generation = editingProvider(editor)?.generation
  const previous = indexes.get(editor)
  if (
    previous &&
    previous.generation === generation &&
    previous.entries.length === entries.length &&
    previous.entries.every(
      (entry, index) =>
        entry.target === entries[index].target &&
        entry.include_label === entries[index].include_label &&
        entry.include_page === entries[index].include_page &&
        entry.display === entries[index].display,
    )
  )
    return false
  // Keep a value snapshot: callers must not mutate the published index silently.
  indexes.set(editor, { generation, entries: entries.map((entry) => ({ ...entry })) })
  // An initial empty index cannot change a badge already showing its fallback.
  if (!previous && entries.length === 0) return false
  editor.view.dispatch(editor.state.tr.setMeta('cross-reference-index', true))
  return true
}
