use super::*;
use crate::document_types::{FieldSection, definition::Tab};

pub(super) fn build(loaded: &LoadedDefinition) -> (Vec<RootField>, Vec<FieldGroup>) {
    let def = loaded.definition();
    let mut fields = Vec::new();
    for binding in &def.bindings {
        let (id, label, multiline, kind, required) = match binding {
            Binding::Field { field, .. } => {
                let f = def.fields.iter().find(|f| f.id() == field).unwrap();
                (
                    f.id().to_owned(),
                    f.label_key(),
                    matches!(
                        f,
                        Field::Text {
                            multiline: true,
                            ..
                        }
                    ),
                    if matches!(f, Field::ResourceReference { .. }) {
                        FieldKind::ResourceReference
                    } else if matches!(f, Field::Date { .. }) {
                        FieldKind::Date
                    } else if matches!(f, Field::Doi { .. }) {
                        FieldKind::Doi
                    } else if matches!(f, Field::PositiveInteger { .. }) {
                        FieldKind::PositiveInteger
                    } else if matches!(f, Field::Choice { .. }) && f.presentation().is_none() {
                        FieldKind::Choice
                    } else if matches!(f, Field::Text { .. } | Field::Choice { .. }) {
                        FieldKind::Text
                    } else {
                        FieldKind::Records
                    },
                    f.required_for_export(),
                )
            }
            Binding::Collection { collection, .. } => {
                let c = def
                    .collections
                    .iter()
                    .find(|c| c.id == *collection)
                    .unwrap();
                (
                    format!("{}.{}", def.id, c.id),
                    c.label_key.as_str(),
                    false,
                    FieldKind::Records,
                    false,
                )
            }
        };
        let group = def
            .header
            .tabs
            .iter()
            .find(|tab| match tab {
                Tab::Form { sections, .. } => sections.iter().any(|s| s.fields.contains(&id)),
                Tab::RecordCards { collection, .. } => binding.source() == collection,
                Tab::Bibliography {
                    collection,
                    style_field,
                    ..
                } => binding.source() == collection || binding.source() == style_field,
            })
            .map_or("general", |tab| tab.id());
        fields.push(RootField {
            public: serde_json::from_value(json!(id)).expect("registered metadata identity"),
            resource: def
                .fields
                .iter()
                .find(|f| f.id() == binding.source())
                .and_then(|f| {
                    if let Field::ResourceReference {
                        resource_kind,
                        profile_default,
                        ..
                    } = f
                    {
                        Some(crate::resources::ResourceDescriptor {
                            kind: *resource_kind,
                            profile_default: *profile_default,
                        })
                    } else {
                        None
                    }
                }),
            presentation: def
                .fields
                .iter()
                .find(|field| field.id() == binding.source())
                .and_then(Field::presentation),
            parameter: binding.metadata_key().into(),
            label_key: label.into(),
            group: group.into(),
            multiline,
            choices: def
                .fields
                .iter()
                .find_map(|f| match f {
                    Field::Choice {
                        choices,
                        choice_labels,
                        ..
                    } if f.id() == binding.source() => Some(
                        choices
                            .iter()
                            .zip(choice_labels)
                            .map(|(value, label_key)| super::super::fields::FieldChoice {
                                value: value.clone(),
                                label_key: label_key.clone(),
                            })
                            .collect(),
                    ),
                    _ => None,
                })
                .unwrap_or_default(),
            kind,
            required_for_export: required,
        });
    }
    let groups = def
        .header
        .tabs
        .iter()
        .map(|tab| FieldGroup {
            id: tab.id().into(),
            label_key: tab.label_key().into(),
            sections: match tab {
                Tab::Form { sections, .. } => sections
                    .iter()
                    .map(|section| FieldSection {
                        id: section.id.clone(),
                        label_key: section.label_key.clone(),
                        layout: section.layout,
                        fields: section
                            .fields
                            .iter()
                            .map(|id| {
                                serde_json::from_value(json!(id))
                                    .expect("registered metadata field")
                            })
                            .collect(),
                    })
                    .collect(),
                _ => vec![],
            },
        })
        .collect();
    (fields, groups)
}
