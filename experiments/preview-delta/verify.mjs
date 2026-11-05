// Native renderer correctness/transfer check. STDIO/base64 is diagnostic only;
// timings here must not be presented as production Tauri IPC or input latency.
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
const root = fileURLToPath(new URL("../../", import.meta.url));
const child = spawn(
  resolve(root, "target/release/typstographe-preview-delta-after"),
  [
    "--stdio",
    "--session-dir",
    await mkdtemp(resolve(tmpdir(), "tog-delta-verify-")),
  ],
  { stdio: ["pipe", "pipe", "inherit"] },
);
let id = 0;
const pending = new Map();
createInterface({ input: child.stdout }).on("line", (line) => {
  const r = JSON.parse(line);
  const p = pending.get(r.id);
  pending.delete(r.id);
  r.error ? p.reject(Error(JSON.stringify(r.error))) : p.resolve(r.result);
});
child.on("error", (e) => {
  for (const p of pending.values()) p.reject(e);
});
child.on("exit", (code) => {
  for (const p of pending.values()) p.reject(Error(`Renderer exited ${code}`));
});
function invoke(command, args = {}, peer = "main") {
  const key = ++id;
  return new Promise((resolve, reject) => {
    pending.set(key, { resolve, reject });
    child.stdin.write(JSON.stringify({ id: key, command, peer, args }) + "\n");
  });
}
function decode(reply) {
  const bytes = Buffer.from(reply.binary, "base64");
  assert.equal(bytes.subarray(0, 4).toString(), "TOG1");
  const start = 8 + bytes.readUInt32LE(4),
    header = JSON.parse(bytes.subarray(8, start).toString());
  return {
    bytes: bytes.length,
    preview: header.preview,
    pages: header.pages.map((page, i) => ({
      index: page.index ?? i,
      hash: createHash("sha256")
        .update(
          bytes.subarray(
            start + page.offset,
            start + page.offset + page.length,
          ),
        )
        .digest("hex"),
    })),
  };
}
const rows = [];
try {
  const init = await invoke("join");
  const article = (await invoke("content_catalogue")).types.find(
    (t) => t.id === "article",
  );
  assert(article);
  const model = article.models[0];
  const settings = {
    metadata: article.metadata,
    template: model.source,
    modelManifest: model.manifest,
    modelId: model.id,
  };
  const generation = init.generation,
    epoch = await invoke("preview_bind", { generation });
  const corpora = JSON.parse(
    await readFile(
      resolve(root, "output/preview-profiling/corpora.json"),
      "utf8",
    ),
  ).filter((c) => c.language === "latex");
  let version = 0;
  for (const corpus of corpora) {
    const snapshot = {
      document: corpus.document,
      revision: init.revision,
      settings,
    };
    const request = async (base) =>
      decode(
        await invoke("preview_delta", {
          snapshot,
          request: { scope: { generation, epoch, version: ++version }, base },
        }),
      );
    const initial = await request(null);
    const unchanged = await request(initial.preview.delta.id);
    assert.equal(unchanged.pages.length, 0);
    const edited = structuredClone(corpus.document);
    const paragraph = edited.content.find(
      (node) => node.type === "paragraph" && node.content?.[0]?.type === "text",
    );
    assert(paragraph);
    paragraph.content[0].text = "X" + paragraph.content[0].text;
    snapshot.document = edited;
    const delta = await request(unchanged.preview.delta.id);
    const reconstructed = initial.pages
      .map((p) => p.hash)
      .slice(0, delta.preview.pageSizes.length);
    for (const p of delta.pages) reconstructed[p.index] = p.hash;
    const full = decode(
      await invoke("preview_frame", { snapshot, encoding: "rgba" }),
    );
    assert.deepEqual(
      reconstructed,
      full.pages.map((p) => p.hash),
    );
    assert.equal(delta.preview.source, full.preview.source);
    assert.deepEqual(delta.preview.references, full.preview.references);
    const frame = { generation, epoch, id: delta.preview.delta.id };
    let checks = 0;
    for (const position of [1, 2, 3, 10, 20, 50, 100]) {
      const a = await invoke("preview_sync", {
        frame,
        revision: snapshot.revision,
        query: { kind: "forward", position },
      });
      const b = await invoke("sync_forward", {
        revision: snapshot.revision,
        position,
      });
      assert.deepEqual(a, b);
      checks++;
      if (a) {
        assert.deepEqual(
          await invoke("preview_sync", {
            frame,
            revision: snapshot.revision,
            query: { kind: "backward", location: a },
          }),
          await invoke("sync_backward", {
            revision: snapshot.revision,
            location: b,
          }),
        );
        checks++;
      }
    }
    assert.deepEqual(
      await invoke("preview_sync", {
        frame,
        revision: snapshot.revision,
        query: { kind: "selection", from: 1, to: 50 },
      }),
      await invoke("sync_selection", {
        revision: snapshot.revision,
        from: 1,
        to: 50,
      }),
    );
    checks++;
    const other = "other-" + corpus.name;
    await invoke("join", {}, other);
    const otherEpoch = await invoke("preview_bind", { generation }, other);
    const fallback = decode(
      await invoke(
        "preview_delta",
        {
          snapshot,
          request: {
            scope: { generation, epoch: otherEpoch, version: 1 },
            base: delta.preview.delta.id,
          },
        },
        other,
      ),
    );
    assert.equal(fallback.preview.delta.base, null);
    assert.deepEqual(
      fallback.pages.map((p) => p.hash),
      full.pages.map((p) => p.hash),
    );
    rows.push({
      corpus: corpus.name,
      pages: full.pages.length,
      changedPages: delta.pages.length,
      fullBytes: full.bytes,
      deltaBytes: delta.bytes,
      unchangedBytes: unchanged.bytes,
      unchangedPages: unchanged.pages.length,
      mappingChecks: checks,
      pixelsEqual: true,
      sourceAndReferencesEqual: true,
      otherWindowFullFallback: true,
    });
  }
  const report = {
    success: true,
    implementation: JSON.parse(
      await readFile(
        resolve(root, "output/preview-delta-after/manifest.json"),
        "utf8",
      ),
    ),
    scope:
      "Native release renderer, diagnostic STDIO; same-revision rendering snapshots isolate transfer and pixel correctness. Not a Tauri IPC/input-latency benchmark.",
    rows,
  };
  await writeFile(
    resolve(root, "experiments/preview-delta/verification.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  child.stdin.end();
  child.kill();
}
