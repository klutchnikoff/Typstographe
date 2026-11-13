//! Catalogue des modèles fournis. Toutes les listes et commandes en dérivent.
use super::DocumentType;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Model {
    Personal,
    ArticleWorking,
    ArticleLaPreprint,
    ArticleIeee,
}
pub struct Definition {
    pub model: Model,
    pub kind: DocumentType,
    pub source: &'static str,
    pub manifest: &'static str,
    pub name: &'static str,
    pub label_key: &'static str,
    pub description: &'static str,
    pub keywords: &'static [&'static str],
}
pub const ALL: &[Definition] = &[
    Definition {
        model: Model::Personal,
        kind: DocumentType::Courrier,
        source: include_str!("../../templates/courrier-personnel.typ"),
        manifest: include_str!("../../templates/courrier-personnel.model.yaml"),
        name: "Personal letter",
        label_key: "model-personal-letter",
        description: "A restrained personal letter with selectable paper size and orientation; A4 portrait retains the DL window-envelope layout.",
        keywords: &[
            "personal",
            "French",
            "A4",
            "A5",
            "US Letter",
            "US Legal",
            "landscape",
            "DL",
            "window envelope",
            "minimal",
        ],
    },
    Definition {
        model: Model::ArticleWorking,
        kind: DocumentType::Article,
        source: include_str!("../../templates/article-working.typ"),
        manifest: include_str!("../../templates/article-working.model.yaml"),
        name: "Working article",
        label_key: "model-working-article",
        description: "A readable single-column scientific working article with multilingual frontmatter and shared official affiliations.",
        keywords: &[
            "article",
            "research",
            "working paper",
            "SHS",
            "multilingual",
        ],
    },
    Definition {
        model: Model::ArticleLaPreprint,
        kind: DocumentType::Article,
        source: include_str!("../../templates/article-lapreprint.typ"),
        manifest: include_str!("../../templates/article-lapreprint.model.yaml"),
        name: "LaPreprint",
        label_key: "model-lapreprint",
        description: "A scientific preprint with numbered sections, a wide left margin and a running title.",
        keywords: &["article", "preprint", "research", "multilingual"],
    },
    Definition {
        model: Model::ArticleIeee,
        kind: DocumentType::Article,
        source: include_str!("../../templates/article-ieee.typ"),
        manifest: include_str!("../../templates/article-ieee.model.yaml"),
        name: "IEEE for MyST",
        label_key: "model-ieee-myst",
        description: "An IEEE-style two-column article with Letter paper and numeric citations.",
        keywords: &["article", "IEEE", "MyST", "two-column", "numeric citations"],
    },
];
impl Model {
    pub const fn id(self) -> &'static str {
        match self {
            Self::Personal => "courrier.model.personal",
            Self::ArticleWorking => "article.model.working",
            Self::ArticleLaPreprint => "article.model.lapreprint",
            Self::ArticleIeee => "article.model.ieee",
        }
    }
    #[cfg(test)]
    pub fn all() -> impl Iterator<Item = Self> {
        ALL.iter().map(|entry| entry.model)
    }
    pub fn definition(self) -> &'static Definition {
        ALL.iter()
            .find(|entry| entry.model == self)
            .expect("modèle enregistré")
    }
    pub fn source(self) -> String {
        self.definition().source.into()
    }
}

#[cfg(test)]
#[cfg_attr(coverage_nightly, coverage(off))]
mod tests {
    use super::*;
    #[test]
    fn type_availability_defaults_and_public_commands_all_follow_the_catalog() {
        let mut ids = std::collections::HashSet::new();
        for kind in DocumentType::ALL {
            let entries: Vec<_> = kind.models().collect();
            assert_eq!(kind.can_create(), !entries.is_empty());
            assert_eq!(
                kind.default_model(),
                entries.first().map_or("", |entry| entry.source)
            );
            for entry in entries {
                assert!(ids.insert(entry.model.id()));
                assert_eq!(entry.model.definition().kind, kind);
            }
        }
        assert!(DocumentType::Courrier.can_create());
        assert!(!DocumentType::CompteRendu.can_create());
        assert!(DocumentType::Article.can_create());
        assert_eq!(
            DocumentType::Article
                .models()
                .map(|entry| entry.model)
                .collect::<Vec<_>>(),
            [
                Model::ArticleWorking,
                Model::ArticleLaPreprint,
                Model::ArticleIeee
            ],
        );
    }
}
