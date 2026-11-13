// The editor keeps a heading and its paragraph as separate blocks. A run-in model
// composes level 3 on the first line of the paragraph. Keep the heading
// element and both labels while passing its paragraph text back to the flow.
#let layout-body(body) = {
  if body.func() != [].func() { return body }
  let parts = body.children
  // The editor keeps an empty paragraph at the end for the next insertion.
  // It should not add vertical space before References.
  if parts.len() > 0 and parts.last().func() == par and parts.last().body == [] {
    let _ = parts.pop()
    if parts.len() > 0 and parts.last().func() == parbreak { let _ = parts.pop() }
  }
  let result = []
  let pending = none
  for element in parts {
    if pending != none {
      if element.func() == parbreak { continue }
      if element.func() == par and element.body != [] {
        let anchor = element.at("label", default: none)
        let marker = if anchor != none { [#metadata(none)#anchor] }
        result += pending + [ ] + marker + element.body
        pending = none
        continue
      }
      result += pending + parbreak()
      pending = none
    }
    if element.func() == heading and element.at("level", default: none) == 3 {
      pending = element
    } else {
      result += element
    }
  }
  if pending != none { result += pending }
  result
}

#let start-page-number(publication) = {
  let first = publication.at("first-page", default: 1)
  if first != 1 { counter(page).update(first) }
}
