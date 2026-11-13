// Shared layout for the British and American letter models.
// The British composition is based on Letterloom 3.0.2 by nandac (Unlicense).
// https://github.com/nandac/letterloom/tree/f1ea4f667d73aa88b40d751fc2b414f9d078c92b
// The American composition uses the full-block layout.

#let address-lines(value) = value.split("\n").join(linebreak())

#let letter-layout(
  format-date, layout-figures, letter-notes,
  british: true,
  expediteur: "", fonction: "", service: "", email: "", organisme: "",
  adresse_expediteur: "", telephone: "", signature: none, destinataire: "",
  adresse: "", objet: "", reference: "", lieu: "", date: none,
  options: (paper: "a4", landscape: false, language: "fr", bullet-marker: auto),
  body,
) = {
  let lang = options.language
  let french = lang == "fr"
  let labels = (
    fr: (signature: "Signature manuscrite", postscript: "P.-S.", enclosures: "P.J.", subject: "Objet", reference: "Référence", date-prefix: "le "),
    en: (signature: "Handwritten signature", postscript: "P.S.", enclosures: "Enclosures", subject: "Subject", reference: "Reference", date-prefix: ""),
    de: (signature: "Handschriftliche Unterschrift", postscript: "P.S.", enclosures: "Anlagen", subject: "Betreff", reference: "Referenz", date-prefix: "den "),
    es: (signature: "Firma manuscrita", postscript: "P.D.", enclosures: "Adjuntos", subject: "Asunto", reference: "Referencia", date-prefix: "el "),
    it: (signature: "Firma autografa", postscript: "P.S.", enclosures: "Allegati", subject: "Oggetto", reference: "Riferimento", date-prefix: "il "),
    pt: (signature: "Assinatura manuscrita", postscript: "P.S.", enclosures: "Anexos", subject: "Assunto", reference: "Referência", date-prefix: "em "),
    nl: (signature: "Handgeschreven handtekening", postscript: "P.S.", enclosures: "Bijlagen", subject: "Onderwerp", reference: "Referentie", date-prefix: "op "),
  ).at(lang)
  let header-alignment = if british { right } else { left }
  set document(title: objet, author: expediteur)
  set text(font: "Libertinus Serif", size: 11pt, lang: lang)
  set par(leading: if british { 0.8em } else { 0.65em },
    spacing: if british { 1.8em } else { 1.25em })
  set page(paper: options.paper, flipped: options.landscape, numbering: "1",
    footer: context if here().page() > 1 { align(center, counter(page).display("1")) })
  show link: set text(fill: blue)
  set footnote.entry(separator: line(length: 30% + 0pt, stroke: 0.5pt))
  show footnote.entry: set text(size: 7pt)
  set list(marker: if options.bullet-marker != auto { options.bullet-marker }
    else if french { [—] } else { [•] })
  show figure.where(kind: table): set block(breakable: true)

  let sender = (expediteur, organisme, service, adresse_expediteur, telephone, email)
    .filter(value => value != "").map(address-lines)
  if sender.len() > 0 { align(header-alignment, block(align(left, sender.join(linebreak())))) }
  if date != none or lieu != "" {
    let prefix = if type(date) == datetime {
      let prefix = labels.date-prefix
      if lieu == "" and prefix != "" { upper(prefix.slice(0, 1)) + prefix.slice(1) } else { prefix }
    }
    let formatted = if british and lang == "en" and type(date) == datetime {
      date.display("[day padding:none] [month repr:long] [year]")
    } else {
      format-date(date, lang: lang)
    }
    let value = if date == none { lieu } else {
      [#if lieu != "" [#lieu, ]#prefix#formatted]
    }
    align(header-alignment, block({ v(0.2em); value }))
  }
  let recipient = (destinataire, adresse).filter(value => value != "").map(address-lines)
  if recipient.len() > 0 { block({ v(0.5em); recipient.join(linebreak()) }) }
  let separator = if french { [~: ] } else { [: ] }
  if objet != "" or reference != "" {
    block(sticky: true, (
      if objet != "" { strong([#labels.subject#separator#objet]) },
      if reference != "" { text(size: 10pt, [#labels.reference#separator#reference]) },
    ).filter(value => value != none).join(linebreak()))
  }
  layout-figures(body)
  let signature-area = if signature == none { box(height: 40pt) }
    else { image(signature, width: 36mm, height: 40pt, fit: "contain", alt: if expediteur != "" { expediteur } else { labels.signature }) }
  block(breakable: false, stack(spacing: 0.45em,
    ..(signature-area, expediteur, fonction).filter(value => value != "")))
  letter-notes(
    postscript: contents => block(above: 0.8em, [#strong[#labels.postscript#separator]#contents]),
    attachments: items => block(above: 0.8em, [
      #strong[#labels.enclosures#separator]
      #list(..items)
    ]),
  )
}
