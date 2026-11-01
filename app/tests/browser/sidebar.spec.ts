import { expect, test, type Page } from '@playwright/test'
const rail = (page: Page) => page.locator('.side-rail')
const panel = (page: Page) => page.locator('#side-panel')
const toggle = (page: Page) => rail(page).locator('.side-rail-toggle')
const prefs = (page: Page) =>
  page.evaluate(() => window.__spike!.provider.transport.invoke<any>('preferences_load'))
const dimensions = (page: Page) =>
  page.evaluate(() => {
    const workspace = document.querySelector('main')!.getBoundingClientRect()
    const writing = document.querySelector('.writing')!.getBoundingClientRect()
    const preview = document.querySelector('.preview')!.getBoundingClientRect()
    const side = document.querySelector('.side-rail')!.getBoundingClientRect()
    const pane = document.querySelector('.side-panel')!.getBoundingClientRect()
    return {
      ratio: writing.width / (workspace.width - side.width),
      docked: pane.left >= side.left - 1 && pane.right <= side.right + 1,
      reserved: preview.right <= side.left + 1,
      overlay: pane.left >= preview.left - 1 && pane.right <= preview.right + 1,
    }
  })
test.beforeEach(async ({ page, request }) => {
  await request.post('/__spike/invoke', { data: { command: 'reset', peer: 'main', args: {} } })
  await page.goto('/?client=main')
  await page.waitForFunction(() => window.__spike?.ready)
})

test('one live search panel docks below its heading and keeps its input, selection and focus across modes', async ({
  page,
}) => {
  const button = rail(page).getByRole('button', { name: 'Rechercher', exact: true })
  await button.click()
  await expect(button).toHaveAttribute('aria-expanded', 'true')
  expect(
    await panel(page).evaluate((el) =>
      el.previousElementSibling?.getAttribute('data-side-section'),
    ),
  ).toBe('ui.find')
  const input = page.getByRole('combobox', { name: 'Rechercher', exact: true })
  await input.fill('Recherche conservée')
  await input.evaluate((el: HTMLInputElement) => {
    el.setSelectionRange(2, 8)
    Reflect.set(window, 'retainedSidebarInput', el)
  })
  expect((await dimensions(page)).docked).toBe(true)
  expect((await dimensions(page)).reserved).toBe(true)
  const ratio = (await dimensions(page)).ratio
  const revision = await page.evaluate(() => window.__spike!.provider.revision)
  // Exercise the fallback used by WebViews without state-preserving DOM moves.
  await page.evaluate(() =>
    Object.defineProperty(HTMLElement.prototype, 'moveBefore', {
      value: undefined,
      configurable: true,
    }),
  )
  await toggle(page).click()
  await expect(rail(page)).toHaveAttribute('data-expanded', 'false')
  await expect(input).toBeFocused()
  await expect(input).toHaveValue('Recherche conservée')
  expect((await dimensions(page)).overlay).toBe(true)
  expect((await dimensions(page)).ratio).toBeCloseTo(ratio, 3)
  await toggle(page).click()
  await expect(panel(page)).toHaveAttribute('data-docked', 'true')
  expect(
    await input.evaluate((el: HTMLInputElement) => [
      el === Reflect.get(window, 'retainedSidebarInput'),
      el.selectionStart,
      el.selectionEnd,
    ]),
  ).toEqual([true, 2, 8])
  await expect(input).toBeFocused()
  expect(await page.evaluate(() => window.__spike!.provider.revision)).toBe(revision)
  await rail(page).getByRole('button', { name: 'Préférences', exact: true }).click()
  await expect(button).toHaveAttribute('aria-expanded', 'false')
  await expect(
    rail(page).locator(':scope > button[aria-expanded=true]:not(.side-rail-toggle)'),
  ).toHaveCount(1)
  await page.getByLabel('Apparence', { exact: true }).press('Escape')
  await expect(panel(page)).toBeHidden()
  await button.click()
  await button.click()
  await expect(panel(page)).toBeHidden()
})

