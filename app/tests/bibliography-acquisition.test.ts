import { expect, it, vi } from 'vitest'
import { AcquisitionReview, prepareAcquisition } from '../src/bibliography-acquisition'
import {
  prepareBibliographyPublication,
  type BibliographyQuery,
  type CitationDraft,
} from '../src/bibliography-publication'
import type { OnlineCandidate } from '../src/bibliography-online-types'
import type { Draft, Form, Notice, Report } from '../src/bibliography-types'
import { stableJSON } from '../src/provider'
const origin: OnlineCandidate = {
  id: 'remote',
  provider: 'cairn',
  title: 'Émancipation',
  authors: 'Eneau',
  year: 2022,
  doi: '10.3917/dbu.jorro.2022.01.0155',
  source_url: 'https://doi.org/10.3917/dbu.jorro.2022.01.0155',
  entry: { type: 'chapter', title: 'Émancipation' },
  contents: 'original converted acquisition',
  warnings: [],
}
const record: Notice = {
  id: 'incoming',
  key: 'eneau2022',
  entry: origin.entry,
  provenance: [{ source_id: 'source', original_key: 'eneau2022' }],
}
const report = (): Report => ({
  fingerprint: 'preparation',
  library_fingerprint: 'library',
  records: [structuredClone(record)],
  diagnostics: [],
  plan: {
    blocked: false,
    items: [
      {
        incoming: 'incoming',
        target: 'incoming',
        action: 'new',
        added_fields: [],
        differing_fields: [],
        conflicts: [],
      },
    ],
  },
})
function setup(target = 'incoming', blocked = false) {
  const current = report()
  current.plan.items[0].target = target
  current.plan.blocked = blocked
  const calls = vi.fn(async (op: string, params?: Record<string, unknown>) => {
    if (op === 'bibliography.prepare_import') return structuredClone(current)
    if (op === 'bibliography.form')
      return {
        record,
        profile: 'book_chapter',
        profiles: ['book_chapter'],
        fingerprint: 'record',
        patches: [],
        diagnostics: [],
        fields: [],
      } as Form
    if (op === 'bibliography.prepare_form')
      return {
        record: { ...record, entry: { ...record.entry, title: 'Verified' } },
        profile: 'book_chapter',
        profiles: ['book_chapter'],
        fingerprint: 'record',
        patches: [],
        diagnostics: [],
        fields: [],
      } as Form
    if (op === 'bibliography.review_import') return { plan: structuredClone(current.plan) }
    throw new Error(`Unexpected ${op}: ${JSON.stringify(params)}`)
  })
  return { api: calls as BibliographyQuery, calls, current }
}
it('prepares a private editable record with immutable converted source provenance', async () => {
  const { api } = setup()
  const draft = await prepareAcquisition(api, origin)
  const before = draft.acquisition!.source.contents
  draft.values['/title'] = 'Correction'
  expect(draft.acquisition!.source.contents).toBe(before)
  expect(draft.base.provenance).toEqual(record.provenance)
  expect(draft.creating).toBe(true)
})
it('publishes corrected import and citation as one batch using the reconciled target identity', async () => {
  const { api, calls } = setup('already-in-project')
  const draft = await prepareAcquisition(api, origin)
  const before = stableJSON(draft)
  const cite: CitationDraft = {
    target: { path: [0] },
    document: { type: 'doc' },
    position: 1,
    node: {
      type: 'citation',
      attrs: { items: [{ record_id: 'already-in-project', supplement: 'p. 2' }], form: 'prose' },
      marks: [{ type: 'italic' }],
    },
  }
  const batch = await prepareBibliographyPublication(api, draft, undefined, cite)
  expect(batch?.map((c) => c.id)).toEqual(['bibliography.apply', 'inline.replace'])
  expect(batch?.[0].params).toMatchObject({
    expected: 'library',
    change: {
      kind: 'import',
      preparation: 'preparation',
      reviewed: [{ id: 'incoming', entry: { title: 'Verified' }, provenance: record.provenance }],
    },
  })
  expect(batch?.[1].params).toMatchObject({
    node: {
      attrs: { items: [{ record_id: 'already-in-project', supplement: 'p. 2' }], form: 'prose' },
      marks: cite.node?.marks,
    },
  })
  expect(stableJSON(draft)).toBe(before)
  expect(calls.mock.calls.some(([op]) => op === 'bibliography.inspect')).toBe(false)
})
it('requests explicit reconciliation and never silently reuses decisions from an older library', async () => {
  const { api, calls, current } = setup('candidate', true)
  const draft = await prepareAcquisition(api, origin)
  draft.acquisition!.decisions = [{ kind: 'same', incoming: 'incoming', target: 'old-target' }]
  current.library_fingerprint = 'new-library'
  let review: AcquisitionReview | undefined
  try {
    await prepareBibliographyPublication(api, draft)
  } catch (error) {
    review = error as AcquisitionReview
  }
  expect(review).toBeInstanceOf(AcquisitionReview)
  expect(review!.review.decisions).toEqual([])
  expect(review!.review.reviewed?.[0].entry.title).toBe('Verified')
  expect(calls.mock.calls.find(([op]) => op === 'bibliography.review_import')?.[1]).toMatchObject({
    expected: 'new-library',
    decisions: [],
  })
  expect(draft.acquisition!.decisions[0]).toMatchObject({ target: 'old-target' })
})
