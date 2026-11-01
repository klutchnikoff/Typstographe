import { afterEach, expect, it, vi } from 'vitest'
import type { Registry } from '../src/commands'
import { newDocumentDialog, newDocumentMetadata } from '../src/new-document-dialog'
import { DOCUMENT_COMMANDS, shellCommands } from '../src/shell-commands'
import { defaultPreferences, guardedRunner } from '../src/shell-context'
import { documentTitle } from '../src/shell-documents'
import { appendMenuCommands, fieldOwnsShortcut, shortcutKey } from '../src/shell-menus'
import { editorFont } from '../src/shell-preferences'
import { recoveredItemLabel } from '../src/shell-recovered'
import type { DocumentType } from '../src/shell'

const letter: DocumentType = {
  id: 'courrier',
  label: 'Courrier',
  settingsHeading: 'Paramètres du courrier',
  canCreate: true,
  capabilities: [],
  fields: [
    {
      field: 'sender.name',
      parameter: 'sender_name',
      label: 'Expéditeur',
      value: '',
      group: 'sender',
      multiline: false,
      kind: 'text',
      required_for_export: false,
    },
    {
      field: 'date',
      parameter: 'date',
      label: 'Date',
      value: '',
      group: 'letter',
      multiline: false,
      kind: 'date',
      required_for_export: false,
    },
  ],
  groups: [],
  metadata: {
    type: 'courrier',
    fields: { sender_name: '', date: '', options: { language: 'fr' } },
  },
  models: [
    { id: 'personal', label: 'Personnel', description: '', source: 'Typst', fixedPage: null },
    { id: 'free', label: 'Libre', description: '', source: 'Typst libre', fixedPage: null },
  ],
}
const report: DocumentType = {
  ...letter,
  id: 'rapport',
  label: 'Rapport',
  fields: [],
  models: [{ id: 'report', label: 'Rapport', description: '', source: 'R', fixedPage: null }],
}

afterEach(() => document.body.replaceChildren())

it('builds the command shortcut notation of key presses', () => {
  expect(shortcutKey({ key: 's', shiftKey: false })).toBe('Mod+S')
  expect(shortcutKey({ key: 'S', shiftKey: true })).toBe('Mod+Shift+S')
  expect(shortcutKey({ key: ',', shiftKey: false })).toBe('Mod+,')
  expect(shortcutKey({ key: 'Enter', shiftKey: true })).toBe('Mod+Shift+Enter')
})

it('leaves history and object shortcuts to focused text fields only', () => {
  const input = document.createElement('input'),
    area = document.createElement('textarea'),
    button = document.createElement('button')
  expect(fieldOwnsShortcut(input, { id: 'history.undo' })).toBe(true)
  expect(fieldOwnsShortcut(area, { id: 'block.remove' })).toBe(true)
  expect(fieldOwnsShortcut(input, { id: 'document.save' })).toBe(false)
  expect(fieldOwnsShortcut(button, { id: 'history.undo' })).toBe(false)
})

it('disables document commands on the welcome screen, including later additions', () => {
  let active = false
  const commands: Registry = new Map()
  const { add, requiresDocument } = shellCommands(commands, () => active)
  add('document.save', 'Enregistrer', () => {}, 'Mod+S')
  add('document.new', 'Nouveau', () => {})
  add('ui.recovered', 'Saisies', () => {})
  requiresDocument.add('ui.recovered')
  expect(DOCUMENT_COMMANDS).toContain('document.save')
  expect(commands.get('document.save')).toMatchObject({ id: 'document.save', shortcut: 'Mod+S' })
  expect(commands.get('document.save')!.enabled!()).toBe(false)
  expect(commands.get('ui.recovered')!.enabled!()).toBe(false)
  expect(commands.get('document.new')!.enabled!()).toBe(true)
  active = true
  expect(commands.get('document.save')!.enabled!()).toBe(true)
  expect(commands.get('ui.recovered')!.enabled!()).toBe(true)
})

it('reports synchronous and asynchronous failures of guarded tasks', async () => {
  const errors: unknown[] = []
  const guarded = guardedRunner((error) => errors.push(error))
  guarded(() => {
    throw new Error('sync')
  })
  guarded(async () => {
    throw new Error('async')
  })
  guarded(() => undefined)
  await vi.waitFor(() => expect(errors).toHaveLength(2))
  expect(errors.map((error) => (error as Error).message)).toEqual(['sync', 'async'])
})

