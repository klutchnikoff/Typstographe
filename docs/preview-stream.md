# Desktop preview stream

The production desktop preview compiles incrementally with Typst, then sends
raw RGBA **only for pages whose visual key changed**. It keeps the last valid
preview visible until the complete next revision is ready. It does not debounce
editing, alter confirmed document state, undo, preservation or export.

## Identity and acknowledgement

`preview_bind(generation)` returns a window-local epoch. Joining/reloading or
closing the window detaches its old epoch and invalidates its work. Changing
document generation cannot reuse a base. Only binding can create an epoch;
late render/invalidation requests cannot recreate a detached view.

`preview_delta(snapshot, request)` carries:

- `scope: { generation, epoch, version }`: document identity, view lifetime and
  monotonically increasing local editing version;
- `base`: the ID of the frame **actually displayed**, or `null`.

A produced frame is a candidate, never an implicit acknowledgement. Each native
view retains at most a displayed record and its latest candidate (immutable
synchronization maps and visual keys, no pixel buffers). A subsequent request
naming that candidate promotes it to the displayed base. Discarding any number
of responses therefore preserves the last acknowledged base. Missing/unknown
bases get a full RGBA packet; they never silently reuse a different frame.

`TOG1` packets retain the full source, page sizes and resolved references. The
optional `delta` manifest gives the scope, a new frame `id`, acknowledged `base`
and keys for **all** pages. Binary descriptors give ordered, unique page
`index` values for changed pages only. A null base contains every page; a delta
may contain no pixels. The decoder validates manifests, dimensions, indices,
byte offsets and RGBA lengths before viewing the native buffer without copying.

## Visual keys and synchronization

The key hashes the normalized Typst frame, page fill and bleed and all raster
options. Geometry, glyphs/fonts, images, shapes, transforms and clipping remain.
Only non-painting source spans, semantic tags, links and group labels/parents
are stripped. The 128-bit hash uses Typst's native hash infrastructure; this is
a render-cache identity with its usual collision assumption, not a persisted
content-addressed archive or a proof of cryptographic pixel identity.

Every successful revision builds a **fresh** `RenderSync`, including source
mapping and UTF-16 positions, even if no pixels changed. Production
`preview_sync` addresses `{ generation, epoch, id }` plus revision, and checks
window membership and current revision. New pixels, metadata, page order and
navigation handlers publish together. The legacy full-render and synchronization
endpoints remain available for diagnostics and non-stream consumers.

The browser retains unchanged canvases at the same page index and key. It
prepares only changed canvases off-DOM, yields between preparation slices and
checks its ticket after every yield. It never modifies reused nodes or their
navigation closures during preparation. An obsolete/failed preparation releases
only new canvases/URLs. Success releases only replaced/removed pages. A base
mismatch retries a full frame without blanking the visible preview.

## Obsolete work

The first edit while a native request is active sends one `preview_invalidate`
with the newer view version. Atomic maximum ordering prevents a late cancellation
from invalidating a newer request. Same-version duplicate requests also have
separate attempt IDs. Native checks run before/after waiting for the compiler,
after compilation, between pages, before synchronization and before/after packet
assembly, followed by a final session/version check before caching the result.
A running Typst compilation or individual page raster is allowed to finish;
its remaining work is then skipped. There is no unsafe interruption of Typst.

The compiler never waits for the session mutex while holding its own lock:
contention conservatively abandons the preview and retries the latest request.
The frontend queue allows one active request and keeps only the latest pending
state. Neither cancellation nor differential transfer changes document commands
or persistence. Scoped stream endpoints are internal IPC, not public CLI/MCP
editing commands.

## Verification

Tests cover complete-versus-differential pixels, invisible source/link changes
with fresh forward/backward/selection mappings, fonts/images/options/dimensions,
cancellation boundaries, dropped replies, unknown bases, reloads, window/epoch
isolation, zero-pixel revisions, page addition/removal, atomic publication and
cleanup. Chromium and WebKit exercise the real Rust transport without captures.
Native continuous-input measurements use the isolated
[typing-latency recipe](../experiments/typing-latency/README.md); an unlocked,
active desktop is required. Results must distinguish input latency, render
latency, transfer size and surviving outliers.
