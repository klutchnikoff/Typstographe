# typstographe-bibliography

Pure bibliographic values and operations, shared by project libraries (C.3) and
the future personal library (C.4). No filesystem, clock, network, randomness,
GUI, document engine or localization runtime. Callers allocate opaque identities
and own persistence, undo history, recovery and publication.

- Native Hayagriva records with independent stable IDs and editable citation keys.
- Immutable UTF-8 import originals and provenance, BibLaTeX/Hayagriva parsing,
  conversion diagnostics, nonblocking completeness hints and form descriptors.
- Unicode-aware fuzzy title/author search, summaries and available-key suggestions.
- Candidate evidence separate from contradictions and whole-group coherence.
- Immutable reconciliation plans, explicit same/distinct/skip decisions,
  gap-only enrichment, full-library guards and all-or-nothing application in memory.
- Deterministic Hayagriva projection retaining supported native fields and parents.

Public records serialize as `id`, `genre`, `key`, `entry`, `provenance`. The
`entry` is native Hayagriva data, not a flattened title/author/year schema.
Parent paths in `native_value` and field descriptors use arrays, including a
single parent. Field patches replace or remove **complete native fields**;
compound formatted text, publisher and URL controls must preserve their metadata.
`Record::edited` preserves every field outside the supplied patches and refuses
invalid paths, invalid native values and a changed base. Source imports report
unsupported fields; strict record decoding refuses unknown native root/parent
fields instead of dropping them.

Import identities must be fresh within the destination library and unique in a
batch. They remain stable while the plan is reviewed. Reimporting the same source
with fresh proposal identities does not duplicate existing works; source links
are deduplicated by original digest and key. Citation-key collisions remain
naming decisions, never identity evidence. Suggested names never rename an
existing record. Plans cannot be deserialized as trusted mutation instructions.

Apply returns a new `Library`; it never changes its input. A blocked or stale
plan returns an error. Skipping a conflicting incoming record rechecks the
remaining group. Same-work decisions can target another incoming record;
cycles and unrelated targets are rejected. Existing values remain intact even
after a same-work decision: differing fields are listed for a separate correction.

The prepared import contains review diagnostics, including conservative warnings
for unqualified BibLaTeX fields. The caller must present those before publication.
Genre intent is kept independently from conversion: Hayagriva 0.10.1 converts
`@software` to `misc`, while `repository` also covers data. This crate reports
the mismatch; it does not silently rewrite imported types. Form descriptors
describe starting structures; form codecs must account for actual imported
containers, inheritance and unexposed metadata before editing them.

Tests:

```sh
cargo test --locked --offline -p typstographe-bibliography
cargo clippy --locked --offline -p typstographe-bibliography --all-targets -- -D warnings
```

The [contract](../../docs/c3-bibliography-contract.md),
[validated interface](../../docs/c3-bibliography-interface.md) and
[Citekeep-derived corpus](../../fixtures/bibliography/README.md) explain the
remaining integration work and attribution. The current document file format,
citation command targets and GUI manager are not migrated by this crate alone.
