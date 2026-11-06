import type { JSONContent } from '@tiptap/core'
import type { Draft, Form } from './bibliography-types'
import type { ImportDraft } from './bibliography-import'
import type { StructuredCommand } from './structured-commands'
import { stableJSON } from './provider'
import { planAcquisition } from './bibliography-acquisition'

export interface CitationDraft {
  node?: JSONContent
  target: Record<string, unknown>
  document: JSONContent
  position: number
}
export type BibliographyQuery = <T>(
  operation: string,
  params?: Record<string, unknown>,
) => Promise<T>

/** Prepare one atomic batch from a frozen private draft. The caller owns the
 * document/context guard and publication; preparation never changes shared state.
 */
export async function prepareBibliographyPublication(
  api: BibliographyQuery,
  selected?: Draft,
  review?: ImportDraft,
  cite?: CitationDraft,
): Promise<StructuredCommand[] | null> {
  const batch: StructuredCommand[] = []
  if (review) {
    if (review.report.plan.blocked || review.ready !== stableJSON(review.decisions)) return null
    batch.push({
      id: 'bibliography.apply',
      params: {
        expected: review.report.library_fingerprint,
        change: {
          kind: 'import',
          source: review.source,
          preparation: review.report.fingerprint,
          decisions: review.decisions,
          ...(review.reviewed ? { reviewed: review.reviewed } : {}),
        },
      },
    })
  } else if (selected) {
    const prepared = await api<Form>('bibliography.prepare_form', {
      record: selected.working,
      ...(selected.acquisition ? { scope: 'import' } : {}),
      values: selected.values,
      key: selected.key || null,
    })
    let citedId = selected.base.id
    if (selected.acquisition) {
      const acquisition = await planAcquisition(api, selected, prepared)
      batch.push(acquisition.command)
      citedId = acquisition.target
    }
    if (!selected.acquisition) {
      const inspection = await api<{ fingerprint: string }>('bibliography.inspect')
      if (selected.creating || stableJSON(prepared.record) !== stableJSON(selected.base))
        batch.push({
          id: 'bibliography.apply',
          params: {
            expected: inspection.fingerprint,
            change: selected.creating
              ? { kind: 'create', record: prepared.record }
              : {
                  kind: 'replace',
                  id: selected.base.id,
                  expected: selected.fingerprint,
                  record: prepared.record,
                },
          },
        })
    }
    if (cite) {
      batch.push({
        id: 'inline.replace',
        params: {
          target: cite.target,
          node: {
            type: 'citation',
            marks: cite.node?.marks,
            attrs: {
              ...cite.node?.attrs,
              items: (cite.node?.attrs?.items || []).some(
                (item: { record_id: string }) => item.record_id === citedId,
              )
                ? cite.node!.attrs!.items
                : [...(cite.node?.attrs?.items || []), { record_id: citedId, supplement: '' }],
              form: cite.node?.attrs?.form || 'normal',
            },
          },
        },
      })
    }
  }
  return batch
}
