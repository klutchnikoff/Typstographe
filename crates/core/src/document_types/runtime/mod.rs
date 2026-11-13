//! Supplied declarations are loaded once; all adapters consume these projections.
mod descriptors;
mod source;

use super::{
    DocumentType, FieldGroup, FieldKind, FieldValue, Metadata, MetadataField, definition::*,
};
use crate::document::DocumentOptions;
use serde_json::{Value, json};
use std::sync::OnceLock;

pub(super) struct Runtime {
    pub loaded: LoadedDefinition,
    pub fields: Vec<RootField>,
    pub groups: Vec<FieldGroup>,
    pub structured: Option<Value>,
}
pub(super) struct RootField {
    pub public: MetadataField,
    pub presentation: Option<super::model_options::OptionId>,
    pub parameter: String,
    pub label_key: String,
    pub group: String,
    pub multiline: bool,
    pub choices: Vec<super::fields::FieldChoice>,
    pub kind: FieldKind,
    pub required_for_export: bool,
    pub resource: Option<crate::resources::ResourceDescriptor>,
}

pub(super) fn get(kind: DocumentType) -> &'static Runtime {
    static TYPES: OnceLock<[Runtime; 3]> = OnceLock::new();
    let all = TYPES.get_or_init(|| {
        [
            Runtime::load(
                DocumentType::Courrier,
                include_str!("../../../types/courrier/type.yaml"),
            ),
            Runtime::load(
                DocumentType::CompteRendu,
                include_str!("../../../types/compte-rendu/type.yaml"),
            ),
            Runtime::load(
                DocumentType::Article,
                include_str!("../../../types/article/type.yaml"),
            ),
        ]
    });
    &all[DocumentType::ALL
        .iter()
        .position(|k| *k == kind)
        .expect("registered type")]
}
impl Runtime {
    fn load(kind: DocumentType, source: &str) -> Self {
        let loaded = load_yaml(source).expect("valid supplied type declaration");
        assert_eq!(
            json!(kind),
            json!(loaded.definition().id),
            "type identity mismatch"
        );
        let initial = initial_fields(&loaded, &DocumentOptions::default());
        // Serde is the domain-data codec. Refuse silent omissions when a declaration
        // changes without its registered data structure (or the converse).
        let decoded: Metadata = serde_json::from_value(json!({"type":kind,"fields":initial}))
            .expect("declared fields match domain data");
        assert_eq!(
            serde_json::to_value(decoded).unwrap()["fields"],
            initial,
            "declaration must cover all domain data"
        );
        let (fields, groups, structured) = descriptors::build(&loaded);
        Self {
            loaded,
            fields,
            groups,
            structured,
        }
    }
}

pub(super) fn initial_fields(loaded: &LoadedDefinition, options: &DocumentOptions) -> Value {
    let mut values = loaded.defaults();
    for collection in &loaded.definition().collections {
        if let Some(key) = &collection.language_key {
            let mut record = loaded
                .record_defaults(&collection.id)
                .expect("declared collection");
            record.insert(
                "id".into(),
                json!(format!("localization-{}", options.language.code())),
            );
            record.insert(key.clone(), json!(options.language.code()));
            values.insert(collection.id.clone(), json!([record]));
        }
    }
    let mut raw = serde_json::Map::new();
    for binding in &loaded.definition().bindings {
        raw.insert(
            binding.metadata_key().into(),
            values[binding.source()].clone(),
        );
    }
    raw.insert("options".into(), json!(options));
    Value::Object(raw)
}

pub(super) fn values(kind: DocumentType, raw: &Value) -> Value {
    Value::Object(
        kind.definition()
            .definition()
            .bindings
            .iter()
            .map(|b| (b.source().into(), raw[b.metadata_key()].clone()))
            .collect(),
    )
}

pub(super) fn fields(kind: DocumentType, raw: &Value) -> Vec<FieldValue> {
    get(kind)
        .fields
        .iter()
        .map(|f| FieldValue {
            field: f.public,
            presentation: f.presentation,
            resource: f.resource,
            value: raw[&f.parameter].clone(),
            parameter: &f.parameter,
            group: &f.group,
            multiline: f.multiline,
            choices: f.choices.clone(),
            kind: f.kind,
            required_for_export: f.required_for_export,
            label_key: &f.label_key,
        })
        .collect()
}

pub(super) fn source(
    kind: DocumentType,
    raw: &Value,
    options: &DocumentOptions,
    publication: bool,
) -> String {
    source::main(kind.definition(), raw, options, publication)
}

#[cfg(test)]
#[cfg_attr(coverage_nightly, coverage(off))]
mod tests;
