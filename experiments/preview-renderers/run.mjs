import { spawn, execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
const root = fileURLToPath(new URL("../../", import.meta.url));
const output = resolve(root, "output/preview-renderers");
const binary = resolve(root, "target/release/typstographe-renderer-comparison");
const smoke = process.argv.includes("--smoke");
const only = process.argv.find((x) => x.startsWith("--mode="))?.split("=")[1];
const batch = await mkdtemp(resolve(output, "run-"));
const reports = [],
  discarded = [];
for (let run = 0; run < (smoke ? 1 : 2); run++)
  for (const count of smoke ? [10] : [10, 50, 200]) {
    const modes = ["rgba-full", "rgba-delta", "reflexo"];
    if (run) modes.reverse();
    for (const renderer of modes.filter((x) => !only || x === only)) {
      const config = {
        corpus: `article-${count}`,
        language: "latex",
        cache: "warm",
        renderer,
      };
      let report;
      for (let attempt = 0; attempt < 3; attempt++) {
        const folder = resolve(
          batch,
          `${config.corpus}-${renderer}-${run}-${attempt}`,
        );
        await mkdir(folder);
        const child = spawn(
          binary,
          ["--diagnostic-performance", "--session-dir", folder],
          {
            env: {
              ...process.env,
              TOG_PROFILE_CORPUS: config.corpus,
              TOG_PROFILE_LANGUAGE: "latex",
              TOG_PROFILE_CACHE: "warm",
              TOG_RENDERER: renderer,
            },
            stdio: ["ignore", "pipe", "pipe"],
          },
        );
        let log = "";
        for (const stream of [child.stdout, child.stderr])
          stream.on("data", (data) => {
            log += data;
            process.stderr.write(data);
          });
        const timeout = setTimeout(() => child.kill(), 240000);
        const code = await new Promise((resolve, reject) => {
          child.on("exit", resolve);
          child.on("error", reject);
        });
        clearTimeout(timeout);
        await writeFile(resolve(folder, "native.log"), log);
        try {
          report = JSON.parse(
            await readFile(
              resolve(folder, "native-performance-report.json"),
              "utf8",
            ),
          );
        } catch (error) {
          throw new Error(
            JSON.stringify({ code, folder, error: String(error) }),
          );
        }
        if (code === 0 && report.success) break;
        discarded.push({ config, run, attempt, error: report.error, folder });
        if (attempt < 2 && /hidden|Suspended frames/.test(report.error || ""))
          continue;
        throw new Error(JSON.stringify({ code, folder, error: report.error }));
      }
      report.run = run;
      for (const sample of report.samples)
        sample.native = Object.fromEntries(
          ["preview-worker", "renderer", "typst"].map((stage) => [
            stage,
            report.nativeProfiling.find(
              (r) => r.stage === stage && r.revision === sample.revision,
            ),
          ]),
        );
      reports.push(report);
      await writeFile(
        resolve(output, smoke ? "smoke-raw.json" : "renderer-raw.json"),
        JSON.stringify(reports, null, 2) + "\n",
      );
    }
  }
let pixelPairs = 0,
  syncPairs = 0;
for (const a of reports.filter((r) => r.config.renderer === "rgba-full"))
  for (const mode of ["rgba-delta", "reflexo"]) {
    const b = reports.find(
      (r) =>
        r.config.renderer === mode &&
        r.config.corpus === a.config.corpus &&
        r.run === a.run,
    );
    if (!b) continue;
    for (let i = 0; i < a.samples.length; i++) {
      if (
        JSON.stringify(a.samples[i].dimensions) !==
        JSON.stringify(b.samples[i].dimensions)
      )
        throw new Error(`Layout mismatch ${mode}`);
      if (mode === "rgba-delta") {
        if (
          JSON.stringify(a.samples[i].pixels) !==
          JSON.stringify(b.samples[i].pixels)
        )
          throw new Error("RGBA full/delta pixel mismatch");
        pixelPairs++;
      }
    }
    if (
      JSON.stringify([a.correctness.sync, a.correctness.mathSync]) !==
      JSON.stringify([b.correctness.sync, b.correctness.mathSync])
    )
      throw new Error(`Sync mismatch ${mode}`);
    syncPairs++;
  }
const percentile = (values, p) =>
  [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1];
const summary = [];
for (const r of reports)
  for (const phase of ["first-math-render", "prose-edit", "formula-edit"]) {
    if (
      summary.some(
        (s) =>
          JSON.stringify(s.config) === JSON.stringify(r.config) &&
          s.phase === phase,
      )
    )
      continue;
    const samples = reports
      .filter((x) => JSON.stringify(x.config) === JSON.stringify(r.config))
      .flatMap((x) => x.samples)
      .filter(
        (s) =>
          s.phase === phase && (phase === "first-math-render" || s.round > 0),
      );
    const getters = {
      publishedMs: (s) => s.publishedMs,
      frameMs: (s) => s.frameMs,
      bytes: (s) => s.profiling.frameBytes,
      changedPages: (s) => s.changedPages,
      reusedPages: (s) => s.candidateProfile.reusedPages,
      drawnPages: (s) => s.candidateProfile.drawnPages,
      flushMs: (s) => s.profiling.flushMs,
      requestMs: (s) => s.profiling.requestMs,
      showMs: (s) => s.profiling.showAndPublishMs,
      compileMs: (s) => s.timings.compileMs,
      keyMs: (s) => s.candidate.keyMs,
      rasterMs: (s) => s.candidate.rasterMs,
      rgbaMs: (s) => s.candidate.rgbaMs,
      vectorMs: (s) => s.candidate.vectorMs,
      vectorMergeMs: (s) => s.candidateProfile.vectorMergeMs,
      vectorDrawMs: (s) => s.candidateProfile.vectorDrawMs,
      rgbaPutMs: (s) => s.candidateProfile.rgbaPutMs,
      syncMs: (s) => s.timings.syncMs,
      nativeMs: (s) => s.native["preview-worker"].nativeMs,
      ipcResidualMs: (s) =>
        s.profiling.requestMs -
        s.native["preview-worker"].nativeMs -
        s.native["preview-worker"].dispatchWaitMs,
    };
    summary.push({
      config: r.config,
      phase,
      n: samples.length,
      pages: samples[0].pages,
      metrics: Object.fromEntries(
        Object.entries(getters).map(([key, get]) => {
          const values = samples.map(get);
          if (values.some((v) => !Number.isFinite(v)))
            throw new Error(`Missing metric ${key}`);
          return [
            key,
            { p50: percentile(values, 0.5), p95: percentile(values, 0.95) },
          ];
        }),
      ),
    });
  }
const result = {
  success: true,
  pixelPairs,
  syncPairs,
  discarded,
  environment: {
    cpu: os.cpus()[0].model,
    ram: os.totalmem(),
    os: os.release(),
    arch: os.arch(),
    rustc: execFileSync("rustc", ["--version"], { encoding: "utf8" }).trim(),
  },
  manifest: JSON.parse(
    await readFile(resolve(output, "manifest.json"), "utf8"),
  ),
  summary,
};
await writeFile(
  resolve(output, smoke ? "smoke-summary.json" : "summary.json"),
  JSON.stringify(result, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    { success: true, runs: reports.length, pixelPairs, syncPairs, output },
    null,
    2,
  ),
);
