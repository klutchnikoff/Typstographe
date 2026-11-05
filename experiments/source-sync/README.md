# Source mapping and synchronization indexing

Production changes under test:

- Literal projection and UTF-8 byte widths use shared escaping rules without
  allocating temporary strings per character. UTF-16 source positions, surrogate
  pairs, nonbreaking spaces and smart quotes retain their exact semantics.
- RenderSync indexes numbered syntax spans in a single tree walk for **each
  immutable compilation**. Unknown/explicit range spans still use Typst's
  resolver. Nothing is cached across source revisions or document replacement.
  Geometry, transforms, eager link-free click frames and revision guards remain
  unchanged; no work is moved to the first navigation request.

## Controlled native comparison

Reuse the [UI refresh protocol](../ui-refresh/README.md): same fixed
10/50/200-formula Articles (2/7/24 pages), fonts, edit strings, release WebKit,
full RGBA and differential RGBA, two fresh processes per size/mode/variant.
There are 16 prose and 16 formula edits per session; exclude the first warm edit
of each phase, giving 30 samples per cell. Both variants already include the UI
optimization. Before is `c33dbdf`; after is `46c3553`.

In addition to pixel/source/layout/navigation equality, each measured state
records a signature of **every UTF-16 source-map range** and **every source
anchor and transformed geometry coordinate**. Before/after signatures must
match. Hashing has no temporary anchor copy. Map verification happens outside
`mapMs`; anchor verification is included in `syncMs`. Both remain in end-to-end
latency and have their own verification-time counters. These deterministic
128-bit signatures are regression checks, not cryptographic proofs.

Every session retains full replay, dropped-base recovery, stale-view/stale-sync
rejection, page removal/restoration, forward/backward and selection checks.
Reference transactions, UI work and count requests remain instrumented. The
full RGBA harness still includes experimental page-key bookkeeping and
reconciliation; use paired differences, not absolute production guarantees.
Differential RGBA remains an isolated candidate.

## Reproduce on macOS

Requires the app's Node/Rust dependencies, Typst CLI 0.15.1, a visible desktop,
and the pinned renderer dependencies from
`sh experiments/preview-renderers/bootstrap.sh`. Source preparation refuses
existing disposable copies; all transient files stay in ignored `output/`.

```sh
python3 experiments/source-sync/prepare.py before c33dbdf
python3 experiments/source-sync/prepare.py after 46c3553
# Build each copy: replace VARIANT with before, then after.
cd output/source-sync-VARIANT/source
npm --workspace app run build -- --mode recipe
TAURI_CONFIG='{"build":{"frontendDist":"../dist-recipe"}}' \
  CARGO_TARGET_DIR="$PWD/../../../target" cargo build --release --locked --offline \
  -p typstographe-source-sync-VARIANT --features recipe-driver -j 2
cd ../../..
# Wait until both builds and functional checks have finished before measuring.
caffeinate -di node experiments/source-sync/run.mjs before
caffeinate -di node experiments/source-sync/run.mjs after
node experiments/source-sync/summarize.mjs
```

Measured series run successively, without randomized interleaving. Reject and
restart hidden/suspended sessions. Publication and two-animation-frame waits
are distinct measurements; neither is physical GPU presentation. No screenshot,
video, browser performance trace or personal `.typsto` input is used. Raw reports
are losslessly gzipped JSON under `results/`; the summary remains plain JSON.
