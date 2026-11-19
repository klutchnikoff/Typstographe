//! Text zones in the content tree. Scalar fields and annotations have their own targets.

#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) enum TextZoneKind {
    Prose,
    Math,
}

impl TextZoneKind {
    pub(super) fn of(kind: &str) -> Option<Self> {
        match kind {
            "paragraph"
            | "heading"
            | "figure"
            | "tableCaption"
            | "descriptionTerm"
            | "descriptionDefinition"
            | "quoteAttribution"
            | "postscript"
            | "attachment" => Some(Self::Prose),
            kind if super::mathematics::is_math(kind) => Some(Self::Math),
            _ => None,
        }
    }

    pub(super) fn supports_styles(self) -> bool {
        self == Self::Prose
    }
}
