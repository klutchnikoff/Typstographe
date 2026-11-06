# Source maps and synchronization — 5 November 2026

The production core now encodes literal text in one pass and computes escaped
byte widths without allocating a temporary string per character. Numbered
syntax spans are indexed in one traversal of each immutable compilation rather
than repeatedly searching the syntax tree from its root. There is no cache of
source ranges across revisions, renderer change or work deferred to navigation.

## Verified native comparison

Before `c33dbdf`, after `46c3553`, both including the earlier UI optimization.
Release Tauri/WebKit on Apple M1 Max, 32 GiB, macOS kernel 25.6.0, Rust 1.98.1,
official Typst 0.15.1. Same deterministic 10/50/200-formula Articles, 2/7/24 pages,
fonts and edit strings. Full and differential RGBA, two fresh processes per
size/mode/variant: 24 accepted sessions, each checked against the fingerprint
embedded in its compiled core. No hidden-session retries in the final series.
No builds or other test runners ran during measurements.

Formula edit → preview publication, milliseconds **p50 / p95**, 30 warm samples
per cell (first warm edit excluded):

| Article | Harness renderer | Before | After |
| --- | --- | ---: | ---: |
| 10 formulas, 2 pages | Full RGBA | 31 / 35 | 31 / 36 |
| 10 formulas, 2 pages | Differential RGBA | 25 / 29 | 24 / 26 |
| 50 formulas, 7 pages | Full RGBA | 78 / 85 | 76 / 82 |
| 50 formulas, 7 pages | Differential RGBA | 38 / 41 | 35 / 39 |
| 200 formulas, 24 pages | Full RGBA | 258 / 333 | 244 / 262 |
| 200 formulas, 24 pages | Differential RGBA | 93 / 96 | 76 / 78 |

On the long Article, median formula publication improves by 14 ms (5%) full
RGBA and 17 ms (18%) differential. Prose publication improves from 259 / 292 to
239 / 260 ms full RGBA and from 88 / 93 to 68 / 73 ms differential. With the
additional two-frame wait, long formula edits move from 271 / 352 to
255 / 284 ms full RGBA, and 104 / 117 to 89 / 94 ms differential.

Short Articles show little total benefit: their mapping/sync costs are already
small, and frame alignment hides sub-millisecond savings. The two initial full
renders per cell remain exploratory; their timings do not establish a first-load
improvement. Full-RGBA tails are variable, as in the earlier study: this sample's
p95 reduction is not a guaranteed worst-case bound.

## Cost of the two maps

Long Article, formula edit, differential RGBA, milliseconds **p50 / p95**:

| Stage | Before | After |
| --- | ---: | ---: |
| Source-map construction | 11.93 / 12.27 | 2.01 / 2.36 |
| RenderSync, including verification | 16.99 / 17.56 | 8.96 / 9.89 |
| Anchor verification alone | 4.09 / 4.23 | 4.15 / 4.39 |
| RenderSync minus measured verification, derived per sample | 12.81 / 13.49 | 4.82 / 5.74 |
| Source-map verification alone | 0.66 / 0.68 | 0.64 / 0.70 |
| Typst compilation | 13.42 / 14.18 | 13.71 / 14.41 |

Mapping falls by about 83%; the derived synchronization construction metric by
about 62%. Typst compilation is essentially unchanged. The command-return
median remains 7 ms: these changes affect native preparation after the edit.
The 67,527 anchors in the final long-Article formula state retain identical
source ranges and transformed geometry.

Verification is intentionally substantial. Its time remains in all end-to-end
results and in the inclusive RenderSync timer. `syncBuildMs` subtracts the
measured verification interval for each sample before computing percentiles;
it is not obtained by subtracting two aggregate percentiles. Small probe/logging
overheads remain. Do not subtract checks from publication/frame times to invent
an unmeasured production latency, or add nested timings as independent savings.

## Preservation and checks

- 24 compiled-core identity checks pass. Every paired session has identical
  recorded navigation/recovery replies.
- All 396 paired states have identical source SHA, displayed pixel hashes,
  geometry, complete UTF-16 map signatures and complete anchor signatures.
  Map signatures include every position/range and source length; anchor
  signatures include source range, page, point and four transformed corners.
- Every session passes full replay, dropped-base recovery, stale-view/stale-sync
  rejection, page removal/restoration, forward/backward navigation and selection.
  Each variant also passes 198 full/differential pixel pairs and six navigation
  comparisons between renderers.
- All 275 core tests, one doctest, Clippy with warnings denied, and formatting
  pass. New tests compare encoding and widths against the former rules for every
  valid Unicode scalar, check UTF-16 ranges after an inline atom, and compare
  the span index to Typst's resolver before/after incremental edits. Existing
  real-render tests retain styles, links, ligatures, repeated text, multipage
  selections and old-world snapshots.
- Native release builds pass. Existing user `.typsto` files are untouched.

## Invalid pilot and Cargo guard

A first pilot unexpectedly showed unchanged mapping and synchronization costs.
The optimized copy contained the correct source, but its build log showed no
core recompilation: Cargo had reused the baseline core from the shared target.
Git archive timestamps predated that artifact. **Those 24 pilot sessions are
excluded**, retained only under ignored `output/` for diagnosis.

The final series uses rebuilt cores and a fingerprint literal emitted by the
core itself. Both runner and summarizer reject reports without the expected
fingerprint; the rejection was checked against the old pilot reports. The build
helper invalidates only the local core's release artifacts, retaining expensive
third-party dependencies, and cleans instrumented core artifacts on exit so a
future production release build recompiles its own core. Measurement binaries
remain statically linked and usable. This guard is part of the reproduction
protocol, not a production dependency or document-format change.

## Scope and next step

These core changes benefit every caller of the common projection and RenderSync.
The differential renderer remains isolated. Full RGBA in this harness includes
experimental page-key bookkeeping/reconciliation; compare paired differences,
not its absolute time as a production guarantee. Before and after series run
successively, not randomly interleaved. Signatures are deterministic 128-bit
regression checks, not cryptographic proofs. Two-frame waits are not physical
GPU presentation timestamps. No new Windows/Linux timing, memory, image/PDF
fidelity, OS keyboard/IME or typing-burst qualification is claimed.

Remaining common costs include ~14 ms of Typst compilation and ~5 ms of
synchronization construction on this Article; full-page transfer/publication
still dominates the full-RGBA path. Reevaluate differential RGBA against partial
SVG in the same WebKit host with synchronization retained, before choosing a
production renderer or a cross-revision cache protocol.

[Protocol](README.md), [summary](results/summary.json),
[before raw JSON, gzip](results/before-raw.json.gz),
[after raw JSON, gzip](results/after-raw.json.gz).
