# Continuous native input after production differential RGBA

Measured 5 November 2026 on Apple M1 Max (32 GiB), macOS 25.6.0,
Rust 1.98.1, Node 26.9.0. Full machine metadata, exact application/frontend/core
identities and aggregates are in
[summary.json](../typing-latency/results/preview-delta/summary.json).
[Before raw observations](../typing-latency/results/preview-delta/before-raw.json.gz)
and [after raw observations](../typing-latency/results/preview-delta/after-raw.json.gz)
are retained separately from the previous typing study.

## Scope and correctness

- Real release Tauri/WebKit: `64b6e41` before, `43c96bc` after.
- Same deterministic 10/50/200-formula Articles, 2/7/24 pages, demo header.
- Preview enabled and paused, two fresh processes each; reverse preview-mode
  order on the second pass. 24 sessions, no discarded runs.
- A worker clock schedules 24 native WebKit `insertText` operations at 100 ms,
  then 24 at 250 ms. All 1,152 input operations survive native editing and
  document confirmation. Input percentiles omit the first two characters of
  each phase: 44 samples/cell. IPC/spans/frame-gap statistics include warm-up.
- Compiled core/frontend fingerprints match the prepared sources. Final text,
  selection, source, every page's pixel hash and forward/backward/selection
  navigation match across both modes, both builds and repetitions.
- The desktop preflight passed after unlocking macOS; the earlier locked-desktop
  attempt retained no sample. No captures or profiler traces were taken.

These are main-thread delivery, editing and animation-frame opportunities, not
physical keyboard-to-screen latency. A `requestAnimationFrame` callback does
not prove GPU presentation. Two repetitions and these specific edit locations
are a controlled local comparison, not a universal latency guarantee.

## Preview enabled

All times below are milliseconds. P95 uses the nearest-rank definition.

| Pages | Interval/key | Input queue p95 before → after | First RAF p95 | Second RAF p95 | Maximum frame gap | Native preview request p95 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2 | 100 | 1 → 1 | 16 → 16 | 40 → 33 | 27 → 27 | 18 → 13 |
| 2 | 250 | 1 → 0 | 24 → 23 | 32 → 34 | 36 → 32 | 26 → 22 |
| 7 | 100 | 1 → 1 | 14 → 15 | 30 → 30 | 32 → 25 | 45 → 17 |
| 7 | 250 | 1 → 2 | 20 → 28 | 32 → 39 | 37 → 40 | 50 → 22 |
| 24 | 100 | 0 → 1 | 16 → 20 | **80 → 34** | **69 → 44** | **152 → 32** |
| 24 | 250 | 2 → 1 | 20 → 30 | 35 → 37 | **67 → 40** | **147 → 34** |

The native request metric is asynchronous transport round-trip time (including
failed stale replies), not a synchronous JavaScript span or total key-to-preview
latency. At 24 pages / 100 ms, the before build has 41 stale replies among 46
completed requests; after has none among 47. At 250 ms all replies succeed;
the request p95 falls from 147 to 34 ms. Do not interpret request durations as
JavaScript blocked for that duration.

The large-document improvement is reproduced in both fresh processes: at
100 ms, second-RAF p95 is 80/81 ms before and 33/35 ms after. The maximum frame
gap remains 44 ms; outliers were reduced, not eliminated.

The improvement is **not uniform across frame metrics**. At 250 ms, first-RAF
p95 rises 20 → 30 ms on 24 pages, and 20 → 28 ms on 7 pages; second-RAF p95 is
also slightly worse. The measurements do not establish a specific cause for
those increases. The direct native edit call stays at 1–4 ms p95 in all
preview-enabled cells (24 pages: 1 → 1 ms at 100 ms, 1 → 2 ms at 250 ms).

## The preview now keeps up with the fast typing phase

On 24 pages / 100 ms, the before build uploads **no** page canvas during the
measured typing windows: each long render becomes stale. The after build uploads
46 changed-page canvases across the two windows, while retaining the other 23
pages at each publication. The last pending state drains outside the timed
phase; every final state is verified.

At 250 ms the before build performs 1,103 page uploads during the windows
(including abandoned partial preparation); after performs 46. The same workload
now returns roughly 8.14 MB per changed-page reply rather than 192.66 MB for a
full document reply. This agrees with the independent
[native transfer/pixel checks](README.md#native-pixel-and-transfer-checks).

No `preview_invalidate` request was observed during these timed after phases:
render replies generally finish before the next input. This study therefore
measures the **combined production path**, dominated here by differential
transfer/reuse; it does not isolate a speed gain attributable to early native
cancellation. Dedicated native tests cover cancellation after compilation,
between pages, before synchronization/packet assembly, epochs and late replies.

## Preview-paused control and remaining limits

On 24 pages / 100 ms after, paused-preview second-RAF p95 is 31 ms and the maximum
frame gap is 43 ms, compared with 34 and 44 ms when enabled. At 250 ms those
control values are 42 and 45 ms, compared with 37 and 40 ms when enabled. These
controls support that the large full-buffer stalls have receded on this workload;
they do not identify all remaining sources of scheduling variability.

This test inserts short text in the initial paragraph. Editing something that
repaginates the entire article can legitimately repaint/transfer many pages;
initial full loading also still transfers every page. There is no claim of a
universal sub-frame preview, zero outliers, physical input latency or measured
peak memory savings. SVG versus RGBA has not been reevaluated here.

## Reproduce

Use the `TOG_TYPING_SERIES=preview-delta` commands in the
[recipe documentation](../typing-latency/README.md). Both variants are isolated
Git archives, use distinct release executables, keep the same last visible
preview in the paused control and verify the compiled sources. Do not run builds
or other heavy measurements alongside timing sessions. Summarization rechecks
all 24 final states before writing aggregates.
