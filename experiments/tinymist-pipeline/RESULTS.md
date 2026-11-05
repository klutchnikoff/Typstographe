# Tinymist's complete preview and our common pipeline — 5 November 2026

**The user's observation is supported for typical warm edits:** on the 24-page
article, real VS Code/Tinymist with partial rendering reaches two subsequent
animation frames in **47 ms p50**, versus **123 ms** for our differential RGBA
candidate. The prior Reflexo experiment left our editor/confirmation/mapping/
publication pipeline in place. Its roughly equal renderer totals did not
establish equivalence to Tinymist's complete preview.

The recommendation is to **reduce the measured common work and retain
Tinymist's partial SVG path as the comparison target before fixing the renderer
choice**. Differential RGBA remains a validated candidate. The previous
recommendation to prioritize it on warm latency alone was too broad.

## Evidence and scope

24 fresh application sessions: 12 native Tauri, 12 real VS Code. Two processes
per mode/article size, inverse mode order on the second pass. Same three
10/50/200-formula Articles (2/7/24 pages), MiTeX WASM retained. Each process:
initialized blank Article → complete corpus → 16 prose edits → 16 formula edits.
First warm edit excluded from summary: 30 warm observations per cell. No final
sample is removed for being slow; pilot failures are excluded in full.

**792 measured states**, checked against their exported Typst body SHA-256;
**792 paired input/geometry comparisons** between native modes and VS Code modes.
Main/model/package/font hashes are in the [corpus manifest](results/corpora.json).
Native metadata and exports come from the same core's demo Article/model.
Paragraph identities are deterministic only in the benchmark to avoid random
labels changing the input strings between hosts.

Native: official Typst 0.15.1, release Tauri/WebKit, 1280×900. VS Code 1.144.0,
Electron 43.8.3 / Chromium 150, Tinymist 0.15.12 and **its patched Typst 0.15.1**,
1440×900, builtin SVG preview 528 CSS pixels wide, DPR 2. Exported used fonts,
system discovery disabled. No remote package downloads during measurements.
This observes two real applications with different editors/browser engines;
it does not isolate every advantage to the renderer alone.

[Reproduction and metric definitions](README.md), [native raw reports](results/native-raw.json),
[VS Code raw reports](results/vscode-raw.json), [summary](results/summary.json),
[exact software provenance](results/manifest.json).
The application and its dependencies/formats remain unchanged.

## Primary comparison: two subsequent animation frames

Milliseconds, p50 / p95 from edit command to the recorded two-frame observation:

| Article | Edit | Tauri RGBA differential | Tauri Reflexo Canvas | VS Code partial SVG | VS Code full SVG |
| --- | --- | ---: | ---: | ---: | ---: |
| 2 pages | Prose | 39 / 54 | 39 / 45 | 37 / 46 | 42 / 63 |
| 2 pages | Formula | 55 / 57 | 39 / 55 | 38 / 46 | 38 / 46 |
| 7 pages | Prose | 62 / 63 | 61 / 63 | 37 / 58 | 67 / 83 |
| 7 pages | Formula | 63 / 64 | 62 / 64 | 37 / 69 | 65 / 84 |
| 24 pages | Prose | 106 / 119 | 106 / 121 | **48 / 70** | 199 / 284 |
| 24 pages | Formula | **123 / 126** | **122 / 124** | **47 / 168** | 201 / 311 |

This metric includes browser scheduling and intervening layout/postprocessing;
**it is not a physical GPU presentation measurement**. Both applications wait
two frames, but their publication hooks differ, as detailed below. It is a more
useful cross-application indicator than comparing our publication callback with
the first SVG mutation.

