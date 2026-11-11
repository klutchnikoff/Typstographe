import { expect, test, type Page } from '@playwright/test'
import { confirmNewDocument } from './document-lifecycle'

test.beforeEach(async ({ page, request }) => {
  await request.post('/__spike/invoke', { data: { command: 'reset', peer: 'main', args: {} } })
  await page.goto('/?client=main')
  await page.waitForFunction(() => window.__spike?.ready)
})

for (const [collection, label, field] of [
  ['authors', 'Auteur', 'Nom complet'],
  ['affiliations', 'Affiliation', 'Signature officielle'],
] as const) {
  test(`${collection}: separate cards, real pointer and keyboard reorder, one undo`, async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Fichier', exact: true }).click()
    await page.locator('[data-command="document.new"]').click()
    await page.locator('dialog [data-type="article"]').click()
    await confirmNewDocument(page)
    await page.locator(`#metadata-tab-${collection}`).click()
    const section = page.locator(`[data-section="${collection}"]`)
    const cards = section.locator('.collection-card')
    for (const value of ['One', 'Two', 'Three']) {
      await section.getByRole('button', { name: `Ajouter · ${label}`, exact: true }).click()
      const dialog = page.locator('dialog.form-dialog[open]')
      await dialog.getByLabel(field, { exact: true }).fill(value)
      await dialog.getByRole('button', { name: 'Valider', exact: true }).click()
      await expect(dialog).toHaveCount(0)
    }
    const names = section.locator('.metadata-record-caption')
    await expect(names).toHaveText(['One', 'Two', 'Three'])
    await expect(cards.locator('[aria-haspopup="dialog"]')).toHaveCount(3)
    await expect(cards.locator('.collection-card-heading button')).toHaveCount(9) // handle, edit surface, trash
    await expect(section.locator('[data-record-add]')).toHaveCount(1)
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme })
      const layout = await cards.evaluateAll((elements) => {
        const first = elements[0].getBoundingClientRect(),
          second = elements[1].getBoundingClientRect()
        return {
          gap: second.top - first.bottom,
          individual:
            getComputedStyle(elements[0]).backgroundColor !==
            getComputedStyle(document.getElementById('metadata-content')!).backgroundColor,
        }
      })
      expect(layout.gap).toBeGreaterThanOrEqual(7)
      expect(layout.individual).toBe(true)
    }
    const trigger = cards.first().locator('[data-record-open]')
    await trigger.click()
    const input = page.locator('dialog[open]').getByLabel(field, { exact: true })
    await expect(input).toBeFocused()
    await input.fill('Private edit')
    await input.press('Escape')
    await expect(trigger).toBeFocused()
    await expect(names).toHaveText(['One', 'Two', 'Three'])

    const publications: unknown[] = []
    page.on('request', (request) => {
      if (!request.url().endsWith('/__spike/invoke') || request.method() !== 'POST') return
      const data = request.postDataJSON()
      if (data.command === 'commit_structured_commands')
        publications.push(
          ...data.args.request.commands.filter((command: any) => command.id === 'record.move'),
        )
    })
    const from = await cards.first().locator('.collection-card-handle').boundingBox()
    const to = await cards.last().boundingBox()
    await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2)
    await page.mouse.down()
    await page.mouse.move(from!.x + from!.width / 2 + 7, from!.y + from!.height / 2 + 7, {
      steps: 3,
    })
    await page.mouse.move(from!.x + from!.width / 2, to!.y + to!.height - 3, { steps: 16 })
    // WebKit's fallback drag preview advances on Sortable's scheduled drag-over.
    // Release only once the target position is actually visible.
    await expect(names).toHaveText(['Two', 'Three', 'One'])
    await page.mouse.up()
    await expect(names).toHaveText(['Two', 'Three', 'One'])
    await expect.poll(() => publications.length).toBe(1)
    const body = page.getByRole('textbox', { name: 'Corps du document', exact: true })
    await body.focus()
    await body.press('ControlOrMeta+z')
    await expect(names).toHaveText(['One', 'Two', 'Three'])
    await body.press('ControlOrMeta+Shift+z')
    await expect(names).toHaveText(['Two', 'Three', 'One'])

    const handle = cards.last().locator('.collection-card-handle')
    await handle.press('Space')
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('Escape')
    await expect(names).toHaveText(['Two', 'Three', 'One'])
    expect(publications).toHaveLength(1)
    await handle.press('Space')
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('Enter')
    await expect(names).toHaveText(['Two', 'One', 'Three'])
    await expect.poll(() => publications.length).toBe(2)
    await expect(cards.nth(1).locator('.collection-card-handle')).toBeFocused()

    await cards
      .nth(1)
      .getByRole('button', { name: `Supprimer · ${label}`, exact: true })
      .press('Enter')
    await expect(names).toHaveText(['Two', 'Three'])
    await expect(section.locator('.metadata-record-deletion')).toHaveCount(0)
    await expect(cards.last().locator('[data-record-open]')).toBeFocused()
    await body.focus()
    await body.press('ControlOrMeta+z')
    await expect(names).toHaveText(['Two', 'One', 'Three'])
  })
}

test('sidebar labels collapse, remain accessible and persist without changing the document', async ({
  page,
}) => {
  const rail = page.locator('.side-rail')
  await expect(rail).toHaveAttribute('data-expanded', 'true')
  await expect(rail.getByText('Commandes', { exact: true })).toBeVisible()
  const saved = page.waitForResponse((response) => {
    if (!response.url().endsWith('/__spike/invoke') || response.request().method() !== 'POST')
      return false
    const data = response.request().postDataJSON()
    return data.command === 'preferences_save' && data.args.preferences.sidebar_expanded === false
  })
  await rail.getByRole('button', { name: 'Masquer les libellés', exact: true }).click()
  await saved
  await expect(rail.getByText('Commandes', { exact: true })).toBeHidden()
  await expect(rail).toHaveCSS('width', '36px')
  await rail.getByRole('button', { name: 'Préférences', exact: true }).click()
  await expect(page.locator('.side-panel')).toHaveCSS('right', '36px')
  await page.reload()
  await page.waitForFunction(() => window.__spike?.ready)
  await expect(rail).toHaveAttribute('data-expanded', 'false')
  const toggle = rail.getByRole('button', { name: 'Afficher les libellés', exact: true })
  await toggle.press('Enter')
  await expect(rail).toHaveAttribute('data-expanded', 'true')
  await expect(rail.getByText('Commandes', { exact: true })).toBeVisible()
  await expect(rail).toHaveCSS('width', '320px')
  await expect(rail.locator('.side-rail-toggle')).toBeFocused()
})
