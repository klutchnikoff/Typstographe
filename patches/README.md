# Dependency patches

`npm ci` applies the patches with `patch-package --error-on-fail`. They are
versioned, fail explicitly if they no longer apply, and must be reviewed when
upgrading their dependencies.

## @tiptap/y-tiptap 3.0.10: shared text runs

A valid Rust/Yrs paragraph can contain several adjacent `Y.XmlText` objects,
for example a plain run followed by an italic run and another plain run. Its
ProseMirror projection groups those runs into one normalized text sequence.
The position-migration reader previously used the normalized child index as
its physical XML child index. Structural edits then threw `Position tracking
requires synchronized editor content`; ordinary character deletion used a fast
path and could still work.

The patch traverses the physical children independently, reads every original
character ID, and verifies that their text matches the projected sequence. It
keeps the regular migration mechanism, formatting and inline objects. It does
not catch and ignore inconsistencies, rebuild the document, or disable CRDT
position tracking. Empty shared text objects do not displace subsequent nodes.
Both ESM and CommonJS distributions, and the matching TypeScript source, carry
the same correction. The upstream 3.0.12 tarball was checked on 2026-11-01 and
still had this assumption; the application remains pinned to 3.0.10.

Regression coverage: `app/tests/shared-text-runs.test.ts`, opening an actual
archive in `app/tests/browser/persisted-paragraph-input.spec.ts`, and the native
paragraph-input recipe. Keep the patch until an upstream release passes these
recipes without it. Upstream source: <https://github.com/ueberdosis/tiptap>.
The upstream MIT notice is retained in
`app/public/licenses/y-tiptap-LICENSE.txt` and distributed with the frontend.

To exercise the actual desktop WebView and native IPC on a copy of the example:

```sh
npm run build:recipe -- --offline
npm run test:paragraph-input-native
```

An optional `.typsto` path selects another input. `--manual` waits for physical
keys in the diagnostic window; the default uses dispatched keyboard events in
that real WebView. The recipe records which was used, verifies both archive
hashes, and writes reports under `output/paragraph-input-native/`. It never
opens or writes the personal recovery session and takes no screenshots.

## @tiptap/y-tiptap 3.0.10: appended transactions after text edits

Plain text insertions take a fast path in `mapPositionMigration`: they keep their
Yjs character identities and compute no migration. A plugin can append a
structural transaction in the same dispatch, before the view writes the text to
Yjs; the link extension does so when it removes the mark from a trailing space.
That transaction used to read Yjs as if it already held the inserted text, and
the strict text check above then threw `Position tracking requires synchronized
editor text`.

The patch remembers the unsynced fast-path transactions per binding. A following
structural transaction reads the Yjs content of the document they started from
and maps it through them before its own steps. It still reads Yjs directly when
no such chain exists, so a real inconsistency keeps failing explicitly.

Regression coverage: `app/tests/browser/bands.spec.ts` (links and table
deletion), which inserts a linked text with a trailing space in the real editor.
