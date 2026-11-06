import type { Draft, Form, Report, Source } from './bibliography-types'
import type { ImportDraft } from './bibliography-import'
import type { BibliographyQuery } from './bibliography-publication'
import type { OnlineCandidate } from './bibliography-online-types'
import { providerLabel } from './bibliography-online-types'
import { stableJSON } from './provider'
export interface Acquisition extends ImportDraft {
  origin: OnlineCandidate
}
export class AcquisitionReview extends Error {
  constructor(readonly review: Acquisition) {
    super('acquisition_review')
  }
}
/** Converted source snapshot is immutable. Only the private native draft is edited. */
export async function prepareAcquisition(
  api: BibliographyQuery,
  origin: OnlineCandidate,
): Promise<Draft> {
  const source: Source = {
    id: crypto.randomUUID(),
    name: `${providerLabel(origin.provider)} — notice.yaml`,
    format: 'hayagriva',
    contents: origin.contents,
  }
  const report = await api<Report>(
    'bibliography.prepare_import',
    source as unknown as Record<string, unknown>,
  )
  if (report.records.length !== 1) throw new Error('Invalid acquisition result')
  const record = report.records[0]
  const form = await api<Form>('bibliography.form', { record, scope: 'import' })
  return {
    base: record,
    working: record,
    profile: form.profile,
    profiles: form.profiles,
    fingerprint: form.fingerprint,
    fields: form.fields,
    values: {},
    key: record.key,
    creating: true,
    acquisition: { source, report, decisions: [], ready: '', origin },
  }
}
/** Recheck identity matching after field edits, before one atomic project publication. */
export async function planAcquisition(api: BibliographyQuery, draft: Draft, prepared: Form) {
  const old = draft.acquisition!
  const report = await api<Report>(
    'bibliography.prepare_import',
    old.source as unknown as Record<string, unknown>,
  )
  const decisions =
    report.library_fingerprint === old.report.library_fingerprint ? old.decisions : []
  const reviewed = [prepared.record]
  const { plan } = await api<{ plan: Report['plan'] }>('bibliography.review_import', {
    source: old.source,
    expected: report.library_fingerprint,
    decisions,
    reviewed,
  })
  const review: Acquisition = {
    ...old,
    report: { ...report, records: reviewed, plan },
    decisions,
    reviewed,
    ready: stableJSON(decisions),
  }
  const target = plan.items[0]?.target
  if (plan.blocked || !target) throw new AcquisitionReview(review)
  return {
    command: {
      id: 'bibliography.apply',
      params: {
        expected: report.library_fingerprint,
        change: {
          kind: 'import',
          source: old.source,
          preparation: report.fingerprint,
          decisions,
          reviewed,
        },
      },
    },
    target,
  }
}
