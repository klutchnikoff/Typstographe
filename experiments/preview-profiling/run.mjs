import { spawn, execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
const root = fileURLToPath(new URL("../../", import.meta.url));
const output = resolve(root, "output/preview-profiling");
const binary = resolve(root, "target/release/typstographe-preview-profile");
const smoke = process.argv.includes("--smoke");
const batch = await mkdtemp(resolve(output, "run-"));
const reports = [];
const discarded = [];
for (let run = 0; run < (smoke ? 1 : 2); run++) {
  const cases = (smoke ? [10] : [10, 50, 200]).map((count) => ({
    corpus: `article-${count}`,
    cache: "warm",
  }));
  if (!smoke) cases.push({ corpus: "article-200", cache: "cold" });
  for (let i = 0; i < cases.length; i++)
    for (const language of (i + run) % 2
      ? ["typst", "latex"]
      : ["latex", "typst"]) {
      const config = { ...cases[i], language };
      let report;
      for (let attempt = 0; attempt < 3; attempt++) {
        const folder = resolve(
          batch,
          `${config.corpus}-${language}-${config.cache}-${run}-${attempt}`,
        );
        await mkdir(folder);
        const child = spawn(
          binary,
          ["--diagnostic-performance", "--session-dir", folder],
          {
            env: {
              ...process.env,
              TOG_PROFILE_CORPUS: config.corpus,
              TOG_PROFILE_LANGUAGE: language,
              TOG_PROFILE_CACHE: config.cache,
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
        report = JSON.parse(
          await readFile(
            resolve(folder, "native-performance-report.json"),
            "utf8",
          ),
        );
        if (code === 0 && report.success) break;
        discarded.push({ config, run, attempt, error: report.error, folder });
        if (attempt < 2 && /hidden|Suspended frames/.test(report.error || "")) {
          console.error(
            `Discarded hidden/suspended window; restarting the entire isolated run: ${JSON.stringify(config)}`,
          );
          continue;
        }
        throw new Error(
          JSON.stringify({ code, config, error: report.error, folder }),
        );
      }
      report.run = run;
      for (const sample of report.samples) {
        sample.native = Object.fromEntries(
          ["preview-worker", "renderer", "typst"].map((stage) => [
            stage,
            report.nativeProfiling.findLast(
              (r) => r.stage === stage && r.revision === sample.revision,
            ),
          ]),
        );
        sample.sources = report.nativeProfiling.filter(
          (r) => r.stage === "source" && r.revision === sample.revision,
        );
        if (Object.values(sample.native).some((r) => !r))
          throw new Error(
            `Missing native profile: ${JSON.stringify(config)} ${sample.revision}`,
          );
      }
      reports.push(report);
      await writeFile(
        resolve(output, smoke ? "smoke-raw.json" : "preview-raw.json"),
        JSON.stringify(reports, null, 2) + "\n",
      );
    }
}
let pairedStates = 0;
for (const a of reports.filter((r) => r.config.language === "latex")) {
  const b = reports.find(
    (r) =>
      r.config.language === "typst" &&
      r.config.corpus === a.config.corpus &&
      r.config.cache === a.config.cache &&
      r.run === a.run,
  );
  for (let i = 0; i < a.samples.length; i++) {
    if (
      JSON.stringify(a.samples[i].pixels) !==
        JSON.stringify(b.samples[i].pixels) ||
      JSON.stringify(a.samples[i].dimensions) !==
        JSON.stringify(b.samples[i].dimensions)
    )
      throw new Error(
        `Native Typst pixel mismatch ${a.config.corpus} ${a.config.cache} run ${a.run} sample ${i}`,
      );
    pairedStates++;
  }
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
    const metrics = {
      publishedMs: (s) => s.publishedMs,
      frameMs: (s) => s.frameMs,
      changedPages: (s) => s.changedPages,
      bytes: (s) => s.profiling.frameBytes,
      flushMs: (s) => s.profiling.flushMs,
      jsSnapshotMs: (s) => s.profiling.snapshotMs,
      requestMs: (s) => s.profiling.requestMs,
      decodeMs: (s) => s.profiling.decodeMs,
      showMs: (s) => s.profiling.showAndPublishMs,
      canvasAllocateMs: (s) => s.profiling.canvasAllocateMs,
      putImageDataMs: (s) => s.profiling.putImageDataMs,
      domPublishMs: (s) => s.profiling.domPublishMs,
      dispatchWaitMs: (s) => s.native["preview-worker"].dispatchWaitMs,
      lockWaitMs: (s) => s.native["preview-worker"].lockWaitMs,
      nativeSnapshotMs: (s) => s.native["preview-worker"].snapshotMs,
      mapMs: (s) => s.native["preview-worker"].mapMs,
      nativeMs: (s) => s.native["preview-worker"].nativeMs,
      prepareMs: (s) => s.timings.prepareMs,
      compileMs: (s) => s.timings.compileMs,
      engineMs: (s) => s.native.typst.engineMs,
      rasterMs: (s) => s.timings.rasterMs,
      rgbaMs: (s) => s.timings.rgbaMs,
      syncMs: (s) => s.timings.syncMs,
      packetMs: (s) => s.native.renderer.packetMs,
      ipcResidualMs: (s) =>
        s.profiling.requestMs -
        s.native["preview-worker"].nativeMs -
        s.native["preview-worker"].dispatchWaitMs,
      relayIpcMs: (s) =>
        s.ipc
          .filter((x) => x.command === "relay")
          .reduce((a, x) => a + x.ms, 0),
      sourceUpdateMs: (s) => s.sources.reduce((a, x) => a + x.ms, 0),
    };
    summary.push({
      config: r.config,
      phase,
      n: samples.length,
      pages: samples[0].pages,
      metrics: Object.fromEntries(
        Object.entries(metrics).map(([key, get]) => [
          key,
          {
            p50: percentile(samples.map(get), 0.5),
            p95: percentile(samples.map(get), 0.95),
          },
        ]),
      ),
    });
  }
const result = {
  success: true,
  discarded,
  pairedStates,
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
    { success: true, pairedStates, runs: reports.length, output },
    null,
    2,
  ),
);
