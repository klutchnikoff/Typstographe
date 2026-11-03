// Stable date interface. Values are none, native datetime or literal custom text.
// The caller supplies a fixed value; neither this wrapper nor Datify reads a clock.
#import "../packages/datify-1.3.0/src/main.typ": custom-date-format

#let format-date(value, lang: "fr", format: "long") = {
  assert(format in ("long", "short", "iso"), message: "Unknown date format.")
  if value == none { return [] }
  if type(value) == str { return [#value] }
  assert(type(value) == datetime, message: "Expected none, datetime or custom text.")
  if format == "iso" { return [#value.display("[year]-[month]-[day]")] }
  // French long dates use an ordinal for the first day only.
  if format == "long" and lang == "fr" and value.day() == 1 {
    [1#super[er] #custom-date-format(value, pattern: "MMMM y", lang: lang)]
  } else {
    [#custom-date-format(value, pattern: format, lang: lang)]
  }
}
