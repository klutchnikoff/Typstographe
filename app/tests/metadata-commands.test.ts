import { afterEach, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import type { Editor } from '@tiptap/core'
import type { Provider } from '../src/provider'
import { MetadataCommands } from '../src/metadata-commands'
import { bindMetadataInput } from '../src/metadata-input'
import { installKeyboardNavigation } from '../src/keyboard-navigation'

const native = vi.hoisted(() => ({
  calls: [] as { value: unknown; commands: any[]; finish: () => void }[],
}))
vi.mock('../src/structured-commands', () => ({
  executeStructured: vi.fn(async (_editor, provider, _transport, commands, current) => {
    const before = [...Y.encodeStateAsUpdate(provider.doc)]
    await new Promise<void>((resolve) =>
      native.calls.push({ value: commands.at(-1)?.params.value, commands, finish: resolve }),
    )
    if (
      !current() ||
      JSON.stringify(before) !== JSON.stringify([...Y.encodeStateAsUpdate(provider.doc)])
    )
      throw new Error('Le document a changé. Réessayez.')
    for (const command of commands.filter((command: any) => command.id === 'metadata.set'))
      provider.doc.getMap('settings').set(command.params.target.field, command.params.value)
    return true
  }),
}))
const docs: Y.Doc[] = []
afterEach(() => {
  docs.splice(0).forEach((doc) => doc.destroy())
  native.calls = []
  document.body.replaceChildren()
})
function setup() {
  const doc = new Y.Doc()
  docs.push(doc)
  const map = doc.getMap('settings')
  map.set('identity', 'project')
  map.set('name', 'Initial')
  const provider = {
    doc,
    generation: 'one',
    transport: {},
    onStatus: vi.fn(),
  } as unknown as Provider
  const controller = new MetadataCommands({} as Editor, provider)
  const target = { kind: 'metadata', field: 'name' } as const
  return { controller, provider, map, target, read: () => map.get('name') }
}
it('keeps typing immediate, coalesces our queued values and flushes through the final confirmation', async () => {
  const s = setup()
  s.controller.set(s.target, 'A', s.read)
  await vi.waitFor(() => expect(native.calls).toHaveLength(1))
  s.controller.set(s.target, 'Ab', s.read)
  s.controller.set(s.target, 'Abc 😀', s.read)
  expect(s.controller.value(s.target, s.read())).toBe('Abc 😀')
  expect(s.read()).toBe('Initial')
  let saved = false
  const flush = s.controller.flush().then(() => {
    saved = true
  })
  native.calls[0].finish()
  await vi.waitFor(() => expect(native.calls).toHaveLength(2))
  expect(native.calls[1].value).toBe('Abc 😀')
  expect(saved).toBe(false)
  native.calls[1].finish()
  await flush
  expect(s.read()).toBe('Abc 😀')
  expect(s.controller.dirty()).toBe(false)
})
it('retains refused input, blocks snapshots and never retries over a peer edit without a user decision', async () => {
  const s = setup()
  s.controller.set(s.target, 'Mon brouillon', s.read)
  await vi.waitFor(() => expect(native.calls).toHaveLength(1))
  s.map.set('name', 'Modification distante')
  native.calls[0].finish()
  await expect(s.controller.flush()).rejects.toThrow('Le document a changé')
  expect(s.controller.value(s.target, s.read())).toBe('Mon brouillon')
  expect(s.controller.draft()).toEqual([
    { target: s.target, value: 'Mon brouillon', base: 'Initial' },
  ])
  expect(s.read()).toBe('Modification distante')
  expect(native.calls).toHaveLength(1)
  s.controller.discard(s.target)
  await expect(s.controller.flush()).resolves.toBeUndefined()
  expect(s.controller.value(s.target, s.read())).toBe('Modification distante')
})
it('native fields isolate IME and keep their draft and caret during another field refresh', async () => {
  const s = setup(),
    row = document.createElement('div'),
    input = document.createElement('input')
  row.className = 'field'
  row.append(input)
  document.body.append(row)
  const binding = bindMetadataInput(input, s.controller, s.target, s.read)
  input.focus()
  input.dispatchEvent(new CompositionEvent('compositionstart'))
  input.value = 'にほん'
  input.dispatchEvent(new InputEvent('input', { isComposing: true }))
  expect(native.calls).toHaveLength(0)
  await expect(s.controller.flush()).rejects.toThrow('Terminez la saisie')
  input.dispatchEvent(new CompositionEvent('compositionend'))
  await vi.waitFor(() => expect(native.calls).toHaveLength(1))
  expect(native.calls[0].value).toBe('にほん')
  input.value = 'にほん 😀'
  input.dispatchEvent(new Event('input'))
  input.setSelectionRange(3, 3)
  binding.refresh()
  expect(input.value).toBe('にほん 😀')
  expect(input.selectionStart).toBe(3)
  native.calls[0].finish()
  await vi.waitFor(() => expect(native.calls).toHaveLength(2))
  native.calls[1].finish()
  await s.controller.flush()
  binding.destroy()
})
it('discarding an in-flight field cancels its preparation and releases the snapshot gate', async () => {
  const s = setup()
  s.controller.set(s.target, 'Ne pas publier', s.read)
  await vi.waitFor(() => expect(native.calls).toHaveLength(1))
  s.controller.discardAll()
  native.calls[0].finish()
  await s.controller.flush()
  expect(s.read()).toBe('Initial')
  expect(s.controller.dirty()).toBe(false)
})

it('Escape discards a refused native field without closing its enclosing metadata panel', async () => {
  installKeyboardNavigation()
  const s = setup(),
    row = document.createElement('div'),
    input = document.createElement('input')
  row.className = 'field'
  row.append(input)
  document.body.append(row)
  const binding = bindMetadataInput(input, s.controller, s.target, s.read)
  input.value = 'Mon texte'
  input.dispatchEvent(new Event('input'))
  await vi.waitFor(() => expect(native.calls).toHaveLength(1))
  s.map.set('name', 'Texte confirmé')
  native.calls[0].finish()
  await expect(s.controller.flush()).rejects.toThrow()
  input.focus()
  input.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
  )
  expect(input.value).toBe('Texte confirmé')
  expect(input.getAttribute('aria-invalid')).toBe('false')
  expect(document.activeElement).toBe(input)
  await s.controller.flush()
  binding.destroy()
})

