import { spawn, execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
const root = fileURLToPath(new URL("../../", import.meta.url));
const output = resolve(root, "output/mitex-benchmark");
const binary = resolve(root, "target/release/typstographe-mitex-benchmark");
const corpora = JSON.parse(
  await readFile(resolve(output, "corpora.json"), "utf8"),
);
const conversion = JSON.parse(
  execFileSync(binary, ["--mitex-probe", resolve(output, "corpora.json")], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  }),
);
await writeFile(
  resolve(output, "conversion-raw.json"),
  JSON.stringify(conversion, null, 2) + "\n",
);
console.error(
  `Conversion equivalence verified: ${conversion.samples.length} corpus/round pairs.`,
);
if (process.argv.includes("--conversion-only")) process.exit(0);
const reports = [];
const batch = await mkdtemp(resolve(output, "run-"));
// Alternate order across corpora. One fresh process/session per engine/article.
for (let run = 0; run < 2; run++) {
  for (let i = 0; i < corpora.length; i++) {
    for (const engine of (i + run) % 2
      ? ["native", "wasm"]
      : ["wasm", "native"]) {
      const corpus = corpora[i].name;
      const folder = resolve(batch, `${corpus}-${engine}-${run}`);
      await mkdir(folder, { recursive: true });
      const child = spawn(
        binary,
        ["--diagnostic-performance", "--session-dir", folder],
        {
          env: {
            ...process.env,
            TOG_MITEX_ENGINE: engine,
            TOG_MITEX_CORPUS: corpus,
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
      const timer = setTimeout(() => child.kill(), 180000);
      const code = await new Promise((resolve, reject) => {
        child.on("exit", resolve);
        child.on("error", reject);
      });
      clearTimeout(timer);
      await writeFile(resolve(folder, "native.log"), log);
      const report = JSON.parse(
        await readFile(
          resolve(folder, "native-performance-report.json"),
          "utf8",
        ),
      );
      if (code !== 0 || !report.success)
        throw new Error(JSON.stringify({ code, report }));
      report.run = run;
      reports.push(report);
      await writeFile(
        resolve(output, "preview-raw.json"),
        JSON.stringify(reports, null, 2) + "\n",
      );
    }
  }
}
const percentile = (values, p) =>
  [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1];
const summary = [];
for (const corpus of corpora) {
  for (let run = 0; run < 2; run++) {
    const a = reports.find(
      (r) =>
        r.config.corpus === corpus.name &&
        r.config.engine === "wasm" &&
        r.run === run,
    );
    const b = reports.find(
      (r) =>
        r.config.corpus === corpus.name &&
        r.config.engine === "native" &&
        r.run === run,
    );
    for (let i = 0; i < a.samples.length; i++) {
      if (
        JSON.stringify(a.samples[i].pixels) !==
        JSON.stringify(b.samples[i].pixels)
      )
        throw new Error(`Pixel mismatch: ${corpus.name} ${i}`);
    }
  }
  for (const engine of ["wasm", "native"])
    for (const phase of ["first-math-render", "prose-edit", "formula-edit"]) {
      const samples = reports
        .filter(
          (r) => r.config.corpus === corpus.name && r.config.engine === engine,
        )
        .flatMap((r) => r.samples)
        .filter(
          (s) =>
            s.phase === phase && (phase === "first-math-render" || s.round > 0),
        );
      const row = {
        corpus: corpus.name,
        engine,
        phase,
        n: samples.length,
        pages: samples[0].pages,
      };
      for (const [label, get] of Object.entries({
        frameMs: (s) => s.frameMs,
        publishedMs: (s) => s.publishedMs,
        backendMs: (s) => s.backendMs,
        compileMs: (s) => s.timings.compileMs,
        rasterMs: (s) => s.timings.rasterMs,
        syncMs: (s) => s.timings.syncMs,
      })) {
        row[label] = {
          p50: percentile(samples.map(get), 0.5),
          p95: percentile(samples.map(get), 0.95),
        };
      }
      summary.push(row);
    }
}
const report = {
  success: true,
  environment: {
    cpu: os.cpus()[0].model,
    architecture: os.arch(),
    os: os.release(),
    ram: os.totalmem(),
  },
  manifest: JSON.parse(
    await readFile(resolve(output, "build-manifest.json"), "utf8"),
  ),
  pixelsIdentical: true,
  summary,
};
await writeFile(
  resolve(output, "results.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
