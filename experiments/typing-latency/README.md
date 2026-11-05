# Continuous native editing responsiveness

This measures the production full-RGBA Tauri/WebKit pipeline, with preview
updates enabled/paused. Both cases retain the same visible last preview, window
layout, editor, Unicode counters, document confirmation and preservation rules.
No experimental differential renderer is substituted.

An independent Web Worker schedules 24 characters at 100 ms intervals and then
24 at 250 ms intervals. Main-thread delivery uses WebKit's native
`document.execCommand('insertText')` editing path, including native input events,
DOM observation and ProseMirror updates. Record worker jitter, main-thread queue
delay, native edit call time and the next one/two animation-frame opportunities.
This is **not physical OS keyboard latency**: keydown/IME/device delivery and
physical GPU presentation are not measured. The worker clock prevents a blocked
main thread from quietly slowing the stimulus and hiding queue delay.

The same fixed 10/50/200-formula Articles (2/7/24 pages) are used. Two fresh
processes per size/mode/variant; reverse mode order on the second pass. Exclude
the first two characters from each phase's input percentiles (44 samples/cell).
Keep all synchronous-span and frame-gap observations, including warm-up, and
report generator jitter. Spans are inclusive/nested; do not sum them.

Probe real editor dispatch, UI refresh, preview snapshot, canvas uploads and
atomic page publication. IPC is timed separately and does not imply blocking of
the JavaScript thread. Final text/selection/source/pixels/navigation must match
between modes and variants. Every character must survive native editing and
document confirmation; each report verifies compiled core and frontend stamps.

Prepare uses a disposable Git archive and a recipe-only CSP permission for the
worker clock (`worker-src blob:`). It never opens a personal project, captures
images/video or records a browser profiler trace. Scalar raw JSON is gzipped.
Visible native windows are required; hidden/suspended sessions are rejected.

```sh
python3 experiments/typing-latency/prepare.py before dae6c9c
sh experiments/typing-latency/build.sh before
caffeinate -di node experiments/typing-latency/run.mjs before --smoke
caffeinate -di node experiments/typing-latency/run.mjs before
node experiments/typing-latency/summarize.mjs --baseline
# After committing the production correction:
python3 experiments/typing-latency/prepare.py after AFTER_REF
sh experiments/typing-latency/build.sh after
caffeinate -di node experiments/typing-latency/run.mjs after
node experiments/typing-latency/summarize.mjs
```

Do not run builds/tests alongside the timed sessions. The build helper cleans
only the local release core (not third-party dependencies), avoiding shared
Cargo-target reuse of archived local sources. It cleans instrumented core
artifacts on exit; statically linked measurement executables remain usable.
