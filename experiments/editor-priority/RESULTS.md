# Prioritize typing over secondary interface refresh

Measured 5 November 2026 on Apple M1 Max, 32 GiB, macOS 25.6.0. The production
changes leave the Rust document/rendering engines and binary preview protocol
unchanged. The goal is a faster editor response, even if secondary UI updates
must wait until after an opportunity to display the character.

## Isolated changes

1. `08f0c24`: differential preview with the old page-reconciliation/UI schedule.
2. `b7eca7c` (`dom`): remove replaced page nodes before inserting new ones; retained
   pages stay in place. Do not clear empty SVG overlays. Pixel preparation and
   fresh navigation handlers still publish atomically, with existing stale guards.
3. `029349b` (`after`): route both command-surface events and general status refresh
   through the same coalescer. A rendering callback schedules a subsequent task,
   rather than a microtask that would still run before rendering. Command target
   and permission checks remain immediate at invocation. Pending work is cancelled
   on close; a 100 ms fallback serves hidden/suspended windows without waiting for
   their animation frames. No typing debounce or deliberate compile delay is added.

The DOM change is deliberately small: on the 24-page typing phases, measured page
insertions fall from 1,104 to 46, while typing p95 barely changes. The larger
improvement follows moving/coalescing secondary UI work out of the critical path.
The command-surface listener previously refreshed synchronously on transactions,
in addition to the main UI's microtask refresh.

## Measurement and correctness

The [native recipe](../typing-latency/README.md) uses protocol 2 for **all three
variants**, including the reference. Do not compare raw timings from this probe
with the older protocol as if the probes were identical.

Same deterministic 2/7/24-page Articles, release Tauri/WebKit, preview enabled and
paused. Two fresh processes per size/mode/variant, reverse mode order on the second
pass. A worker schedules 24 native WebKit insertions at 100 ms/key, then 24 at
250 ms/key. No builds or browser suites run alongside timed sessions. No captures.

All **36 sessions** pass, with no discarded runs and **1,728 input operations**
retained. Compiled application frontend/core and probe fingerprints match. Final
text, source, selection, page pixel hashes and forward/backward/selection navigation
match all modes, variants and repetitions. All 864 preview-enabled inputs have a
matching publication, including the last pending update drained after each phase.
Input percentiles omit the first two characters per phase: 44 samples/cell.

Three distinct metrics start at worker delivery (`sent`), excluding timer jitter:

- **Typing:** first animation-frame opportunity after the native insertion.
- **Preview DOM:** the publication callback after complete canvas publication,
  resolved references and preview status updates. Includes document confirmation,
  compilation, transfer and browser preparation.
- **Preview frame:** first animation-frame opportunity after that publication.

The preview callback records the revision and inserted-character count. An input
matches the first subsequent publication containing at least that many characters.
The phase remains observed through the last preview and its following frame;
there are no silently censored final inputs. The paused control intentionally has
no input-to-preview statistic during typing.

These are scheduling/publication measurements, **not physical keyboard-to-photon
measurements**. A rendering callback is an opportunity to display, not proof of GPU
presentation. Publication instrumentation includes a short first-paragraph text
read and an extra animation callback; it is identical across all three variants.
P95 is nearest-rank over the pooled 44 samples, rounded below to milliseconds.

## Two user-facing p95 metrics, preview enabled

| Pages | Interval/key | Typing before → DOM only → after | Preview frame before → DOM only → after | Preview DOM before → after |
| ---: | ---: | ---: | ---: | ---: |
| 2 | 100 ms | 12 → 14 → 13 ms | 39 → 40 → 38 ms | 27 → 26 ms |
| 2 | 250 ms | 20 → 20 → 14 ms | 59 → 60 → 51 ms | 53 → 47 ms |
| 7 | 100 ms | 13 → 11 → 17 ms | 46 → 44 → 41 ms | 35 → 31 ms |
| 7 | 250 ms | 23 → 23 → 14 ms | 65 → 69 → 60 ms | 57 → 51 ms |
| 24 | 100 ms | **17 → 16 → 13 ms** | **70 → 72 → 60 ms** | **63 → 52 ms** |
| 24 | 250 ms | **25 → 25 → 16 ms** | **90 → 89 → 80 ms** | **81 → 69 ms** |

The direct end-to-end preview measurement is longer than the native IPC round trip;
that distinction is intentional. Neither the second RAF after input nor IPC alone
is labelled as complete preview latency.

On 24 pages, the typing improvement appears in both fresh processes:

| Interval/key | Before, run 0 / run 1 | DOM only | After |
| ---: | ---: | ---: | ---: |
| 100 ms | 14 / 17 ms | 16 / 16 ms | 11 / 13 ms |
| 250 ms | 25 / 25 ms | 25 / 24 ms | 15 / 16 ms |

## Controls, outliers and limits

The paused-preview control also improves on 24 pages: typing p95 18 → 14 ms at
100 ms/key, and 29 → 18 ms at 250 ms/key. This supports the shared UI scheduling
change as an editor-side improvement independent of compiling/painting the preview.

On 24 pages with preview enabled, `editor.dispatch` p95 drops 6 → 4 ms at 100 ms
and 11 → 6 ms at 250 ms. Individual UI refreshes need not become faster: they run
later and redundant synchronous refreshes are coalesced. The native insertion call
itself remains 1 ms p95 at 100 ms and 2 ms at 250 ms.

Maximum frame gaps on 24 pages fall 46 → 34 ms at 100 ms/key, and 39 → 26 ms at
250 ms/key. Outliers remain. Improvement is **not uniform**: 7 pages / 100 ms has
typing p95 13 → 17 ms despite shorter measured dispatch work, and the 2-page fast
case is roughly unchanged. Frame phasing/browser work can affect these metrics;
this experiment does not prove the cause of each change or offer confidence
intervals from only two processes per cell.

These cases insert short text in the first paragraph. Repagination, startup,
different machines/refresh rates and large structural edits require their own
measurements. No claim is made of zero jank or a universal one-frame guarantee.

## Artifacts and reproduction

[Aggregate and verified build identities](../typing-latency/results/editor-priority/summary.json),
[reference raw observations](../typing-latency/results/editor-priority/before-raw.json.gz),
[DOM-only raw observations](../typing-latency/results/editor-priority/dom-raw.json.gz),
[combined raw observations](../typing-latency/results/editor-priority/after-raw.json.gz).

Use `TOG_TYPING_SERIES=editor-priority` for prepare/build/run commands. Prepare
`before 08f0c24`, `dom b7eca7c`, `after 029349b`; keep the same recipe/probe in all
variants and an unlocked active desktop. Once all builds finish, run each variant
without other heavy tasks, then summarize:

```sh
TOG_TYPING_SERIES=editor-priority TOG_TYPING_VARIANTS=before,dom,after node experiments/typing-latency/summarize.mjs
```

Existing output source directories are never overwritten by preparation. Source
archives and distinct statically linked executables remain local for reproduction;
the aggregate and compressed raw observations are versioned. Re-summarization
revalidates all 36 final states before writing results.