it('incomplete date modes share draft recovery, Escape and IME without erasing the confirmed date', async () => {
  installKeyboardNavigation()
  const { metadataFields, destroyMetadataFields } = await import('../src/metadata-fields')
  const s = setup(),
    root = document.createElement('div')
  const calendar = { kind: 'calendar', iso: '2026-11-03' }
  s.map.set('name', calendar)
  document.body.append(root)
  metadataFields(
    root,
    { id: 'date', label: 'Date', sections: [] },
    [
      {
        field: 'name',
        parameter: 'date',
        label: 'Date',
        group: 'date',
        multiline: false,
        kind: 'date',
        required_for_export: true,
        value: calendar,
      },
    ],
    { date: calendar },
    vi.fn(),
    { commands: s.controller, read: s.read },
  )
  const mode = root.querySelector('select')!,
    input = root.querySelector('input')!
  mode.value = 'custom'
  mode.dispatchEvent(new Event('change'))
  expect(s.read()).toEqual(calendar)
  expect(native.calls).toHaveLength(0)
  expect(s.controller.draft()[0].value).toEqual({ kind: 'custom', text: '' })
  await expect(s.controller.flush()).rejects.toThrow('nouvelle date')
  input.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
  )
  expect(input.type).toBe('date')
  expect(input.value).toBe('2026-11-03')
  expect(s.controller.dirty()).toBe(false)
  mode.value = 'custom'
  mode.dispatchEvent(new Event('change'))
  input.dispatchEvent(new CompositionEvent('compositionstart'))
  input.value = 'Début novembre にほん'
  input.dispatchEvent(new InputEvent('input', { isComposing: true }))
  expect(native.calls).toHaveLength(0)
  input.dispatchEvent(new CompositionEvent('compositionend'))
  await vi.waitFor(() => expect(native.calls).toHaveLength(1))
  expect(native.calls[0].value).toEqual({ kind: 'custom', text: 'Début novembre にほん' })
  native.calls[0].finish()
  await s.controller.flush()
  const done = vi.fn(async () => {})
  s.controller.restore(s.target, { kind: 'calendar', iso: '' }, s.read, done)
  expect(mode.value).toBe('calendar')
  input.value = '2024-02-29'
  input.dispatchEvent(new Event('input'))
  expect(native.calls).toHaveLength(1)
  const confirm = [...root.querySelectorAll('button')].find(
    (button) => button.textContent === 'Valider',
  )!
  confirm.click()
  await vi.waitFor(() => expect(native.calls).toHaveLength(2))
  native.calls[1].finish()
  await s.controller.flush()
  await vi.waitFor(() => expect(done).toHaveBeenCalledOnce())
  expect(s.read()).toEqual({ kind: 'calendar', iso: '2024-02-29' })
  destroyMetadataFields(root)
})

