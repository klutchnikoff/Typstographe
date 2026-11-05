# Continuous-input baseline — 5 November 2026

Before production commit `4d4af70`: actual release Tauri/WebKit, full RGBA,
fixed 2/7/24-page Articles. Twelve accepted sessions, two fresh processes per
size/preview mode. Every character survives editing and confirmation; final
text, selection, source, pixels and navigation match across on/off modes.

Input at 100 and 250 ms per character. Exclude the first two inputs per phase:
44 samples/cell. The worker supplies an independent clock. These are native
WebKit editing operations, not physical OS keyboard or GPU timestamps.

24-page Article, 250 ms cadence:

| Metric | Preview updating | Preview paused |
| --- | ---: | ---: |
| Worker message → main handler, p95 | 25 ms | 2 ms |
| Scheduled input → next animation-frame opportunity, p95 | 40 ms | 34 ms |
| Frame gap, p95 | 78 ms | 32 ms |
| Largest observed frame gap | 123 ms | 43 ms |

During the two preview-on phases, 1,104 canvas uploads run in 46 publications
(24 pages each). Each upload is at most 4 ms in this series, but the synchronous
page loop chains them without allowing input or rendering between pages.
At the faster 100 ms cadence, no preview is published during these long-Article
phases: obsolete results are rejected. Its input p95 is 17 ms with updates and
20 ms paused. This distinction matters: rendering load and arrival timing,
rather than preview latency alone, determine the typing interruptions.

Production correction `4d4af70` prepares detached pages in ~4 ms CPU slices,
yields full browser tasks, cancels obsolete work, retains atomic publication,
and explicitly releases abandoned/replaced canvas backing stores. Navigation
retains lightweight revision/page metadata instead of the complete RGBA packet.
There is no fixed 500–600 ms typing debounce. Latest-only compilation is kept.

459 Vitest tests and 14 Chromium/WebKit functional cases pass, including sliced
preparation, stale cancellation, upload failure, closure, pixel publication,
reference badges and backward navigation. Production build and formatting pass.
The Vite watcher test times out inside the sandbox and passes outside it.

**After measurements are pending:** macOS switched to `loginwindow`; the native
window could not activate and its animation frames stopped. Those runs failed
before input and are excluded. Do not report an after gain from unit tests or
background/hidden windows. The after executable and runner are ready to resume
on an unlocked desktop:

```sh
caffeinate -di node experiments/typing-latency/run.mjs after
node experiments/typing-latency/summarize.mjs
```

[Protocol](README.md), [baseline summary](results/baseline.json),
[baseline raw JSON, gzip](results/before-raw.json.gz).
