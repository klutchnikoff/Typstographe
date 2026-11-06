import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Editor } from '@tiptap/core'
import { richZoneExtensions } from '../src/rich-zone'
import { previewController } from '../src/preview'
import type { Provider, Transport } from '../src/provider'
import { browserTurn } from '../src/browser-turn'
vi.mock('../src/browser-turn', () => ({ browserTurn: vi.fn(async () => {}) }))

function deferred() {
  let resolve!: () => void, reject!: (error: Error) => void
  const promise = new Promise<void>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
const originalDecode = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'decode')
let editor: Editor
let decode = vi.fn<() => Promise<void>>()
let provider: Provider
let version: number
let controller: ReturnType<typeof previewController>
let transport: Transport
const result = (revision: number, pages = ['new']) => ({
  revision,
  pages,
  pageSizes: pages.map(() => [100, 200] as [number, number]),
})
beforeEach(() => {
  vi.mocked(browserTurn).mockReset().mockResolvedValue(undefined)
  vi.useFakeTimers()
  document.body.innerHTML = '<div id="pages"><img src="old" alt="Ancien aperçu"></div>'
  editor = new Editor({
    extensions: richZoneExtensions('document'),
    content: '<p>Test du rendu</p>',
  })
  document.body.append(editor.view.dom)
  editor.commands.setTextSelection(1)
  provider = { revision: 1, generation: 'document-a' } as Provider
  version = 1
  decode = vi.fn(() => Promise.resolve())
  Object.defineProperty(HTMLImageElement.prototype, 'decode', { configurable: true, value: decode })
  transport = {
    invoke: vi.fn(async (command) => (command === 'sync_selection' ? [] : null)),
  } as unknown as Transport
  controller = previewController(editor, provider, transport, () => version)
})

const rgba = (revision: number, count = 3) => ({
  revision,
  pages: Array.from({ length: count }, () => ({
    encoding: 'rgba' as const,
    width: 2,
    height: 2,
    data: new Uint8Array(16),
  })),
  pageSizes: Array.from({ length: count }, () => [100, 200] as [number, number]),
})
function canvasProbe(failAt = -1) {
  let clock = 0
  const canvases: HTMLCanvasElement[] = []
  const time = vi.spyOn(performance, 'now').mockImplementation(() => clock)
  const put = vi.fn(() => {
    clock += 5
    if (put.mock.calls.length === failAt) throw Error('Upload failed')
  })
  const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
    this: HTMLCanvasElement,
  ) {
    canvases.push(this)
    return { putImageData: put } as unknown as CanvasRenderingContext2D
  })
  vi.stubGlobal(
    'ImageData',
    class {
      constructor(..._args: unknown[]) {}
    },
  )
  return {
    canvases,
    put,
    close: () => {
      time.mockRestore()
      context.mockRestore()
      vi.unstubAllGlobals()
    },
  }
}
it('prepares pages in slices, publishes atomically and releases replaced canvases only afterwards', async () => {
  const probe = canvasProbe()
  try {
    await controller.show(rgba(1, 1), 1)
    const old = document.querySelector('canvas')!
    const first = deferred(),
      second = deferred()
    vi.mocked(browserTurn).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const pending = controller.show(rgba(1), 1)
    expect(probe.put).toHaveBeenCalledTimes(2)
    expect(document.querySelector('canvas')).toBe(old)
    expect(old.width).toBe(2)
    first.resolve()
    await Promise.resolve()
    expect(probe.put).toHaveBeenCalledTimes(3)
    expect(document.querySelector('canvas')).toBe(old)
    second.resolve()
    expect(await pending).toBe(true)
    expect(document.querySelectorAll('canvas')).toHaveLength(3)
    expect(old.width).toBe(0)
    expect([...document.querySelectorAll('canvas')].every((c) => c.width === 2)).toBe(true)
  } finally {
    probe.close()
  }
})
it('a document edit during preparation cancels remaining uploads and preserves visible pages and selection', async () => {
  const probe = canvasProbe(),
    held = deferred(),
    old = document.querySelector('#pages img')
  try {
    vi.mocked(browserTurn).mockReturnValueOnce(held.promise)
    const pending = controller.show(rgba(1), 1)
    expect(probe.put).toHaveBeenCalledTimes(1)
    editor.commands.setTextSelection(3)
    version = provider.revision = 2
    controller.invalidate()
    held.resolve()
    expect(await pending).toBe(false)
    expect(probe.put).toHaveBeenCalledTimes(1)
    expect(probe.canvases.every((c) => c.width === 0)).toBe(true)
    expect(document.querySelector('#pages img')).toBe(old)
    expect(editor.state.selection.from).toBe(3)
  } finally {
    probe.close()
  }
})
it('a failed partial upload releases every prepared canvas and keeps the last preview', async () => {
  const probe = canvasProbe(2),
    old = document.querySelector('#pages img')
  try {
    await expect(controller.show(rgba(1), 1)).rejects.toThrow('Upload failed')
    expect(probe.canvases).toHaveLength(2)
    expect(probe.canvases.every((c) => c.width === 0)).toBe(true)
    expect(document.querySelector('#pages img')).toBe(old)
  } finally {
    probe.close()
  }
})

