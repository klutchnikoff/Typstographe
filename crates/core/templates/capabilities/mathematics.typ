// Stable public adapter. The application ships MiTeX and its WASM offline.
#let math-formula(source, language: "typst", block: false, alt: "") = {
  assert(language in ("typst", "latex"), message: "Unknown mathematical language.")
  let body = if source.trim() == "" { [] }
    else if language == "typst" { eval(source, mode: "math") }
    else {
      import "../packages/mitex-0.2.7/lib.typ": mitex-convert, mitex-scope
      eval(mitex-convert(source), mode: "math", scope: mitex-scope)
    }
  math.equation(block: block, alt: if alt == "" { none } else { alt }, body)
}
