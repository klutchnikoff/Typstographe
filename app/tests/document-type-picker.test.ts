import { afterEach, expect, it, vi } from 'vitest'
import { documentTypePicker, type CreationCatalogue } from '../src/document-type-picker'
import type { DocumentType } from '../src/shell'

const type: DocumentType = {
  id: 'letter',
  label: 'Letter',
  canCreate: true,
  settingsHeading: '',
  capabilities: [],
  fields: [],
  groups: [],
  metadata: { type: 'courrier', fields: { options: {} } },
  models: ['one', 'two'].map((id) => ({
    id,
    label: id,
    description: '',
    source: id,
    fixedPage: null,
  })),
}
const catalogue: CreationCatalogue = {
  types: [type],
  typeGroups: [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
  ],
  typeCards: [
    {
      id: 'letter',
      label: 'Letter',
      description: 'A letter',
      canCreate: true,
      runtimeType: 'letter',
      groups: ['a'],
    },
    {
      id: 'planned',
      label: 'Planned',
      description: 'Later',
      canCreate: false,
      runtimeType: null,
      groups: ['a', 'b'],
    },
  ],
}
afterEach(() => document.body.replaceChildren())

it('remembers the chosen model across profile inspection without submitting a hidden choice', () => {
  const changed = vi.fn()
  const picker = documentTypePicker(catalogue, changed)
  document.body.append(picker)
  const click = (selector: string) => picker.querySelector<HTMLButtonElement>(selector)!.click()
  click('[data-model="two"]')
  expect(changed).toHaveBeenLastCalledWith({ type, model: type.models[1] })
  click('[data-type="planned"]')
  expect(changed).toHaveBeenLastCalledWith(null)
  click('[data-type="letter"]')
  expect(picker.querySelector('[data-model="two"]')!.getAttribute('aria-pressed')).toBe('true')
  click('[data-group="b"]')
  expect(changed).toHaveBeenLastCalledWith(null)
  expect(picker.querySelector('[data-model]')).toBeNull()
  click('[data-group="a"]')
  expect(picker.querySelectorAll('[data-type]')).toHaveLength(2)
  expect(changed).toHaveBeenLastCalledWith(null)
})

it('handles an empty catalogue without enabling creation', () => {
  const changed = vi.fn()
  const picker = documentTypePicker({ types: [], typeGroups: [], typeCards: [] }, changed)
  expect(picker.querySelector('[data-type]')).toBeNull()
  expect(picker.querySelector('[data-model]')).toBeNull()
  expect(picker.textContent).toContain('Choisissez un type')
  expect(changed).toHaveBeenLastCalledWith(null)
})

it('ignores a late thumbnail when the selected type has changed and tolerates preview failure', async () => {
  let resolve!: (url: string) => void
  const thumbnail = vi.fn(
    () =>
      new Promise<string>((done) => {
        resolve = done
      }),
  )
  const changed = vi.fn()
  const picker = documentTypePicker(catalogue, changed, thumbnail)
  document.body.append(picker)
  picker.querySelector<HTMLButtonElement>('[data-type="planned"]')!.click()
  resolve('data:image/png;base64,late')
  await Promise.resolve()
  expect(picker.querySelector('img')).toBeNull()
  expect(changed).toHaveBeenLastCalledWith(null)
  const failed = documentTypePicker(catalogue, changed, () => Promise.reject(new Error('offline')))
  await vi.waitFor(() => expect(failed.textContent).toContain('Aperçu indisponible'))
  expect(changed).toHaveBeenLastCalledWith({ type, model: type.models[0] })
})
