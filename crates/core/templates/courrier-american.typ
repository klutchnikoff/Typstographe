#import "capabilities/letter-layout.typ": letter-layout
#import "capabilities/dates.typ": format-date
#import "capabilities/figures.typ": layout-figures
#import "capabilities/correspondence.typ": letter-notes
#import "capabilities/cross-references.typ": cross-reference

#let courrier(signature: none, ..args) = letter-layout(
  format-date, layout-figures, letter-notes, british: false,
  // Resolve the resource relative to the model before delegating its layout.
  signature: if signature != none { path(signature) }, ..args,
)
