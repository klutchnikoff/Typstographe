import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
const root = fileURLToPath(new URL("../../", import.meta.url));
const output = resolve(root, "output/tinymist-pipeline");
const native = JSON.parse(
  await readFile(resolve(output, "renderer-raw.json"), "utf8"),
);
const vscode = JSON.parse(
  await readFile(resolve(output, "vscode-raw.json"), "utf8"),
);
if (native.length !== 12 || vscode.length !== 12)
  throw Error("Expected twelve fresh processes for each application");
let checkedSources = 0,
  pairedGeometries = 0,
  nativeSyncPairs = 0;
for (const r of [...native, ...vscode]) {
  const name = r.config?.corpus || r.corpus;
  const { states } = JSON.parse(
    await readFile(resolve(output, `articles/${name}/states.json`), "utf8"),
  );
  if (!r.success || r.samples.length !== 33) throw Error("Incomplete run");
  for (let i = 0; i < states.length; i++) {
    const hash = createHash("sha256").update(states[i].source).digest("hex");
    if (r.samples[i].sourceSha !== hash)
      throw Error(`Source mismatch ${name} ${i}`);
    checkedSources++;
  }
}
for (const n of native) {
  const peers = vscode.filter(
    (v) => v.corpus === n.config.corpus && v.run === n.run,
  );
  for (const v of peers)
    for (let i = 0; i < n.samples.length; i++) {
      const a = n.samples[i],
        b = v.samples[i];
      if (
        a.sourceSha !== b.sourceSha ||
        JSON.stringify(a.dimensions) !==
          JSON.stringify(
            b.render.pages.map((p) => [
              Math.ceil(p.width * 2),
              Math.ceil(p.height * 2),
            ]),
          )
      )
        throw Error("Input/page geometry mismatch");
      pairedGeometries++;
    }
  if (
    !n.correctness.fullReplayPixelsEqual ||
    !n.correctness.staleViewRejected ||
    !n.correctness.staleSyncRejected ||
    !n.correctness.discardedDelta.recovered
  )
    throw Error("Native guarantees failed");
  if (n.config.renderer === "rgba-delta") {
    const b = native.find(
      (b) =>
        b.config.corpus === n.config.corpus &&
        b.run === n.run &&
        b.config.renderer === "reflexo",
    );
    if (
      JSON.stringify([n.correctness.sync, n.correctness.mathSync]) !==
      JSON.stringify([b.correctness.sync, b.correctness.mathSync])
    )
      throw Error("Native navigation mismatch");
    nativeSyncPairs++;
  }
}
if (
  vscode.some(
    (r) =>
      !r.navigation.backward ||
      r.clockUncertaintyMs > 3 ||
      r.samples.some(
        (s) =>
          s.render.visible !== "visible" ||
          s.render.publicationVisible !== "visible",
      ),
  )
)
  throw Error("VS Code visibility/navigation/clock check failed");
const pct = (a, p) => [...a].sort((a, b) => a - b)[Math.ceil(a.length * p) - 1];
const stats = (samples, get) => {
  const a = samples.map(get);
  if (a.some((v) => !Number.isFinite(v))) throw Error("Missing metric");
  return { p50: pct(a, 0.5), p95: pct(a, 0.95) };
};
const summary = [];
for (const count of [10, 50, 200])
  for (const phase of ["initial", "prose-edit", "formula-edit"]) {
    for (const mode of [
      "rgba-delta",
      "reflexo",
      "vscode-partial",
      "vscode-full",
    ]) {
      const isCode = mode.startsWith("vscode");
      const runs = (isCode ? vscode : native).filter(
        (r) =>
          (r.config?.corpus || r.corpus) === `article-${count}` &&
          (isCode
            ? r.partial === (mode === "vscode-partial")
            : r.config.renderer === mode),
      );
      const samples = runs
        .flatMap((r) => r.samples)
        .filter((s) =>
          phase === "initial"
            ? ["initial", "first-math-render"].includes(s.phase)
            : s.phase === phase && s.round > 0,
        );
      const getters = isCode
        ? {
            domPatchMs: (s) => s.publishedMs,
            frameMs: (s) => s.frameMs,
            editMs: (s) => s.editMs,
            mergeMs: (s) => s.render.mergeMs,
            svgDiffMs: (s) => s.render.svgMs,
            vectorBytes: (s) => s.render.bytes,
            svgElements: (s) => s.render.svgElements,
          }
        : {
            publishedMs: (s) => s.publishedMs,
            frameMs: (s) => s.frameMs,
            commandMs: (s) => s.pipeline.marks["command.returned"],
            renderEnterMs: (s) => s.pipeline.marks["render.enter"],
            uiRefreshMs: (s) => s.pipeline.spans["ui.refresh"]?.ms || 0,
            uiRefreshCalls: (s) => s.pipeline.spans["ui.refresh"]?.calls || 0,
            dispatchMs: (s) => s.pipeline.spans["editor.dispatch"]?.ms || 0,
            viewUpdateMs: (s) => s.pipeline.spans["editor.viewUpdate"]?.ms || 0,
            referencesMs: (s) =>
              s.pipeline.spans["references.publish"]?.ms || 0,
            flushMs: (s) => s.profiling.flushMs,
            requestMs: (s) => s.profiling.requestMs,
            showMs: (s) => s.profiling.showAndPublishMs,
            mapMs: (s) => s.native["preview-worker"].mapMs,
            snapshotMs: (s) => s.native["preview-worker"].snapshotMs,
            compileMs: (s) => s.timings.compileMs,
            syncMs: (s) => s.timings.syncMs,
            vectorMs: (s) => s.candidate.vectorMs,
            rgbaMs: (s) => s.candidate.rgbaMs,
            rasterMs: (s) => s.candidate.rasterMs,
          };
      summary.push({
        corpus: `article-${count}`,
        phase,
        mode,
        n: samples.length,
        metrics: Object.fromEntries(
          Object.entries(getters).map(([k, get]) => [k, stats(samples, get)]),
        ),
      });
    }
  }
const result = {
  success: true,
  nativeRuns: native.length,
  vscodeRuns: vscode.length,
  checkedSources,
  pairedGeometries,
  nativeSyncPairs,
  nativeCorrectnessSessions: native.filter(
    (r) => r.correctness.fullReplayPixelsEqual,
  ).length,
  vscodeBackwardChecks: vscode.filter((r) => r.navigation.backward).length,
  vscodeForwardDiagnostics: vscode.map((r) => ({
    corpus: r.corpus,
    partial: r.partial,
    run: r.run,
    observedScroll: r.navigation.forwardScroll,
  })),
  maxClockUncertaintyMs: Math.max(...vscode.map((r) => r.clockUncertaintyMs)),
  summary,
};
await writeFile(
  resolve(output, "pipeline-summary.json"),
  JSON.stringify(result, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    {
      success: true,
      checkedSources,
      pairedGeometries,
      nativeSyncPairs,
      maxClockUncertaintyMs: result.maxClockUncertaintyMs,
    },
    null,
    2,
  ),
);
for (const s of summary.filter(
  (s) => s.corpus === "article-200" && s.phase === "formula-edit",
))
  console.log(s.mode, s.metrics);
