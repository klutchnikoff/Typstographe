import type { Editor } from '@tiptap/core'
import type { Transport, Provider } from './provider'
import type { BinaryPage, Delta } from './preview-frame'
import { previewStream } from './preview-stream'
import { revealEditorPosition } from './editor-reveal'
import { browserTurn } from './browser-turn'
interface Result {
  delta?: Delta
  revision: number
  pages: (string | BinaryPage)[]
  pageSizes?: [number, number][]
}
interface Highlight {
  page: number
  corners: [number, number][]
}
export function previewController(
  editor: Editor,
  provider: Provider,
  transport: Transport,
  version: () => number,
) {
  const container = document.getElementById('pages')!
  const stream = previewStream(transport, () => provider.generation, version)
  let result: Pick<Result, 'revision' | 'pageSizes' | 'delta'> | undefined,
    shown = -1,
    ticket = 0,
    displayTicket = 0,
    backwardTicket = 0,
    timer: ReturnType<typeof setTimeout>
  interface PageView {
    page: HTMLElement
    image: HTMLImageElement | HTMLCanvasElement
    url?: string
    key?: string
    size?: [number, number]
  }
  let visible: PageView[] = []
  const release = (entries: PageView[]) => {
    for (const entry of entries) {
      if (entry.url) URL.revokeObjectURL(entry.url)
      if (entry.image instanceof HTMLCanvasElement) entry.image.width = entry.image.height = 0
    }
  }
  const query = <T>(
    publication: Pick<Result, 'revision' | 'delta'>,
    kind: string,
    args: Record<string, unknown>,
  ) =>
    publication.delta
      ? transport.invoke<T>('preview_sync', {
          frame: {
            generation: publication.delta.generation,
            epoch: publication.delta.epoch,
            id: publication.delta.id,
          },
          revision: publication.revision,
          query: { kind, ...args },
        })
      : transport.invoke<T>(`sync_${kind}`, { revision: publication.revision, ...args })
  const clear = () => {
    for (const svg of container.querySelectorAll('svg')) if (svg.firstChild) svg.replaceChildren()
  }
  const selection = () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      const id = ++ticket
      if (!result || shown !== version()) {
        clear()
        return
      }
      const publication = result,
        generation = provider.generation
      const revision = result.revision,
        { from, to } = editor.state.selection
      void Promise.all([
        query<Highlight[]>(result, 'selection', { from, to }),
        query<{ page: number; point: [number, number] } | null>(result, 'forward', {
          position: from,
        }),
      ])
        .then(([highlights, point]) => {
          if (
            id !== ticket ||
            result !== publication ||
            generation !== provider.generation ||
            shown !== version() ||
            provider.revision !== revision
          )
            return
          clear()
          for (const highlight of highlights) {
            const svg = container.querySelector<SVGSVGElement>(
              `[data-page="${highlight.page}"] svg`,
            )
            if (!svg) continue
            const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon')
            polygon.setAttribute(
              'points',
              highlight.corners.map((pair) => pair.join(',')).join(' '),
            )
            svg.append(polygon)
          }
          if (point && editor.isFocused) {
            const page = container.querySelector<HTMLElement>(`[data-page="${point.page}"]`)
            const size = result!.pageSizes?.[point.page]
            if (!page || !size) return
            const rect = page.getBoundingClientRect(),
              viewport = container.getBoundingClientRect()
            const y = rect.top + (point.point[1] * rect.width) / size[0]
            if (y < viewport.top + 35 || y > viewport.bottom - 35)
              container.scrollTop += y - viewport.top - container.clientHeight / 3
          }
        })
        .catch(() => {})
    }, 35)
  }
  const bindBackward = (
    page: HTMLElement,
    image: HTMLElement,
    index: number,
    size: [number, number] | undefined,
    publication: Pick<Result, 'revision' | 'pageSizes' | 'delta'>,
    generation: string,
  ) => {
    const displayed = () =>
      !editor.isDestroyed &&
      generation === provider.generation &&
      result === publication &&
      shown === version() &&
      provider.revision === publication.revision
    page.ondblclick = (event) => {
      if (!displayed() || !size) return
      const request = ++backwardTicket
      const rect = image.getBoundingClientRect()
      const location = {
        page: index,
        point: [
          ((event.clientX - rect.left) * size[0]) / rect.width,
          ((event.clientY - rect.top) * size[1]) / rect.height,
        ],
      }
      void query<number | null>(publication, 'backward', { location })
        .then((pos) => {
          if (pos !== null && displayed() && request === backwardTicket)
            revealEditorPosition(editor, pos)
        })
        .catch(() => {})
    }
  }
  return {
    request: stream.request,
    reset: stream.reset,
    selection,
    destroy: () => {
      result = undefined
      shown = -1
      ticket++
      displayTicket++
      backwardTicket++
      clearTimeout(timer)
      stream.reset()
      release(visible)
      visible = []
    },
    invalidate: () => {
      stream.invalidate()
      ticket++
      displayTicket++
      backwardTicket++
      clear()
    },
    show: async (value: Result, currentVersion: number) => {
      const id = ++displayTicket,
        generation = provider.generation,
        publication = { revision: value.revision, pageSizes: value.pageSizes, delta: value.delta }
      const current = () =>
        id === displayTicket &&
        currentVersion === version() &&
        value.revision === provider.revision &&
        generation === provider.generation &&
        !editor.isDestroyed
      const images: HTMLImageElement[] = []
      const prepared: PageView[] = []
      const discard = () => release(prepared)
      const delta = value.delta
      const compatible =
        delta?.base &&
        result?.delta?.id === delta.base &&
        result.delta.epoch === delta.epoch &&
        result.delta.generation === generation
      if (delta && delta.base !== null && !compatible) throw 'preview-reset'
      const changes = new Map(
        value.pages.map((src, index) => [
          typeof src === 'string' ? index : (src.index ?? index),
          src,
        ]),
      )
      const count = delta ? delta.keys.length : value.pages.length
      let pages: PageView[]
      try {
        pages = []
        let sliceStarted = performance.now()
        for (let index = 0; index < count; index++) {
          if (!current()) {
            discard()
            return false
          }
          const src = changes.get(index)
          const size = value.pageSizes?.[index]
          if (src === undefined) {
            const old = compatible ? visible[index] : undefined
            if (
              !old ||
              old.key !== delta?.keys[index] ||
              old.size?.[0] !== size?.[0] ||
              old.size?.[1] !== size?.[1]
            )
              throw 'preview-reset'
            pages.push(old)
            continue
          }
          const page = document.createElement('div')
          page.className = 'preview-page'
          page.dataset.page = String(index)
          let image: HTMLImageElement | HTMLCanvasElement
          const entry: PageView = {
            page,
            image: document.createElement('canvas'),
            size,
            key: delta?.keys[index],
          }
          prepared.push(entry)
          if (typeof src !== 'string' && src.encoding === 'rgba') {
            image = entry.image as HTMLCanvasElement
            image.width = src.width
            image.height = src.height
            const context = image.getContext('2d')
            if (!context) throw new Error('Canvas indisponible.')
            context.putImageData(
              new ImageData(
                new Uint8ClampedArray(src.data.buffer, src.data.byteOffset, src.data.byteLength),
                src.width,
                src.height,
              ),
              0,
              0,
            )
            image.setAttribute('aria-label', `Page ${index + 1} du rendu Typst`)
          } else {
            image = entry.image = document.createElement('img')
            if (typeof src === 'string') image.src = src
            else {
              const url = URL.createObjectURL(
                new Blob([src.data], {
                  type: src.encoding === 'svg' ? 'image/svg+xml' : 'image/png',
                }),
              )
              entry.url = url
              image.src = url
            }
            image.alt = `Page ${index + 1} du rendu Typst`
            images.push(image)
          }
          const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
          if (size) svg.setAttribute('viewBox', `0 0 ${size[0]} ${size[1]}`)
          page.append(image, svg)
          pages.push(entry)
          // Preparing all page canvases in one task stalls typing. Slice only
          // detached preparation; visible pages and their maps publish together.
          if (index + 1 < count && performance.now() - sliceStarted >= 4) {
            await browserTurn()
            sliceStarted = performance.now()
          }
        }
        // Decode detached images before replacing any visible page. Publishing
        // all pages together also keeps layout and sync on the same revision.
        await Promise.all(images.map((image) => image.decode()))
      } catch (error) {
        discard()
        if (!current()) return false
        throw error
      }
      if (!current()) {
        discard()
        return false
      }
      ticket++
      result = publication
      shown = currentVersion
      const scrollTop = container.scrollTop
      // No reused DOM or handler is touched during preparation. Publish pixels,
      // page order and fresh navigation closures together in this one task.
      const retained = new Set(pages.map((entry) => entry.page))
      for (const child of [...container.children])
        if (!retained.has(child as HTMLElement)) child.remove()
      for (const [index, entry] of pages.entries()) {
        const overlay = entry.page.querySelector('svg')
        if (overlay?.firstChild) overlay.replaceChildren()
        bindBackward(entry.page, entry.image, index, entry.size, publication, generation)
        const position = container.children[index]
        if (position !== entry.page) container.insertBefore(entry.page, position ?? null)
      }
      while (container.children.length > pages.length) container.lastElementChild!.remove()
      release(visible.filter((entry) => !pages.includes(entry)))
      visible = pages
      stream.published(value)
      container.scrollTop = scrollTop
      selection()
      return true
    },
  }
}