it('gates saving while decoding an image and retains refused bytes for recovery and explicit retry', async () => {
  const s = setup()
  const resource = { path: 'images/sign.svg', data: btoa('<svg/>') }
  let release!: (value: typeof resource) => void
  const decoded = new Promise<typeof resource>((resolve) => {
    release = resolve
  })
  const prepare = s.controller.prepareResource(s.target, s.read, () => decoded)
  const refusal = expect(prepare).rejects.toThrow('Le document a changé')
  expect(s.controller.dirty()).toBe(true)
  const saved = vi.fn()
  const flush = s.controller.flush().then(saved)
  const blockedSave = expect(flush).rejects.toThrow('Le document a changé')
  await Promise.resolve()
  expect(saved).not.toHaveBeenCalled()
  s.map.set('name', 'Peer reference')
  release(resource)
  await refusal
  await blockedSave
  expect(s.controller.draft()).toEqual([
    { target: s.target, value: resource.path, base: 'Initial', resources: [resource] },
  ])
  expect(s.read()).toBe('Peer reference')
  const recovered = s.controller.draft()[0]
  s.controller.discardAll()
  s.controller.restore(
    recovered.target,
    recovered.value,
    s.read,
    async () => {},
    'source',
    recovered.resources,
  )
  expect(s.controller.pendingResources(s.target)).toEqual([resource])
  s.controller.confirm(s.target, resource.path, s.read)
  await vi.waitFor(() => expect(native.calls).toHaveLength(1))
  expect(native.calls[0].commands).toEqual([
    { id: 'resource.add', params: { resource } },
    { id: 'metadata.set', params: { target: s.target, value: resource.path } },
  ])
  native.calls[0].finish()
  await s.controller.flush()
  expect(s.read()).toBe(resource.path)
  expect(s.controller.dirty()).toBe(false)
})

it('waits for image decoding and the atomic resource-reference publication before saving', async () => {
  const s = setup(),
    resource = { path: 'images/ready.svg', data: btoa('<svg/>') }
  let release!: (value: typeof resource) => void
  const prepared = s.controller.prepareResource(
    s.target,
    s.read,
    () =>
      new Promise((resolve) => {
        release = resolve
      }),
  )
  const saved = vi.fn(),
    flush = s.controller.flush().then(saved)
  await vi.waitFor(() => expect(release).toBeDefined())
  expect(native.calls).toHaveLength(0)
  expect(saved).not.toHaveBeenCalled()
  release(resource)
  await vi.waitFor(() => expect(native.calls).toHaveLength(1))
  expect(saved).not.toHaveBeenCalled()
  native.calls[0].finish()
  await prepared
  await flush
  expect(saved).toHaveBeenCalledOnce()
  expect(s.controller.dirty()).toBe(false)
})
