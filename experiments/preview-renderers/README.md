# Differential preview renderer evaluation

Isolated comparison of the current full RGBA path, a page-differential RGBA
candidate, and the incremental vector components used by Tinymist/Reflexo.
The application renderer and its dependency locks are unchanged.

See the [results and recommendation](RESULTS.md).

## Candidates

- `rgba-full`: rasterize/transfer/draw every page, using `typst-render` 0.15.1.
- `rgba-delta`: hash visual frames, rasterize and transfer only changed pages;
  retain unchanged page elements and canvases.
- `reflexo`: `IncrSvgDocServer` → binary vector delta → published renderer WASM
  → Canvas2D. Retain unchanged canvases using the same visual keys.

The candidates share the production structured editor, document confirmation,
source projection, **one official Typst 0.15.1 compilation**, reference metadata,
`RenderSync`, binary native Tauri IPC, selection overlay, and double-click
navigation handler. There is no LSP subprocess, Vite server, HTTP relay, or
network request during a measured run. WASM assets are bundled locally. The
isolated Tauri policy allows fetching these bundled assets (`connect-src 'self'`)
and instantiating WASM (`script-src 'wasm-unsafe-eval'`), without general JS
`unsafe-eval` or external domains. The application's policy is unchanged.

The visual key prepass is included in all three candidates and timed separately.
It clones frame trees and strips only non-rendering source spans, tags, links,
and logical parents. It never modifies the original compiled frames used for
navigation. Resolution (2 pixels/point), page fill, bleed, transforms, clipping,
fonts, shaping, glyphs, and paints participate in the key. Reusing pages by index
is intentionally conservative: an inserted/reordered page may be redrawn.
This is an experiment, not yet a production cache/key/protocol contract.

## Compatibility and upstream scope

Rust format and browser renderer are pinned to **the same commit**
`e1974e566ba63dcf8ecdd6730cff25de26c7dbd2`, the npm `0.8.0-rc3` release.
The source read during assessment also included typst.ts
`52dd6cfb986208bcb8a88cd13a6070b9ba3aad13` and Tinymist
`c754ffe8ec9540074dacfd36ba5e8a38b4fc758a`.

The minimal reusable server is `reflexo-vec2svg::IncrSvgDocServer`, reexporting
the vector conversion server, not the whole Tinymist LSP/preview service. The
matching browser package is `@myriaddreamin/typst-ts-renderer`.
Upstream typst.ts is Apache-2.0; Tinymist's preview crate is MIT. We do not copy
upstream implementation into the application. The experiment downloads pinned
upstream sources and uses the published JS/WASM artifact. Their licenses must
be included if these dependencies are eventually distributed.

The upstream workspace normally patches Typst. As a consumer we deliberately
keep **official** Typst 0.15.1, and two compatibility adjustments are required:

1. Enable `no-content-hint`: despite its manifest comment, the actual cfg disables
   an unavailable `Frame::content_hint()` call.
2. Official Typst exposes neither `PdfDocument::data()` nor
   `typst_svg::pdf_to_svg()`. The isolated patch **explicitly rejects imported PDF
   images**, which are absent from these articles. It does not pretend to offer a
   supported generic PDF conversion. SVG/raster/math paths remain upstream code.

This limitation and the pinned Rust/WASM format pairing are part of the adoption
cost. A fast result on this corpus would not establish full feature parity.

Primary implementation references:
[render actor](https://github.com/Myriad-Dreamin/tinymist/blob/c754ffe8ec9540074dacfd36ba5e8a38b4fc758a/crates/typst-preview/src/actor/render.rs),
[vector delta server](https://github.com/Myriad-Dreamin/typst.ts/blob/e1974e566ba63dcf8ecdd6730cff25de26c7dbd2/crates/conversion/typst2vec/src/incr.rs),
[Canvas renderer](https://github.com/Myriad-Dreamin/typst.ts/blob/e1974e566ba63dcf8ecdd6730cff25de26c7dbd2/packages/renderer/src/render/canvas.rs).

## Protocol and correctness

Every request carries the revision of the **actually published** view. A server
base mismatch resets the delta stream. Decoding/merging/rendering happens before
publication; the original revision/generation guards still reject stale results.
Changed canvases are prepared detached. Unchanged complete page elements remain
in place. Their native backward-navigation handlers are rebound for every
published revision. All page sizes, references and synchronization maps are
updated, including when no page pixels changed.

The experiment uses **one preview stream per process**. A production protocol
must additionally bind its cache to a document/generation, renderer options,
and a per-view stream epoch (not just a revision number), especially with several
windows and after a stream reset. This prototype does not establish multi-view
stream isolation or replace that design step.

Outside latency samples the native recipe checks:

- actual canvas pixels from incremental rendering equal an independent full
  replay of the final state, for each candidate;
- RGBA differential pixels equal the full RGBA control at every measured state;
- all candidates produce the same page geometry and synchronization answers;
- forward, backward, selection highlights and the displayed double-click handler
  work at first/middle/last document targets, including retained pages;
- deliberately discard a delta, then recover from the last published base;
- reject an obsolete view before publication and synchronization against an obsolete revision;
- remove pages and reinsert the long article without stale page DOM.

Canvas2D vector antialiasing can differ from `typst-render`. Cross-renderer pixel
identity is **not** asserted; only per-renderer full/delta equivalence and common
layout/navigation are. This does not substitute for broad visual qualification
of colors, clipping, gradients, images or PDF imports before adopting Reflexo.
No screenshot, recording or trace is produced.

## Reproduce

Requires the usual Tauri/Rust/Node environment, Typst CLI 0.15.1 (corpus
preparation only), Git/network for the one-time pinned dependency download, and a
visible macOS desktop for native measurements. No application file is opened.

```sh
sh experiments/preview-renderers/bootstrap.sh
cd output/preview-renderers/source
npm --workspace app run build -- --mode recipe
TAURI_CONFIG='{"build":{"frontendDist":"../dist-recipe"}}' \
  CARGO_TARGET_DIR="$PWD/../../../target" \
  cargo build --release -p typstographe-renderer-comparison \
  --features recipe-driver -j 2
cd ../../..
caffeinate -di node experiments/preview-renderers/run.mjs --smoke
caffeinate -di node experiments/preview-renderers/run.mjs
```

Preparation reuses the prior profiling transformations and corpus generator,
with guarded replacement points, solely in `output/preview-renderers/source`.
It refuses to overwrite an existing source copy. The first build resolves a
separate lock; the captured experimental Cargo/npm locks permit later
`--locked --offline` rebuilds. The application locks are never changed.
`--mode=rgba-delta` (or `reflexo`) restricts exploratory runs.

The first math render follows the normal blank-document startup, with the base
fonts/compiler and potentially the renderer already initialized. It is not a
cold application-startup measurement.

The three exact LaTeX/MiTeX articles contain 10/50/200 formulas, on 2/7/24 pages.
Two fresh native processes per configuration, order reversed on the second
pass. First math render, 16 prose edits, 16 formula edits; first edit of each
series excluded from the summary (30 warm observations per case).
The window stays on top to avoid WebKit occlusion. Hidden/suspended runs are
rejected in full and logged, with at most two fresh retries.

`publishedMs` measures transaction to publication; `frameMs` waits two more
animation frames, not a physical GPU presentation timestamp. Hashes and
correctness checks are outside timing. Raw reports contain native stage records,
payload volumes and per-state canvas hashes. Results do not establish Windows/
Linux latency or response to arbitrary documents/rapid typing/IME.
