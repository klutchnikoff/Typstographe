// Run only full and differential RGBA: the production UI change is renderer-independent.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
const root = fileURLToPath(new URL("../../", import.meta.url));
const variant = process.argv[2];
if (!["before", "after"].includes(variant))
  throw Error("Expected before or after");
let code = await readFile(
  resolve(root, "experiments/preview-renderers/run.mjs"),
  "utf8",
);
for (const [old, value] of [
  ["output/preview-renderers", `output/ui-refresh-${variant}`],
  ["typstographe-renderer-comparison", `typstographe-ui-refresh-${variant}`],
  [
    'const modes = ["rgba-full", "rgba-delta", "reflexo"];',
    'const modes = ["rgba-full", "rgba-delta"];',
  ],
]) {
  if (code.split(old).length !== 2)
    throw Error(`Unexpected insertion point: ${old}`);
  code = code.replace(old, value);
}
const copy = resolve(root, `output/ui-refresh-${variant}/run-native-copy.mjs`);
await writeFile(copy, code);
await import(pathToFileURL(copy).href);
