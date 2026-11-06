// Replaces the existing recipe module ONLY in a disposable checkout.
import type { Editor } from "@tiptap/core";
import type { Provider, Transport } from "./provider";
import type { Preview, BinaryPage } from "./preview-frame";
import corpora from "./profile-corpora.json";

interface Harness {
  pause: () => Promise<void>;
  resume: () => void;
  snapshot: () => unknown;
  show: (result: Preview) => Promise<boolean>;
  observe: (
    callback: (
      revision: number,
      result: Preview & { profiling?: Record<string, number> },
    ) => void,
  ) => void;
}
const frame = () =>
  new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Suspended frames: ${document.visibilityState}`)),
      5000,
    );
    requestAnimationFrame(() => {
      clearTimeout(timeout);
      resolve();
    });
  });
const painted = async () => {
  if (document.visibilityState !== "visible")
    throw new Error("Benchmark window is hidden");
  await frame();
  await frame();
  if (document.visibilityState !== "visible")
    throw new Error("Benchmark window became hidden");
};
async function hashes(result: Preview) {
  const values = [];
  for (const page of result.pages as BinaryPage[]) {
    const hash = await crypto.subtle.digest("SHA-256", page.data);
    values.push(
      Array.from(new Uint8Array(hash), (n) =>
        n.toString(16).padStart(2, "0"),
      ).join(""),
    );
  }
  return values;
}
export async function nativePreviewPerformance(
  transport: Transport,
  provider: Provider,
  editor: Editor,
  harness: Harness,
) {
  const samples: unknown[] = [];
  try {
    await harness.pause();
    const { benchmark: config } = await transport.invoke<{
      benchmark: { corpus: string; language: string; cache: string };
    }>("diagnostic_confirmed");
    const corpus = corpora.find(
      (c) => c.name === config.corpus && c.language === config.language,
    )!;
    if (!corpus) throw new Error(`Unknown corpus: ${config.corpus}`);
    let finish:
      | ((value: Preview & { profiling?: Record<string, number> }) => void)
      | undefined;
    let calls: { command: string; ms: number }[] | undefined;
    const originalInvoke = transport.invoke.bind(transport);
    transport.invoke = async <T>(
      command: string,
      args?: Record<string, unknown>,
    ) => {
      const target = calls;
      const start = performance.now();
      try {
        return await originalInvoke<T>(command, args);
      } finally {
        target?.push({ command, ms: performance.now() - start });
      }
    };
    let previousPixels: string[] | undefined;
    harness.observe((revision, result) => {
      if (revision === provider.revision) finish?.(result);
    });
    const measure = async (
      phase: string,
      round: number,
      edit: () => void,
      resume = false,
    ) => {
      let timer: ReturnType<typeof setTimeout>;
      const ready = new Promise<
        Preview & { profiling?: Record<string, number> }
      >((resolve, reject) => {
        finish = resolve;
        timer = setTimeout(
          () => reject(new Error(`No preview: ${phase} ${round}`)),
          30000,
        );
      });
      const start = performance.now();
      calls = [];
      edit();
      if (resume) harness.resume();
      const result = await ready;
      clearTimeout(timer!);
      finish = undefined;
      const publishedMs = performance.now() - start;
      await painted();
      const frameMs = performance.now() - start;
      const ipc = calls;
      calls = undefined;
      // Hash outside the measured path, so equivalence checking cannot skew it.
      const pixels = await hashes(result);
      const changedPages = previousPixels
        ? pixels.filter((p, i) => p !== previousPixels![i]).length +
          Math.max(0, previousPixels.length - pixels.length)
        : pixels.length;
      previousPixels = pixels;
      samples.push({
        revision: result.revision,
        phase,
        round,
        frameMs,
        publishedMs,
        backendMs: result.elapsedMs,
        timings: result.timings,
        pages: result.pages.length,
        pixels,
        changedPages,
        dimensions: (result.pages as BinaryPage[]).map((p) => [
          p.width,
          p.height,
        ]),
        profiling: result.profiling,
        ipc,
      });
    };
    await measure(
      "first-math-render",
      0,
      () => editor.commands.setContent(corpus.document),
      true,
    );
    for (const phase of ["prose-edit", "formula-edit"]) {
      for (let round = 0; round < (config.cache === "cold" ? 6 : 16); round++) {
        await measure(phase, round, () => {
          if (phase === "prose-edit")
            editor.commands.insertContentAt(1, String.fromCharCode(97 + round));
          else {
            let position: number | undefined;
            editor.state.doc.descendants((node, pos) => {
              if (node.type.name === "mathBlock" && position === undefined)
                position = pos + node.nodeSize - 1;
            });
            editor.commands.insertContentAt(position!, " + 1");
          }
        });
      }
      await transport.invoke("diagnostic_event", {
        target: "main",
        step: "progress",
        payload: { ...config, phase, samples: samples.length },
      });
    }
    if (provider.rejected) throw new Error("Native publication was rejected");
    await transport.invoke("diagnostic_finish", {
      report: {
        success: true,
        config,
        samples,
        userAgent: navigator.userAgent,
        visibility: document.visibilityState,
        viewport: {
          width: innerWidth,
          height: innerHeight,
          dpr: devicePixelRatio,
        },
      },
    });
  } catch (error) {
    await transport.invoke("diagnostic_finish", {
      report: { success: false, samples, error: String(error) },
    });
  }
}
