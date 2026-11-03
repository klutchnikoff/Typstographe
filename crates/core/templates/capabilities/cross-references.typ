// Presentation lives in Typst. A model can replace any renderer, never the target identity.
#let reference-style-state = state("typstographe-cross-reference-style", (:))
#let reference-style(label: auto, page: auto, combine: auto) = reference-style-state.update((label: label, page: page, combine: combine))
#let default-label(element) = {
  if element.has("numbering") and element.numbering != none {
    let counter-value = if element.func() == figure { element.counter } else { counter(element.func()) }
    let pattern = element.numbering
    if type(pattern) == str { pattern = pattern.trim(".") }
    let number = numbering(pattern, ..counter-value.at(element.location()))
    if element.supplement == none or element.supplement == [] { number }
    else { [#element.supplement~#number] }
  } else if element.func() == heading { element.body }
  else if element.func() == figure and element.caption != none { element.caption.body }
  else { element.supplement }
}
#let default-page(element) = {
  let pattern = element.location().page-numbering()
  assert(pattern != none, message: "The model must declare page numbering for page references.")
  [page~#numbering(pattern, ..counter(page).at(element.location()))]
}
// Metadata exposes the same final content used for the preview, without another compilation.
#let cross-reference(target, include-label: true, include-page: false) = context {
  assert(include-label or include-page, message: "A cross-reference needs a label or a page.")
  let matches = query(target)
  assert(matches.len() == 1, message: "Cross-reference target missing or ambiguous.")
  let element = matches.first()
  let style = reference-style-state.get()
  let label-renderer = if style.at("label", default: auto) == auto { default-label } else { style.label }
  let page-renderer = if style.at("page", default: auto) == auto { default-page } else { style.page }
  let full = if include-label { label-renderer(element) }
  let page-ref = if include-page { page-renderer(element) }
  let result = if include-label and include-page {
    if style.at("combine", default: auto) == auto { [#full (#page-ref)] } else { (style.combine)(full, page-ref) }
  } else if include-label { full } else { page-ref }
  metadata((typstographe-reference: str(target), include-label: include-label,
    include-page: include-page, display: result))
  link(target, result)
}
