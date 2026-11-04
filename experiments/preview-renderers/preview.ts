// Replaces the existing recipe module ONLY in a disposable checkout.
import type { Editor } from "@tiptap/core";
import type { Provider, Transport } from "./provider";
import { decodeFrame } from "./preview-frame";
import { candidatePages, publishedBase } from "./renderer-candidate";
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
let ink: { darkSamples: number; totalSamples: number }[] = [];
async function hashes(
  container: ParentNode = document.getElementById("pages")!,
) {
  const values: string[] = [];
  const inkValues: { darkSamples: number; totalSamples: number }[] = [];
  for (const canvas of container.querySelectorAll("canvas")) {
    const data = canvas
      .getContext("2d")!
      .getImageData(0, 0, canvas.width, canvas.height).data;
    let darkSamples = 0,
      totalSamples = 0;
    for (let i = 0; i < data.length; i += 16) {
      if (data[i] + data[i + 1] + data[i + 2] < 600) darkSamples++;
      totalSamples++;
    }
    inkValues.push({ darkSamples, totalSamples });
    const hash = await crypto.subtle.digest("SHA-256", data);
    values.push(
      Array.from(new Uint8Array(hash), (n) =>
        n.toString(16).padStart(2, "0"),
      ).join(""),
    );
  }
  ink = inkValues;
  return values;
}
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
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
      benchmark: {
        corpus: string;
        language: string;
        cache: string;
        renderer: string;
      };
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
          () =>
            reject(
              new Error(
                `No preview: ${phase} ${round}; ${(window as any).__rendererError || document.getElementById("message")?.textContent}`,
              ),
            ),
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
      const pixels = await hashes();
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
        pages: result.pageSizes!.length,
        candidate: result.candidate,
        candidateProfile: (result as any).candidateProfile,
        pixels,
        changedPages,
        ink,
        dimensions: Array.from(
          document.querySelectorAll("#pages canvas"),
          (p) => [
            (p as HTMLCanvasElement).width,
            (p as HTMLCanvasElement).height,
          ],
        ),
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
    // Full replay of the final state, outside all latency samples. Checks actual
    // displayed canvas pixels rather than merely equal packet hashes.
    await harness.pause();
    const before = await hashes();
    const replay = decodeFrame(
      await originalInvoke<ArrayBuffer>("preview_frame", {
        snapshot: harness.snapshot(),
        encoding: "rgba",
        baseRevision: null,
      }),
    );
    if (!replay.candidate?.reset) throw new Error("Full replay did not reset");
    const detached = document.createElement("div");
    detached.append(...(await candidatePages(replay, detached, () => true)));
    const full = await hashes(detached);
    if (JSON.stringify(before) !== JSON.stringify(full))
      throw new Error("Incremental/full replay pixel mismatch");
    const correctness: any = {
      fullReplayPixelsEqual: true,
      fullReplayPages: full.length,
      sync: [],
    };
    // First/middle/last text targets exercise both changed and reused pages.
    const positions: number[] = [];
    editor.state.doc.descendants((node, pos, parent) => {
      if (
        node.isText &&
        parent?.type.name === "paragraph" &&
        node.text!.length > 20
      )
        positions.push(pos + 5);
    });
    for (const position of [
      positions[0],
      positions[Math.floor(positions.length / 2)],
      positions.at(-1)!,
    ]) {
      const revision = provider.revision;
      const point = await originalInvoke<any>("sync_forward", {
        revision,
        position,
      });
      if (!point) throw new Error(`Missing forward sync ${position}`);
      const backward = await originalInvoke<number | null>("sync_backward", {
        revision,
        location: point,
      });
      const selection = await originalInvoke<any[]>("sync_selection", {
        revision,
        from: position - 2,
        to: position + 4,
      });
      if (backward === null || !selection.length)
        throw new Error("Missing backward/selection sync");
      const page = document.querySelector<HTMLElement>(
        `#pages [data-page="${point.page}"]`,
      )!;
      const canvas = page.querySelector("canvas")!,
        size = replay.pageSizes![point.page];
      const rect = canvas.getBoundingClientRect();
      editor.commands.setTextSelection(1);
      page.dispatchEvent(
        new MouseEvent("dblclick", {
          bubbles: true,
          clientX: rect.left + (point.point[0] * rect.width) / size[0],
          clientY: rect.top + (point.point[1] * rect.height) / size[1],
        }),
      );
      for (let i = 0; i < 100 && editor.state.selection.from !== backward; i++)
        await sleep(10);
      if (editor.state.selection.from !== backward)
        throw new Error("Displayed page backward handler failed");
      editor.commands.setTextSelection({
        from: position - 2,
        to: position + 4,
      });
      for (let i = 0; i < 100 && !document.querySelector("#pages polygon"); i++)
        await sleep(10);
      if (!document.querySelector("#pages polygon"))
        throw new Error("Displayed selection overlay failed");
      correctness.sync.push({
        position,
        point,
        backward,
        highlights: selection,
      });
    }
    let mathPosition: number | undefined;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "mathBlock" && mathPosition === undefined)
        mathPosition = pos + 3;
    });
    const mathPoint = await originalInvoke<any>("sync_forward", {
      revision: provider.revision,
      position: mathPosition,
    });
    correctness.mathSync = {
      position: mathPosition,
      point: mathPoint,
      backward: mathPoint
        ? await originalInvoke("sync_backward", {
            revision: provider.revision,
            location: mathPoint,
          })
        : null,
    };
    // Deliberately discard a completed delta. Next publication must recover from
    // the last actually published base, not silently apply a broken delta chain.
    editor.commands.insertContentAt(1, "z");
    await provider.flush();
    const discarded = decodeFrame(
      await originalInvoke<ArrayBuffer>("preview_frame", {
        snapshot: harness.snapshot(),
        encoding: "rgba",
        baseRevision: publishedBase(),
      }),
    );
    if (await harness.show(replay)) throw new Error("Stale view was published");
    if (JSON.stringify(before) !== JSON.stringify(await hashes()))
      throw new Error("Stale view changed displayed pixels");
    correctness.staleViewRejected = true;
    const recover = decodeFrame(
      await originalInvoke<ArrayBuffer>("preview_frame", {
        snapshot: harness.snapshot(),
        encoding: "rgba",
        baseRevision: publishedBase(),
      }),
    );
    if (!recover.candidate?.reset || !(await harness.show(recover)))
      throw new Error("Discarded delta recovery failed");
    correctness.discardedDelta = {
      revision: discarded.revision,
      recovered: recover.candidate.reset,
    };
    try {
      await originalInvoke("sync_forward", {
        revision: replay.revision,
        position: 1,
      });
      throw new Error("Stale revision accepted");
    } catch (error) {
      if (String(error).includes("Stale revision accepted")) throw error;
      correctness.staleSyncRejected = true;
    }
    // A full document reflow changes page count. This also checks removals and
    // stale page DOM cleanup; then restore the complete article.
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Court document de contrôle." }],
        },
      ],
    });
    await provider.flush();
    const short = decodeFrame(
      await originalInvoke<ArrayBuffer>("preview_frame", {
        snapshot: harness.snapshot(),
        encoding: "rgba",
        baseRevision: publishedBase(),
      }),
    );
    if (
      !(await harness.show(short)) ||
      document.querySelectorAll("#pages canvas").length !== 1
    )
      throw new Error("Page removal failed");
    editor.commands.setContent(corpus.document);
    await provider.flush();
    const restored = decodeFrame(
      await originalInvoke<ArrayBuffer>("preview_frame", {
        snapshot: harness.snapshot(),
        encoding: "rgba",
        baseRevision: publishedBase(),
      }),
    );
    if (
      !(await harness.show(restored)) ||
      document.querySelectorAll("#pages canvas").length !==
        restored.pageSizes!.length
    )
      throw new Error("Page insertion failed");
    correctness.reflow = {
      short: short.pageSizes!.length,
      restored: restored.pageSizes!.length,
    };
    if (provider.rejected) throw new Error("Native publication was rejected");
    await transport.invoke("diagnostic_finish", {
      report: {
        success: true,
        config,
        samples,
        correctness,
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
