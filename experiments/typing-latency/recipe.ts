import type { Editor } from "@tiptap/core";
import type { Provider, Transport } from "./provider";
import type { Preview } from "./preview-frame";
import { now, typingSpan, startProbe, stopProbe } from "./typing-probe";
import corpora from "./typing-corpora.json";
const FRONTEND = "prepared";
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const frame = () =>
  new Promise<number>((resolve, reject) => {
    const timeout = setTimeout(() => reject(Error("Suspended frames")), 5000);
    requestAnimationFrame(() => {
      clearTimeout(timeout);
      resolve(now());
    });
  });
interface Harness {
  pause(): Promise<void>;
  resume(): void;
  snapshot(): unknown;
  show(result: Preview): Promise<boolean>;
  observe(fn: (revision: number, result: Preview) => void): void;
}
export async function nativePreviewPerformance(
  transport: Transport,
  provider: Provider,
  editor: Editor,
  harness: Harness,
) {
  const report: any = {
    success: false,
    frontendFingerprint: FRONTEND,
    userAgent: navigator.userAgent,
    phases: [],
  };
  const assert = (value: unknown, message: string) => {
    if (!value) throw Error(message);
  };
  let latest: Preview | undefined,
    waiters: (() => void)[] = [];
  harness.observe((_revision, result) => {
    latest = result;
    waiters.splice(0).forEach((f) => f());
  });
  const settled = async () => {
    const end = now() + 30000;
    while (!latest || latest.revision !== provider.revision) {
      if (now() > end) throw Error("No confirmed final preview");
      await Promise.race([
        new Promise<void>((r) => waiters.push(r)),
        sleep(100),
      ]);
    }
  };
  try {
    await harness.pause();
    const { benchmark: config } = await transport.invoke<any>(
      "diagnostic_confirmed",
    );
    report.config = config;
    const corpus = corpora.find(
      (c) => c.name === config.corpus && c.language === "latex",
    )!;
    assert(corpus, "Unknown corpus");
    editor.commands.setContent(corpus.document);
    await provider.flush();
    harness.resume();
    await settled();
    await frame();
    await frame();
    assert(
      document.visibilityState === "visible",
      "Benchmark window is hidden",
    );
    report.pages = latest!.pages.length;
    if (config.preview === "off") await harness.pause();
    editor.commands.setTextSelection(1);
    editor.view.focus();
    const dispatch = editor.view.props.dispatchTransaction!;
    editor.view.setProps({
      dispatchTransaction: (tr) =>
        typingSpan("editor.dispatch", () => dispatch.call(editor.view, tr)),
    });
    const put = CanvasRenderingContext2D.prototype.putImageData;
    CanvasRenderingContext2D.prototype.putImageData = function (
      ...args: any[]
    ) {
      return typingSpan("preview.putImageData", () =>
        put.apply(this, args as any),
      );
    };
    const replace = Element.prototype.replaceChildren;
    Element.prototype.replaceChildren = function (...args: any[]) {
      return this.id === "pages"
        ? typingSpan("preview.publish", () => replace.apply(this, args))
        : replace.apply(this, args);
    };
    const invoke = transport.invoke.bind(transport);
    let ipc: any[] | undefined;
    transport.invoke = async <T>(
      command: string,
      args?: Record<string, unknown>,
    ) => {
      const target = ipc,
        start = now();
      try {
        const result = await invoke<T>(command, args);
        target?.push({
          command,
          start,
          ms: now() - start,
          bytes: result instanceof ArrayBuffer ? result.byteLength : undefined,
        });
        return result;
      } catch (e) {
        target?.push({ command, start, ms: now() - start, error: String(e) });
        throw e;
      }
    };
    const text = "Un texte pour mesurer la saisie. ";
    let inserted = "";
    const original = editor.state.doc.firstChild!.textContent;
    for (const cadence of [100, 250]) {
      const samples: any[] = [],
        inputs: any[] = [],
        frames: number[] = [];
      const count = 24,
        start = now(),
        url = URL.createObjectURL(
          new Blob(
            [
              `
        const now=()=>performance.timeOrigin+performance.now();
        onmessage=({data:c})=>{let index=0;const tick=()=>{const due=c.start+200+index*c.cadence;
          setTimeout(()=>{postMessage({index,due,sent:now()});if(++index<c.count)tick()},Math.max(0,due-now()))};tick()};
      `,
            ],
            { type: "text/javascript" },
          ),
        );
      const worker = new Worker(url);
      const observed = (e: Event) => {
        const i = e as InputEvent;
        inputs.push({
          time: now(),
          trusted: i.isTrusted,
          type: i.inputType,
          data: i.data,
        });
      };
      editor.view.dom.addEventListener("input", observed, true);
      let tracing = true;
      const heartbeat = () => {
        if (tracing) {
          frames.push(now());
          requestAnimationFrame(heartbeat);
        }
      };
      requestAnimationFrame(heartbeat);
      ipc = [];
      startProbe();
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(Error("Input stream stalled")),
          30000,
        );
        worker.onerror = () => reject(Error("Worker failed"));
        worker.onmessage = ({ data }) => {
          try {
            const received = now(),
              ch = text[data.index % text.length];
            assert(editor.isFocused, "Editor lost focus");
            assert(
              document.execCommand("insertText", false, ch),
              "Native editing rejected text",
            );
            inserted += ch;
            const returned = now(),
              sample = {
                ...data,
                received,
                returned,
                firstFrame: 0,
                secondFrame: 0,
              };
            samples.push(sample);
            requestAnimationFrame(() => {
              sample.firstFrame = now();
              requestAnimationFrame(() => {
                sample.secondFrame = now();
              });
            });
            if (samples.length === count) {
              clearTimeout(timeout);
              resolve();
            }
          } catch (e) {
            clearTimeout(timeout);
            reject(e);
          }
        };
        worker.postMessage({ start, cadence, count });
      });
      await frame();
      await frame();
      const end = now();
      tracing = false;
      const spans = stopProbe();
      const calls = ipc;
      ipc = undefined;
      worker.terminate();
      URL.revokeObjectURL(url);
      editor.view.dom.removeEventListener("input", observed, true);
      await provider.flush();
      assert(!provider.rejected, "Document publication rejected");
      assert(
        editor.state.doc.firstChild!.textContent === inserted + original,
        "Lost or reordered input",
      );
      assert(
        inputs.length === count && inputs.every((i) => i.type === "insertText"),
        "Unexpected native input events",
      );
      assert(
        samples.every((s) => s.secondFrame > 0),
        "Missing frame samples",
      );
      assert(
        document.visibilityState === "visible",
        "Benchmark window became hidden",
      );
      report.phases.push({
        cadence,
        start,
        end,
        samples,
        inputs,
        frames,
        spans,
        ipc: calls,
        confirmed: true,
      });
      await transport.invoke("diagnostic_event", {
        target: "main",
        step: "progress",
        payload: { ...config, cadence, keys: count },
      });
      // Drain outside timing; both modes start the next phase from a coherent page.
      if (config.preview === "off") harness.resume();
      await settled();
      await sleep(150);
      if (config.preview === "off") await harness.pause();
    }
    if (config.preview === "off") harness.resume();
    await provider.flush();
    await settled();
    // A same-revision render can retire canvases while the asynchronous hash
    // loop reads them. Freeze publication outside the timed input phases.
    await harness.pause();
    await frame();
    await frame();
    const hashes = [];
    for (const canvas of document.querySelectorAll<HTMLCanvasElement>(
      "#pages canvas",
    )) {
      const pixels = canvas
        .getContext("2d")!
        .getImageData(0, 0, canvas.width, canvas.height).data;
      hashes.push(
        Array.from(
          new Uint8Array(await crypto.subtle.digest("SHA-256", pixels)),
          (v) => v.toString(16).padStart(2, "0"),
        ).join(""),
      );
    }
    report.final = {
      source: latest!.source,
      pixels: hashes,
      selection: editor.state.selection.from,
      body: editor.state.doc.firstChild!.textContent,
    };
    const position = 6,
      revision = provider.revision;
    const point = await transport.invoke<any>("sync_forward", {
      revision,
      position,
    });
    assert(point, "Missing forward navigation");
    const back = await transport.invoke<number | null>("sync_backward", {
      revision,
      location: point,
    });
    const boxes = await transport.invoke<any[]>("sync_selection", {
      revision,
      from: 2,
      to: 8,
    });
    assert(
      back !== null && boxes.length,
      "Missing backward navigation or selection",
    );
    report.navigation = { point, back, boxes };
    report.success = true;
  } catch (e) {
    report.error =
      e instanceof Error ? `${e.message}\n${e.stack || ""}` : String(e);
  }
  await transport.invoke("diagnostic_finish", { report });
}
