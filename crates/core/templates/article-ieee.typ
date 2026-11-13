// Adapted for typstOgraphe from IEEE Typst MyST Template, revision e40d103.
// https://github.com/myst-templates/ieee-typst-template/tree/e40d10316580912aed84348170b479133acc5622
// Upstream template credits Typst, Franklin Koch, Laurenz Mädje and Brandon Sánchez.
// Upstream license follows.
// This is free and unencumbered software released into the public domain.
//
// Anyone is free to copy, modify, publish, use, compile, sell, or
// distribute this software, either in source code form or as a compiled
// binary, for any purpose, commercial or non-commercial, and by any
// means.
//
// In jurisdictions that recognize copyright laws, the author or authors
// of this software dedicate any and all copyright interest in the
// software to the public domain. We make this dedication for the benefit
// of the public at large and to the detriment of our heirs and
// successors. We intend this dedication to be an overt act of
// relinquishment in perpetuity of all present and future rights to this
// software under copyright law.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
// EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
// IN NO EVENT SHALL THE AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR
// OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE,
// ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
// OTHER DEALINGS IN THE SOFTWARE.
//
// For more information, please refer to <http://unlicense.org/>

#import "capabilities/authorship.typ": prepare-authorship
#import "capabilities/abstracts.typ": abstract-labels, show-abstracts
#import "capabilities/figures.typ": layout-figures
#import "capabilities/article-layout.typ": layout-body, start-page-number

