use super::*;
use crate::{content::editorial::RichText, document::typst_string};

pub(super) fn main(
    loaded: &LoadedDefinition,
    raw: &Value,
    options: &DocumentOptions,
    publication: bool,
) -> String {
    let def = loaded.definition();
    let name = &def.composition.function;
    let mut source = format!("#import \"modele.typ\": {name}\n#show: {name}.with(\n");
    let mut groups = std::collections::BTreeMap::<&str, Vec<String>>::new();
    for binding in &def.bindings {
        if binding.typst_group() == Some("publication") && !publication {
            continue;
        }
        let value = &raw[binding.metadata_key()];
        let text = match binding {
            Binding::Field { field, .. } => {
                render(def.fields.iter().find(|f| f.id() == field).unwrap(), value)
            }
            Binding::Collection { collection, .. } => {
                let c = def
                    .collections
                    .iter()
                    .find(|c| c.id == *collection)
                    .unwrap();
                if c.kind == CollectionKind::BibliographicSources {
                    continue;
                }
                if c.kind == CollectionKind::BibliographicRecords {
                    let text = if value.as_array().is_none_or(|v| v.is_empty()) {
                        "()".into()
                    } else {
                        format!(
                            "(path({}),)",
                            typst_string(crate::bibliography::ACTIVE_PATH)
                        )
                    };
                    source.push_str(&format!("  {}: {text},\n", binding.parameter()));
                    continue;
                }
                let text = value
                    .as_array()
                    .expect("typed ordered records")
                    .iter()
                    .map(|record| {
                        if c.kind != CollectionKind::OrderedRecords {
                            unreachable!("native collection handled above")
                        } else {
                            let fields = c
                                .fields
                                .iter()
                                .filter(|field| !omitted(field, &record[field.id()]))
                                .map(|f| format!("{}: {}", f.id(), render(f, &record[f.id()])))
                                .collect::<Vec<_>>()
                                .join(", ");
                            format!(
                                "(id: {}, {fields}),",
                                typst_string(record["id"].as_str().expect("typed identity"))
                            )
                        }
                    })
                    .collect::<String>();
                format!("({text})")
            }
        };
        if let Some(group) = binding.typst_group() {
            let field = def
                .fields
                .iter()
                .find(|field| field.id() == binding.source())
                .unwrap();
            if value != &field.default_value() {
                groups
                    .entry(group)
                    .or_default()
                    .push(format!("{}: {text}", binding.parameter()));
            }
        } else {
            source.push_str(&format!("  {}: {text},\n", binding.parameter()));
        }
    }
    for (group, fields) in groups {
        source.push_str(&format!("  {group}: ({}),\n", fields.join(", ")));
    }
    source.push_str(&format!(
        "  options: (paper: {}, landscape: {}, language: {}, bullet-marker: {}),\n)\n#include \"contenu.typ\"\n",
        typst_string(options.paper.expect("resolved paper").typst_name()),options.landscape.expect("resolved orientation"),typst_string(options.language.code()),
        options.bullet_marker.as_deref().filter(|v| *v != "auto").map_or_else(||"auto".into(),typst_string),
    ));
    source
}
fn omitted(field: &Field, value: &Value) -> bool {
    field.omit_empty() && (value.is_null() || value.as_str() == Some(""))
}

fn render(field: &Field, value: &Value) -> String {
    match field {
        Field::RichText { profile, .. } => {
            let rich: RichText =
                serde_json::from_value(value.clone()).expect("validated editorial data");
            format!("[{}]", rich.source(*profile == RichProfile::InlineText))
        }
        Field::Tokens { .. } | Field::RecordReferences { .. } => {
            let text = value
                .as_array()
                .expect("typed string list")
                .iter()
                .map(|v| format!("{},", typst_string(v.as_str().expect("typed string"))))
                .collect::<String>();
            format!("({text})")
        }
        Field::ResourceReference { .. } => {
            value.as_str().map_or_else(|| "none".into(), typst_string)
        }
        Field::Date { .. } => {
            serde_json::from_value::<Option<crate::dates::DateValue>>(value.clone())
                .expect("validated date")
                .map_or_else(|| "none".into(), |date| date.typst())
        }
        Field::PositiveInteger { .. } => value
            .as_u64()
            .map_or_else(|| "none".into(), |number| number.to_string()),
        Field::Boolean { .. } => value.as_bool().expect("resolved boolean").to_string(),
        _ => typst_string(value.as_str().expect("resolved literal text")),
    }
}
