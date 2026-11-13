// Adapted from LaPreprint for MyST, revision b7496d369fa6b143621afbebed0e87406f276bd2.
// https://github.com/myst-templates/lapreprint-typst
//
// MIT License
//
// Copyright (c) 2023 Rowan Cockett
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

#import "capabilities/abstracts.typ": abstract-labels
#import "capabilities/authorship.typ": prepare-authorship
#import "capabilities/cross-references.typ": reference-style
#import "capabilities/dates.typ": format-date
#import "capabilities/figures.typ": layout-figures
#import "capabilities/article-layout.typ": layout-body, start-page-number

#let orcid-mark(orcid) = {
  let svg = ``` <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 24 24"><path fill="#AECD54" d="M21.8,12c0,5.4-4.4,9.8-9.8,9.8S2.2,17.4,2.2,12S6.6,2.2,12,2.2S21.8,6.6,21.8,12z M8.2,5.8c-0.4,0-0.8,0.3-0.8,0.8s0.3,0.8,0.8,0.8S9,7,9,6.6S8.7,5.8,8.2,5.8z M10.5,15.4h1.2v-6c0,0-0.5,0,1.8,0s3.3,1.4,3.3,3s-1.5,3-3.3,3s-1.9,0-1.9,0H10.5v1.1H9V8.3H7.7v8.2h2.9c0,0-0.3,0,3,0s4.5-2.2,4.5-4.1s-1.2-4.1-4.3-4.1s-3.2,0-3.2,0L10.5,15.4z"/></svg>```.text
  link("https://orcid.org/" + orcid,
    box(height: 1.1em, baseline: 13.5%, image(bytes(svg), alt: "ORCID")))
}

#let labels(language) = (
  fr: (section: "Section", page: "page", total: "sur", open: "Accès ouvert", published: "Publié", accepted: "Accepté", submitted: "Soumis"),
  en: (section: "Section", page: "page", total: "of", open: "Open Access", published: "Published", accepted: "Accepted", submitted: "Submitted"),
  de: (section: "Abschnitt", page: "Seite", total: "von", open: "Offener Zugang", published: "Veröffentlicht", accepted: "Angenommen", submitted: "Eingereicht"),
  es: (section: "Sección", page: "página", total: "de", open: "Acceso abierto", published: "Publicado", accepted: "Aceptado", submitted: "Enviado"),
  it: (section: "Sezione", page: "pagina", total: "di", open: "Accesso aperto", published: "Pubblicato", accepted: "Accettato", submitted: "Inviato"),
  pt: (section: "Seção", page: "página", total: "de", open: "Acesso aberto", published: "Publicado", accepted: "Aceito", submitted: "Submetido"),
  nl: (section: "Sectie", page: "pagina", total: "van", open: "Open toegang", published: "Gepubliceerd", accepted: "Geaccepteerd", submitted: "Ingediend"),
).at(language)

#let publication-date(value, language, short: false) = {
  if value == none { return [] }
  if language == "en" and type(value) == datetime {
    let month = if short { "short" } else { "long" }
    return text(value.display("[month repr:" + month + "] [day], [year]"))
  }
  format-date(value, lang: language, format: if short { "short" } else { "long" })
}

#let render-authorship(authors, affiliations, language) = {
  let prepared = prepare-authorship(authors, affiliations)
  if prepared.authors.len() > 0 {
    let conjunction = if language == "en" { ", and " } else { ", " }
    box(inset: (y: 10pt), {
      prepared.authors.map(author => {
        text(11pt, weight: "semibold", author.name)
        h(1pt)
        if author.affiliation-indices.len() > 0 {
          super(author.affiliation-indices.map(str).join(","))
        }
        if author.corresponding { super("*") }
        if author.orcid != "" { orcid-mark(author.orcid) }
      }).join(", ", last: conjunction)
    })
  }
  if prepared.affiliations.len() > 0 {
    box(inset: (bottom: 10pt), {
      prepared.affiliations.map(affiliation => {
        super(str(affiliation.index))
        h(1pt)
        affiliation.text
      }).join(", ")
    })
  }
  let contacts = prepared.authors.filter(author => author.corresponding and author.email != "")
  if contacts.len() > 0 {
    block(above: 0pt, below: 6pt, text(9pt, contacts.map(author =>
      [#text("*") #author.name: #link("mailto:" + author.email, author.email)]
    ).join(linebreak())))
  }
}

