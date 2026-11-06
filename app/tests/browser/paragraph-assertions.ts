import type { Locator } from '@playwright/test'

/** Compare authored DOM text without counting the editor's paragraph decorations. */
export function paragraphTexts(paragraphs: Locator) {
  return paragraphs.evaluateAll((elements) =>
    elements.map((element) => {
      const copy = element.cloneNode(true) as HTMLElement
      copy.querySelectorAll('.paragraph-marker').forEach((marker) => marker.remove())
      return copy.textContent || ''
    }),
  )
}
