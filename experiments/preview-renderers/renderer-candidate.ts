// Isolated renderer candidate. Native sync overlays/handlers remain in preview.ts.
import init, {
  TypstRendererBuilder,
  RenderPageImageOptions,
} from "./renderer-vendor/typst_ts_renderer.mjs";
import wasmUrl from "./renderer-vendor/typst_ts_renderer_bg.wasm?url";
import type { BinaryPage } from "./preview-frame";
export interface Candidate {
  mode: string;
  base: number | null;
  reset: boolean;
  keys: string[];
  changed: number[];
  keyMs: number;
  rasterMs: number;
  rgbaMs: number;
  vectorMs: number;
}
let published: number | undefined;
export const publishedBase = () => published;
export const publishBase = (revision: number) => {
  published = revision;
};
export const forgetBase = () => {
  published = undefined;
};
let vector: Promise<any> | undefined, session: any;
let rendererRevision: number | undefined;
const getVector = () =>
  (vector ||= (async () => {
    await init({ module_or_path: await (await fetch(wasmUrl)).arrayBuffer() });
    const builder = new TypstRendererBuilder();
    const renderer = await builder.build();
    // build() consumes the wasm-bindgen builder; freeing it again is invalid.
    return renderer;
  })());
export async function candidatePages(
  value: {
    revision: number;
    pages: (string | BinaryPage)[];
    candidate?: Candidate;
    pageSizes?: [number, number][];
  },
  container: HTMLElement,
  current: () => boolean,
) {
  const info = value.candidate!,
    start = performance.now();
  const stats = {
    vectorMergeMs: 0,
    vectorDrawMs: 0,
    rgbaPutMs: 0,
    canvasAllocateMs: 0,
    reusedPages: 0,
    drawnPages: 0,
  };
  let renderer: any;
  if (info.mode === "reflexo") {
    renderer = await getVector();
    if (info.reset) {
      session?.free();
      session = renderer.create_session();
    } else if (rendererRevision !== info.base)
      throw new Error("Reflexo base revision mismatch");
    const merge = performance.now();
    renderer.manipulate_data(
      session,
      "merge",
      (value.pages[0] as BinaryPage).data,
    );
    stats.vectorMergeMs = performance.now() - merge;
    rendererRevision = value.revision;
    const pages = session.pages_info;
    if (pages.page_count !== value.pageSizes!.length)
      throw new Error(`Reflexo page count mismatch ${pages.page_count}`);
    pages.free();
  }
  const result: HTMLElement[] = [];
  for (let i = 0; i < info.keys.length; i++) {
    const existing = container.children[i] as HTMLElement | undefined;
    if (
      info.mode !== "rgba-full" &&
      existing?.dataset.visualKey === info.keys[i]
    ) {
      result.push(existing);
      stats.reusedPages++;
      continue;
    }
    const allocate = performance.now();
    const page = document.createElement("div"),
      canvas = document.createElement("canvas");
    page.className = "preview-page";
    page.dataset.page = String(i);
    page.dataset.visualKey = info.keys[i];
    const size = value.pageSizes![i];
    const change = info.changed.indexOf(i);
    if (info.mode === "reflexo") {
      canvas.width = Math.ceil(size[0] * 2);
      canvas.height = Math.ceil(size[1] * 2);
    } else {
      const bytes = value.pages[change] as BinaryPage;
      if (!bytes) throw new Error("Missing changed page");
      canvas.width = bytes.width;
      canvas.height = bytes.height;
    }
    const ctx = canvas.getContext("2d")!;
    stats.canvasAllocateMs += performance.now() - allocate;
    const draw = performance.now();
    if (info.mode === "reflexo") {
      const options = new RenderPageImageOptions();
      options.page_off = i;
      options.pixel_per_pt = 2;
      options.background_color = "#ffffff";
      options.data_selection = 1;
      // Detached canvas: never let an asynchronous render overwrite a newer view.
      await renderer.render_page_to_canvas(session, ctx, options);
      // wasm-bindgen consumes this optional argument; no free() after the call.
      stats.vectorDrawMs += performance.now() - draw;
    } else {
      const bytes = value.pages[change] as BinaryPage;
      ctx.putImageData(
        new ImageData(
          new Uint8ClampedArray(
            bytes.data.buffer,
            bytes.data.byteOffset,
            bytes.data.byteLength,
          ),
          bytes.width,
          bytes.height,
        ),
        0,
        0,
      );
      stats.rgbaPutMs += performance.now() - draw;
    }
    stats.drawnPages++;
    canvas.setAttribute("aria-label", `Page ${i + 1} du rendu Typst`);
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", `0 0 ${size[0]} ${size[1]}`);
    page.append(canvas, svg);
    result.push(page);
  }
  // Publication guard is checked again by the production controller after await.
  (value as any).candidateProfile = {
    ...stats,
    totalMs: performance.now() - start,
    validAtEnd: current(),
  };
  return result;
}
