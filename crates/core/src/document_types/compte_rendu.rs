//! Compte-rendu de réunion : contrat intégré, présentation en pur Typst.
use crate::document::DocumentOptions;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Metadata {
    pub options: DocumentOptions,
    pub titre: String,
    pub date: Option<crate::dates::DateValue>,
    pub lieu: String,
    pub redacteur: String,
    pub participants: String,
    pub excuses: String,
}
impl Default for Metadata {
    fn default() -> Self {
        serde_json::from_value(super::runtime::initial_fields(
            super::DocumentType::CompteRendu.definition(),
            &DocumentOptions::default(),
        ))
        .expect("declared minutes defaults")
    }
}
impl Metadata {
    pub fn demo() -> Self {
        Self {
            titre: "Préparation de la rencontre associative".into(),
            date: crate::dates::DateValue::calendar("2026-10-21"),
            lieu: "Salle des Tilleuls".into(),
            redacteur: "Camille Martin".into(),
            participants: "Camille Martin\nAlex Dupont".into(),
            excuses: "Lou Bernard".into(),
            ..Self::default()
        }
    }
}
