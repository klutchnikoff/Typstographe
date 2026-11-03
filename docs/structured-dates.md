# Structured documentary dates

Implemented for the Letter and internal Meeting-minutes contracts in B.1. This
is a common field kind (`kind: date`), not a text control that guesses ISO dates.
The same validation and serializer serve Tauri, CLI and MCP.

## Values and validation

| Value | JSON | Typst argument |
| --- | --- | --- |
| Absent | `null` | `none` |
| Complete Gregorian date | `{"kind":"calendar","iso":"2026-11-03"}` | `datetime(year: 2026, month: 11, day: 3)` |
| Custom literal text | `{"kind":"custom","text":"Early November 2026"}` | Escaped string |

Calendar dates use canonical `YYYY-MM-DD`, with years 0001–9999. Impossible
calendar dates, unknown keys/kinds, raw strings and control characters are
rejected. Custom text must be nonblank, single-line and at most 16,000 UTF-8 bytes.
It is never reclassified: custom `2026-02-30` or `today` remains literal text.
Partial dates, approximate dates and ranges use custom text in this first scope.
There is no time, timezone, relative date, locale parser or clock in the core.

This first scope registers root-form fields; date fields inside record collections
are rejected at type loading until their control is registered. The default is `null`. A required-for-export date can still be absent in a saved
draft; the common export diagnostics report the missing value. These structured
fields are not text zones and cannot be changed through character offsets.

```yaml
- id: letter.date
  kind: date
  label-key: field-date
```

```json
{
  "id": "metadata.set",
  "params": {
    "target": {"kind": "metadata", "field": "letter.date"},
    "value": {"kind": "calendar", "iso": "2026-11-03"}
  }
}
```

Use `value: null` to clear the date, or `kind: custom` with `text` to enter prose.
`document_types.describe.values_schema` supplies the value schema and `metadata.get` returns the
actual structured value. Calendar validation applies to commands, raw shared
updates, stored values and YAML defaults, before Typst compilation.

## Shared control and conservation

The compact date control offers Date / Custom text, an editable value, Today and
a small trash button. It is generated from the field kind, independently of the
document type. The trash remains available for export-required fields.
Today reads the adapter's local calendar once and publishes a fixed date.

Changing mode prepares an empty replacement without converting or deleting the
confirmed date. Incomplete replacements use `MetadataCommands.stage` and the
same native-field error, retry, Escape/cancel and private recovery path as other
metadata. Saving/exporting waits for completion or cancellation. A valid new
value is published through the usual typed command and undo history. A recovered
draft still needs explicit validation. IME preedition stays local until commit.
The browser's native calendar owns its incomplete date segments; they are not
published as partial documentary dates. Use the trash to remove a date.

## Typst and Datify

The stable wrapper is in `templates/capabilities/dates.typ`:

```typst
#let format-date(value, lang: "fr", format: "long") = { /* implementation */ }
```

- `none` returns empty content; strings return literal content.
- Native `datetime` values use Datify 1.3.0 / datify-core 2.1.0 for localized
  `long` (default) and `short` dates. French long dates retain superscript `1er`.
- `iso` uses Typst's native date display for stable `YYYY-MM-DD`.
- Unknown formats and unsupported value types fail explicitly.

The model selects the format in Typst. This lot adds no date-format option to
the model manifest or end-user preferences. The document language is independent
of the interface language. Dependencies remain inventoried, bundled and usable
offline in the application and exported sources.

The personal-letter model inserts the localized date prefix only for calendar
dates: `Rennes, le 3 novembre 2026`, or `Le 3 novembre 2026` without a place.
Custom text receives neither an automatic prefix nor case changes. The model
continues to own the place, punctuation and layout; the author owns the date.

## Development format

Container format **13** and source generator **4** record this explicit date
contract and native Typst arguments. There is no compatibility reader for
experimental formats. The committed Article example and immutable test fixture
are regenerated from the previous Git example; mutable local documents remain
untouched.

## Verification — 3 November 2026

- Rust workspace: 447 tests passed, one pre-existing performance test ignored.
  Targeted follow-up checks cover the final type-schema discovery, generated
  command documentation, date wrapper and MCP discovery contracts.
- Web: 424 Vitest tests and six Node tests passed. Date controls exercise the
  common pending-field path, cancellation, recovered-input confirmation and IME.
- Browser recipes: 24 Chromium/WebKit cases passed, covering compact layouts,
  focus and keyboard actions, cross-window updates, undo/redo, save/reopen, and
  offline exports with native calendar values, custom strings and absence.
- Workspace/all-target Clippy, Rust/Prettier formatting, 18 CI-policy tests,
  the production-file size guard and the core dependency boundary passed.
- Both mutable local Article files retain their original SHA-256 hashes.
  No screenshots, videos or browser traces were produced.
