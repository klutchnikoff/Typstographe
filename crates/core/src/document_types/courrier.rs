//! Le type Courrier : données, contrat du modèle et commandes propres au type.
use crate::document::DocumentOptions;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Metadata {
    pub options: DocumentOptions,
    pub expediteur: String,
    pub fonction: String,
    pub service: String,
    pub email: String,
    pub organisme: String,
    pub adresse_expediteur: String,
    pub telephone: String,
    pub signature: Option<String>,
    pub destinataire: String,
    pub adresse: String,
    pub objet: String,
    pub reference: String,
    pub lieu: String,
    pub date: String,
}
impl Default for Metadata {
    fn default() -> Self {
        Self {
            options: DocumentOptions::default(),
            expediteur: "Camille Martin".into(),
            fonction: "Responsable de la vie associative".into(),
            service: "Vie associative".into(),
            email: "camille.martin@valmont.example".into(),
            organisme: "Ville de Valmont".into(),
            adresse_expediteur: "1, place de la Mairie\n35000 Valmont".into(),
            telephone: String::new(),
            signature: None,
            destinataire: "Service des équipements".into(),
            adresse: "12, place de la République\n35000 Valmont".into(),
            objet: "Demande de réservation d’une salle".into(),
            reference: "VA / 2026 / 042".into(),
            lieu: "Valmont".into(),
            date: "2026-10-19".into(),
        }
    }
}

impl Metadata {
    pub fn blank() -> Self {
        serde_json::from_value(super::runtime::initial_fields(
            super::DocumentType::Courrier.definition(),
            &DocumentOptions::default(),
        ))
        .expect("declared letter defaults")
    }
}

#[cfg(test)]
#[cfg_attr(coverage_nightly, coverage(off))]
mod tests {
    use super::super::models::Model;
    use crate::document_types::{DocumentType, Metadata as DocumentMetadata};
    use crate::rendering::TypstWorld;

    use typst::layout::{Frame, FrameItem};
    fn text(frame: &Frame) -> String {
        let mut result = String::new();
        for (_, item) in frame.items() {
            match item {
                FrameItem::Group(group) => result.push_str(&text(&group.frame)),
                FrameItem::Text(run) => result.push_str(&run.text),
                _ => {}
            }
        }
        result
    }

    #[test]
    fn fixed_dates_are_presented_by_the_model_in_the_document_language() {
        use crate::document::DocumentLanguage;
        let template = Model::Personal.source();
        let mut world = TypstWorld::default();
        let mut metadata = DocumentMetadata::blank(DocumentType::Courrier);
        metadata.courrier_mut().date = "2026-10-01".into();
        metadata.courrier_mut().lieu = "Rennes".into();
        for (language, month) in [
            (DocumentLanguage::French, "octobre"),
            (DocumentLanguage::English, "October"),
            (DocumentLanguage::German, "Oktober"),
            (DocumentLanguage::Spanish, "octubre"),
            (DocumentLanguage::Italian, "ottobre"),
            (DocumentLanguage::Portuguese, "outubro"),
            (DocumentLanguage::Dutch, "oktober"),
        ] {
            metadata.options_mut().language = language;
            let document = world
                .compile_with_template("Bonjour.", &metadata, &template)
                .unwrap();
            let rendered = text(&document.pages()[0].frame);
            assert!(rendered.contains(month), "{rendered}");
            assert!(rendered.contains("2026"));
            assert!(!rendered.contains("2026-10-01"));
            if language == DocumentLanguage::French {
                assert!(rendered.contains("1er"));
            }
        }
        let custom = template.replace("#format-date(date, lang: options.language)", "#date");
        let document = world
            .compile_with_template("Bonjour.", &metadata, &custom)
            .unwrap();
        assert!(text(&document.pages()[0].frame).contains("2026-10-01"));
    }

