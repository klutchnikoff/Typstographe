import type { Editor } from '@tiptap/core'
import type { Transport, Provider } from './provider'
import type { BinaryPage } from './preview-frame'
import { revealEditorPosition } from './editor-reveal'
import { browserTurn } from './browser-turn'
interface Result {
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
  let result: Pick<Result, 'revision' | 'pageSizes'> | undefined,
    shown = -1,
    ticket = 0,
    displayTicket = 0,
    backwardTicket = 0,
    timer: ReturnType<typeof setTimeout>
  let visibleUrls: string[] = []
  let visibleCanvases: HTMLCanvasElement[] = []
  const releaseCanvases = (canvases: HTMLCanvasElement[]) => {
    for (const canvas of canvases) canvas.width = canvas.height = 0
  }
  const clear = () => {
    for (const svg of container.querySelectorAll('svg')) svg.replaceChildren()
  }
  const selection = () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      const id = ++ticket
      if (!result || shown !== version()) {
        clear()
        return
      }
      const revision = result.revision,
        { from, to } = editor.state.selection
      void Promise.all([
        transport.invoke<Highlight[]>('sync_selection', { revision, from, to }),
        transport.invoke<{ page: number; point: [number, number] } | null>('sync_forward', {
          revision,
          position: from,
        }),
      ])
        .then(([highlights, point]) => {
          if (id !== ticket || shown !== version() || provider.revision !== revision) return
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
    publication: Pick<Result, 'revision' | 'pageSizes'>,
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
      void transport
        .invoke<number | null>('sync_backward', { revision: publication.revision, location })
        .then((pos) => {
          if (pos !== null && displayed() && request === backwardTicket)
            revealEditorPosition(editor, pos)
        })
        .catch(() => {})
    }
  }
  return {
    selection,
    destroy: () => {
      result = undefined
      shown = -1
      ticket++
      displayTicket++
      backwardTicket++
      clearTimeout(timer)
      visibleUrls.forEach((url) => URL.revokeObjectURL(url))
      visibleUrls = []
      releaseCanvases(visibleCanvases)
      visibleCanvases = []
    },
    invalidate: () => {
      ticket++
      displayTicket++
      backwardTicket++
      clear()
    },
    show: async (value: Result, currentVersion: number) => {
      const id = ++displayTicket,
        generation = provider.generation,
        publication = { revision: value.revision, pageSizes: value.pageSizes }
      const current = () =>
        id === displayTicket &&
        currentVersion === version() &&
        value.revision === provider.revision &&
        generation === provider.generation &&
        !editor.isDestroyed
      const images: HTMLImageElement[] = []
      const urls: string[] = []
      const canvases: HTMLCanvasElement[] = []
      const release = () => {
        urls.forEach((url) => URL.revokeObjectURL(url))
        releaseCanvases(canvases)
      }
      let pages: HTMLElement[]
      try {
        pages = []
        let sliceStarted = performance.now()
        for (const [index, src] of value.pages.entries()) {
          if (!current()) {
            release()
            return false
          }
          const page = document.createElement('div')
          page.className = 'preview-page'
          page.dataset.page = String(index)
          let image: HTMLImageElement | HTMLCanvasElement
          if (typeof src !== 'string' && src.encoding === 'rgba') {
            image = document.createElement('canvas')
            canvases.push(image)
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
            image = document.createElement('img')
            if (typeof src === 'string') image.src = src
            else {
              const url = URL.createObjectURL(
                new Blob([src.data], {
                  type: src.encoding === 'svg' ? 'image/svg+xml' : 'image/png',
                }),
              )
              urls.push(url)
              image.src = url
            }
            image.alt = `Page ${index + 1} du rendu Typst`
            images.push(image)
          }
          const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
          const size = value.pageSizes?.[index]
          if (size) svg.setAttribute('viewBox', `0 0 ${size[0]} ${size[1]}`)
          page.append(image, svg)
          bindBackward(page, image, index, size, publication, generation)
          pages.push(page)
          // Preparing all page canvases in one task stalls typing. Slice only
          // detached preparation; visible pages and their maps publish together.
          if (index + 1 < value.pages.length && performance.now() - sliceStarted >= 4) {
            await browserTurn()
            sliceStarted = performance.now()
          }
        }
        // Decode detached images before replacing any visible page. Publishing
        // all pages together also keeps layout and sync on the same revision.
        await Promise.all(images.map((image) => image.decode()))
      } catch (error) {
        release()
        if (!current()) return false
        throw error
      }
      if (!current()) {
        release()
        return false
      }
      ticket++
      result = publication
      shown = currentVersion
      const scrollTop = container.scrollTop
      container.replaceChildren(...pages)
      visibleUrls.forEach((url) => URL.revokeObjectURL(url))
      visibleUrls = urls
      releaseCanvases(visibleCanvases)
      visibleCanvases = canvases
      container.scrollTop = scrollTop
      selection()
      return true
    },
  }
}
