import { expect, test, type Page } from '@playwright/test'
import { confirmNewDocument } from './document-lifecycle'
import { openRecordCard, confirmRecordDialog } from './record-dialog-controls'

const cards = (page: Page) => page.locator('[data-section=localizations] [data-record-open]')
const dialog = (page: Page) => page.locator('dialog.form-dialog')
const field = (page: Page, name: string) => dialog(page).getByRole('textbox', { name, exact: true })
const values = (page: Page) =>
  page.evaluate(() =>
    (window.__spike!.provider.doc.getMap('settings').get('collections') as any).toJSON(),
  )
async function create(page: Page) {
  await page.goto('/?client=main&welcome=1')
  await page.waitForFunction(() => window.__spike?.ready)
  await page.getByRole('button', { name: 'Nouveau document', exact: true }).first().click()
  await page.locator('dialog select').first().selectOption('article')
  await confirmNewDocument(page)
  await page.locator('#metadata-tab-titles').click()
}
test.beforeEach(async ({ request }) => {
  await request.post('/__spike/invoke', { data: { command: 'reset', peer: 'main', args: {} } })
})

test('titres par langue : brouillon privé, trois zones riches, validation atomique et ellipse', async ({
  page,
}) => {
  await create(page)
  const initial = await values(page)
  await expect(cards(page).locator('.metadata-record-caption')).toHaveText(['Français'])
  await openRecordCard(page)
  await expect(field(page, 'Titre')).toBeFocused()
  await field(page, 'Titre').fill('Titre provisoire')
  await field(page, 'Sous-titre').fill('Sous-titre provisoire')
  await field(page, 'Titre court').fill('Bref')
  expect(await values(page)).toEqual(initial)
  await field(page, 'Titre court').press('Escape')
  await expect(cards(page)).toBeFocused()
  expect(await values(page)).toEqual(initial)

  const title =
    'Recherches sur l’université : 日本, institutions et transformations du travail '.repeat(5)
  await openRecordCard(page)
  await field(page, 'Titre').fill(title)
  await field(page, 'Titre').press('ControlOrMeta+a')
  await field(page, 'Titre').press('ControlOrMeta+b')
  await field(page, 'Sous-titre').fill('Une analyse comparative')
  await field(page, 'Titre court').fill('Institutions et travail')
  await field(page, 'Titre court').press('ControlOrMeta+Enter')
  await expect(dialog(page)).toHaveCount(0)
  await expect(cards(page).locator('.metadata-record-caption')).toHaveText(`Français (${title})`)
  expect(await cards(page).getAttribute('title')).toBeNull()
  await expect(cards(page).locator('.metadata-record-detail')).toBeHidden()
  const saved = await values(page)
  const body = page.getByRole('textbox', { name: 'Corps du document', exact: true })
  await body.focus()
  await body.press('ControlOrMeta+z')
  await expect.poll(() => values(page)).toEqual(initial)
  await body.press('ControlOrMeta+Shift+z')
  await expect.poll(() => values(page)).toEqual(saved)
  await page.setViewportSize({ width: 920, height: 740 })
  const caption = cards(page).locator('.metadata-record-caption')
  const layout = await caption.evaluate((el) => ({
    overflow: el.scrollWidth > el.clientWidth,
    ellipsis: getComputedStyle(el).textOverflow,
    wrapping: getComputedStyle(el).whiteSpace,
    tooltip: el.getAttribute('title'),
  }))
  expect(layout).toEqual({
    overflow: true,
    ellipsis: 'ellipsis',
    wrapping: 'nowrap',
    tooltip: null,
  })
  await openRecordCard(page)
  await expect(field(page, 'Titre')).toHaveText(title)
  await expect(field(page, 'Titre').locator('strong')).toHaveText(title)
  await expect(field(page, 'Sous-titre')).toHaveText('Une analyse comparative')
  await expect(field(page, 'Titre court')).toHaveText('Institutions et travail')
  await page.keyboard.press('Escape')
  await page.locator('#metadata-tab-abstracts').click()
  await expect(cards(page).locator('.metadata-record-caption')).toHaveText(['Français'])
})

test('langues de titres : ajout annulable, réorganisation commune et résumé conservé', async ({
  page,
}) => {
  await create(page)
  const add = page.getByRole('button', { name: 'Ajouter · Titre', exact: true })
  await add.click()
  await expect(dialog(page).getByLabel('Langue', { exact: true })).toBeFocused()
  await field(page, 'Titre').fill('Unpublished')
  await page.keyboard.press('Escape')
  await expect(add).toBeFocused()
  await expect(cards(page)).toHaveCount(1)
  await add.click()
  await expect(dialog(page).getByLabel('Langue', { exact: true })).toHaveValue('en')
  await field(page, 'Titre').fill('Academic work')
  await confirmRecordDialog(page)
  await expect(cards(page).locator('.metadata-record-caption')).toHaveText([
    'Français',
    'Anglais (Academic work)',
  ])
  await page.locator('.collection-card-handle').last().press('Space')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('Enter')
  await expect(cards(page).locator('.metadata-record-caption')).toHaveText([
    'Anglais (Academic work)',
    'Français',
  ])
  await page.locator('#metadata-tab-abstracts').click()
  await expect(cards(page).locator('.metadata-record-caption')).toHaveText(['Anglais', 'Français'])
  await openRecordCard(page)
  await field(page, 'Résumé').fill('An abstract using the same language record.')
  await confirmRecordDialog(page)
  await page.locator('#metadata-tab-titles').click()
  await openRecordCard(page)
  await field(page, 'Titre').fill('Academic institutions')
  await confirmRecordDialog(page)
  await page.locator('#metadata-tab-abstracts').click()
  await openRecordCard(page)
  await expect(field(page, 'Résumé')).toHaveText('An abstract using the same language record.')
})
