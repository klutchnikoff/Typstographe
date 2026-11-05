import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
import os from "node:os";
import { execFileSync } from "node:child_process";
const root = fileURLToPath(new URL("../../", import.meta.url));
const series = process.env.TOG_TYPING_SERIES || "typing-latency";
if (!/^[a-z0-9-]+$/.test(series)) throw Error("Invalid series name");
const variants = process.argv.includes("--baseline")
  ? ["before"]
  : ["before", "after"];
const datasets = await Promise.all(
  variants.map(async (variant) => ({
    variant,
    ...JSON.parse(
      await readFile(
        resolve(root, `output/${series}-${variant}/raw.json`),
        "utf8",
      ),
    ),
  })),
);
const percentile = (values, p) =>
  [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1];
const stats = (values) => ({
  n: values.length,
  p50: percentile(values, 0.5),
  p95: percentile(values, 0.95),
  max: Math.max(...values),
});
const summary = [];
let checked = 0;
const equal = (a, b, label) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw Error(`Changed ${label}`);
};
for (const data of datasets)
  for (const report of data.reports) {
    if (
      !report.success ||
      report.coreFingerprint !== data.manifest.core_fingerprint ||
      report.frontendFingerprint !== data.manifest.frontend_fingerprint
    )
      throw Error("Unverified input run");
    const a = datasets[0].reports.find(
      (r) =>
        r.config.corpus === report.config.corpus &&
        r.run === report.run &&
        r.config.preview === "on",
    );
    equal(a.final, report.final, "final source/pixels/selection/text");
    equal(a.navigation, report.navigation, "navigation");
    checked++;
  }
for (const { variant, reports } of datasets)
  for (const corpus of ["article-10", "article-50", "article-200"])
    for (const preview of ["on", "off"])
      for (const cadence of [100, 250]) {
        const runs = reports.filter(
          (r) => r.config.corpus === corpus && r.config.preview === preview,
        );
        const phases = runs
          .flatMap((r) => r.phases)
          .filter((p) => p.cadence === cadence);
        if (phases.length !== 2)
          throw Error("Expected two fresh processes per cell");
        const samples = phases.flatMap((p) => p.samples.slice(2));
        const spans = phases.flatMap((p) => p.spans);
        const getters = {
          workerJitterMs: (s) => s.sent - s.due,
          queuedMs: (s) => s.received - s.sent,
          deadlineMs: (s) => s.received - s.due,
          nativeEditMs: (s) => s.returned - s.received,
          nextFrameMs: (s) => s.firstFrame - s.due,
          twoFramesMs: (s) => s.secondFrame - s.due,
        };
        summary.push({
          variant,
          corpus,
          preview,
          cadence,
          pages: runs[0].pages,
          metrics: Object.fromEntries(
            Object.entries(getters).map(([k, get]) => [
              k,
              stats(samples.map(get)),
            ]),
          ),
          frames: stats(
            phases.flatMap((p) =>
              [p.start, ...p.frames, p.end]
                .slice(1)
                .map((v, i) => v - [p.start, ...p.frames, p.end][i]),
            ),
          ),
          spans: Object.fromEntries(
            [...new Set(spans.map((s) => s.name))].map((name) => [
              name,
              stats(spans.filter((s) => s.name === name).map((s) => s.ms)),
            ]),
          ),
          previewBytes: phases.map((p) =>
            p.ipc
              .filter(
                (c) =>
                  ["preview_frame", "preview_delta"].includes(c.command) &&
                  !c.error,
              )
              .map((c) => c.bytes),
          ),
          previewRequests: phases.map(
            (p) =>
              p.ipc.filter((c) =>
                ["preview_frame", "preview_delta"].includes(c.command),
              ).length,
          ),
          previewStale: phases.map(
            (p) =>
              p.ipc.filter(
                (c) =>
                  ["preview_frame", "preview_delta"].includes(c.command) &&
                  c.error,
              ).length,
          ),
          trustedInputEvents: phases.map(
            (p) => p.inputs.filter((i) => i.trusted).length,
          ),
        });
      }
const output = resolve(
  root,
  "experiments/typing-latency/results",
  ...(series === "typing-latency" ? [] : [series]),
);
await mkdir(output, { recursive: true });
const result = {
  success: true,
  sessions: checked,
  environment: {
    cpu: os.cpus()[0].model,
    ram: os.totalmem(),
    os: os.release(),
    arch: os.arch(),
    node: process.version,
    rustc: execFileSync("rustc", ["--version"], { encoding: "utf8" }).trim(),
  },
  manifests: datasets.map((d) => d.manifest),
  discarded: datasets.map((d) => d.discarded),
  summary,
};
await writeFile(
  resolve(output, variants.length === 1 ? "baseline.json" : "summary.json"),
  JSON.stringify(result, null, 2) + "\n",
);
for (const data of datasets)
  await writeFile(
    resolve(output, `${data.variant}-raw.json.gz`),
    gzipSync(JSON.stringify(data) + "\n"),
  );
console.log(JSON.stringify({ success: true, sessions: checked }));
