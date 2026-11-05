# Shared resource references — B.1

The Letter signature is a normal image-reference field. Its declaration, value
schema, form, commands and initialization use the shared resource primitive.
The image pool, decoder, CAS and atomic editing engine are reused.

## First scope

The registered resource kind is `image`: PNG, JPEG and SVG (internal JPEG paths
use `.jpg`). Bibliography retains its domain contract until C.3; fonts and Typst
packages retain their application catalogues. Record resource controls are not
registered yet; unsupported declarations fail at type loading.

```yaml
- id: sender.signature
  kind: resource-reference
  resource-kind: image
  profile-default: signature
  label-key: web-document-signature
```

The field has an ordinary binding to `signature` and belongs to an ordinary
header section. There is no special `signature:` declaration or
`document.set_signature` command.

`profile-default` is optional. Its first registered source is `signature`.
It describes an adapter initialization opportunity, not private profile data or
a core-side lookup. The only declaration default is `null`; external defaults
cannot be smuggled into a type through arbitrary file paths.

## Value, validation and rendering

The Rust `ResourceReference` wraps a validated logical path. Its JSON value is a
string such as `"images/abc123.svg"`, or `null` for absence. Reusing the existing
logical paths avoids a second identity table beside the immutable pool and CAS.
Absolute host paths, URLs, traversal, unsupported formats and malformed paths are
rejected by the common contract. A non-null reference must exist in the project.
A required-for-export field can still be absent in a saved draft.

`document_types.describe` exposes the value schema and field descriptor:
`resource.kind`, `resource.profile_default`. Native controls consume the same
descriptor. Resource references are excluded from text zones, spelling, search
and character-offset editing, even though their wire representation is a string.

Typst receives an escaped internal path or `none`. The model owns dimensions,
placement and all presentation. The personal-letter model still reserves the
handwritten-signature space when the image is absent.

```json
{
  "id": "metadata.set",
  "params": {
    "target": {"kind": "metadata", "field": "sender.signature"},
    "value": "images/abc123.svg"
  }
}
```

To import, precede that step with `resource.add` containing the validated-image
path and base64 bytes in the same documentary batch. Use `value: null` to remove
the reference. CLI and autonomous MCP use the same operations. Attached MCP
retains its existing read-only restrictions on metadata and resources.

## Shared control and profile

The common control offers an image preview, file selection/replacement and
removal. A declared profile source adds the explicit reset action. File reading
is an adapter operation; decoding is performed by the existing pure core decoder.
Save and export wait for decoding and guarded publication to finish.

At creation, the adapter copies the declared profile default and its bytes into
the project. No document-type condition is needed. Subsequent profile changes do
not alter the document; resetting from preferences makes another explicit copy.
The core receives values and bytes, never access to application preferences.

## Atomicity, recovery and retention

Image admission and reference assignment form one guarded batch and one undo
entry. A concurrent field change refuses the operation. Refused input retains
its proposed path **and prepared image bytes** in the common metadata draft;
retry or recovered-input validation submits the same complete batch. Private
bytes stay in the field recovery payload until admission, without publishing them
to the owner or other windows. No duplicate copy is added to the live image pool.

Bytes are immutable under a logical path. A replacement admits a new resource.
Clearing the field removes the reference; undo/redo and retained project versions
keep the images they need. Current-state save/export retention follows every
declared resource field, body figures and model dependencies. In a broken model,
the existing conservative retention rule protects work rather than guessing
which images are unused.

Archive boundaries and image admission validate bytes. Ordinary editing checks
references against the already-admitted pool; it does not decode images again
for every metadata keystroke.

## Format and removed special paths

Container format **14** records the shared field identity `sender.signature` in
Yjs. The source generator stays **4**: the signature argument and JSON metadata
path representation remain unchanged. Development formats have no compatibility
reader. The committed Article sample is regenerated from Git, independently of
mutable local examples.

The signature-only YAML structure, command, shared override key, UI section and
retention/validation branches are removed. Global preferences still expose a
signature image; that private preference is a distinct application concern.

## Verification — 3 November 2026

- Rust workspace: 449 tests passed, one pre-existing performance test ignored;
  a final focused API check also protects resource fields from text-offset edits.
- Web: 429 Vitest tests and six Node tests passed. They cover profile-copy
  isolation, decoding/save gates, concurrent refusal, private bytes and recovery.
- Yjs/Yrs: all 29 cross-contract recipes passed after bringing the model-manifest
  fixtures up to date. The image/reference batch, undo/redo and object identity
  are verified through the native adapter.
- Chromium/WebKit: 34 metadata/resource cases qualified across the initial run
  and focused reruns, including profile-based creation, sharing, save/reopen,
  keyboard navigation and focus after removal. No captures or traces were made.
- Clippy for all workspace targets, both formatters, 19 CI-policy tests, the
  production-file length guard and core dependency boundary passed.
- Existing local Article files retain their SHA-256 hashes. A separate local
  `examples/article-cas14.typsto` copies the current committed sample.

The recipes also caught an earlier new-document date initialization that still
produced a raw string. It now produces an explicit calendar date. Profile text
fields exclude resource controls and cannot override their typed defaults.
