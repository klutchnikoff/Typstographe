//! Runtime descriptors shared by documentary operations and their JSON projection.
use super::super::definition::{
    CollectionKind, Editing, Field, FieldControl, LoadedDefinition, RichProfile, Tab,
};
use serde::Serialize;
use serde_json::{Value, json};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum ValueKind {
    Text,
    Multiline,
    #[serde(rename = "resource-reference")]
    ResourceReference,
    Date,
    Doi,
    PositiveInteger,
    Boolean,
    Choice,
    Language,
    Tokens,
    Rich,
    RichInline,
    References,
    Native,
    Records,
}

impl ValueKind {
    pub(crate) fn is_rich(self) -> bool {
        matches!(self, Self::Rich | Self::RichInline)
    }

    pub(crate) fn uses_shared_text(self) -> bool {
        matches!(self, Self::Text | Self::Multiline)
    }
}

#[derive(Serialize)]
pub(crate) struct RecordField {
    pub(crate) key: String,
    label_key: String,
    pub(crate) kind: ValueKind,
    pub(crate) default: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    references: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    choices: Option<Vec<String>>,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    statistics: bool,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub(crate) omit_empty: bool,
}

impl RecordField {
    fn native(key: &str, label_key: &str, default: Value) -> Self {
        Self {
            key: key.into(),
            label_key: label_key.into(),
            kind: ValueKind::Native,
            default,
            references: None,
            choices: None,
            statistics: false,
            omit_empty: false,
        }
    }
}

impl From<&Field> for RecordField {
    fn from(field: &Field) -> Self {
        let kind = match field {
            Field::Text {
                multiline: true, ..
            } => ValueKind::Multiline,
            Field::Text { .. } => ValueKind::Text,
            Field::ResourceReference { .. } => ValueKind::ResourceReference,
            Field::Date { .. } => ValueKind::Date,
            Field::Doi { .. } => ValueKind::Doi,
            Field::PositiveInteger { .. } => ValueKind::PositiveInteger,
            Field::Boolean { .. } => ValueKind::Boolean,
            Field::Choice { .. } => ValueKind::Choice,
            Field::Language { .. } => ValueKind::Language,
            Field::Tokens { .. } => ValueKind::Tokens,
            Field::RichText {
                profile: RichProfile::InlineText,
                ..
            } => ValueKind::RichInline,
            Field::RichText { .. } => ValueKind::Rich,
            Field::RecordReferences { .. } => ValueKind::References,
        };
        Self {
            key: field.id().into(),
            label_key: field.label_key().into(),
            kind,
            default: field.default_value(),
            references: match field {
                Field::RecordReferences {
                    target_collection, ..
                } => Some(target_collection.clone()),
                _ => None,
            },
            choices: match field {
                Field::Choice { choices, .. } => Some(choices.clone()),
                _ => None,
            },
            statistics: field.statistics(),
            omit_empty: field.omit_empty(),
        }
    }
}

#[derive(Serialize)]
pub(crate) struct RecordCollection {
    field: String,
    pub(crate) parameter: String,
    label_key: String,
    item_label_key: String,
    title_key: String,
    schema: Value,
    pub(crate) fields: Vec<RecordField>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    summary: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) language_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    removal_notice_key: Option<String>,
}

impl RecordCollection {
    pub(crate) fn field(&self, key: &str) -> Option<&RecordField> {
        self.fields.iter().find(|field| field.key == key)
    }
}

#[derive(Serialize)]
struct RecordPanel {
    id: String,
    collection: String,
    editing: Editing,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    fields: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    summary: Option<[String; 1]>,
    #[serde(skip_serializing_if = "Option::is_none")]
    item_label_key: Option<String>,
}

#[derive(Serialize)]
struct Bibliography {
    tab: String,
    files: String,
    field: String,
    style: String,
    style_field: String,
    sources: &'static str,
}

#[derive(Serialize)]
struct Outline {
    parameter: String,
    field: String,
}

#[derive(Serialize)]
pub(super) struct StructuredMetadata {
    pub(super) collections: Vec<RecordCollection>,
    panels: Vec<RecordPanel>,
    #[serde(skip_serializing_if = "Option::is_none")]
    bibliography: Option<Bibliography>,
    #[serde(skip_serializing_if = "Option::is_none")]
    outline: Option<Outline>,
}

impl StructuredMetadata {
    pub(super) fn build(loaded: &LoadedDefinition) -> Option<Self> {
        let def = loaded.definition();
        if def.collections.is_empty() {
            return None;
        }
        let values_schema = loaded.values_schema();
        let parameter = |source: &str| {
            def.bindings
                .iter()
                .find(|binding| binding.source() == source)
                .expect("validated binding")
                .metadata_key()
                .to_owned()
        };
        let collections = def
            .collections
            .iter()
            .map(|collection| {
                let fields = match collection.kind {
                    CollectionKind::OrderedRecords => {
                        collection.fields.iter().map(RecordField::from).collect()
                    }
                    CollectionKind::BibliographicRecords => [
                        ("key", Value::Null),
                        ("entry", Value::Null),
                        ("retained_parents", json!([])),
                        ("provenance", json!([])),
                    ]
                    .into_iter()
                    .map(|(key, default)| RecordField::native(key, "field-bibliography", default))
                    .collect(),
                    CollectionKind::BibliographicSources => {
                        ["name", "format", "contents", "digest"]
                            .into_iter()
                            .map(|key| {
                                RecordField::native(key, "field-reference-source", Value::Null)
                            })
                            .collect()
                    }
                };
                let mut schema = values_schema["properties"][&collection.id].clone();
                schema["$defs"] = values_schema["$defs"].clone();
                RecordCollection {
                    field: format!("{}.{}", def.id, collection.id),
                    parameter: parameter(&collection.id),
                    label_key: collection.label_key.clone(),
                    item_label_key: collection.item_label_key.clone(),
                    title_key: collection.summary_field.clone(),
                    schema,
                    fields,
                    summary: collection.summary.clone(),
                    language_key: collection.language_key.clone(),
                    removal_notice_key: collection.removal_notice_key.clone(),
                }
            })
            .collect();

        let mut panels = Vec::new();
        let mut bibliography = None;
        for tab in &def.header.tabs {
            match tab {
                Tab::RecordCards {
                    id,
                    collection,
                    summary_field,
                    fields,
                    editing,
                    item_label_key,
                    ..
                } => {
                    let definition = def
                        .collections
                        .iter()
                        .find(|c| c.id == *collection)
                        .expect("validated panel collection");
                    panels.push(RecordPanel {
                        id: id.clone(),
                        collection: collection.clone(),
                        editing: *editing,
                        fields: fields.clone(),
                        summary: (summary_field != &definition.summary_field)
                            .then(|| [summary_field.clone()]),
                        item_label_key: item_label_key.clone(),
                    });
                }
                Tab::Bibliography {
                    id,
                    collection,
                    style_field,
                    ..
                } => {
                    bibliography = Some(Bibliography {
                        tab: id.clone(),
                        files: parameter(collection),
                        field: format!("{}.{}", def.id, collection),
                        style: parameter(style_field),
                        style_field: style_field.clone(),
                        sources: "reference_sources",
                    });
                }
                Tab::Form { .. } => {}
            }
        }
        let outline = def
            .fields
            .iter()
            .rfind(|field| field.control() == Some(FieldControl::Outline))
            .map(|field| Outline {
                parameter: parameter(field.id()),
                field: field.id().into(),
            });
        Some(Self {
            collections,
            panels,
            bibliography,
            outline,
        })
    }
}
