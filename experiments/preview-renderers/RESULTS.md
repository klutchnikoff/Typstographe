# Differential RGBA and Tinymist/Reflexo — 5 November 2026

**Recommendation: implement differential RGBA first, keeping official Typst,
our compiler and RenderSync.** On the 24-page article it cuts warm formula-edit
publication from **270 ms to 102 ms** (62% less), with identical pixels. Reflexo
also reaches **102 ms**. Its main demonstrated advantage is the initial full
render and the much smaller transfer, rather than faster warm edits on long
articles. Keep it as an evaluated option for future preview needs.

These are isolated candidates. The distributed renderer, application dependency
locks, document formats and user `.typsto` files are unchanged. Production
integration and its stream/cache contract remain to be validated.

## Scope and reproducibility

Apple M1 Max, 32 GiB RAM, arm64, Darwin 25.6.0, Rust 1.98.1. Native Tauri/WebKit,
release build with embedded frontend assets; same 2 pixels/point and official
Typst **0.15.1**, MiTeX **WASM retained**. The exact prior 10/50/200-formula
articles are reused: 2/7/24 pages. No application document was opened.

18 fresh processes: two runs × three article sizes × three renderers, reversing
renderer order for the second run. First math render, then 16 prose edits and
16 formula edits per process. The first edit of each series is excluded from
summaries: **30 warm observations per table cell**, two for the first math render.
All 594 preview states remain in the raw reports. There were **no discarded or
hidden-window runs in the final series**. Earlier integration pilots are not
included. No capture, screenshot or trace was made.

All candidates use the same visual-key prepass and publication controller;
`rgba-full` deliberately redraws every page. It is a contemporary full-render
control, not a claim that every byte of its frontend matches the historical
profiling binary. The previous study remains available separately.

[Protocol and reproduction](README.md), [raw native reports](results/native-raw.json),
[summary](results/summary.json), [source manifest](results/manifest.json),
[pinned dependencies](dependencies/provenance.json).
The measured application source is commit `719438b`; guarded transformations are
provided in this experiment. The benchmark helper commit does not change that
application code.

## Warm editing latency

Transaction → publication of the prepared canvases, p50 / p95, milliseconds:

| Article | Edit | Full RGBA | Differential RGBA | Reflexo vector delta |
| --- | --- | ---: | ---: | ---: |
| 2 pages | Prose | 37 / 40 | 30 / 31 | 27 / 30 |
| 2 pages | Formula | 37 / 40 | 31 / 35 | 28 / 30 |
| 7 pages | Prose | 84 / 92 | 43 / 46 | 40 / 43 |
| 7 pages | Formula | 87 / 97 | 45 / 49 | 43 / 46 |
| 24 pages | Prose | 261 / 293 | 94 / 100 | 95 / 128 |
| 24 pages | Formula | **270 / 306** | **102 / 107** | **102 / 105** |

The extra wait for two animation frames gives formula-edit p50 values of
287 / 122 / 121 ms on 24 pages. This is a browser scheduling observation, **not a
physical GPU presentation timestamp**. Differences of 1–3 ms are too small to
establish a durable renderer advantage from this experiment. The Reflexo prose
p95 is higher in this sample; no observation was removed because it was slow.

Only **one page changes pixels** in these warm edits. Both differential
candidates retain the other **23 complete page elements and canvases**, including
updated synchronization handlers. Full RGBA redraws all 24.

## Transfer and first full render

24-page formula edit, p50 of the complete native packet, including common source,
page geometry and reference metadata:

| Renderer | Bytes | MiB |
| --- | ---: | ---: |
| Full RGBA | 192,657,814 | 183.73 |
| Differential RGBA | 8,136,595 | 7.76 |
| Reflexo | 116,627 | 0.111 |

The RGBA candidate reduces transfer about **24-fold**. Reflexo is another
**70-fold** smaller than differential RGBA, but that does not yield a comparable
latency reduction on local Tauri IPC: native work and browser display dominate
once the other 23 pages are removed from the packet.

First math render, p50 milliseconds (only **two observations**; initialized blank
document/compiler/base fonts and potentially initialized browser renderer):

| Article | Full RGBA | Differential RGBA | Reflexo |
| --- | ---: | ---: | ---: |
| 2 pages | 91 | 95 | 75 |
| 7 pages | 235 | 235 | 153 |
| 24 pages | 736 | 713 | **455** |

All pages are new here, so differential RGBA has no reusable pixels. Reflexo's
smaller initial packet has a clear observed benefit. This does not measure cold
application startup. Rendering visible pages first and prefetching the rest is
a natural next RGBA experiment; its gain has **not** been measured here.

## Where the time goes after the differential change