#let render-affiliation(affiliation) = {
  let department = affiliation.at("department", default: "")
  let institution = affiliation.at("institution", default: "")
  let location = affiliation.at("location", default: "")
  if department == "" and institution == "" and location == "" {
    linebreak()
    emph(affiliation.text)
  } else {
    if department != "" [\ #emph(department)]
    if institution != "" [\ #emph(institution)]
    if location != "" [\ #location]
  }
}

#let render-authors(authors, affiliations, language) = {
  let prepared = prepare-authorship(authors, affiliations)
  let groups = prepared.authors.chunks(3)
  for (index, group) in groups.enumerate() {
    grid(
      columns: group.len() * (1fr,),
      gutter: 12pt,
      ..group.map(author => align(center, {
        text(12pt, author.name)
        if author.corresponding { super("*") }
        for affiliation-index in author.affiliation-indices {
          render-affiliation(prepared.affiliations.at(affiliation-index - 1))
        }
        if author.email != "" [\ #link("mailto:" + author.email, author.email)]
        if author.orcid != "" [\ #link("https://orcid.org/" + author.orcid, [ORCID])]
      })),
    )
    if index < groups.len() - 1 { v(16pt, weak: true) }
  }
  if authors.any(author => author.corresponding) {
    let role = if language == "fr" { "Auteur correspondant" } else { "Corresponding author" }
    align(center, text(size: 8pt)[#text("*") #role])
  }
}

#let prefix-first-paragraph(body, prefix) = {
  let parts = if body.func() == [].func() { body.children } else { (body,) }
  let first = parts.position(part => part.func() == par)
  if first == none { return prefix + body }
  let fields = parts.at(first).fields()
  let text = fields.remove("body")
  parts.at(first) = par(prefix + text, ..fields)
  parts.join()
}

#let render-abstract(entry, primary: false) = {
  if (entry.abstract == [] and entry.keywords.len() == 0
    and (primary or (entry.title == [] and entry.subtitle == []))) {
    return []
  }
  set text(lang: entry.language, weight: 700)
  let labels = abstract-labels(entry.language)
  let dash = if entry.language == "fr" {
    [#sym.space.nobreak#sym.dash.em#sym.space.nobreak]
  } else { sym.dash.em }
  if not primary {
    if entry.title != [] {
      block(below: 7pt, sticky: true, text(size: 11pt, entry.title))
    }
    if entry.subtitle != [] {
      block(
        below: 7pt,
        sticky: true,
        text(size: 10pt, weight: "regular", emph(entry.subtitle)),
      )
    }
  }
  if entry.abstract != [] {
    prefix-first-paragraph(entry.abstract, h(1em) + emph(labels.abstract) + dash)
    parbreak()
  }
  if entry.keywords.len() > 0 {
    let label = if entry.language == "en" { "Index terms" } else { labels.keywords }
    par[#h(1em)#emph(label)#dash#entry.keywords.join(", ")]
  }
  v(2pt)
}

#let article(
  localizations: (),
  authors: (),
  affiliations: (),
  references: (),
  citation-style: "ieee",
  show-outline: false,
  publication: (:),
  options: (paper: "us-letter", landscape: false, language: "en", bullet-marker: auto),
  body,
) = {
  let primary = localizations.find(entry => entry.language == options.language)
  let title = if primary == none { [] } else { primary.title }
  set document(
    title: title,
    author: authors.map(author => author.name),
    keywords: if primary == none { () } else { primary.keywords },
  )
  set text(font: "STIX Two Text", size: 10pt, lang: options.language)
  set page(
    paper: options.paper,
    flipped: options.landscape,
    numbering: "1",
    footer: none,
    margin: if options.paper == "a4" {
      (x: 41.5pt, top: 80.51pt, bottom: 89.51pt)
    } else {
      (x: (50pt / 216mm) * 100%, top: (55pt / 279mm) * 100%, bottom: (64pt / 279mm) * 100%)
    },
  )

  start-page-number(publication)

  set math.equation(numbering: "(1)")
  show math.equation: set block(spacing: 0.65em)
  show ref: it => {
    let equation = it.element
    if equation != none and equation.func() == math.equation and equation.numbering != none {
      let location = equation.location()
      link(location, numbering(equation.numbering, ..counter(math.equation).at(location)))
    } else { it }
  }
  set enum(indent: 10pt, body-indent: 9pt)
  set list(indent: 10pt, body-indent: 9pt, marker: if options.bullet-marker != auto {
    options.bullet-marker
  } else if options.language == "fr" { [—] } else { [•] })
  set table(inset: 3pt)
  show figure.where(kind: table): set block(breakable: true)

  set heading(numbering: "I.A.1.")
  show heading: it => context {
    let levels = counter(heading).at(it.location())
    let deepest = levels.last(default: 1)
    set text(10pt, weight: 400)
    if it.level == 1 [
      #let is-ack = it.body in ([Acknowledgment], [Acknowledgement])
      #set align(center)
      #set text(if is-ack { 10pt } else { 12pt })
      #show: smallcaps
      #v(20pt, weak: true)
      #if it.numbering != none and not is-ack {
        numbering("I.", deepest)
        h(7pt, weak: true)
      }
      #it.body
      #v(13.75pt, weak: true)
    ] else if it.level == 2 [
      #set par(first-line-indent: 0pt)
      #set text(style: "italic")
      #v(10pt, weak: true)
      #if it.numbering != none {
        numbering("A.", deepest)
        h(7pt, weak: true)
      }
      #it.body
      #v(10pt, weak: true)
    ] else [
      #if it.level == 3 and it.numbering != none {
        numbering("1)", deepest)
        [ ]
      }
      _#(it.body):_
    ]
  }

  if title != [] {
    show std.title: set text(weight: "regular")
    show std.title: it => align(center, text(18pt, it.body))
    v(3pt, weak: true)
    std.title(title)
  }
  if primary != none and primary.subtitle != [] {
    align(center, text(size: 12pt, primary.subtitle))
  }
  v(8.35mm, weak: true)
  render-authors(authors, affiliations, options.language)
  v(40pt, weak: true)

  {
    set par(justify: true, first-line-indent: 1em, spacing: 0.65em)
    layout-figures({
      show-abstracts(localizations, primary-language: options.language, render-entry: render-abstract)
      if show-outline { outline() }
      layout-body(body)
      if references.len() > 0 {
        show bibliography: set text(8pt)
        let title = if options.language == "en" { text(10pt)[References] } else { auto }
        bibliography(references, title: title, style: citation-style)
      }
    }, column-count: 2, gutter: 12pt)
  }
}
