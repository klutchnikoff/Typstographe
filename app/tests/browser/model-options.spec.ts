import { expect, test, type Page } from '@playwright/test'
import { confirmNewDocument } from './document-lifecycle'

const tab = (page: Page, id: string) => page.locator(`#metadata-tab-${id}`).click()
const flush = (page: Page) => page.evaluate(() => window.__spike!.provider.flush())
const paper = (page: Page) => page.locator('#document-option-paper')
function manifest() {
  return {
    'contract-version': 1,
    'document-type': 'article',
    languages: ['fr', 'en'],
    options: {
      paper: { regime: 'free', default: 'a4' },
      landscape: { regime: 'free', default: false },
      'bullet-marker': { regime: 'free', default: 'auto' },
      'citation-style': { regime: 'free', default: 'chicago-author-date' },
      outline: { regime: 'free', default: false },
    },
  } as any
}
async function install(page: Page, value: unknown) {
  return page.evaluate(async (manifest) => {
    const { executeStructured } = await import('../../src/structured-commands.ts')
    const { provider, editor } = window.__spike!
    const current = provider.doc
      .getMap('settings')
      .get('document') as import('../../src/state').Settings
    await executeStructured(editor, provider, provider.transport, [
      {
        id: 'document.set_model',
        params: {
          model_id: 'article.test-model',
          source: current.template,
          manifest: JSON.stringify(manifest),
        },
      },
    ])
  }, value)
}
async function policy(page: Page) {
  return page.evaluate(async () => {
    const { settingsFor } = await import('../../src/state.ts')
    const provider = window.__spike!.provider,
      current = settingsFor(provider)
    return provider.transport.invoke<import('../../src/shell').ModelPolicy>('model_policy', {
      manifest: current.modelManifest,
      metadata: current.metadata,
    })
  })
}
test.beforeEach(async ({ page, request }) => {
  await request.post('/__spike/invoke', { data: { command: 'reset', peer: 'main', args: {} } })
  await page.goto('/?client=main')
  await page.waitForFunction(() => window.__spike?.ready)
  await page.getByRole('button', { name: 'Fichier', exact: true }).click()
  await page.locator('[data-command="document.new"]').click()
  await page.locator('dialog [data-type="article"]').click()
  await confirmNewDocument(page)
  await tab(page, 'general')
  await expect(paper(page)).toBeVisible()
})

test('les régimes conservent les choix, masquent les réglages imposés et restent annulables', async ({
  page,
}) => {
  await expect(paper(page)).toHaveValue('')
  await paper(page).selectOption('a3')
  await flush(page)
  await tab(page, 'bibliography')
  await page.getByLabel('Style bibliographique', { exact: true }).selectOption('apa')
  await flush(page)
  const restricted = manifest()
  restricted.options.paper = { regime: 'restricted', allowed: ['a5'], default: 'a5' }
  restricted.options.landscape = { regime: 'imposed', value: false }
  restricted.options['citation-style'] = { regime: 'imposed', value: 'ieee' }
  await install(page, restricted)
  await expect(page.getByLabel('Style bibliographique', { exact: true })).toBeHidden()
  const resolved = await policy(page)
  expect(resolved.options['citation-style']).toMatchObject({
    choice: 'apa',
    effective: 'ieee',
    regime: 'imposed',
  })
  expect(resolved.options.paper).toMatchObject({ choice: 'a3', effective: 'a5', substituted: true })
  await tab(page, 'general')
  await expect(paper(page).locator('option:not(:disabled)')).toHaveCount(2)
  await expect(paper(page).locator('option:checked')).toHaveText(/A3.*Choix conservé/)
  await expect(page.locator('#document-option-orientation')).toBeHidden()
  await expect(
    page.getByRole('status').filter({ hasText: 'Vos choix sont conservés' }),
  ).toBeVisible()
  await page.evaluate(() => window.__spike!.provider.history('undo'))
  await expect(paper(page)).toHaveValue('a3')
  await tab(page, 'bibliography')
  await expect(page.getByLabel('Style bibliographique', { exact: true })).toHaveValue('apa')
  await page.evaluate(() => window.__spike!.provider.history('redo'))
  await expect(page.getByLabel('Style bibliographique', { exact: true })).toBeHidden()
})

test('Selon le modèle suit le défaut ; un choix explicite reste fixe ; la langue incompatible est refusée', async ({
  page,
}) => {
  let model = manifest()
  model.options.paper.default = 'a5'
  await install(page, model)
  await expect(paper(page)).toHaveValue('')
  expect((await policy(page)).options.paper).toMatchObject({ choice: null, effective: 'a5' })
  await paper(page).selectOption('a4')
  await flush(page)
  model.options.paper.default = 'us-letter'
  await install(page, model)
  await expect(paper(page)).toHaveValue('a4')
  expect((await policy(page)).options.paper).toMatchObject({ choice: 'a4', effective: 'a4' })
  await paper(page).selectOption('')
  await flush(page)
  expect((await policy(page)).options.paper).toMatchObject({ choice: null, effective: 'us-letter' })
  await page.locator('#document-option-language').selectOption('en')
  await flush(page)
  const before = JSON.stringify(await policy(page))
  model = manifest()
  model.languages = ['fr']
  await expect(install(page, model)).rejects.toBeDefined()
  await expect(page.locator('#document-option-language')).toHaveValue('en')
  expect(JSON.stringify(await policy(page))).toBe(before)
})

test('le marqueur libre accepte un caractère personnalisé sans publier le choix du sous-menu', async ({
  page,
}) => {
  await install(page, manifest())
  const select = page.locator('#document-option-bullet-marker')
  await expect(select).toBeVisible()
  await select.selectOption('__custom__')
  const input = page.getByRole('textbox', { name: 'Marqueur personnalisé', exact: true })
  await expect(input).toBeFocused()
  await input.fill('★')
  await flush(page)
  expect((await policy(page)).options['bullet-marker']).toMatchObject({
    choice: '★',
    effective: '★',
  })
  await expect(input).toBeFocused()
})