it('closing during a yielded preparation releases its buffers and disables old-page navigation', async () => {
  const probe = canvasProbe(),
    held = deferred()
  try {
    await controller.show(rgba(1, 1), 1)
    const visible = document.querySelector('canvas')!
    vi.mocked(browserTurn).mockReturnValueOnce(held.promise)
    const pending = controller.show(rgba(1), 1)
    controller.destroy()
    expect(visible.width).toBe(0)
    document.querySelector('.preview-page')!.dispatchEvent(new MouseEvent('dblclick'))
    held.resolve()
    expect(await pending).toBe(false)
    expect(probe.canvases.every((canvas) => canvas.width === 0)).toBe(true)
    expect(transport.invoke).not.toHaveBeenCalled()
  } finally {
    probe.close()
  }
})
afterEach(() => {
  editor.destroy()
  vi.clearAllTimers()
  vi.useRealTimers()
  if (originalDecode) Object.defineProperty(HTMLImageElement.prototype, 'decode', originalDecode)
  else Reflect.deleteProperty(HTMLImageElement.prototype, 'decode')
  document.body.replaceChildren()
})

it('garde tout l’ancien aperçu jusqu’à ce que toutes les pages soient prêtes', async () => {
  const first = deferred(),
    second = deferred()
  decode.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
  const old = document.querySelector('#pages img')
  const pending = controller.show(result(1, ['first', 'second']), 1)
  expect(document.querySelector('#pages img')).toBe(old)
  first.resolve()
  await Promise.resolve()
  expect(document.querySelector('#pages img')).toBe(old)
  second.resolve()
  expect(await pending).toBe(true)
  expect(
    [...document.querySelectorAll<HTMLImageElement>('#pages img')].map((img) =>
      img.getAttribute('src'),
    ),
  ).toEqual(['first', 'second'])
})

it('une erreur de décodage conserve les pages visibles', async () => {
  const old = document.querySelector('#pages img'),
    failure = new Error('Image corrompue')
  decode.mockRejectedValueOnce(failure)
  await expect(controller.show(result(1), 1)).rejects.toBe(failure)
  expect(document.querySelector('#pages img')).toBe(old)
})

it('un ancien décodage ne peut pas remplacer un aperçu plus récent', async () => {
  const first = deferred()
  decode.mockReturnValueOnce(first.promise)
  const pending = controller.show(result(1, ['outdated']), 1)
  version = provider.revision = 2
  controller.invalidate()
  expect(await controller.show(result(2, ['latest']), 2)).toBe(true)
  first.resolve()
  expect(await pending).toBe(false)
  expect(document.querySelector('#pages img')?.getAttribute('src')).toBe('latest')
})

it('invalide aussi un résultat dont le document a été remplacé ou modifié', async () => {
  for (const change of ['version', 'revision', 'generation', 'invalidation']) {
    provider.revision = version = 1
    provider.generation = 'document-a'
    const held = deferred()
    decode.mockReturnValueOnce(held.promise)
    const pending = controller.show(result(1), 1)
    if (change === 'version') version++
    else if (change === 'revision') provider.revision++
    else if (change === 'generation') provider.generation = 'document-b'
    else controller.invalidate()
    held.resolve()
    expect(await pending).toBe(false)
    expect(document.querySelector('#pages img')?.getAttribute('src')).toBe('old')
  }
})

