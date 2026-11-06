import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
const root = fileURLToPath(new URL("../../", import.meta.url));
const read = async (name) =>
  JSON.parse(await readFile(resolve(root, name), "utf8"));
const before = await read("output/ui-refresh-before/renderer-raw.json");
const after = await read("output/ui-refresh-after/renderer-raw.json");
const equal = (a, b, label) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw Error(`Changed ${label}`);
};
let pairedStates = 0;
for (const a of before) {
  const b = after.find(
    (b) =>
      JSON.stringify(a.config) === JSON.stringify(b.config) && a.run === b.run,
  );
  if (!b || !a.success || !b.success) throw Error("Missing successful pair");
  equal(a.samples.length, b.samples.length, "sample count");
  for (let i = 0; i < a.samples.length; i++) {
    for (const key of ["sourceSha", "pixels", "dimensions", "phase", "round"])
      equal(a.samples[i][key], b.samples[i][key], key);
    pairedStates++;
  }
  equal(a.correctness, b.correctness, "navigation and replay guarantees");
}
equal(before.length, after.length, "session count");
const percentile = (values, p) =>
  [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1];
const getters = {
  publishedMs: (s) => s.publishedMs,
  frameMs: (s) => s.frameMs,
  commandMs: (s) => s.pipeline.marks["command.returned"],
  renderEnterMs: (s) => s.pipeline.marks["render.enter"],
  uiMs: (s) => s.pipeline.spans["ui.refresh"]?.ms ?? 0,
  uiCalls: (s) => s.pipeline.spans["ui.refresh"]?.calls ?? 0,
  dispatchMs: (s) => s.pipeline.spans["editor.dispatch"]?.ms ?? 0,
  dispatchCalls: (s) => s.pipeline.spans["editor.dispatch"]?.calls ?? 0,
  referenceMs: (s) => s.pipeline.spans["references.publish"]?.ms ?? 0,
  referenceTransactions: (s) =>
    s.pipeline.spans["references.transaction"]?.calls ?? 0,
  countRequests: (s) => s.ipc.filter((x) => x.command === "count_text").length,
  compileMs: (s) => s.timings.compileMs,
  mapMs: (s) => s.native["preview-worker"].mapMs,
  syncMs: (s) => s.timings.syncMs,
  bytes: (s) => s.profiling.frameBytes,
};
const summary = [];
for (const variant of ["before", "after"]) {
  const reports = variant === "before" ? before : after;
  for (const r of reports.filter((r) => r.run === 0))
    for (const phase of ["first-math-render", "prose-edit", "formula-edit"]) {
      const samples = reports
        .filter((x) => JSON.stringify(x.config) === JSON.stringify(r.config))
        .flatMap((x) => x.samples)
        .filter(
          (s) =>
            s.phase === phase && (phase === "first-math-render" || s.round > 0),
        );
      summary.push({
        variant,
        config: r.config,
        phase,
        n: samples.length,
        pages: samples[0].pages,
        metrics: Object.fromEntries(
          Object.entries(getters).map(([name, get]) => {
            const values = samples.map(get);
            if (values.some((v) => !Number.isFinite(v)))
              throw Error(`Missing metric ${name}`);
            return [
              name,
              { p50: percentile(values, 0.5), p95: percentile(values, 0.95) },
            ];
          }),
        ),
      });
    }
}
const environment = await Promise.all(
  ["before", "after"].map((v) => read(`output/ui-refresh-${v}/summary.json`)),
);
const result = {
  success: true,
  sessions: before.length + after.length,
  pairedStates,
  environment: environment[0].environment,
  manifests: environment.map((e) => e.manifest),
  discarded: environment.map((e) => e.discarded),
  summary,
};
const output = resolve(root, "experiments/ui-refresh/results");
await mkdir(output, { recursive: true });
for (const [name, value] of [
  ["before-raw", before],
  ["after-raw", after],
  ["summary", result],
])
  await writeFile(
    resolve(output, `${name}.json`),
    JSON.stringify(value, null, 2) + "\n",
  );
console.log(
  JSON.stringify({ success: true, sessions: result.sessions, pairedStates }),
);
