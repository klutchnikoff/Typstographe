# Common pipeline and real VS Code/Tinymist comparison

[Results and revised recommendation](RESULTS.md).

The previous experiment replaced the renderer **inside our application pipeline**.
This experiment measures that common work and the installed Tinymist extension
inside **real VS Code**, including its builtin SVG preview. No application code,
lock, document format or user `.typsto` file is changed.

## Method

- Same 10/50/200-formula Articles, with deterministic paragraph identities added
  only to the benchmark inputs. They retain the same 2/7/24-page layout.
- `export.rs` calls the application core's source projection and normal standalone
  Typst exporter: main file, model, metadata, packages and used fonts. Each state
  has a SHA-256. The native preview's actual source matches the exported source;
  the same strings are applied in VS Code through minimal `WorkspaceEdit`s.
- Native candidates retain the compiler, confirmation, guards and RenderSync.
  Additional scalar counters measure editor dispatch/view updates, UI refresh,
  reference publication, and milestones before/after the normal render request.
  Counters are inclusive and nested: **never add their totals indiscriminately**.
- VS Code uses a separate profile, only Tinymist and a local recipe extension,
  exported fonts with system font discovery disabled, no PDF export on typing,
  and no auto-update or Git integration. Existing user windows/settings are not
  used. Profiles use short paths under `/private/tmp` because long macOS local
  socket paths prevented startup in a pilot.
- An installed extension is linked into each isolated extensions directory.
  No installed server/frontend file or renderer logic is replaced. Runtime
  wrappers measure the original methods and observe SVG mutations. Playwright connects to
  that instance's loopback DevTools port; this is not a browser reconstruction
  of VS Code. The recipe helper edits only its copied `contenu.typ`.
- A blank Article is rendered first. Then insert the full corpus, 16 prose edits,
  16 formula edits. Two fresh processes per size/mode; first warm edit excluded
  from summaries. Reverse mode order on the second pass. Native and VS Code
  measurements run **successively**, after builds finish.
- VS Code modes: partial rendering enabled/disabled. Normal builtin renderer,
  normal LSP path, normal source-map data; no feature removed to gain speed.

## What is timed

The native start is immediately before the structured editor command. Its
publication event follows prepared canvas publication and reference updates.

The VS Code start is immediately before `workspace.applyEdit` in the extension
host. Computing the minimal diff happens beforehand, like a caller that already
knows the requested edit. The preview hooks original session methods, calls them
unchanged, and observes SVG mutations inside `svg.typst-doc`. **The first observed
DOM patch can precede remaining layout/postprocessing**. It is not equivalent to
our native publication callback. The primary cross-application comparison is
therefore the additional wait for **two animation frames** in both applications.
Neither metric is a physical GPU presentation timestamp or a keyboard/IME test.

Extension-host and webview clocks are calibrated separately against the runner
using twelve round trips; choose the minimum-RTT midpoint estimate. Preserve raw
and corrected timings and the uncertainty bound. Network/CDP polling time does
not become the preview's end timestamp. Hidden samples fail the run. The normal
VS Code always-on-top command keeps the dedicated window unobscured.

Native windows are 1280×900; VS Code reports 1440×900 despite the requested startup
size. Preview SVG width is 528 CSS pixels at DPR 2; record all viewports. Both
compile the same point dimensions/fonts. Browser engines differ: native WebKit
versus VS Code's Electron/Chromium. These are real application comparisons,
**not a controlled estimate of the isolated benefit of SVG versus Canvas**.

## Synchronization and checks

Native full-replay, stale-view/stale-sync rejection, dropped-delta recovery,
page-count changes, forward/backward and selection checks are inherited and
remain mandatory. Both native candidates must return identical navigation data.

For VS Code, real Cmd-click input must return to the copied body source. The
source→preview command is recorded separately: after the unsaved edit sequence
it did not produce an observed scroll in the automated recipe. A separate
initial-document diagnostic did scroll correctly. This check remains
**inconclusive** and does not establish a Tinymist defect or passed forward-sync
qualification. It does not invalidate the independently timed edits.

Every measured source and page geometry is checked across hosts. No screenshot,
video, browser profiler trace or personal project is recorded.

## Reproduce on macOS

Requires Node, Rust, the app's normal dependencies, Typst CLI 0.15.1 for preparing
the prior corpus, VS Code and Tinymist. Measured versions: Code 1.144.0,
Tinymist 0.15.12, language version 0.15.1. Tinymist's compiler is its patched
Typst fork; the app retains official Typst 0.15.1. Exact versions/hashes are in
[the manifest](results/manifest.json).

First download the pinned renderer dependencies with
`sh experiments/preview-renderers/bootstrap.sh` if they are not already present.
Its disposable source directory must not already exist. This preparation does
not build or replace the application. Then:

```sh
python3 experiments/tinymist-pipeline/prepare.py
python3 experiments/tinymist-pipeline/prepare-exporter.py
CARGO_TARGET_DIR="$PWD/target" cargo run --locked --offline --release \
  --manifest-path output/tinymist-pipeline/exporter/Cargo.toml -j 2 -- \
  output/tinymist-pipeline/corpora.json output/tinymist-pipeline/articles
cd output/tinymist-pipeline/source
npm --workspace app run build -- --mode recipe
TAURI_CONFIG='{"build":{"frontendDist":"../dist-recipe"}}' \
  CARGO_TARGET_DIR="$PWD/../../../target" cargo build --locked --offline \
  --release -p typstographe-tinymist-pipeline --features recipe-driver -j 2
cd ../../..
caffeinate -di node experiments/tinymist-pipeline/run-native.mjs --smoke
caffeinate -di node experiments/tinymist-pipeline/run-vscode.mjs --smoke
caffeinate -di node experiments/tinymist-pipeline/run-native.mjs
caffeinate -di node experiments/tinymist-pipeline/run-vscode.mjs
node experiments/tinymist-pipeline/summarize.mjs
```

`TOG_TINYMIST_EXTENSION` and `TOG_VSCODE_CLI` override the installed locations.
The default extension path pins `myriad-dreamin.tinymist-0.15.12-darwin-arm64`.
Preparation refuses to overwrite its source/exporter; the exporter refuses a
nonempty destination. A rerun needs fresh copies for these steps, not deletion
of application data. Each runner creates fresh session/profile/project folders;
only the benchmark's own VS Code instance is closed afterward. Runtime caches
and diagnostic pilots stay outside Git under `output/` or the named temporary
profile directories. Raw final reports are in `results/`.