it('titles a document after its file, then its recovered name', () => {
  expect(documentTitle('/home/a/Lettre.typsto')).toBe('Lettre')
  expect(documentTitle('C:\\docs\\Rapport.typsto', 'Autre.typsto')).toBe('Rapport')
  expect(documentTitle(null, 'Brouillon.typsto')).toBe('Brouillon')
  expect(documentTitle(null, null)).toBe('Sans titre')
})

it('maps the editor font preference to a CSS family', () => {
  expect(editorFont('sans')).toBe('Inter')
  expect(editorFont('mono')).toBe('monospace')
  expect(editorFont('serif')).toBe('Georgia')
  expect(defaultPreferences()).toMatchObject({ font: 'serif', size: 18, spelling_enabled: true })
})

it('fills a new document from the profile and the current date without sharing defaults', () => {
  const metadata = newDocumentMetadata(
    letter,
    { 'sender.name': 'Ada', unrelated: 'x' },
    new Date(2026, 0, 5),
  )
  expect(metadata.fields).toMatchObject({ sender_name: 'Ada', date: '2026-01-05' })
  expect(metadata.fields).not.toHaveProperty('unrelated')
  expect(letter.metadata.fields.sender_name).toBe('')
})

it('keeps planned cards inspectable but submits only the selected executable type and model', () => {
  const overlay = document.createElement('dialog')
  overlay.showModal = vi.fn(() => overlay.setAttribute('open', ''))
  document.body.append(overlay)
  const submit = vi.fn()
  const hidden = { ...report, id: 'hidden', canCreate: false, models: [] }
  const types = [letter, report, hidden]
  newDocumentDialog(
    overlay,
    {
      types,
      typeGroups: [{ id: 'test', label: 'Test' }],
      typeCards: types.map((type) => ({
        id: type.id,
        label: type.label,
        description: 'Usage',
        groups: ['test'],
        runtimeType: type.id,
        canCreate: type.canCreate,
      })),
    },
    submit,
  )
  expect(overlay.showModal).toHaveBeenCalled()
  expect(overlay.querySelectorAll('[data-type]')).toHaveLength(3)
  const models = () => [...overlay.querySelectorAll<HTMLButtonElement>('[data-model]')]
  expect(models().map((button) => button.dataset.model)).toEqual(['personal', 'free'])
  overlay.querySelector<HTMLButtonElement>('[data-type="hidden"]')!.click()
  const confirm = overlay.querySelector<HTMLButtonElement>('[data-default]')!
  expect(confirm.disabled).toBe(true)
  confirm.click()
  expect(submit).not.toHaveBeenCalled()
  overlay.querySelector<HTMLButtonElement>('[data-type="rapport"]')!.click()
  expect(confirm.disabled).toBe(false)
  expect(models().map((button) => button.dataset.model)).toEqual(['report'])
  confirm.click()
  expect(submit).toHaveBeenLastCalledWith(report, report.models[0])
  overlay.querySelector<HTMLButtonElement>('[data-type="courrier"]')!.click()
  overlay.querySelector<HTMLButtonElement>('[data-model="free"]')!.click()
  confirm.click()
  expect(submit).toHaveBeenLastCalledWith(letter, letter.models[1])
})

it('labels recovered inputs with the vocabulary of the document type', () => {
  const field = {
    id: '1',
    kind: 'field' as const,
    payload: { target: { kind: 'metadata', field: 'sender.name' } },
  }
  expect(recoveredItemLabel(letter, field)).toBe('Expéditeur')
  const unknown = { ...field, payload: { target: { kind: 'metadata', field: 'missing' } } }
  expect(recoveredItemLabel(letter, unknown)).toBe('Champ d’en-tête')
})

it('appends late commands to the first menu and closes menus when run', () => {
  const menu = document.createElement('nav')
  menu.innerHTML =
    '<details class="tool-menu" open><summary>Fichier</summary><div class="tool-menu-content"></div></details><details class="tool-menu"><div class="tool-menu-content"></div></details>'
  const run = vi.fn()
  const commands: Registry = new Map([
    ['recovery.list', { id: 'recovery.list', label: 'Travail', run }],
  ])
  appendMenuCommands(menu, commands, ['recovery.list'])
  const button = menu.querySelector<HTMLButtonElement>('[data-command="recovery.list"]')!
  expect(button.parentElement).toBe(menu.querySelector('.tool-menu-content'))
  expect(button.textContent).toBe('Travail')
  button.click()
  expect(run).toHaveBeenCalled()
  expect(menu.querySelector('details')!.open).toBe(false)
})
