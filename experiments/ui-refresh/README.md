# Interface refresh and unchanged reference transactions

[Measured results](RESULTS.md).

Production changes: batch UI invalidations in a microtask (no typing timer or
extra animation frame), refresh command availability once, skip unchanged
Unicode count requests, and publish reference metadata only when values or the
document generation change. Actual command execution still checks live
availability. Formatting, selection, locale, failures and document replacement
retain their normal behavior.

## Native before/after measurement

This reuses the [validated native pipeline](../tinymist-pipeline/README.md) and
the same deterministic 10/50/200-formula Articles (2/7/24 pages). It measures
**executed** UI work, rather than queued refresh requests. A separate span counts
actual reference transactions; returned count requests are recorded by the
existing IPC probe. Scalar spans are inclusive/nested: do not sum them.

Two fresh processes per size and renderer, full RGBA and differential RGBA,
16 prose and 16 formula edits each. Exclude the first warm edit of each phase
from summaries (30 samples per cell). The corpus has no cross-references, so the
unchanged index is empty; unit and browser tests separately verify nonempty
labels, updates and generation changes. Publication precedes a further wait for
two animation frames; neither timestamp claims physical GPU presentation.

Every session retains full replay, dropped-base recovery, stale-view/stale-sync
rejection, page removal/restoration and forward/backward/selection checks. The
summary also requires exact before/after source SHA, pixel hashes, geometry and
navigation equivalence. Full RGBA still goes through the experimental harness,
including its visual-key bookkeeping; this is a controlled comparison, not a
promise of absolute production latency. Differential RGBA remains isolated.

No application lock/dependency, user project, image capture, video or browser
profiler trace is changed or recorded. Measure only once builds and functional
browser checks have finished, on a visible desktop. Hidden/suspended sessions
are rejected and restarted. Before/after processes run successively, so machine
load and process order remain limitations; report distributions rather than a
single fastest sample.

## Reproduce

Requires the pinned dependencies prepared by
`sh experiments/preview-renderers/bootstrap.sh`, Node, Rust, Typst CLI 0.15.1
and macOS. Preparation refuses to overwrite existing disposable source copies.
The application checkout and its local documents are never used as inputs.

```sh
python3 experiments/ui-refresh/prepare.py before 069decc
python3 experiments/ui-refresh/prepare.py after 32084ed
# For each copy (replace VARIANT with before, then after):
cd output/ui-refresh-VARIANT/source
npm --workspace app run build -- --mode recipe
TAURI_CONFIG='{"build":{"frontendDist":"../dist-recipe"}}' \
  CARGO_TARGET_DIR="$PWD/../../../target" cargo build --release --locked --offline \
  -p typstographe-ui-refresh-VARIANT --features recipe-driver -j 2
cd ../../..
caffeinate -di node experiments/ui-refresh/run.mjs before
caffeinate -di node experiments/ui-refresh/run.mjs after
node experiments/ui-refresh/summarize.mjs
```

Raw reports and results are in `results/`; transient native session folders,
builds, corpora and copied workspaces remain under ignored `output/`.
