import type { Editor } from '@tiptap/core'
import {
  referenceTargets,
  resolvedReference,
  type CrossReferenceTarget,
} from './cross-reference-index'
import { tr } from './i18n'

const normalize = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

function oneEdit(left: string, right: string) {
  if (Math.min(left.length, right.length) < 3 || Math.abs(left.length - right.length) > 1)
    return false
  let i = 0
  while (i < left.length && left[i] === right[i]) i++
  if (left.length !== right.length)
    return left.length > right.length
      ? left.slice(i + 1) === right.slice(i)
      : left.slice(i) === right.slice(i + 1)
  return (
    left.slice(i + 1) === right.slice(i + 1) ||
    (left[i] === right[i + 1] &&
      left[i + 1] === right[i] &&
      left.slice(i + 2) === right.slice(i + 2))
  )
}

function field(value: string, weight: number) {
  const text = normalize(value)
  const words = text.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  return { text, words, weight }
}

function match({ text, words, weight }: ReturnType<typeof field>, token: string) {
  if (text === token) return 5 * weight
  if (words.includes(token)) return 4 * weight
  if (text.startsWith(token) || words.some((word) => word.startsWith(token))) return 3 * weight
  if (text.includes(token)) return 2 * weight
  return words.some((word) => oneEdit(word, token)) ? weight : 0
}

export type SearchTarget = CrossReferenceTarget & { label?: string; page?: string }
const kindWords: Record<string, () => string> = {
  heading: () => `${tr('Titre')} section sec`,
  figure: () => `${tr('Image')} figure fig`,
  tableFigure: () => `${tr('Tableau')} table tab`,
  mathBlock: () => `${tr('Équation')} equation eq`,
}

export function crossReferenceSearch(editor: Editor) {
  const candidates = referenceTargets(editor).map((target) => {
    const resolved = (include_label: boolean, include_page: boolean) =>
      resolvedReference(editor, { target: target.id, include_label, include_page })
    const label = resolved(true, false),
      page = resolved(false, true)
    return {
      target: { ...target, label, page },
      fields: [
        field(target.alias || '', 5),
        field(label || '', 4),
        field(`${kindWords[target.kind]?.() || ''} ${page || ''}`, 3),
        field(`${target.title} ${target.alt || ''}`, 2),
      ],
    }
  })
  return (query: string, selected?: string): SearchTarget[] => {
    const raw = normalize(query).trim()
    const equations = raw.startsWith('$') || raw.startsWith('eq:')
    const tokens = raw
      .replace(/^\$+\s*|^eq:(?=\s|$)/u, '')
      .trim()
      .split(/\s+/u)
      .filter(Boolean)
    const ranked = candidates.flatMap(({ target, fields }) => {
      if (equations && target.kind !== 'mathBlock') return []
      let score = 0
      for (const token of tokens) {
        const value = Math.max(...fields.map((candidate) => match(candidate, token)))
        if (!value) return []
        score += value
      }
      return [{ target, score }]
    })
    ranked.sort((a, b) => b.score - a.score)
    const result = ranked.slice(0, 50).map(({ target }) => target)
    const retained = selected && ranked.find(({ target }) => target.id === selected)?.target
    if (retained && !result.includes(retained)) result.push(retained)
    return result
  }
}
