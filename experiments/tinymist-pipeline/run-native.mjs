// Reuse the validated native renderer runner, changing only its isolated paths/modes.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
const root = fileURLToPath(new URL("../../", import.meta.url));
let code = await readFile(
  resolve(root, "experiments/preview-renderers/run.mjs"),
  "utf8",
);
for (const [old, value] of [
  ["output/preview-renderers", "output/tinymist-pipeline"],
  ["typstographe-renderer-comparison", "typstographe-tinymist-pipeline"],
  [
    'const modes = ["rgba-full", "rgba-delta", "reflexo"];',
    'const modes = ["rgba-delta", "reflexo"];',
  ],
]) {
  if (code.split(old).length !== 2)
    throw Error(`Unexpected runner insertion point: ${old}`);
  code = code.replace(old, value);
}
const copy = resolve(root, "output/tinymist-pipeline/run-native-copy.mjs");
await writeFile(copy, code);
await import(pathToFileURL(copy).href);