    #[test]
    fn letter_date_is_optional_and_starts_with_a_capital_without_a_place() {
        use crate::document::DocumentLanguage;
        let mut world = TypstWorld::default();
        let mut metadata = DocumentMetadata::blank(DocumentType::Courrier);
        let template = Model::Personal.source();
        for (place, date, expected) in [
            ("", "1875-01-19", "Le 19 janvier 1875"),
            ("Paris", "1875-01-19", "Paris, le 19 janvier 1875"),
            ("Paris", "", "Paris"),
            ("", "", ""),
        ] {
            metadata.courrier_mut().lieu = place.into();
            metadata.courrier_mut().date = date.into();
            let document = world
                .compile_with_template("CORPS", &metadata, &template)
                .unwrap();
            let rendered = text(&document.pages()[0].frame);
            assert!(rendered.contains(expected), "{rendered}");
            assert_eq!(rendered.contains("1875"), !date.is_empty(), "{rendered}");
            if place.is_empty() {
                assert!(!rendered.contains("Paris"), "{rendered}");
            }
            if date.is_empty() {
                assert!(!rendered.contains("janvier"), "{rendered}");
                assert!(!rendered.contains("Le "), "{rendered}");
            }
        }
        // A language without a date prefix must also compile without a place.
        metadata.options_mut().language = DocumentLanguage::English;
        metadata.courrier_mut().date = "1875-01-19".into();
        let document = world
            .compile_with_template("CORPS", &metadata, &template)
            .unwrap();
        assert!(text(&document.pages()[0].frame).contains("January"));
    }

    #[test]
    fn personal_window_letter_compiles_in_app_and_keeps_addresses_on_first_page() {
        let template = include_str!("../../templates/courrier-personnel.typ");
        let mut world = TypstWorld::default();
        let mut metadata = DocumentMetadata::blank(DocumentType::Courrier);
        world
            .validate_model("Bonjour.", &metadata, template)
            .unwrap();
        metadata.courrier_mut().expediteur = "EXPEDITEURTEST".into();
        metadata.courrier_mut().destinataire = "DESTINATAIRETEST".into();
        metadata.courrier_mut().adresse =
            "Maison des associations\n4 avenue des Tilleuls\n35000 RENNES".into();
        let body = "Un paragraphe de courrier assez long pour éprouver le passage sur la page suivante et la conservation de la mise en page.\n\n".repeat(45);
        let pages = world
            .compile_with_template(&body, &metadata, template)
            .unwrap();
        assert!(pages.pages().len() > 1);
        assert!(text(&pages.pages()[0].frame).contains("DESTINATAIRETEST"));
        for page in &pages.pages()[1..] {
            assert!(!text(&page.frame).contains("DESTINATAIRETEST"));
        }
        // Une adresse excessive est refusée, jamais tronquée dans la fenêtre.
        metadata.courrier_mut().adresse = "Une ligne d'adresse\n".repeat(12);
        assert!(
            world
                .compile_with_template("Bonjour.", &metadata, template)
                .is_err()
        );
        metadata.courrier_mut().adresse = "W".repeat(120);
        assert!(
            world
                .compile_with_template("Bonjour.", &metadata, template)
                .is_err()
        );
        metadata.courrier_mut().adresse.clear();
        metadata.options_mut().landscape = Some(true);
        assert!(
            world
                .compile_with_template("Bonjour.", &metadata, template)
                .is_ok()
        );
    }

    #[test]
    fn personal_letter_renders_every_supported_paper_and_orientation() {
        use crate::document::PaperFormat;
        let mut world = TypstWorld::default();
        let template = Model::Personal.source();
        let mut metadata = DocumentMetadata::blank(DocumentType::Courrier);
        metadata.courrier_mut().expediteur = "EXPEDITEURTEST".into();
        metadata.courrier_mut().destinataire = "DESTINATAIRETEST".into();
        for (paper, width, height) in [
            (PaperFormat::A4, 210.0, 297.0),
            (PaperFormat::A5, 148.0, 210.0),
            (PaperFormat::Letter, 215.9, 279.4),
            (PaperFormat::Legal, 215.9, 355.6),
            (PaperFormat::A3, 297.0, 420.0),
        ] {
            for landscape in [false, true] {
                metadata.options_mut().paper = Some(paper);
                metadata.options_mut().landscape = Some(landscape);
                let doc = world
                    .compile_with_template("CONTENUTEST", &metadata, &template)
                    .unwrap();
                assert_eq!(doc.pages().len(), 1, "{paper:?} landscape={landscape}");
                let frame = &doc.pages()[0].frame;
                let (w, h) = if landscape {
                    (height, width)
                } else {
                    (width, height)
                };
                assert!((frame.size().x.to_mm() - w).abs() < 0.1);
                assert!((frame.size().y.to_mm() - h).abs() < 0.1);
                let rendered = text(frame);
                for value in ["EXPEDITEURTEST", "DESTINATAIRETEST", "CONTENUTEST"] {
                    assert!(rendered.contains(value), "{paper:?}: {rendered}");
                }
            }
        }
    }