Partial rendering is essential to the good long-document result. With it,
about 11,900 SVG descendants are present at the measured first-page view; with
full SVG, about 96,500. Those are observed DOM sizes, not measurements of memory
or a proof that DOM size alone accounts for the extra time.
Tinymist enables partial rendering by default in VS Code. Its preview actor also
coalesces pending render requests and exports the latest document once.
[Configuration](https://github.com/Myriad-Dreamin/tinymist/blob/9681433b09c3ae15b9794a42a399fecec0aa0747/editors/vscode/package.json),
[render actor](https://github.com/Myriad-Dreamin/tinymist/blob/9681433b09c3ae15b9794a42a399fecec0aa0747/crates/typst-preview/src/actor/render.rs).

### Slow observations remain visible

For the 24-page formula edits, round 12 produces approximately 134–136 ms before
the SVG patch in all four VS Code runs, with and without partial rendering. This
raises the p95 despite the much lower median. The browser merge/diff calls remain
small; the present instrumentation does **not** determine the upstream cause.
No claim of consistently sub-50-ms Tinymist latency is warranted.

### First full corpus: exploratory, not a startup ranking

Two-frame observation p50, only two samples per cell:

| Article | Tauri RGBA differential | Tauri Reflexo | VS Code partial | VS Code full |
| --- | ---: | ---: | ---: | ---: |
| 2 pages | 107 | 95 | 166 | 183 |
| 7 pages | 242 | 166 | 741 | 929 |
| 24 pages | 705 | 450 | 288 | 1,266 |

These observations are non-monotonic in VS Code and still include startup-time
editor/LSP/background initialization after the blank article. The cause of the
7-page delay is unresolved. With two observations, they do not establish a
reliable initial-opening performance ranking. Cold startup needs a separate
protocol; these values are kept rather than hidden.

## Our common work, now measured separately

24-page formula edit, p50 milliseconds in the native differential RGBA candidate:

| Observation | Time | Interpretation |
| --- | ---: | --- |
| Editor command returns | 21 | Synchronous edit, plugins and UI callbacks already run |
| Normal render function starts | 24 | Milestone since the edit began |
| UI refresh totals | 21, **4 calls** | Inclusive across initial edit and later reference publication |
| Editor dispatch totals | 29 | Includes the initial edit and the reference-index transaction |
| Editor view update totals | 8 | Nested inside dispatch; not an extra 8 ms to add |
| Reference publication | 8 | Includes another dispatch/UI refresh |
| Confirmation/context flush | 13 | Existing local confirmed-document barrier, individual mode |
| Native snapshot preparation | 1.80 | Validated source/settings snapshot |
| Structured position → Typst source map | 11.62 | Full projection/mapping pass |
| Compilation with model | 12.97 | Typst and the existing model path |
| RenderSync construction | 12.29 | Collects positions across all pages |
| Changed-page raster + RGBA conversion | 1.30 + 1.24 | One page |
| Frontend request | 51 | Includes native work and transport/scheduling |
| Display/reference publication | 10 | Includes the 8 ms reference publication above |
| Final publication callback | 102 | Full native edit → publication total |

**Do not sum this table.** Counters are nested and percentiles do not add.
Reflexo keeps essentially the same common costs, with about 1.84 ms vector
conversion and a 101 ms total publication callback.

The same article in VS Code has an approximately 1.2 ms edit application,
0.1 ms browser merge and 0.2 ms SVG diff call. Its vector body delta is about
2.5 KiB; it does not resend our common source/header payload. These are selected
stages, not a complete profile of Tinymist's Rust compiler/LSP.

### Why the earlier 102 ms versus 102 ms result was insufficient

The previous test replaced raster output with Reflexo vector conversion and
Canvas2D drawing while preserving **our entire surrounding pipeline**. That
was valid for comparing those two candidates, and its correctness tests stand.
It did not exercise Tinymist's complete SVG/viewport/frontend/editor path.

Native publication is recorded after canvases and reference updates. The VS Code
DOM-patch observation occurs when SVG mutations become observable and can
precede final layout/postprocessing. On 24-page formula edits it is 16 ms p50
with partial rendering, but **16 versus 102 ms is not an equivalent readiness
comparison**. The two-frame values above are the primary comparison. The
clock-calibration uncertainty bound is at most **1.075 ms** in the final runs.

## Concrete optimization targets

1. **Consolidate UI refreshes.** `refresh()` is called four times per measured
   edit. It refreshes commands and calls `refreshSynchronization()`, which also
   refreshes commands. Batch the relevant updates and avoid unrelated work on
   metadata-only transactions, preserving immediate command correctness.
   [Current controller](../../app/src/main.ts).
2. **Avoid unchanged reference-index transactions.** `setResolvedReferences`
   dispatches on every preview, even when the corpus has no cross-references
   and the resolved list remains empty. This measured publication costs about
   8 ms including nested UI work. Skip it when both generation and resolved
   values are unchanged, with tests for document replacement and changed values.
   [Reference publication](../../app/src/cross-reference-index.ts).
3. **Reduce mapping allocations and duplicate projection work.** The current
   source-map loop constructs/escapes a temporary string for each text character.
   Investigate width calculation/caching and reuse of the confirmed projection;
   preserve all Unicode/escaping/zone guarantees. The measured 11.6 ms is the
   complete mapping stage, not a measurement of that allocation loop alone.
   [Source map](../../crates/core/src/content/mapping.rs).
4. **Cache or defer synchronization indexing.** RenderSync walks all pages and
   prepares clickable frames on every preview. Study immutable-frame/page reuse
   or on-demand indexing; preserve forward, backward and selection behavior and
   revision guards. Do not simply remove synchronization to improve a timer.
   [Navigation](../../crates/core/src/navigation.rs).
5. **Keep visible-region rendering in the renderer evaluation.** Tinymist's
   partial SVG path is the demonstrated reference. Recompare it with RGBA after
   reducing the common costs, ideally in the same WebKit host to separate browser
   engine effects. Do not infer that all SVG rendering is fast from its first
   DOM mutation or that adopting its renderer alone reproduces VS Code latency.

These are proposed follow-up changes, **not implemented optimizations**. The
results do not establish a guaranteed additive saving or choose a final renderer.

## Preservation and limits

All 12 native sessions pass full/delta pixel replay, stale-view/stale-sync
rejection, dropped-delta recovery, page removal/reinsertion and navigation/
selection checks. Six native cross-renderer navigation comparisons match.
All 12 real VS Code sessions pass Cmd-click back to the copied body source.
The automated source→preview command shows no observed scroll after this edit
sequence; an initial-document diagnostic scrolled successfully. This direction
remains inconclusive in this recipe and is not reported as passed or as a
confirmed Tinymist defect.

No image/PDF-import/bibliography fidelity review, OS keyboard/IME test, typing
burst test, memory benchmark, Windows/Linux timing, screenshot or browser trace
is claimed. Existing application files and user documents are untouched.