#let render-abstracts(localizations, language, theme) = {
  let ordered = (
    localizations.filter(entry => entry.language == language) +
    localizations.filter(entry => entry.language != language)
  )
  let entries = ordered.filter(entry => entry.abstract != [] or (entry.language != language
    and (entry.title != [] or entry.subtitle != [])))
  if entries.len() > 0 {
    box(inset: (top: 16pt, bottom: 16pt), width: 100%, stroke: (top: 1pt + gray, bottom: 1pt + gray), {
      entries.map(entry => {
        set text(lang: entry.language)
        set par(justify: true)
        if entry.language != language {
          if entry.title != [] {
            text(11pt, weight: "semibold", entry.title)
            parbreak()
          }
          if entry.subtitle != [] {
            text(10pt, style: "italic", entry.subtitle)
            parbreak()
          }
        }
        if entry.abstract != [] {
          text(fill: theme, weight: "semibold", size: 9pt, abstract-labels(entry.language).abstract)
          parbreak()
          entry.abstract
        }
      }).join(parbreak())
    })
  }
  let keyword-entries = ordered.filter(entry => entry.keywords.len() > 0)
  if keyword-entries.len() > 0 {
    keyword-entries.map(entry => {
      set text(lang: entry.language, size: 9pt)
      let label = abstract-labels(entry.language).keywords
      let language-label = if entry.language != language { " (" + upper(entry.language) + ")" } else { "" }
      text(fill: theme, weight: "semibold", label + language-label)
      h(8pt)
      entry.keywords.join(", ")
    }).join(parbreak())
  }
}