    #[test]
    fn courrier_contract_accepts_independent_typst_models_without_presentation_flags() {
        let mut world = TypstWorld::default();
        let metadata = DocumentMetadata::demo(DocumentType::Courrier);
        let header = metadata.main_source();
        assert!(header.contains("#show: courrier.with("));
        assert!(!header.contains("compact"));
        for model in
            Model::all().filter(|m| m.definition().kind == super::super::DocumentType::Courrier)
        {
            assert!(
                world
                    .compile_with_template("Bonjour.", &metadata, &model.source())
                    .is_ok()
            );
        }
        // Une implémentation différente peut employer des fonctions privées
        // élaborées sans aucune déclaration supplémentaire dans l’application.
        let arguments = DocumentType::Courrier
            .definition()
            .definition()
            .bindings
            .iter()
            .map(|f| format!("{}: \"\"", f.parameter()))
            .collect::<Vec<_>>()
            .join(", ");
        let custom = format!(
            r#"
#let decoration-interne(body) = block(width: 100%, inset: 8pt, stroke: 0.5pt)[#body]
#let courrier({arguments}, signature: none, options: (paper: "a4", landscape: false, language: "fr"), body) = {{
  set page(paper: options.paper, flipped: options.landscape)
  set text(lang: options.language)
  decoration-interne[#text(weight: "bold")[#objet] #body]
}}
"#
        );
        let document = world
            .compile_with_template("Bonjour.", &metadata, &custom)
            .unwrap();
        assert!(!document.pages().is_empty());
        assert!(
            world
                .compile_with_template("Bonjour.", &metadata, "#let courrier(body) = body")
                .is_err()
        );
        assert!(
            world
                .compile_with_template("Bonjour.", &metadata, "#let autre(body) = body")
                .is_err()
        );
    }

    #[test]
    fn courrier_field_definitions_drive_header_and_required_export_fields() {
        let mut metadata = DocumentMetadata::blank(DocumentType::Courrier);
        assert_eq!(metadata.document_type(), DocumentType::Courrier);
        assert!(metadata.courrier().destinataire.is_empty());
        assert!(!metadata.ready_for_export());
        metadata.courrier_mut().destinataire = "Destinataire".into();
        assert!(!metadata.ready_for_export());
        metadata.courrier_mut().objet = "Objet".into();
        assert!(metadata.ready_for_export());
        let mut parameters = std::collections::HashSet::new();
        let mut identities = std::collections::HashSet::new();
        for field in metadata.field_values() {
            assert!(parameters.insert(field.parameter));
            assert!(identities.insert(serde_json::to_string(&field.field).unwrap()));
            assert_eq!(
                metadata
                    .editor_groups()
                    .iter()
                    .map(|group| {
                        if group.sections.is_empty() {
                            usize::from(group.id == field.group)
                        } else {
                            group
                                .sections
                                .iter()
                                .flat_map(|section| section.fields.iter())
                                .filter(|&&id| id == field.field)
                                .count()
                        }
                    })
                    .sum::<usize>(),
                1,
                "each metadata field has exactly one editing location"
            );
            let DocumentMetadata::Courrier(fields) = &mut metadata else {
                unreachable!()
            };
            let mut values = serde_json::to_value(&*fields).unwrap();
            values[field.parameter] = serde_json::json!(format!(
                "{} é\\#",
                values[field.parameter].as_str().unwrap()
            ));
            *fields = serde_json::from_value(values).unwrap();
            let value = serde_json::to_value(&*fields).unwrap()[field.parameter]
                .as_str()
                .unwrap()
                .to_owned();
            assert!(
                DocumentMetadata::Courrier(fields.clone())
                    .main_source()
                    .contains(&format!(
                        "  {}: {},",
                        field.parameter,
                        crate::document::typst_string(&value)
                    ))
            );
        }
        assert_eq!(
            serde_json::from_str::<DocumentMetadata>(&serde_json::to_string(&metadata).unwrap())
                .unwrap(),
            metadata
        );
    }
}
