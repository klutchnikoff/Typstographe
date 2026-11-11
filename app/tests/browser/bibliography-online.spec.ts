import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { confirmNewDocument } from './document-lifecycle'
import { openRecordCard, confirmRecordDialog } from './record-dialog-controls'
import type { CitationItem } from '../../src/citation-index'
const response = JSON.parse(
  readFileSync(
    new URL('../../../fixtures/bibliography/online/cairn-results.json', import.meta.url),
    'utf8',
  ),
)
const manager = (page: Page) => page.locator('#bibliography-manager')
const online = (page: Page) => page.locator('#bibliography-online')
const query = (page: Page) =>
  online(page).getByRole('combobox', {
    name: 'Titre, auteur, année, DOI ou URL Cairn',
    exact: true,
  })
const title = (page: Page) => manager(page).getByLabel('Titre', { exact: true })
const body = (page: Page) => page.getByRole('textbox', { name: 'Corps du document', exact: true })
async function manage(page: Page) {
  const open = page.getByRole('button', { name: 'Gérer les références', exact: true })
  if (!(await open.isVisible())) await page.locator('#metadata-tab-bibliography').click()
  await open.click()
  await expect(manager(page)).toBeVisible()
}
async function search(page: Page) {
  await manager(page).getByRole('button', { name: 'Rechercher en ligne', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Recherche en ligne', exact: true })).toBeVisible()
  await expect(query(page)).toBeFocused()
  await query(page).fill('https://doi.org/10.3917/dbu.jorro.2022.01.0155')
  await expect(online(page).locator('.bibliography-list-row')).toHaveCount(1)
}
async function choose(page: Page, provider = 'Cairn.info') {
  await online(page)
    .getByRole('option', { name: new RegExp(` · ${provider}$`) })
    .click()
  await expect(online(page)).toBeVisible()
  await expect(page.locator('dialog[open]')).toHaveCount(1)
  await expect(title(page)).toBeFocused()
}
test.beforeEach(async ({ page, request }) => {
  await request.post('/__spike/invoke', { data: { command: 'reset', peer: 'main', args: {} } })
  await page.goto('/?client=main&welcome=1')
  await page.waitForFunction(() => window.__spike?.ready)
  await page.locator('#create-document').click()
  await page.locator('dialog [data-type="article"]').click()
  await confirmNewDocument(page)
  await page.locator('#metadata-tab-titles').click()
  await openRecordCard(page)
  await page
    .getByRole('textbox', { name: 'Titre', exact: true })
    .fill('Acquisition bibliographique')
  await confirmRecordDialog(page)
  await page.route('**/__spike/invoke', async (route) => {
    if (route.request().postDataJSON().command === 'bibliography_online')
      await route.fulfill({ json: { result: response } })
    else await route.continue()
  })
})
test('le contour de focus des deux recherches reste dans la zone de la modale', async ({
  page,
}) => {
  await manage(page)
  for (const field of [
    manager(page).getByRole('combobox', { name: 'Rechercher une référence', exact: true }),
    query(page),
  ]) {
    if (!(await field.isVisible())) {
      await page.setViewportSize({ width: 560, height: 850 })
      await manager(page).getByRole('button', { name: 'Rechercher en ligne', exact: true }).click()
    }
    await expect(field).toBeFocused()
    const { visible, clearance } = await field.evaluate((input) => {
      const style = getComputedStyle(input)
      const width = parseFloat(style.outlineWidth)
      const edge = input.getBoundingClientRect().left - width - parseFloat(style.outlineOffset)
      return {
        visible: style.outlineStyle !== 'none' && width > 0,
        clearance: edge - input.closest('.bibliography-workspace')!.getBoundingClientRect().left,
      }
    })
    expect(visible).toBe(true)
    expect(clearance).toBeGreaterThanOrEqual(0)
  }
})

test('generic fallback remains editable and reconciles with a later specialised notice', async ({
  page,
}) => {
  let generic = true
  const fallback = JSON.parse(
    readFileSync(
      new URL('../../../fixtures/bibliography/online/doi-results.json', import.meta.url),
      'utf8',
    ),
  )
  await page.route('**/__spike/invoke', async (route) => {
    if (route.request().postDataJSON().command === 'bibliography_online')
      await route.fulfill({ json: { result: generic ? fallback : response } })
    else await route.fallback()
  })
  await manage(page)
  await search(page)
  await expect(online(page).getByRole('checkbox')).toHaveCount(2)
  await expect(online(page).getByRole('checkbox', { name: 'Crossref', exact: true })).toHaveCount(0)
  await expect(online(page)).toContainText('Repli DOI automatique')
  await expect(manager(page).locator('#bibliography-list .bibliography-list-row')).toHaveCount(0)
  await choose(page, 'DOI')
  await expect(manager(page).locator('.bibliography-detail')).toContainText(
    'Le titre du chapitre est identique',
  )
  await expect(title(page)).toHaveValue('Dictionnaire des concepts de la professionnalisation')
  await manager(page).getByRole('button', { name: 'Retour aux résultats' }).click()
  await expect(query(page)).toHaveValue('https://doi.org/10.3917/dbu.jorro.2022.01.0155')
  await expect(online(page).getByRole('option', { name: / · DOI$/ })).toBeFocused()
  await choose(page, 'DOI')
  await title(page).fill('Émancipation')
  await expect(manager(page).locator('#bibliography-list .bibliography-list-row')).toHaveCount(0)
  await title(page).press('ControlOrMeta+Enter')
  await expect(
    page.getByRole('dialog', { name: 'Bibliothèque du projet', exact: true }),
  ).toBeVisible()
  await expect(manager(page).locator('#bibliography-list .bibliography-list-row')).toHaveCount(1)
  await expect(title(page)).toHaveValue('Émancipation')
  await expect(
    manager(page).getByRole('combobox', { name: 'Rechercher une référence', exact: true }),
  ).toBeFocused()
  // The specialised source later reuses the identity of the same DOI.
  generic = false
  await search(page)
  await choose(page, 'Cairn.info')
  await title(page).fill('Émancipation dans la source spécialisée')
  await manager(page).getByRole('button', { name: 'Retour aux résultats', exact: true }).click()
  await manager(page)
    .locator('#bibliography-leave')
    .getByRole('button', { name: 'Valider et poursuivre', exact: true })
    .click()
  const review = manager(page).locator('#bibliography-acquisition-review')
  await expect(review).toBeVisible()
  await expect(review).toContainText('Les deux notices ont le même DOI.')
  await expect(
    review.getByRole('row', { name: /Titre Émancipation Émancipation dans la source spécialisée/ }),
  ).toBeVisible()
  const apply = manager(page).getByRole('button', { name: 'Appliquer le choix', exact: true })
  await expect(apply).toBeDisabled()
  await review.getByRole('radio', { name: 'Conserver la notice du projet' }).check()
  await expect(apply).toBeEnabled()
  await apply.click()
  await expect(online(page).getByRole('option', { name: / · Cairn.info$/ })).toBeFocused()
  await expect(title(page)).toBeHidden()
  await manager(page).getByRole('button', { name: 'Retour aux notices du projet' }).click()
  await expect(manager(page).locator('#bibliography-list .bibliography-list-row')).toHaveCount(1)
  await expect(title(page)).toHaveValue('Émancipation')
  await manager(page).locator('.panel-title button').click()
  await page.getByRole('button', { name: 'Annuler', exact: true }).click()
  await manage(page)
  await expect(manager(page).locator('#bibliography-list .bibliography-list-row')).toHaveCount(0)
})
test('online acquisition preserves a citation group and publishes one undoable batch', async ({
  page,
}) => {
  await manage(page)
  await manager(page)
    .getByLabel('Fichiers bibliographiques', { exact: true })
    .setInputFiles({
      name: 'group.bib',
      mimeType: 'text/plain',
      buffer: Buffer.from(
        [
          '@book{bourdieu1980,author={Bourdieu, Pierre},title={Le sens pratique},year={1980}}',
          '@book{durand2020,author={Durand, Camille},title={Le travail collectif},year={2020}}',
        ].join('\n'),
      ),
    })
  await manager(page).getByRole('button', { name: 'Importer', exact: true }).click()
  await manager(page).locator('.panel-title button').click()
  await body(page).fill('Une référence nouvelle. ')
  await page.getByRole('button', { name: 'Citer une référence', exact: true }).click()
  const selector = page.locator('#citation-properties')
  await selector.getByRole('button', { name: 'Ajouter au groupe · Bourdieu, 1980' }).click()
  await selector.getByLabel('Pages ou chapitre · bourdieu1980', { exact: true }).fill('p. 42')
  const citationQuery = selector.getByRole('combobox', { name: 'Rechercher une référence' })
  await citationQuery.fill('travail collectif')
  await expect(selector.locator('[role=gridcell][data-entry]')).toHaveCount(1)
  await citationQuery.press('Enter')
  await expect(selector.getByLabel('Pages ou chapitre · durand2020', { exact: true })).toBeVisible()
  await selector.getByRole('button', { name: 'Rechercher en ligne', exact: true }).click()
  await expect(query(page)).toBeFocused()
  await query(page).fill('10.3917/dbu.jorro.2022.01.0155')
  await expect(online(page).locator('.bibliography-list-row')).toHaveCount(1)
  await query(page).press('ArrowDown')
  await query(page).press('Enter')
  await expect(title(page)).toHaveValue('Émancipation')
  await manager(page).getByRole('button', { name: 'Ajouter et citer', exact: true }).click()
  await expect(manager(page)).toBeHidden()
  await expect(body(page).locator('.citation-ref')).toHaveCount(1)
  await expect(body(page)).toBeFocused()
  const items = await page.evaluate(() => {
    const result: CitationItem[] = []
    window.__spike!.editor.state.doc.descendants((node) => {
      if (node.type.name === 'citation') result.push(...node.attrs.items)
    })
    return result
  })
  expect(items).toHaveLength(3)
  expect(items[0].supplement).toBe('p. 42')
  await page.getByRole('button', { name: 'Annuler', exact: true }).click()
  await expect(body(page).locator('.citation-ref')).toHaveCount(0)
  await manage(page)
  await expect(manager(page).locator('#bibliography-list .bibliography-list-row')).toHaveCount(2)
})
test('editing a received notice can be cancelled without changing the project', async ({
  page,
}) => {
  await manage(page)
  await search(page)
  await choose(page, 'Cairn.info')
  await title(page).fill('Private correction')
  await title(page).press('Escape')
  await page
    .locator('#bibliography-leave')
    .getByRole('button', { name: 'Continuer l’édition', exact: true })
    .click()
  await expect(title(page)).toHaveValue('Private correction')
  await title(page).press('Escape')
  await page
    .locator('#bibliography-leave')
    .getByRole('button', { name: 'Abandonner', exact: true })
    .click()
  await manage(page)
  await expect(manager(page).locator('#bibliography-list .bibliography-list-row')).toHaveCount(0)
})

test('la recherche combine auteur, année ou titre dans le même champ', async ({ page }) => {
  const queries: string[] = []
  await page.route('**/__spike/invoke', async (route) => {
    const request = route.request().postDataJSON()
    if (request.command !== 'bibliography_online') return route.fallback()
    const { query, limit } = request.args.request
    queries.push(query)
    const candidates = Array.from(
      { length: Math.min(limit, query.endsWith('2025') ? 4 : 9) },
      (_, i) => ({
        ...response.candidates[0],
        id: `candidate-${i}`,
        title: `Notice ${i + 1}`,
      }),
    )
    await route.fulfill({ json: { result: { candidates, issues: [] } } })
  })
  await manage(page)
  await manager(page).getByRole('button', { name: 'Rechercher en ligne', exact: true }).click()
  await page.clock.install({ time: new Date('2026-11-10T12:00:00Z') })
  await page.clock.pauseAt(new Date('2026-11-10T12:00:10Z'))
  const rows = online(page).getByRole('option')
  const hint = online(page).getByText(
    'Seuls les 8 premiers résultats sont affichés. Affinez votre recherche.',
    { exact: true },
  )
  await expect(online(page).getByRole('button', { name: 'Rechercher', exact: true })).toHaveCount(0)
  await query(page).fill('klutchnikoff')
  await query(page).press('Enter')
  await page.clock.runFor(300)
  await query(page).fill('klutchnikoff Minimax')
  await page.clock.runFor(300)
  expect(queries).toEqual([])
  await page.clock.runFor(250)
  await expect(hint).toBeVisible()
  await expect(rows).toHaveCount(8)
  expect(queries).toEqual(['klutchnikoff Minimax'])
  await query(page).fill('klutchnikoff 2025')
  await page.clock.runFor(550)
  await expect(rows).toHaveCount(4)
  await expect(hint).toHaveCount(0)
  expect(queries).toEqual(['klutchnikoff Minimax', 'klutchnikoff 2025'])
  await expect(query(page)).toBeFocused()
})

test('late results cannot replace a newer search launched while typing', async ({ page }) => {
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  let requests = 0
  await page.route('**/__spike/invoke', async (route) => {
    const request = route.request().postDataJSON()
    if (request.command !== 'bibliography_online') return route.fallback()
    requests++
    if (request.args.request.query === 'old search') {
      await held
      await route.fulfill({ json: { result: response } })
    } else {
      await route.fulfill({
        json: {
          result: {
            candidates: [
              { ...response.candidates[0], id: 'current-search', title: 'Newest result' },
            ],
            issues: [{ provider: 'zbmath', code: 'unavailable', retry_after: null }],
          },
        },
      })
    }
  })
  await manage(page)
  await manager(page).getByRole('button', { name: 'Rechercher en ligne', exact: true }).click()
  await query(page).fill('old search')
  await expect.poll(() => requests).toBe(1)
  await query(page).fill('new search')
  await expect(online(page).locator('.bibliography-list-row')).toHaveCount(1)
  await expect(online(page)).toContainText(
    'zbMATH Open — Le service est temporairement indisponible.',
  )
  const oldResponse = page.waitForResponse(
    (r) =>
      r.url().endsWith('/__spike/invoke') &&
      r.request().postDataJSON()?.args?.request?.query === 'old search',
  )
  release()
  await (await oldResponse).finished()
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
  await expect(
    online(page).getByRole('option', { name: 'Newest result · Cairn.info', exact: true }),
  ).toBeVisible()
  await expect(query(page)).toBeFocused()
  await choose(page, 'Cairn.info')
  await expect(title(page)).toHaveValue('Émancipation')
})

test('an unvalidated online notice is recovered with its edits without a new lookup', async ({
  page,
}) => {
  await manage(page)
  await search(page)
  await choose(page, 'Cairn.info')
  await title(page).fill('Reformulation à conserver')
  await page.evaluate(() => window.__spike!.provider.privateRecovery!.force())
  await page.evaluate(() => window.__spike!.provider.transport.invoke('diagnostic_request_close'))
  const closing = page.locator('dialog.recovery-close-dialog')
  await expect(closing).toBeVisible()
  await Promise.all([
    page.waitForEvent('domcontentloaded'),
    closing.getByRole('button', { name: 'Conserver et fermer', exact: true }).click(),
  ])
  await page.waitForFunction(() => window.__spike?.ready)
  await Promise.all([
    page.waitForEvent('domcontentloaded'),
    page
      .locator('.recovery-work-list')
      .getByRole('button', { name: 'Reprendre', exact: true })
      .first()
      .click(),
  ])
  await page.waitForFunction(() => window.__spike?.ready)
  await page.getByRole('button', { name: 'Reprendre la saisie', exact: true }).click()
  await expect(title(page)).toHaveValue('Reformulation à conserver')
  await expect(online(page)).toHaveCount(0)
  await expect(manager(page).locator('#bibliography-list .bibliography-list-row')).toHaveCount(0)
  await manager(page).getByRole('button', { name: 'Ajouter au projet', exact: true }).click()
  await expect(manager(page).locator('#bibliography-list .bibliography-list-row')).toHaveCount(1)
  await expect(title(page)).toHaveValue('Reformulation à conserver')
})

test('a citation-key collision requires an explicit decision and keeps the verified draft', async ({
  page,
}) => {
  await manage(page)
  const files = manager(page).getByLabel('Fichiers bibliographiques', { exact: true })
  await files.setInputFiles({
    name: 'existing.yaml',
    mimeType: 'text/plain',
    buffer: Buffer.from(
      'eneau_emancipation_2022: {type: book, title: A different work, date: 1990}',
    ),
  })
  await manager(page).getByRole('button', { name: 'Importer', exact: true }).click()
  await expect(manager(page).locator('#bibliography-list .bibliography-list-row')).toHaveCount(1)
  await search(page)
  await choose(page, 'Cairn.info')
  await title(page).fill('Émancipation vérifiée')
  await manager(page).getByRole('button', { name: 'Comparer les notices', exact: true }).click()
  const review = page.locator('#bibliography-acquisition-review')
  await expect(review).toBeVisible()
  const apply = manager(page).getByRole('button', { name: 'Appliquer le choix', exact: true })
  await expect(apply).toBeDisabled()
  await expect(page.locator('dialog[open]')).toHaveCount(1)
  const distinct = 'Ajouter avec une nouvelle clé'
  const keep = 'Conserver la notice du projet'
  await expect(review).toContainText('La clé de citation est déjà utilisée.')
  await expect(
    review.getByRole('row', { name: /Titre A different work Émancipation vérifiée/ }),
  ).toBeVisible()
  await expect(review.getByRole('combobox')).toHaveCount(0)
  await expect(review.getByRole('radio', { name: 'Enrichir la notice du projet' })).toHaveCount(0)
  await expect(review.getByRole('radio')).toHaveCount(2)
  await expect(review.getByRole('radio', { checked: true })).toHaveCount(0)
  for (const width of [1280, 560]) {
    await page.setViewportSize({ width, height: 850 })
    for (const name of [keep, distinct]) {
      const option = review.getByRole('radio', { name, exact: true })
      const layout = await option.evaluate((input) => {
        const label = input.closest('label')!
        const row = label.getBoundingClientRect()
        const radio = input.getBoundingClientRect()
        const range = document.createRange()
        range.selectNode(label.lastChild!)
        const text = range.getBoundingClientRect()
        return {
          compactRadio: radio.width < row.width / 3,
          besideRadio: text.left >= radio.right,
          fitsRow: text.width > 0 && text.right <= row.right + 1,
        }
      })
      expect(layout, `${name} at ${width}px`).toEqual({
        compactRadio: true,
        besideRadio: true,
        fitsRow: true,
      })
    }
  }
  await review.getByText(distinct, { exact: true }).click()
  await expect(review.getByRole('radio', { name: distinct })).toBeChecked()
  await expect(review).toContainText('Cette clé est déjà utilisée.')
  await expect(apply).toBeDisabled()
  await review.getByRole('radio', { name: keep }).press('Space')
  await expect(review.getByRole('radio', { name: keep })).toBeChecked()
  await expect(
    review.getByRole('row', { name: /Titre A different work Émancipation vérifiée/ }),
  ).toBeVisible()
  await expect(apply).toBeEnabled()
  await review.getByText(distinct, { exact: true }).click()
  await review
    .getByLabel('Nouvelle clé de citation · eneau_emancipation_2022', { exact: true })
    .fill('eneau2022verified')
  await expect(apply).toBeEnabled()
  await apply.click()
  await expect(review).toHaveCount(0)
  await expect(manager(page).locator('#bibliography-list .bibliography-list-row')).toHaveCount(2)
  await manager(page)
    .getByRole('combobox', { name: 'Rechercher une référence', exact: true })
    .fill('vérifiée')
  await expect(manager(page).locator('#bibliography-list .bibliography-list-row')).toHaveCount(1)
  await manager(page)
    .getByRole('combobox', { name: 'Rechercher une référence', exact: true })
    .press('Enter')
  await expect(title(page)).toHaveValue('Émancipation vérifiée')
  await manager(page).locator('.panel-title button').click()
  await page.getByRole('button', { name: 'Annuler', exact: true }).click()
  await manage(page)
  await expect(manager(page).locator('#bibliography-list .bibliography-list-row')).toHaveCount(1)
})

test('a validated acquisition saves, reopens and exports without any provider request', async ({
  page,
}) => {
  await body(page).fill('Un chapitre sur l’émancipation. ')
  await page.getByRole('button', { name: 'Citer une référence', exact: true }).click()
  await page
    .locator('#citation-properties')
    .getByRole('button', { name: 'Rechercher en ligne', exact: true })
    .click()
  await query(page).fill('10.3917/dbu.jorro.2022.01.0155')
  await expect(online(page).locator('.bibliography-list-row')).toHaveCount(1)
  await choose(page, 'Cairn.info')
  await manager(page).getByRole('button', { name: 'Ajouter et citer', exact: true }).click()
  await expect(manager(page)).toBeHidden()
  await expect(body(page).locator('.citation-ref')).toHaveCount(1)
  await page.route('**/__spike/invoke', async (route) => {
    if (route.request().postDataJSON().command === 'bibliography_online')
      throw new Error('No lookup allowed after acquisition')
    await route.fallback()
  })
  await page.getByRole('button', { name: 'Fichier', exact: true }).click()
  await page.locator('[data-command="document.save"]').click()
  await expect(page.locator('#message')).toContainText('Session enregistrée')
  await page.reload()
  await page.waitForFunction(() => window.__spike?.ready)
  await expect(body(page).locator('.citation-ref')).toHaveCount(1)
  await manage(page)
  await expect(manager(page).locator('#bibliography-list .bibliography-list-row')).toHaveCount(1)
  await expect(title(page)).toHaveValue('Émancipation')
  await manager(page).locator('.panel-title button').click()
  await page.getByRole('button', { name: 'Fichier', exact: true }).click()
  await page.locator('[data-command="document.export"]').click()
  await expect(page.locator('#message')).toContainText('sources Typst exportés')
})

test('un résultat identique est réutilisé directement, y compris dans une citation groupée', async ({
  page,
}) => {
  await manage(page)
  const content = response.candidates[0].contents.replace(
    /^eneau_emancipation_2022:/,
    'my_existing_key:',
  )
  await manager(page)
    .getByLabel('Fichiers bibliographiques', { exact: true })
    .setInputFiles({
      name: 'existing.yaml',
      mimeType: 'text/plain',
      buffer: Buffer.from(
        content +
          '\nexample: {type: book, title: First reference, author: "Doe, Jane", date: 2025}\n',
      ),
    })
  await manager(page).getByRole('button', { name: 'Importer', exact: true }).click()
  const entries = manager(page).locator('#bibliography-list .bibliography-list-row')
  await expect(entries).toHaveCount(2)
  const initial = await entries
    .getByText('Émancipation', { exact: true })
    .locator('..')
    .getAttribute('data-record-id')
  expect(initial).toBeTruthy()
  await search(page)
  await online(page)
    .getByRole('option', { name: /Cairn\.info$/ })
    .click()
  await expect(manager(page).locator('.bibliography-import-status')).toHaveText(
    'Cette notice est déjà dans le projet.',
  )
  await expect(manager(page).locator('#bibliography-acquisition-review')).toHaveCount(0)
  await expect(entries).toHaveCount(2)
  await manager(page).locator('.panel-title button').click()

  await body(page).fill('Une référence déjà présente. ')
  await page.getByRole('button', { name: 'Citer une référence', exact: true }).click()
  const selector = page.locator('#citation-properties')
  await selector.getByRole('button', { name: 'Ajouter au groupe · Doe, 2025' }).click()
  await selector.getByLabel('Pages ou chapitre · example', { exact: true }).fill('p. 5')
  await selector.getByRole('button', { name: 'Rechercher en ligne', exact: true }).click()
  await query(page).fill('10.3917/dbu.jorro.2022.01.0155')
  await online(page)
    .getByRole('option', { name: /Cairn\.info$/ })
    .click()
  await expect(manager(page)).toBeHidden()
  await expect(body(page).locator('.citation-ref')).toHaveCount(1)
  const items = await page.evaluate(() => {
    const result: CitationItem[] = []
    window.__spike!.editor.state.doc.descendants((node) => {
      if (node.type.name === 'citation') result.push(...node.attrs.items)
    })
    return result
  })
  expect(items).toHaveLength(2)
  expect(items[0].supplement).toBe('p. 5')
  expect(items[1].record_id).toBe(initial)
  await page.getByRole('button', { name: 'Annuler', exact: true }).click()
  await expect(body(page).locator('.citation-ref')).toHaveCount(0)
  await manage(page)
  await expect(entries).toHaveCount(2)
})