it('une erreur sur un résultat périmé ne remplace pas le statut du nouvel aperçu', async () => {
  const held = deferred()
  decode.mockReturnValueOnce(held.promise)
  const pending = controller.show(result(1), 1)
  version = provider.revision = 2
  expect(await controller.show(result(2, ['latest']), 2)).toBe(true)
  held.reject(new Error('Erreur tardive'))
  expect(await pending).toBe(false)
  expect(document.querySelector('#pages img')?.getAttribute('src')).toBe('latest')
})

it('un retour de navigation d’une ancienne image ne déplace pas le curseur', async () => {
  let finish!: (position: number) => void
  transport.invoke = vi.fn((command) =>
    command === 'sync_backward'
      ? new Promise<number>((resolve) => {
          finish = resolve
        })
      : Promise.resolve(null),
  ) as Transport['invoke']
  await controller.show(result(1), 1)
  document.querySelector('.preview-page')!.dispatchEvent(new MouseEvent('dblclick'))
  version = provider.revision = 2
  await controller.show(result(2, ['latest']), 2)
  const cursor = editor.state.selection.from
  finish(4)
  await Promise.resolve()
  expect(editor.state.selection.from).toBe(cursor)
})

it('libère les URL binaires périmées et conserve celles de l’aperçu visible', async () => {
  const create = vi
    .fn()
    .mockReturnValueOnce('blob:first')
    .mockReturnValueOnce('blob:next')
    .mockReturnValueOnce('blob:stale')
  const revoke = vi.fn()
  vi.stubGlobal(
    'URL',
    Object.assign(class {}, { createObjectURL: create, revokeObjectURL: revoke }),
  )
  const binary = (revision: number) => ({
    revision,
    pages: [
      { encoding: 'svg' as const, width: 0, height: 0, data: new TextEncoder().encode('<svg/>') },
    ],
    pageSizes: [[100, 200] as [number, number]],
  })
  try {
    expect(await controller.show(binary(1), 1)).toBe(true)
    expect(revoke).not.toHaveBeenCalled()
    version = provider.revision = 2
    expect(await controller.show(binary(2), 2)).toBe(true)
    expect(revoke).toHaveBeenCalledWith('blob:first')
    expect(revoke).not.toHaveBeenCalledWith('blob:next')
    const held = deferred()
    decode.mockReturnValueOnce(held.promise)
    const pending = controller.show(binary(2), 2)
    controller.invalidate()
    held.resolve()
    expect(await pending).toBe(false)
    expect(revoke).toHaveBeenCalledWith('blob:stale')
    controller.destroy()
    expect(revoke).toHaveBeenCalledWith('blob:next')
  } finally {
    vi.unstubAllGlobals()
  }
})

it('seule la dernière navigation demandée peut déplacer et repérer le curseur', async () => {
  const finishes: ((pos: number) => void)[] = []
  transport.invoke = vi.fn((command) =>
    command === 'sync_backward'
      ? new Promise<number>((resolve) => finishes.push(resolve))
      : Promise.resolve(null),
  ) as Transport['invoke']
  await controller.show(result(1), 1)
  const page = document.querySelector('.preview-page')!
  page.dispatchEvent(new MouseEvent('dblclick'))
  page.dispatchEvent(new MouseEvent('dblclick'))
  finishes[1](10)
  await Promise.resolve()
  expect(editor.state.selection.from).toBe(10)
  expect(editor.view.dom.querySelector('.sync-location')?.textContent).toBe('rendu')
  finishes[0](2)
  await Promise.resolve()
  expect(editor.state.selection.from).toBe(10)
})