24-page formula edit, p50 milliseconds:

| Stage | Full RGBA | Differential RGBA | Reflexo |
| --- | ---: | ---: | ---: |
| Compilation with model | 13.04 | 12.93 | 12.89 |
| Visual keys | 3.41 | 3.39 | 3.41 |
| Native rasterization | 30.59 | 1.32 | 0 |
| Demultiplied RGBA conversion | 30.93 | 1.24 | 0 |
| Native vector conversion/packing | 0 | 0 | 1.78 |
| RenderSync construction | 12.50 | 12.17 | 12.94 |
| Native preview worker | 109.66 | 46.34 | 46.10 |
| Frontend request | 158 | 51 | 49 |
| Display and publication | 69 | 10 | 12 |

These independent percentiles do not sum to total latency. The complete edit
also includes editor transactions, normalization/projection, confirmation,
snapshot creation and scheduling. `requestMs - nativeMs - dispatchWaitMs` is a
residual including serialization/copies/schedulers, not an exclusive IPC-copy
timer: 49.18 / 4.13 / 2.46 ms in these three cases.

Reflexo eliminates RGBA rasterization and transfer, replacing them with vector
conversion, merging and Canvas2D drawing. At this scale the resulting total
worker and warm end-to-end latency are similar to differential RGBA. The common
pipeline is now the main target. **The remaining 102 ms are not Typst compilation
time**: compilation itself is around 13 ms.

## Correctness and navigation

- **198 paired states:** differential and full RGBA have identical displayed
  canvas pixels and dimensions, across both runs and all article sizes.
- **18 independent full replays:** each candidate's final incremental view has
  identical pixels to its own fresh full reconstruction, including Reflexo.
- **12 cross-renderer navigation comparisons:** identical forward/backward
  coordinates and source positions, selection geometry and formula-navigation
  answers. First/middle/last prose targets exercise changed and retained pages.
- Each of the 18 sessions also checks the real displayed page double-click
  handler, selection overlays, rejection of a stale view, rejection of stale
  sync, recovery after a deliberately unconsumed delta, page removal to a
  one-page document, and reinsertion of the complete article.

The original compiled `PagedDocument` and source map always build RenderSync;
visual frame normalization never modifies them. Code positions inside a formula
can resolve to the whole equation rather than to an exact rendered character;
this existing behavior is unchanged. It is checked separately from exact prose
selection highlights.

**Cross-renderer pixels are not identical.** Browser Canvas2D and `typst-render`
have different antialiasing. A coarse sampled-dark-pixel ratio for Reflexo versus
RGBA stays between 1.0086 and 1.0124 across these states (no blank-page anomaly),
but this is only a diagnostic, not visual proof of generic fidelity. Images,
imported PDFs, gradients, clipping, transparency and arbitrary fonts need wider
qualification before adopting the vector renderer. No screenshot-based visual
review is claimed.

## Reuse and adoption costs

The reusable pieces are the incremental vector server and browser Canvas renderer,
not Tinymist's whole LSP. Rust and WASM are pinned to the same `0.8.0-rc3` commit.
The WASM artifact is **1,278,260 bytes** (about 1.22 MiB); the isolated Rust lock
adds 49 packages relative to the application lock. These are dependency/artifact
sizes, **not process or WebKit memory measurements**.

Keeping official Typst requires `no-content-hint` and an explicit exclusion of
upstream's unavailable imported-PDF APIs. That exclusion is acceptable for this
corpus, not for a production renderer. The isolated CSP also permits bundled
WASM loading and instantiation. Upstream licenses/notices and paired format
upgrades would accompany a future integration.

For production, both candidates need a cache scoped to document/generation,
render options and per-view stream epoch, with bounded lifetime, full reset on
base mismatch, atomic publication, stale-result rejection and error fallback.
This single-stream experiment tests the reset/publication mechanisms, **not
multi-window stream isolation**. A hash alone is not a final cache correctness
contract; retain/check visual-frame identity as appropriate.

## Proposed next step

1. Validate and implement differential RGBA as the application path: page cache,
   unchanged canvas reuse, stream-scoped protocol, full metadata/RenderSync for
   every confirmed revision, and production tests for multiple views, failures,
   document replacement, options and zero-pixel-change revisions.
2. Profile the remaining common editor/projection/validation/RenderSync work,
   rather than replacing the Typst engine or MiTeX for these warm edits.
3. Evaluate visible-page-first initial rendering. Retain Reflexo's benchmark as
   a reference if initial render, zoom quality or future browser delivery justify
   its broader integration and feature qualification.

The results are macOS observations on these three articles, not Windows/Linux
latency guarantees, memory benchmarks, typing-burst tests or a general-purpose
vector-renderer qualification.