test('a private preferences form and its scroll position survive rehosting without a duplicate form', async ({
  page,
}) => {
  await rail(page).getByRole('button', { name: 'Préférences', exact: true }).click()
  await page.getByLabel('Apparence', { exact: true }).selectOption('dark')
  const content = page.locator('#side-content')
  await page.getByLabel('Apparence', { exact: true }).focus()
  await content.evaluate((el) => {
    el.scrollTop = 100
    Reflect.set(window, 'retainedSidebarForm', el.querySelector('form'))
  })
  const top = await content.evaluate((el) => el.scrollTop)
  expect(top).toBeGreaterThan(0)
  await toggle(page).click()
  await expect(page.getByLabel('Apparence', { exact: true })).toHaveValue('dark')
  const compactLimit = await content.evaluate((el) => el.scrollHeight - el.clientHeight)
  await expect.poll(() => content.evaluate((el) => el.scrollTop)).toBe(Math.min(top, compactLimit))
  await toggle(page).click()
  await expect.poll(() => content.evaluate((el) => el.scrollTop)).toBe(top)
  expect(
    await content.evaluate(
      (el) => el.querySelector('form') === Reflect.get(window, 'retainedSidebarForm'),
    ),
  ).toBe(true)
  await expect(panel(page).locator('form')).toHaveCount(1)
  expect((await prefs(page)).appearance).toBe('system')
})

test('sidebar width persists independently and saving an existing preferences form keeps layout changes', async ({
  page,
}) => {
  await rail(page).getByRole('button', { name: 'Préférences', exact: true }).click()
  const save = page.getByRole('button', { name: 'Enregistrer les préférences', exact: true })
  await page.getByLabel('Apparence', { exact: true }).selectOption('dark')
  await save.click()
  await expect.poll(async () => (await prefs(page)).appearance).toBe('dark')
  const divider = page.getByRole('separator', { name: 'Largeur de la barre latérale' })
  await divider.press('ArrowLeft')
  await expect(divider).toHaveAttribute('aria-valuenow', '336')
  await expect.poll(async () => (await prefs(page)).sidebar_width).toBe(336)
  await toggle(page).click()
  await page.getByLabel('Taille', { exact: true }).fill('21')
  await save.click()
  await expect.poll(async () => (await prefs(page)).size).toBe(21)
  expect((await prefs(page)).sidebar_width).toBe(336)
  expect((await prefs(page)).sidebar_expanded).toBe(false)
  await page.reload()
  await page.waitForFunction(() => window.__spike?.ready)
  await expect(rail(page)).toHaveAttribute('data-expanded', 'false')
  await toggle(page).click()
  await expect(rail(page)).toHaveCSS('width', '336px')
  await expect(page.getByRole('separator', { name: 'Largeur des colonnes' })).toHaveAttribute(
    'aria-valuenow',
    '50',
  )
})

test('pointer resizing cannot select text, Escape cancels, and viewport limits keep the preferred width', async ({
  page,
}) => {
  const before = await page.evaluate(() => window.__spike!.editor.getJSON())
  const divider = page.getByRole('separator', { name: 'Largeur de la barre latérale' })
  const box = (await divider.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + 80)
  await page.mouse.down()
  await page.mouse.move(box.x - 70, box.y + 80, { steps: 5 })
  expect(await page.evaluate(() => getSelection()?.isCollapsed ?? true)).toBe(true)
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expect(rail(page)).toHaveCSS('width', '320px')
  expect((await prefs(page)).sidebar_width).toBe(320)
  await divider.press('ArrowLeft')
  await expect.poll(async () => (await prefs(page)).sidebar_width).toBe(336)
  await page.setViewportSize({ width: 700, height: 800 })
  await expect(rail(page)).toHaveCSS('width', '315px')
  await page.setViewportSize({ width: 1280, height: 900 })
  await expect(rail(page)).toHaveCSS('width', '336px')
  expect((await dimensions(page)).reserved).toBe(true)
  expect(await page.evaluate(() => window.__spike!.editor.getJSON())).toEqual(before)
})