function differential(
  revision: number,
  id: string,
  base: string | null,
  keys: string[],
  changed: number[],
) {
  const value = rgba(revision, keys.length)
  return {
    ...value,
    delta: { generation: 'document-a', epoch: 'epoch', version: revision, id, base, keys },
    pages: changed.map((index) => ({ ...value.pages[index], index })),
  }
}
it('reuses unchanged canvas identities but replaces navigation maps for every revision', async () => {
  const probe = canvasProbe()
  try {
    await controller.show(differential(1, 'first', null, ['a', 'b'], [0, 1]), 1)
    const [first, second] = [...document.querySelectorAll('canvas')]
    version = provider.revision = 2
    await controller.show(differential(2, 'next', 'first', ['a', 'c'], [1]), 2)
    expect(document.querySelectorAll('canvas')[0]).toBe(first)
    expect(document.querySelectorAll('canvas')[1]).not.toBe(second)
    expect(first.width).toBe(2)
    expect(second.width).toBe(0)
    expect(probe.put).toHaveBeenCalledTimes(3)
    document.querySelector('.preview-page')!.dispatchEvent(new MouseEvent('dblclick'))
    expect(transport.invoke).toHaveBeenCalledWith(
      'preview_sync',
      expect.objectContaining({
        revision: 2,
        frame: { generation: 'document-a', epoch: 'epoch', id: 'next' },
        query: expect.objectContaining({ kind: 'backward' }),
      }),
    )
    version = provider.revision = 3
    await controller.show(differential(3, 'same', 'next', ['a', 'c'], []), 3)
    expect(probe.put).toHaveBeenCalledTimes(3)
    expect(document.querySelectorAll('canvas')[0]).toBe(first)
    expect(document.querySelectorAll('.preview-page')).toHaveLength(2)
  } finally {
    probe.close()
  }
})
it('a missing base requests a full fallback without touching visible pixels', async () => {
  const probe = canvasProbe()
  try {
    await controller.show(differential(1, 'first', null, ['a'], [0]), 1)
    const first = document.querySelector('canvas')
    await expect(controller.show(differential(1, 'next', 'missing', ['a'], []), 1)).rejects.toBe(
      'preview-reset',
    )
    expect(document.querySelector('canvas')).toBe(first)
    expect(first!.width).toBe(2)
  } finally {
    probe.close()
  }
})
it('cancellation during a mixed reuse/upload leaves old canvases and handlers intact', async () => {
  const probe = canvasProbe(),
    held = deferred()
  try {
    await controller.show(differential(1, 'first', null, ['a', 'b', 'c'], [0, 1, 2]), 1)
    const old = [...document.querySelectorAll('canvas')]
    vi.mocked(browserTurn).mockReturnValueOnce(held.promise)
    const pending = controller.show(differential(1, 'next', 'first', ['a', 'new', 'c'], [1]), 1)
    controller.invalidate()
    held.resolve()
    expect(await pending).toBe(false)
    expect([...document.querySelectorAll('canvas')]).toEqual(old)
    expect(old.every((c) => c.width === 2)).toBe(true)
    expect(probe.canvases.at(-1)!.width).toBe(0)
  } finally {
    probe.close()
  }
})
it('page deletion and addition keep the correct order and retire only removed canvases', async () => {
  const probe = canvasProbe()
  try {
    await controller.show(differential(1, 'first', null, ['a', 'b'], [0, 1]), 1)
    const [first, removed] = [...document.querySelectorAll('canvas')]
    await controller.show(differential(1, 'short', 'first', ['a'], []), 1)
    expect(document.querySelectorAll('canvas')).toHaveLength(1)
    expect(removed.width).toBe(0)
    await controller.show(differential(1, 'long', 'short', ['a', 'c'], [1]), 1)
    expect(document.querySelectorAll('canvas')).toHaveLength(2)
    expect(document.querySelector('canvas')).toBe(first)
    expect(
      [...document.querySelectorAll('.preview-page')].map((p) => (p as HTMLElement).dataset.page),
    ).toEqual(['0', '1'])
  } finally {
    probe.close()
  }
})

it('replaces only the changed first page and never moves the unchanged following pages', async () => {
  const probe = canvasProbe()
  const mutations: MutationRecord[] = []
  const container = document.getElementById('pages')!
  const observer = new MutationObserver((records) => mutations.push(...records))
  try {
    await controller.show(differential(1, 'first', null, ['a', 'b', 'c'], [0, 1, 2]), 1)
    const [first, ...retained] = [...container.children]
    observer.observe(container, { childList: true, subtree: true })
    await controller.show(differential(1, 'changed', 'first', ['d', 'b', 'c'], [0]), 1)
    await Promise.resolve()
    const removed = mutations.flatMap((m) => [...m.removedNodes])
    const added = mutations.flatMap((m) => [...m.addedNodes])
    expect(removed).toEqual([first])
    expect(added).toEqual([container.firstElementChild])
    expect([...container.children].slice(1)).toEqual(retained)
    mutations.length = 0
    controller.invalidate() // Empty highlights must not generate DOM writes either.
    await controller.show(differential(1, 'same', 'changed', ['d', 'b', 'c'], []), 1)
    await Promise.resolve()
    expect(mutations).toHaveLength(0)
  } finally {
    observer.disconnect()
    probe.close()
  }
})
