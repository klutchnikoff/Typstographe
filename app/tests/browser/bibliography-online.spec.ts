import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { confirmNewDocument } from './document-lifecycle'
import { openRecordCard, confirmRecordDialog } from './record-dialog-controls'
const response = JSON.parse(
  readFileSync(
    new URL('../../../fixtures/bibliography/online/cairn-results.json', import.meta.url),
    'utf8',
  ),
)
const manager = (page: Page) => page.locator('#bibliography-manager')
const online = (page: Page) => page.locator('#bibliography-online')
const query = (page: Page) =>
  online(page).getByRole('combobox', { name: 'Titre, auteur, DOI ou URL Cairn', exact: true })
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
  await expect(query(page)).toBeFocused()
  await query(page).fill('https://doi.org/10.3917/dbu.jorro.2022.01.0155')
  await query(page).press('Enter')
  await expect(online(page).locator('.bibliography-list-row')).toHaveCount(1)
}
async function choose(page: Page, provider = 'Cairn.info') {
  await online(page)
    .getByRole('option', { name: new RegExp(` · ${provider}$`) })
    .click()
  await expect(online(page)).toBeHidden()
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
  await expect(online(page)).toContainText('Le titre du chapitre est identique')
  await expect(manager(page).locator('.bibliography-list-row')).toHaveCount(0)
  await choose(page, 'DOI')
  await expect(title(page)).toHaveValue('Dictionnaire des concepts de la professionnalisation')
  await title(page).fill('Émancipation')
  await expect(manager(page).locator('.bibliography-list-row')).toHaveCount(0)
  await title(page).press('ControlOrMeta+Enter')
  await expect(manager(page).locator('.bibliography-list-row')).toHaveCount(1)
  await expect(title(page)).toHaveValue('Émancipation')
  // The specialised source later reuses the identity of the same DOI.
  generic = false
  await search(page)
  await choose(page, 'Cairn.info')
  await manager(page).getByRole('button', { name: 'Ajouter', exact: true }).click()
  await expect(manager(page).locator('.bibliography-list-row')).toHaveCount(1)
  await expect(title(page)).toHaveValue('Émancipation')
  await manager(page).getByRole('button', { name: 'Fermer', exact: true }).click()
  await page.getByRole('button', { name: 'Annuler', exact: true }).click()
  await manage(page)
  await expect(manager(page).locator('.bibliography-list-row')).toHaveCount(1)
  await manager(page).getByRole('button', { name: 'Fermer', exact: true }).click()
  await page.getByRole('button', { name: 'Annuler', exact: true }).click()
  await manage(page)
  await expect(manager(page).locator('.bibliography-list-row')).toHaveCount(0)
})
test('online acquisition from a citation adds and cites in one undoable batch', async ({
  page,
}) => {
  await body(page).fill('Une référence nouvelle. ')
  await page.getByRole('button', { name: 'Citer une référence', exact: true }).click()
  await page
    .locator('#citation-properties')
    .getByRole('button', { name: 'Rechercher en ligne', exact: true })
    .click()
  await expect(query(page)).toBeFocused()
  await query(page).fill('10.3917/dbu.jorro.2022.01.0155')
  await query(page).press('Enter')
  await expect(online(page).locator('.bibliography-list-row')).toHaveCount(1)
  await query(page).press('ArrowDown')
  await query(page).press('Enter')
  await expect(title(page)).toHaveValue('Émancipation')
  await manager(page).getByRole('button', { name: 'Ajouter et citer', exact: true }).click()
  await expect(manager(page)).toBeHidden()
  await expect(body(page).locator('.citation-ref')).toHaveCount(1)
  await expect(body(page)).toBeFocused()
  await page.getByRole('button', { name: 'Annuler', exact: true }).click()
  await expect(body(page).locator('.citation-ref')).toHaveCount(0)
  await manage(page)
  await expect(manager(page).locator('.bibliography-list-row')).toHaveCount(0)
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
  await expect(manager(page).locator('.bibliography-list-row')).toHaveCount(0)
})

test('late results cannot replace a newer explicit search and typing stays offline', async ({
  page,
}) => {
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
  expect(requests).toBe(0)
  await query(page).press('Enter')
  await expect.poll(() => requests).toBe(1)
  await query(page).fill('new search')
  await query(page).press('Enter')
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
  await expect(manager(page).locator('.bibliography-list-row')).toHaveCount(0)
  await manager(page).getByRole('button', { name: 'Ajouter', exact: true }).click()
  await expect(manager(page).locator('.bibliography-list-row')).toHaveCount(1)
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
  await expect(manager(page).locator('.bibliography-list-row')).toHaveCount(1)
  await search(page)
  await choose(page, 'Cairn.info')
  await title(page).fill('Émancipation vérifiée')
  await manager(page).getByRole('button', { name: 'Ajouter', exact: true }).click()
  const review = page.locator('#bibliography-acquisition-review')
  await expect(review).toBeVisible()
  await expect(review.getByRole('button', { name: 'Valider', exact: true })).toBeDisabled()
  await review
    .getByLabel('Décision · eneau_emancipation_2022', { exact: true })
    .selectOption('distinct')
  await review
    .getByLabel('Clé de citation · eneau_emancipation_2022', { exact: true })
    .fill('eneau2022verified')
  await expect(review.getByRole('button', { name: 'Valider', exact: true })).toBeEnabled()
  await review.getByRole('button', { name: 'Valider', exact: true }).click()
  await expect(review).toHaveCount(0)
  await expect(manager(page).locator('.bibliography-list-row')).toHaveCount(2)
  await manager(page)
    .getByRole('combobox', { name: 'Rechercher une référence', exact: true })
    .fill('vérifiée')
  await expect(manager(page).locator('.bibliography-list-row')).toHaveCount(1)
  await manager(page)
    .getByRole('combobox', { name: 'Rechercher une référence', exact: true })
    .press('Enter')
  await expect(title(page)).toHaveValue('Émancipation vérifiée')
  await manager(page).getByRole('button', { name: 'Fermer', exact: true }).click()
  await page.getByRole('button', { name: 'Annuler', exact: true }).click()
  await manage(page)
  await expect(manager(page).locator('.bibliography-list-row')).toHaveCount(1)
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
  await query(page).press('Enter')
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
  await expect(manager(page).locator('.bibliography-list-row')).toHaveCount(1)
  await expect(title(page)).toHaveValue('Émancipation')
  await manager(page).getByRole('button', { name: 'Fermer', exact: true }).click()
  await page.getByRole('button', { name: 'Fichier', exact: true }).click()
  await page.locator('[data-command="document.export"]').click()
  await expect(page.locator('#message')).toContainText('sources Typst exportés')
})
