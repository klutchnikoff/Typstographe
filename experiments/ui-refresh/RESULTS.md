# UI refresh optimization — 5 November 2026

The production frontend now batches synchronous UI invalidations, refreshes
command availability once per publication, skips unchanged Unicode count
requests, and avoids reference transactions when the resolved values and
document generation are unchanged. There is no typing debounce, extra frame
wait, renderer replacement or loss of synchronization.

## Controlled native result

Before `069decc`, after `32084ed`. Release Tauri/WebKit, Apple M1 Max, 32 GiB,
macOS kernel 25.6.0, Rust 1.98.1, official Typst 0.15.1. Same fixed source states,
fonts and 2/7/24-page Articles as the previous experiment. Two fresh processes
per size/mode/variant, 24 successful sessions, no discarded hidden sessions.
Each warm-edit row has 30 samples; first edits are excluded. No builds or other
functional test runners ran during measurement.

Formula edit → preview publication, milliseconds **p50 / p95**:

| Article | Renderer in the isolated harness | Before | After |
| --- | --- | ---: | ---: |
| 10 formulas, 2 pages | Full RGBA | 37 / 40 | 31 / 35 |
| 10 formulas, 2 pages | Differential RGBA | 30 / 34 | 25 / 27 |
| 50 formulas, 7 pages | Full RGBA | 86 / 93 | 77 / 83 |
| 50 formulas, 7 pages | Differential RGBA | 46 / 52 | 37 / 40 |
| 200 formulas, 24 pages | Full RGBA | 271 / 296 | 254 / 307 |
| 200 formulas, 24 pages | Differential RGBA | 102 / 110 | 87 / 88 |

On the long Article, the median saving is 17 ms (6%) in the full-pixel path and
15 ms (15%) in the differential candidate. Prose publication also improves:
266 → 249 ms full RGBA, 96 → 79 ms differential. The additional two-frame
measurement for long formula edits moves from 286 / 319 to 271 / 326 ms full
RGBA, and 122 / 132 to 105 / 108 ms differential.

**The full-RGBA p95 does not improve for formula edits.** Both series contain
long confirmation/flush samples: the slowest sample has 93 ms of flush before,
91 ms after; another after sample has 63 ms. These are observations, not a GC or
system-load diagnosis. Large full-page transfers/publication still dominate;
this change does not establish uniformly better tail latency. Short Articles
can retain the same two-frame median despite earlier publication because of
frame alignment. Two initial full renders per cell are retained as exploratory
data, not a robust first-load ranking.

## Where the gain appears

Long Article, formula edit, differential RGBA, p50:

| Measurement | Before | After |
| --- | ---: | ---: |
| Command return | 22 ms | 6 ms |
| Render routine entered | 24 ms | 12 ms |
| Executed UI refresh work, inclusive | 21 ms | 8 ms |
| Executed UI refresh calls | 4 | 3 |
| Editor dispatch calls | 2 | 1 |
| Reference metadata transactions | 1 | 0 |
| Unicode count requests | 4 | 1 |
| Reference publication, inclusive | 9 ms | < 1 ms |
| Typst compilation | 12.90 ms | 12.85 ms |
| Source mapping | 11.74 ms | 11.82 ms |
| RenderSync construction | 12.68 ms | 12.71 ms |

The full-RGBA command returns in 7 ms instead of 22 ms. Prose edits retain
three measured UI publications in both variants, but each publication performs
one command-availability refresh instead of two, and counts once per edit
instead of three times. Async confirmation/status events still refresh the UI.
The old status callback also did availability work outside `ui.refresh`; these
spans do not account for it separately. Dispatch/reference/UI times are nested
and must not be added as independent savings. WebKit's clock resolution makes
sub-millisecond UI spans round to zero.

This corpus has an empty reference index; the timing demonstrates removal of
that common unnecessary transaction. Nonempty reference correctness is verified
separately, not claimed as a large-reference performance benchmark.

## Preservation and validation

- 396 before/after document states have identical source SHA, displayed canvas
  pixel hashes and page geometry. Navigation and all recorded correctness
  replies are identical in each paired session.
- Every session passes full replay, missing-base recovery, stale-view/stale-sync
  rejection, page removal/restoration, forward/backward navigation and selection.
  Each variant also passes 198 full/differential pixel pairs and six navigation
  comparisons between renderers.
- 454 Vitest tests pass, including changed reference values/generations,
  nonempty index clearing, caller mutation isolation, selection preservation,
  coalescing, async count ordering, locale changes, failure retry and closure.
- 18 Chromium/WebKit functional tests pass for reference badges, command
  availability in toolbar/palette/private fields, synchronization activation,
  multiple windows and deferred activation during composition.
- Production TypeScript/Vite build and formatting pass. Five native-locale
  script tests pass. The external SVG watcher test initially times out in the
  sandbox and passes when rerun outside it; no watcher code was changed.

## Scope and next step

These changes are in the production UI. The differential renderer remains an
isolated candidate. Full RGBA in this harness includes the previous experimental
visual-key bookkeeping/reconciliation; use its paired difference, not its
absolute time as an exact production guarantee. Before and after processes run
successively, without randomized interleaving. No Windows/Linux timing, physical
GPU presentation, memory measurement or new keyboard/IME qualification is
claimed. Existing user projects are untouched.

The next measured common costs remain source mapping (~12 ms) and RenderSync
(~13 ms) on this Article. Study their allocations/reuse while preserving
Unicode, escaping, zones and revision guards; then reevaluate differential RGBA
against partial SVG. No evidence here selects a final renderer.

[Protocol](README.md), [machine-readable summary](results/summary.json),
[before raw data](results/before-raw.json), [after raw data](results/after-raw.json).
