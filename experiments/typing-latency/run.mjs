import { spawn, execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
const root = fileURLToPath(new URL("../../", import.meta.url)),
  variant = process.argv[2];
if (!["before", "after"].includes(variant))
  throw Error("Expected before or after");
if (process.platform === "darwin")
  execFileSync(
    "swift",
    [resolve(root, "experiments/typing-latency/check-display.swift")],
    { stdio: "inherit" },
  );
const output = resolve(root, `output/typing-latency-${variant}`);
const manifest = JSON.parse(
  await readFile(resolve(output, "manifest.json"), "utf8"),
);
const batch = await mkdtemp(resolve(output, "run-")),
  reports = [],
  discarded = [];
const smoke = process.argv.includes("--smoke");
for (let run = 0; run < (smoke ? 1 : 2); run++)
  for (const count of smoke ? [200] : [10, 50, 200]) {
    const modes = ["on", "off"];
    if (run) modes.reverse();
    for (const preview of modes) {
      let report;
      for (let attempt = 0; attempt < 3; attempt++) {
        const folder = resolve(batch, `${count}-${preview}-${run}-${attempt}`);
        await mkdir(folder);
        const child = spawn(
          resolve(
            root,
            `target/release/typstographe-typing-latency-${variant}`,
          ),
          ["--diagnostic-performance", "--session-dir", folder],
          {
            env: {
              ...process.env,
              TOG_TYPING_CORPUS: `article-${count}`,
              TOG_TYPING_PREVIEW: preview,
            },
            stdio: ["ignore", "pipe", "pipe"],
          },
        );
        let log = "";
        for (const stream of [child.stdout, child.stderr])
          stream.on("data", (d) => {
            log += d;
            process.stderr.write(d);
          });
        const timer = setTimeout(() => child.kill(), 120000);
        const code = await new Promise((r, j) => {
          child.once("exit", r);
          child.once("error", j);
        });
        clearTimeout(timer);
        await writeFile(resolve(folder, "native.log"), log);
        report = JSON.parse(
          await readFile(
            resolve(folder, "native-performance-report.json"),
            "utf8",
          ),
        );
        if (code === 0 && report.success) break;
        discarded.push({ count, preview, run, attempt, error: report.error });
        if (attempt < 2 && /hidden|Suspended/.test(report.error || ""))
          continue;
        throw Error(JSON.stringify({ code, folder, error: report.error }));
      }
      if (
        report.coreFingerprint !== manifest.core_fingerprint ||
        report.frontendFingerprint !== manifest.frontend_fingerprint
      )
        throw Error("Compiled fingerprint mismatch");
      report.run = run;
      reports.push(report);
      await writeFile(
        resolve(output, smoke ? "smoke-raw.json" : "raw.json"),
        JSON.stringify({ manifest, discarded, reports }, null, 2) + "\n",
      );
    }
  }
console.log(
  JSON.stringify({
    success: true,
    variant,
    sessions: reports.length,
    discarded,
  }),
);