#let article(
  localizations: (), authors: (), affiliations: (), references: (),
  citation-style: "chicago-author-date", show-outline: false, publication: (:),
  options: (paper: "a4", landscape: false, language: "fr", bullet-marker: auto), body,
) = {
  let language = options.language
  let terms = labels(language)
  let primary = localizations.find(entry => entry.language == language)
  let full-title = if primary == none { [] } else { primary.title }
  let running-title = if primary == none or primary.short-title == [] { full-title } else { primary.short-title }
  let short-citation = publication.at("short-citation", default: "")
  let doi = publication.at("doi", default: "")
  let open-access = publication.at("access", default: "unspecified") == "open"
  let venue = publication.at("venue", default: "")
  let kind = publication.at("kind", default: "")
  let published = publication.at("published", default: none)
  let dates = ("published", "accepted", "submitted").map(key =>
    (title: terms.at(key), value: publication.at(key, default: none))
  ).filter(entry => entry.value != none)
  let theme = blue.darken(30%)
  let secondary = gray.darken(50%)
  let spacer = text(fill: gray)[#h(8pt) | #h(8pt)]

  set document(
    title: full-title, author: authors.map(author => author.name),
    keywords: if primary == none { () } else { primary.keywords },
  )
  show link: it => text(fill: theme, it)
  show ref: it => text(fill: theme, it)
  show cite: it => text(fill: theme, it)
  set page(
    paper: options.paper, flipped: options.landscape, numbering: "1",
    margin: (left: 25%),
    header: context {
      if here().page() == 1 {
        let headers = (
          if open-access { smallcaps(terms.open) },
          if doi != "" { link("https://doi.org/" + doi, "https://doi.org/" + doi) },
        ).filter(value => value != none)
        align(left, text(size: 8pt, fill: gray, headers.join(spacer)))
      } else {
        let running = (running-title, if short-citation != "" { text(short-citation) })
        align(right, text(size: 8pt, fill: secondary,
          running.filter(value => value != none and value != []).join(spacer)))
      }
    },
    footer: block(
      width: 100%, stroke: (top: 1pt + gray), inset: (top: 8pt, right: 2pt),
      context {
        let left-footer = (
          if venue != "" { emph(venue) },
          if published != none { publication-date(published, language) },
        ).filter(value => value != none)
        grid(columns: (75%, 25%),
          align(left, text(size: 9pt, fill: secondary, left-footer.join(spacer))),
          align(right, text(size: 9pt, fill: secondary, {
            counter(page).display("1")
            if publication.at("first-page", default: 1) == 1 {
              [ #terms.total #counter(page).final().first()]
            }
          })),
        )
      },
    ),
  )
  set text(lang: language)
  start-page-number(publication)
  reference-style(page: element => {
    let location = element.location()
    [#terms.page~#numbering(location.page-numbering(), ..counter(page).at(location))]
  })
  set math.equation(numbering: "(1)")
  show math.equation: set block(spacing: 1em)
  show figure.where(kind: table): set block(breakable: true)
  set table(inset: (x: 3pt, y: 5pt))
  show table: it => {
    let columns = it.columns
    let count = if type(columns) == array { columns.len() } else { columns }
    set text(size: 8pt) if type(count) == int and count >= 7
    it
  }
  set enum(indent: 10pt, body-indent: 9pt)
  set list(indent: 10pt, body-indent: 9pt, marker: if options.bullet-marker != auto {
    options.bullet-marker
  } else if language == "fr" { [—] } else { [•] })

  set heading(numbering: "1.a.i", supplement: text(terms.section))
  show heading: it => context {
    let levels = counter(heading).at(it.location())
    let marker = if it.numbering != none { [#numbering(it.numbering, ..levels).] }
    set text(10pt, weight: 400)
    if it.level == 1 [
      #let is-ack = it.body in ([Acknowledgment], [Acknowledgement])
      #set text(if is-ack { 10pt } else { 12pt })
      #show: smallcaps
      #v(20pt, weak: true)
      #if marker != none and not is-ack { marker; h(7pt, weak: true) }
      #it.body
      #v(13.75pt, weak: true)
    ] else if it.level == 2 [
      #set par(first-line-indent: 0pt)
      #set text(style: "italic")
      #v(10pt, weak: true)
      #if marker != none { marker; h(7pt, weak: true) }
      #it.body
      #v(10pt, weak: true)
    ] else [
      #if it.level == 3 and marker != none [#marker ]
      _#(it.body):_
    ]
  }

  if full-title != [] {
    show std.title: it => text(17pt, weight: "bold", fill: theme, it.body)
    box(inset: (bottom: 2pt), width: 100%, std.title(full-title))
  }
  if primary != none and primary.subtitle != [] {
    parbreak()
    box(width: 100%, text(14pt, fill: gray.darken(30%), primary.subtitle))
  }
  render-authorship(authors, affiliations, language)

  if kind != "" or dates.len() > 0 {
    place(left + bottom, dx: -33%, dy: -10pt, box(width: 27%, {
      if kind != "" {
        set par(spacing: 0em)
        text(11pt, fill: theme, weight: "semibold", smallcaps(kind))
        parbreak()
      }
      grid(columns: (40%, 60%), gutter: 7pt,
        ..dates.enumerate().map(((index, entry)) => (
          text(size: 7pt, fill: theme, weight: if index == 0 { "bold" } else { "light" }, entry.title),
          text(size: 7pt, publication-date(entry.value, language, short: true)),
        )).flatten(),
      )
      // Include the clearance that the upstream margin grid leaves below the dates.
      v(3.2em)
    }))
  }

  render-abstracts(localizations, language, theme)
  v(10pt)
  show par: set par(spacing: 1.5em)
  if show-outline { outline() }
  layout-figures(layout-body(body))
  if references.len() > 0 {
    show bibliography: set text(8pt)
    let title = if language == "en" { text(10pt, "References") } else { auto }
    bibliography(references, title: title, style: citation-style)
  }
}
