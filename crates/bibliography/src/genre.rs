use hayagriva::{Entry, types::EntryType};
use serde::{Deserialize, Serialize};

/// Form intent is separate from Hayagriva's native type and its container types.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Genre {
    JournalArticle,
    Book,
    BookChapter,
    ConferencePaper,
    Report,
    Thesis,
    WebResource,
    Preprint,
    Software,
    Other,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum FieldKind {
    FormattedText,
    People,
    Publisher,
    Date,
    NumberOrText,
    Url,
    Identifiers,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct FieldDescriptor {
    /// Canonical native JSON pointer; parents are always arrays in this API.
    pub path: String,
    pub kind: FieldKind,
    pub group: &'static str,
    pub recommended: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct GenreDescriptor {
    pub genre: Genre,
    pub fields: Vec<FieldDescriptor>,
}

impl Genre {
    /// Conservative inference: an unqualified repository may contain data, not software.
    pub fn infer(entry: &Entry) -> Self {
        use EntryType::*;
        match entry.entry_type() {
            Article
                if entry
                    .parents()
                    .iter()
                    .any(|p| p.entry_type() == &Proceedings) =>
            {
                Self::ConferencePaper
            }
            Article
                if entry
                    .parents()
                    .iter()
                    .any(|p| p.entry_type() == &Repository) =>
            {
                Self::Preprint
            }
            Article
                if entry.parents().is_empty()
                    || entry
                        .parents()
                        .iter()
                        .any(|p| p.entry_type() == &Periodical) =>
            {
                Self::JournalArticle
            }
            Chapter | Anthos => Self::BookChapter,
            Book => Self::Book,
            Report => Self::Report,
            Thesis => Self::Thesis,
            Web => Self::WebResource,
            Manuscript => Self::Preprint,
            _ => Self::Other,
        }
    }

    /// Starting structure for a new record. Imported entries are never coerced into it.
    pub fn empty_entry(self, key: &str) -> Entry {
        use EntryType::*;
        let (kind, parent) = match self {
            Self::JournalArticle => (Article, Some(Periodical)),
            Self::Book => (Book, None),
            Self::BookChapter => (Chapter, Some(Book)),
            Self::ConferencePaper => (Article, Some(Proceedings)),
            Self::Report => (Report, None),
            Self::Thesis => (Thesis, None),
            Self::WebResource => (Web, None),
            Self::Preprint => (Manuscript, None),
            Self::Software => (Repository, None),
            Self::Other => (Misc, None),
        };
        let mut entry = hayagriva::Entry::new(key, kind);
        if let Some(parent) = parent {
            entry.set_parents(vec![hayagriva::Entry::new(key, parent)]);
        }
        entry
    }

    pub fn descriptor(self) -> GenreDescriptor {
        use FieldKind::*;
        let mut fields = vec![];
        let mut add = |path: &str, kind, group, recommended| {
            fields.push(FieldDescriptor {
                path: path.into(),
                kind,
                group,
                recommended,
            })
        };
        add("/title", FormattedText, "work", true);
        add("/author", People, "work", true);
        add("/date", Date, "work", true);
        match self {
            Self::JournalArticle | Self::BookChapter | Self::ConferencePaper => {
                add("/parent/0/title", FormattedText, "publication", true);
                add("/page-range", NumberOrText, "publication", false);
                if self == Self::JournalArticle {
                    add("/volume", NumberOrText, "publication", false);
                    add("/issue", NumberOrText, "publication", false);
                } else {
                    add("/parent/0/editor", People, "publication", false);
                }
            }
            Self::Book => {
                add("/publisher", Publisher, "publication", true);
                add("/edition", NumberOrText, "publication", false);
                add("/editor", People, "publication", false);
            }
            Self::Report | Self::Thesis => {
                add("/organization", FormattedText, "publication", true);
                add("/genre", FormattedText, "publication", false);
            }
            Self::Software => add("/edition", NumberOrText, "publication", true),
            _ => {}
        }
        add("/serial-number", Identifiers, "identifiers", false);
        add(
            "/url",
            Url,
            "identifiers",
            matches!(self, Self::WebResource | Self::Software),
        );
        GenreDescriptor {
            genre: self,
            fields,
        }
    }
}

pub fn genres() -> Vec<GenreDescriptor> {
    use Genre::*;
    [
        JournalArticle,
        Book,
        BookChapter,
        ConferencePaper,
        Report,
        Thesis,
        WebResource,
        Preprint,
        Software,
        Other,
    ]
    .into_iter()
    .map(Genre::descriptor)
    .collect()
}
