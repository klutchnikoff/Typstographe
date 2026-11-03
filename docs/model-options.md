# Model option regimes

Implemented contract, 3 November 2026. A type composes registered structures and
capabilities; each model supplies presentation and a separate YAML manifest.
The manifest cannot replace documentary content or remove a capability.

## One policy authority

Bundled sidecars live beside their templates as `*.model.yaml`. A project pins
the full source as `settings.modelManifest`; each CAS state owns a reference to
those bytes. Typst exports include `model.yaml` alongside `modele.typ`.
The former Typst `editor-options` reader and fixed-page catalogue flags are
removed. Type bindings tagged `presentation` identify capability options without
maintaining a parallel list of field identities in the adapters.

Example Article manifest:

```yaml
contract-version: 1
document-type: article
languages: [fr, en]
options:
  paper: { regime: restricted, allowed: [a4, a5], default: a4 }
  landscape: { regime: imposed, value: false }
  bullet-marker: { regime: imposed, value: auto }
  citation-style: { regime: free, default: chicago-author-date }
  outline: { regime: free, default: false }
```

The registered contract defines valid values. `free` accepts that whole domain;
`restricted` accepts a nonempty, distinct subset containing its default;
`imposed` supplies one valid effective value. Every applicable option must be
declared. Missing/unknown options, unknown policies, type mismatches, invalid
defaults, extra properties and duplicate YAML keys are refused.

The [JSON Schema](schemas/model-manifest.schema.json) is generated from the
Serde/Schemars model; semantic checks additionally validate domains and type
bindings. Parsing uses the same strict, size-limited YAML decoder as types and
is memoized with the existing comemo dependency.

## Retained choices and effective values

| Stored choice | Active regime | Effective value |
| --- | --- | --- |
| `null` (Follow the model) | Free/restricted | Model default |
| Explicit and allowed | Free/restricted | Explicit choice |
| Explicit but excluded | Restricted | Model default, with a substitution diagnostic |
| Any retained choice | Imposed | Imposed value |

Resolving never writes back into metadata. Switching models, saving, reopening
or exporting does not erase a retained choice. Defaults remain defaults rather
than being frozen into the document at creation. Switching back restores a
previous explicit choice if allowed. `bullet-marker: auto` is a valid semantic
marker value; a null documentary choice instead follows the manifest default.

New typed writes are checked against the active policy, including resets to
null. Imposed options cannot be edited. Incoming Yjs settings deltas receive
the same policy check for changed choices; unchanged inactive choices remain
valid. Undo/redo and version composition retain their documentary semantics.
Model source and manifest switch in one guarded, undoable operation.

The document language is author-owned and never substituted. A manifest lists
its supported languages; incompatible model or language changes fail before
publication. The interface language remains independent.

## Adapters and rendering

`model_options::Manifest::resolve` is shared by validation, rendering, CAS main
source generation and export. The renderer receives resolved metadata; archives
and exported metadata retain the original choices. UI policy queries use this
same resolver, without a Typst compilation. Their cache keys exclude body and
rich-header typing and their caches are bounded.

Tauri uses a common native choice control for general and bibliography options.
It offers Follow the model, limits restricted choices, hides imposed controls
and displays a nonblocking substitution notice. An excluded retained choice is
shown as a disabled item, allowing an explicit reset to Follow the model. A free bullet policy also
accepts a custom Unicode character. Choice refreshes keep the control and focus.

CLI and MCP expose the same information through `metadata.get.model_options`:
`choice`, `effective`, `regime`, `default`/`allowed`/`value`, `substituted`,
the finite contract `domain` when applicable, and
supported `languages`. `document.set_model` requires `model_id`, `source` and
`manifest`. Machine commands and GUI edits use the same document engine.

First scope: paper, orientation, bullet marker, citation style and outline.
Model-private parameters and generic resource contracts remain separate work.
[Structured dates](structured-dates.md) are implemented as documentary values,
with formatting selected in Typst by the model. The options lot introduced
container format 12 and source generator 3; structured dates subsequently advance
them to 13 and 4. There is no compatibility reader for development files. The committed Article
sample is regenerated from its Git content; mutable local work is untouched.
Tests use an immutable sample under `fixtures/projects/`, independently of a
user's edits under `examples/`.

```sh
cargo run --locked --offline -p typstographe-core --example model_manifest_schema > docs/schemas/model-manifest.schema.json
cargo test --locked --offline -p typstographe-core model_options
npm run test:browser -- model-options.spec.ts
```

## Verification

- 442 workspace Rust tests passed; one performance diagnostic remains ignored.
- 421 web unit tests and six Node checks passed.
- 44 targeted Chromium/WebKit cases qualified across the initial run and targeted
  reruns. The native-select/custom-input WebKit focus case passed three consecutive
  repeats after its deferred-focus correction; an unrelated focus is never stolen.
- Clippy for the workspace/all targets, both formatters, the 800-line guard,
  the core dependency boundary and 17 CI-policy/architecture checks passed.
- Tests cover strict manifests, follow-model versus explicit choices, excluded
  choices, language refusal, protected new writes, history, snapshots, reopen,
  effective Typst/PDF export and frontend controls. Model options are not exposed
  as plain-text zones, preventing indirect writes through text commands.
- The mutable local sample's SHA-256 is unchanged. Only the regenerated Git sample
  and its stable test fixture are committed; personal local files are excluded.
