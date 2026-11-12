// Keep the native figure (including its label) when resolving a placement.
#let reposition(item, placement, scope, keep-label: true) = {
  let fields = item.fields()
  let body = fields.remove("body")
  let anchor = fields.remove("label", default: none)
  fields.placement = placement
  fields.scope = scope
  let result = figure(body, ..fields)
  if keep-label and anchor != none { [#result#anchor] } else { result }
}

#let full-width-marker(item) = {
  (item.func() == metadata and type(item.value) == dictionary
    and item.value.at("typstographe-full-width", default: false) == true)
}

#let floating-table(item) = {
  (item.func() == figure and item.body.func() == table
    and item.at("placement", default: none) != none)
}

#let layout-figures(body, column-count: 1, gutter: 12pt) = {
  let flow(content) = if column-count == 1 { content } else {
    columns(column-count, gutter: gutter, content)
  }
  let parts = if body.func() == [].func() { body.children } else { (body,) }
  if not parts.any(item => full-width-marker(item) or floating-table(item)) {
    return flow(body)
  }

  layout(size => {
    show figure.where(kind: table): set block(breakable: true)
    let column-width = (size.width - (column-count - 1) * gutter) / column-count
    let pending-full = false
    let segment = []
    for item in parts {
      if full-width-marker(item) {
        pending-full = true
        continue
      }
      if item.func() != figure {
        segment += item
        continue
      }
      let wide = pending-full and column-count > 1
      pending-full = false
      let placement = item.at("placement", default: none)
      if wide and placement == none { placement = auto }
      let scope = if wide { "parent" } else { item.at("scope", default: "column") }
      let long-table = item.body.func() == table and placement != none and {
        let width = if scope == "parent" { size.width } else { column-width }
        let sample = reposition(item, none, "column", keep-label: false)
        measure(sample, width: width).height > size.height
      }
      if wide and long-table {
        flow(segment)
        reposition(item, none, "column")
        segment = []
      } else if long-table {
        segment += reposition(item, none, "column")
      } else if wide {
        segment += reposition(item, placement, scope)
      } else {
        segment += item
      }
    }
    flow(segment)
  })
}
