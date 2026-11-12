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
#import "capabilities/references.typ": reference-list
#import "capabilities/figures.typ": layout-figures

#let render-authors(authors, affiliations, language) = {
  let prepared = prepare-authorship(authors, affiliations)
  for group in prepared.authors.chunks(3) {
    grid(
      columns: group.len() * (1fr,),
      gutter: 12pt,
      ..group.map(author => align(center, {
        text(size: 12pt, author.name)
        if author.corresponding { super("*") }
        for index in author.affiliation-indices {
          linebreak()
          emph(prepared.affiliations.at(index - 1).text)
        }
        if author.email != "" {
          linebreak()
          link("mailto:" + author.email, author.email)
        }
        if author.orcid != "" {
          linebreak()
          link("https://orcid.org/" + author.orcid, [ORCID])
        }
      })),
    )
    v(8pt, weak: true)
  }
  if authors.any(author => author.corresponding) {
    let role = if language == "fr" { "Auteur correspondant" } else { "Corresponding author" }
    align(center, text(size: 8pt)[#text("*") #role])
  }
}

#let render-abstract(entry, primary: false) = {
  set text(lang: entry.language, weight: "bold", size: 9pt)
  set par(first-line-indent: 0pt)
  let labels = abstract-labels(entry.language)
  if not primary {
    if entry.title != [] { block(above: 4pt, below: 2pt, entry.title) }
    if entry.subtitle != [] { block(below: 2pt, emph(entry.subtitle)) }
  }
  if entry.abstract != [] {
    let label = emph(labels.abstract)
    block(sticky: true, below: 2pt)[#label#sym.dash.em]
    entry.abstract
  }
  if entry.keywords.len() > 0 {
    let label = if entry.language == "en" { "Index terms" } else { labels.keywords }
    block(above: 3pt, below: 6pt)[#emph(label)#sym.dash.em#entry.keywords.join(", ")]
  }
}

#let article(
  localizations: (),
  authors: (),
  affiliations: (),
  references: (),
  citation-style: "ieee",
  show-outline: false,
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
  set text(font: "Libertinus Serif", size: 10pt, lang: options.language)
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

  set math.equation(numbering: "(1)")
  show math.equation: set block(spacing: 0.65em)
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
    let number(pattern) = if it.numbering != none { numbering(pattern, deepest) }
    set text(size: 10pt, weight: "regular")
    if it.level == 1 {
      block(above: 1.15em, below: 0.65em, align(center, smallcaps([#number("I.") #it.body])))
    } else if it.level == 2 {
      block(above: 0.75em, below: 0.4em, emph([#number("A.") #it.body]))
    } else {
      block(above: 0.5em, below: 0.3em, emph([#number("1)") #it.body:]))
    }
  }

  if title != [] {
    show std.title: set text(size: 18pt, weight: "regular")
    align(center, std.title(title))
  }
  if primary != none and primary.subtitle != [] {
    align(center, text(size: 12pt, primary.subtitle))
  }
  v(8.35mm, weak: true)
  render-authors(authors, affiliations, options.language)
  v(20pt, weak: true)

  {
    set par(justify: true, first-line-indent: 1em, spacing: 0.65em)
    show bibliography: set text(size: 8pt)
    layout-figures({
      show-abstracts(localizations, primary-language: options.language, render-entry: render-abstract)
      if show-outline { outline() }
      body
      reference-list(references, style: citation-style)
    }, column-count: 2, gutter: 12pt)
  }
}
