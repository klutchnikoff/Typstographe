import { tr } from './i18n'
import { Extension, type Editor } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'
import type { Transport, Provider } from './provider'
import { settingsFor } from './state'
import { editorRangeRect, type ObjectMenu, type ObjectMenuGroup } from './object-menu'
import { editingAvailability } from './command-availability'
import { replaceText } from './text-edits'
import { inlineTarget } from './object-commands'
import { executeStructured } from './structured-commands'
import { errorText } from './command-error'
export interface Hit {
  from: number
  to: number
  word: string
}
interface State {
  query: string
  ignoreCase: boolean
  hits: Hit[]
  issues: Hit[]
  decorations: DecorationSet
}
export const proofingKey = new PluginKey<State>('document-proofing')
/** Preserve PM offsets around editable inline source, while excluding it from prose checks. */
function proseText(node: PMNode, breaks: string) {
  return node.content.content
    .map((n) =>
      n.type.name === 'mathInline'
        ? '\ufffc'.repeat(n.nodeSize)
        : n.isText
          ? n.text!
          : ['softBreak', 'hardBreak'].includes(n.type.name)
            ? breaks
            : '\ufffc'.repeat(n.nodeSize),
    )
    .join('')
}
export function findMatches(doc: PMNode, query: string, ignoreCase: boolean): Hit[] {
  if (!query) return []
  const pattern = new RegExp(
      query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      ignoreCase ? 'giu' : 'gu',
    ),
    hits: Hit[] = []
  doc.descendants((node, pos) => {
    if (node.type.spec.code) return false
    if (!node.isTextblock) return
    const text = proseText(node, '\n')
    for (const match of text.matchAll(pattern)) {
      // Object placeholders and returns are boundaries, never replaceable text.
      if (/[\n\ufffc]/.test(match[0])) continue
      hits.push({
        from: pos + 1 + match.index!,
        to: pos + 1 + match.index! + match[0].length,
        word: match[0],
      })
    }
    return false
  })
  return hits
}
function decorations(doc: PMNode, hits: Hit[], issues: Hit[]) {
  return DecorationSet.create(doc, [
    ...hits.map((hit) => Decoration.inline(hit.from, hit.to, { class: 'search-hit' })),
    ...issues.map((issue) =>
      Decoration.inline(issue.from, issue.to, { class: 'spelling-error', 'data-word': issue.word }),
    ),
  ])
}
export const Proofing = Extension.create({
  name: 'proofing',
  addProseMirrorPlugins() {
    return [
      new Plugin<State>({
        key: proofingKey,
        state: {
          init: (_, state) => ({
            query: '',
            ignoreCase: true,
            hits: [],
            issues: [],
            decorations: DecorationSet.empty,
          }),
          apply(tr, previous, _, next) {
            const meta = tr.getMeta(proofingKey) as Partial<State> | undefined
            const query = meta?.query ?? previous.query,
              ignoreCase = meta?.ignoreCase ?? previous.ignoreCase
            const hits =
              tr.docChanged || meta?.query !== undefined || meta?.ignoreCase !== undefined
                ? findMatches(next.doc, query, ignoreCase)
                : previous.hits
            const issues =
              meta?.issues ??
              (tr.docChanged
                ? previous.issues
                    .map((issue) => ({
                      ...issue,
                      from: tr.mapping.map(issue.from),
                      to: tr.mapping.map(issue.to),
                    }))
                    .filter(
                      (issue) =>
                        issue.from < issue.to &&
                        next.doc.textBetween(issue.from, issue.to) === issue.word,
                    )
                : previous.issues)
            return {
              query,
              ignoreCase,
              hits,
              issues,
              decorations: decorations(next.doc, hits, issues),
            }
          },
        },
        props: {
          decorations: (state) => proofingKey.getState(state)?.decorations,
          handleClick(view, pos, event) {
            if (!(event.target instanceof Element) || !event.target.closest('.search-hit'))
              return false
            const hit = proofingKey
              .getState(view.state)
              ?.hits.find((hit) => hit.from <= pos && pos <= hit.to)
            if (!hit) return false
            view.dispatch(
              view.state.tr.setSelection(TextSelection.create(view.state.doc, hit.from, hit.to)),
            )
            return true
          },
        },
      }),
    ]
  },
})
export function searchState(editor: Editor, query: string, ignoreCase = true) {
  editor.view.dispatch(editor.state.tr.setMeta(proofingKey, { query, ignoreCase }))
  return proofingKey.getState(editor.state)?.hits || []
}
export function correctionAtCursor(editor: Editor) {
  if (
    !(editor.state.selection instanceof TextSelection) ||
    editor.state.selection.$from.parent.type.spec.code
  )
    return
  return correctionAtPosition(editor, editor.state.selection.from)
}
export function correctionAtPosition(editor: Editor, position: number, word?: string) {
  return proofingKey
    .getState(editor.state)
    ?.issues.find(
      (issue) => issue.from <= position && position <= issue.to && (!word || word === issue.word),
    )
}
export function navigateSpelling(editor: Editor, backwards = false) {
  const hits = proofingKey.getState(editor.state)?.issues || []
  const { from, to } = editor.state.selection
  const hit = backwards
    ? [...hits].reverse().find((h) => h.to <= from) || hits.at(-1)
    : hits.find((h) => h.from >= to && h.from !== from) || hits[0]
  if (!hit) return false
  return editor
    .chain()
    .focus()
    .setTextSelection({ from: hit.from, to: hit.to })
    .scrollIntoView()
    .run()
}
const correctionMenus = new WeakMap<Editor, (issue: Hit) => boolean>()
export function openCorrection(editor: Editor, issue = correctionAtCursor(editor)) {
  return !!issue && (correctionMenus.get(editor)?.(issue) ?? false)
}
export function mountProofing(
  editor: Editor,
  menu: ObjectMenu,
  provider: Provider,
  transport: Transport,
  preferences: () => { personal: Record<string, string[]>; spelling_enabled: boolean },
  savePersonal: (word: string, lang: string) => Promise<void>,
  message: (s: string, error?: boolean) => void,
) {
  let timer: ReturnType<typeof setTimeout>,
    version = 0
  const check = () => {
    const ticket = ++version
    clearTimeout(timer)
    if (preferences().spelling_enabled === false) {
      editor.view.dispatch(editor.state.tr.setMeta(proofingKey, { issues: [] }))
      return
    }
    timer = setTimeout(() => {
      const segments: { text: string; pos: number }[] = []
      editor.state.doc.descendants((node, pos) => {
        if (node.type.spec.code) return false
        if (node.isTextblock) {
          segments.push({ text: proseText(node, '\n'), pos: pos + 1 })
          return false
        }
      })
      const settings = settingsFor(provider),
        language = String(settings.metadata.fields.options.language)
      const ignored = [
        ...(preferences().personal[language] || []),
        ...((
          settings.metadata.fields.options.spelling_ignored as Record<string, string[]> | undefined
        )?.[language] || []),
      ]
      void transport
        .invoke<{ segment: number; from: number; to: number; word: string }[]>('spelling_check', {
          segments: segments.map((s) => s.text),
          language,
          ignored,
        })
        .then((found) => {
          if (ticket !== version) return
          editor.view.dispatch(
            editor.state.tr.setMeta(proofingKey, {
              issues: found.map((issue) => ({
                ...issue,
                from: segments[issue.segment].pos + issue.from,
                to: segments[issue.segment].pos + issue.to,
              })),
            }),
          )
        })
        .catch(() => {})
    }, 400)
  }
  editor.on('update', check)
  document.addEventListener('proofing:changed', check)
  const settings = provider.doc.getMap('settings')
  settings.observe(check)
  check()

  const documentLanguage = () => String(settingsFor(provider).metadata.fields.options.language)
  correctionMenus.set(editor, (issue) => {
    if (
      !editingAvailability(editor, false).enabled ||
      !provider.online ||
      issue.to > editor.state.doc.content.size ||
      editor.state.doc.textBetween(issue.from, issue.to) !== issue.word
    )
      return false
    const language = documentLanguage()
    const valid = () => {
      if (language !== documentLanguage() || !preferences().spelling_enabled)
        throw new Error(tr('Le document a changé. Réessayez.'))
    }
    const label = `${tr('Orthographe')} · « ${issue.word} »`
    const session = menu.open({
      label,
      range: { from: issue.from, to: issue.to },
      anchor: (range) => editorRangeRect(editor, range),
    })
    const extras: ObjectMenuGroup = {
      actions: [
        {
          label: tr('Ignorer dans ce document'),
          async run({ range, current }) {
            valid()
            await executeStructured(
              editor,
              provider,
              transport,
              [
                {
                  id: 'spelling.ignore',
                  params: {
                    target: inlineTarget(editor, range.from, range.to),
                    language,
                    word: issue.word,
                  },
                },
              ],
              current,
            )
          },
        },
        {
          label: tr('Ajouter au dictionnaire personnel'),
          async run() {
            valid()
            await savePersonal(issue.word, language)
            preferences().personal[language] = [
              ...(preferences().personal[language] || []),
              issue.word,
            ]
            check()
          },
        },
      ],
    }
    session.show([{ label, note: tr('Recherche de suggestions…'), actions: [] }, extras], true)
    void transport
      .invoke<string[]>('spelling_suggestions', { language, word: issue.word })
      .then((suggestions) => {
        session.updateFirstGroup({
          label,
          note: suggestions.length ? undefined : tr('Aucune suggestion disponible.'),
          actions: suggestions.slice(0, 6).map((text) => ({
            label: text,
            async run({ range, current }) {
              valid()
              const { from, to } = editor.state.selection
              await replaceText(editor, [{ ...range, word: issue.word, text }], {
                focus: false,
                current,
                installed:
                  from < range.from || to > range.to
                    ? () => {
                        editor.commands.setTextSelection(range.from + text.length)
                      }
                    : undefined,
              })
            },
          })),
        })
      })
      .catch((error) => {
        if (!session.current()) return
        session.updateFirstGroup({ label, actions: [], note: errorText(error) })
        message(errorText(error), true)
      })
    return true
  })
  editor.on('destroy', () => {
    clearTimeout(timer)
    version++
    settings.unobserve(check)
    document.removeEventListener('proofing:changed', check)
    correctionMenus.delete(editor)
  })
}
