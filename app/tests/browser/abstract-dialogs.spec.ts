import { openRecordCard, confirmRecordDialog } from './record-dialog-controls'
import { expect, test, type Page } from '@playwright/test'
import { confirmNewDocument } from './document-lifecycle'

const modal = (page: Page) => page.locator('dialog.rich-record-dialog')
const abstract = (page: Page) => modal(page).getByRole('textbox', { name: 'Résumé', exact: true })
const keywords = (page: Page) => modal(page).getByLabel('Mots-clés', { exact: true })
const fieldTitle = (page: Page) => modal(page).getByRole('textbox', { name: 'Titre', exact: true })
const cards = (page: Page) => page.locator('[data-section=localizations] [data-record-open]')
const values = (page: Page) =>
  page.evaluate(() =>
    (window.__spike!.provider.doc.getMap('settings').get('collections') as any).toJSON(),
  )
async function create(page: Page) {
  await page.goto('/?client=main&welcome=1')
  await page.waitForFunction(() => window.__spike?.ready)
  await page.getByRole('button', { name: 'Nouveau document', exact: true }).first().click()
  await page.locator('dialog [data-type="article"]').click()
  await confirmNewDocument(page)
  await page.locator('#metadata-tab-titles').click()
  await openRecordCard(page)
  await page.getByRole('textbox', { name: 'Titre', exact: true }).fill('Un titre conservé')
  await confirmRecordDialog(page)
  await page.locator('#metadata-tab-abstracts').click()
}
async function confirm(page: Page) {
  await modal(page).locator('.dialog-form > .panel-actions .primary').click()
  await expect(modal(page)).toHaveCount(0)
  await page.evaluate(() => window.__spike!.provider.flush())
}
test.beforeEach(async ({ request }) => {
  await request.post('/__spike/invoke', { data: { command: 'reset', peer: 'main', args: {} } })
})

test('cartes de langue : focus riche, annulation privée et validation atomique du résumé et des mots-clés', async ({
  page,
}) => {
  await create(page)
  await expect(cards(page)).toHaveText(['Français'])
  const initial = await values(page)
  await cards(page).click()
  await expect(abstract(page)).toBeFocused()
  await expect(modal(page).getByLabel('Langue', { exact: true })).toHaveCount(0)
  await abstract(page).fill('Un résumé encore privé.')
  await keywords(page).fill('université\ntravail')
  expect(await values(page)).toEqual(initial)
  await keywords(page).press('Escape')
  await expect(modal(page)).toHaveCount(0)
  await expect(cards(page)).toBeFocused()
  expect(await values(page)).toEqual(initial)

  await cards(page).click()
  await abstract(page).fill('Un résumé validé.')
  await keywords(page).fill('université\ntravail')
  // Normal Enter edits the rich field; only modified Enter submits the modal.
  await abstract(page).press('End')
  await abstract(page).press('Enter')
  await page.keyboard.type('Suite dans le même paragraphe.')
  await expect(modal(page)).toBeVisible()
  await expect(abstract(page).locator('p')).toHaveCount(1)
  await expect(abstract(page).locator('br[data-soft-break]')).toHaveCount(1)
  await abstract(page).press('ControlOrMeta+Enter')
  await expect(modal(page)).toHaveCount(0)
  await expect(cards(page)).toBeFocused()
  await page.evaluate(() => window.__spike!.provider.flush())
  const saved = await values(page)
  const body = page.getByRole('textbox', { name: 'Corps du document', exact: true })
  await body.focus()
  await body.press('ControlOrMeta+z')
  await expect.poll(() => values(page)).toEqual(initial)
  await body.press('ControlOrMeta+Shift+z')
  await expect.poll(() => values(page)).toEqual(saved)
  await cards(page).click()
  await expect(keywords(page)).toHaveValue('université\ntravail')
  await expect(abstract(page)).toContainText('Un résumé validé.')
  for (const width of [420, 920, 1280]) {
    await page.setViewportSize({ width, height: 740 })
    expect(
      await modal(page).evaluate((el) => {
        const box = el.getBoundingClientRect()
        return (
          box.left >= 0 &&
          box.right <= innerWidth &&
          box.top >= 0 &&
          box.bottom <= innerHeight &&
          el.scrollWidth <= el.clientWidth
        )
      }),
    ).toBe(true)
  }
  await page.keyboard.press('Escape')
  await page.locator('#metadata-tab-titles').click()
  await openRecordCard(page)
  await expect(page.getByRole('textbox', { name: 'Titre', exact: true })).toHaveText(
    'Un titre conservé',
  )
})

