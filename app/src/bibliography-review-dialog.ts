import type { Acquisition } from './bibliography-acquisition'
import type { Notice } from './bibliography-types'
import { formDialog } from './form-dialog'
import { importReview, refreshImportPlan } from './bibliography-import'
import type { BibliographyQuery } from './bibliography-publication'
import { stableJSON } from './provider'
import { errorText } from './command-error'
import { tr } from './i18n'
/** Reuse the import decision controls for a single verified online acquisition. */
export function acquisitionReviewDialog(options: {
  review: Acquisition
  api: BibliographyQuery
  existing: Notice[]
  current: () => boolean
  changed: () => void
  confirm: () => void
  closed: () => void
}) {
  const initial = document.activeElement as HTMLElement
  let alive = true,
    ticket = 0
  const close = () => {
    if (!alive) return
    alive = false
    ticket++
    form.destroy()
    options.closed()
  }
  const form = formDialog({
    id: 'bibliography-acquisition-review',
    title: tr('Vérifier l’import'),
    cancel: close,
    returnFocus: () => (initial?.isConnected ? initial : undefined),
  })
  const review = options.review
  form.action({ label: tr('Annuler'), run: close })
  const confirm = form.action({
    label: tr('Valider'),
    primary: true,
    run: () => {
      if (
        !options.current() ||
        review.ready !== stableJSON(review.decisions) ||
        review.report.plan.blocked
      )
        return
      close()
      options.confirm()
    },
  })
  async function refresh() {
    const id = ++ticket
    confirm.disabled = true
    options.changed()
    try {
      const { plan } = await options.api<{ plan: Acquisition['report']['plan'] }>(
        'bibliography.review_import',
        {
          source: review.source,
          expected: review.report.library_fingerprint,
          decisions: review.decisions,
          reviewed: review.reviewed,
        },
      )
      if (!alive || !options.current() || id !== ticket) return
      review.report.plan = plan
      review.ready = stableJSON(review.decisions)
      refreshImportPlan(form.body, plan)
      confirm.disabled = plan.blocked || !plan.items[0]?.target
      form.error.textContent = plan.blocked
        ? tr('Cet import nécessite une décision de rapprochement.')
        : ''
      options.changed()
    } catch (error) {
      if (alive && id === ticket) form.error.textContent = errorText(error)
    }
  }
  importReview(form.body, review, options.existing, () => void refresh(), false)
  void refresh()
  form.open()
  return { destroy: close }
}