test('ajouter un résumé partage la langue avec les titres et la suppression annonce sa portée', async ({
  page,
}) => {
  await create(page)
  await page.getByRole('button', { name: 'Ajouter · Résumé', exact: true }).click()
  await expect(modal(page).getByLabel('Langue', { exact: true })).toBeFocused()
  await expect(modal(page).getByLabel('Langue', { exact: true })).toHaveValue('en')
  await abstract(page).fill('An English abstract.')
  await keywords(page).fill('research\ninstitutions')
  await confirm(page)
  await expect(cards(page)).toHaveText(['Français', 'Anglais'])
  await page.locator('#metadata-tab-titles').click()
  await openRecordCard(page, 1)
  const english = page.locator('dialog.form-dialog')
  await english.getByRole('textbox', { name: 'Titre', exact: true }).fill('A shared language entry')
  await confirmRecordDialog(page)
  await page.locator('#metadata-tab-abstracts').click()
  const before = await values(page)
  const remove = page.getByRole('button', {
    name: 'Supprimer · Ensemble linguistique',
    exact: true,
  })
  await expect(remove.first()).toBeDisabled()
  await remove.nth(1).click()
  const panel = page.locator('[data-section=localizations] .properties:not([hidden])')
  await expect(panel).toContainText('ses titres, son résumé et ses mots-clés')
  await panel.getByRole('button', { name: 'Supprimer', exact: true }).click()
  await expect(cards(page)).toHaveCount(1)
  const body = page.getByRole('textbox', { name: 'Corps du document', exact: true })
  await body.focus()
  await body.press('ControlOrMeta+z')
  await expect.poll(() => values(page)).toEqual(before)
  await cards(page).nth(1).click()
  await expect(abstract(page)).toHaveText('An English abstract.')
  await expect(keywords(page)).toHaveValue('research\ninstitutions')
})

for (const panel of ['abstracts', 'titles'] as const) {
  test(`la reprise privée retrouve la modale ${panel} sans publication anticipée`, async ({
    page,
  }) => {
    await create(page)
    if (panel === 'titles') await page.locator('#metadata-tab-titles').click()
    const text = panel === 'titles' ? fieldTitle(page) : abstract(page)
    const extra =
      panel === 'titles'
        ? page.getByRole('textbox', { name: 'Titre court', exact: true })
        : keywords(page)
    const initial = await values(page)
    await cards(page).click()
    await text.fill('Texte à reprendre après incident.')
    await extra.fill('Conservation')
    await page.evaluate(() => window.__spike!.provider.privateRecovery!.force())
    await page.evaluate(() => window.__spike!.provider.transport.invoke('diagnostic_request_close'))
    const closing = page.locator('dialog.recovery-close-dialog')
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
    expect(await values(page)).toEqual(initial)
    await page.getByRole('button', { name: 'Reprendre la saisie', exact: true }).click()
    await expect(modal(page)).toBeVisible()
    await expect(page.locator(`#metadata-tab-${panel}`)).toHaveAttribute('aria-pressed', 'true')
    await expect(text).toHaveText('Texte à reprendre après incident.')
    if (panel === 'titles') await expect(extra).toHaveText('Conservation')
    else await expect(extra).toHaveValue('Conservation')
    expect(await values(page)).toEqual(initial)
    // Reopening or cancelling is never validation and must retain the durable source.
    await modal(page)
      .locator('.dialog-form > .panel-actions')
      .getByRole('button', { name: 'Annuler', exact: true })
      .click()
    await expect(modal(page)).toHaveCount(0)
    expect(await values(page)).toEqual(initial)
    await page.getByRole('button', { name: 'Reprendre la saisie', exact: true }).click()
    await expect(modal(page)).toBeVisible()
    await expect(text).toHaveText('Texte à reprendre après incident.')
    if (panel === 'titles') await expect(extra).toHaveText('Conservation')
    else await expect(extra).toHaveValue('Conservation')
    await confirm(page)
    expect(JSON.stringify(await values(page))).toContain('Texte à reprendre après incident.')
    await expect(page.locator('#side-content')).toContainText(
      'Toutes les saisies ont été traitées.',
    )
  })
}

test('le libellé du résumé compte le texte Unicode pendant la saisie et les annulations', async ({
  page,
}) => {
  await create(page)
  await openRecordCard(page)
  const heading = modal(page).locator('.metadata-rich-heading > span')
  const visibleLabel = () =>
    heading.textContent().then((text) => text?.replace(/[\u2068\u2069]/g, ''))
  await expect.poll(visibleLabel).toBe('Résumé (0 mot - 0 signe)')
  await abstract(page).fill('e\u0301 👩🏽‍💻 chat')
  await expect.poll(visibleLabel).toBe('Résumé (2 mots - 8 signes)')
  await abstract(page).press('ControlOrMeta+a')
  await abstract(page).press('ControlOrMeta+b')
  await expect.poll(visibleLabel).toBe('Résumé (2 mots - 8 signes)')
  await keywords(page).fill('hors compteur')
  await expect.poll(visibleLabel).toBe('Résumé (2 mots - 8 signes)')
  await confirm(page)
  await openRecordCard(page)
  await expect.poll(visibleLabel).toBe('Résumé (2 mots - 8 signes)')
  await abstract(page).press('ControlOrMeta+a')
  await abstract(page).press('Backspace')
  await expect.poll(visibleLabel).toBe('Résumé (0 mot - 0 signe)')
  await abstract(page).press('ControlOrMeta+z')
  await expect.poll(visibleLabel).toBe('Résumé (2 mots - 8 signes)')
})
