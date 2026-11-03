use super::*;
use crate::{content::editorial::RichText, document::typst_string};

pub(super) fn main(loaded: &LoadedDefinition, raw: &Value, options: &DocumentOptions) -> String {
    let def = loaded.definition();
    let name = &def.composition.function;
    let mut source = format!("#import \"modele.typ\": {name}\n#show: {name}.with(\n");
    for binding in &def.bindings {
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
                let text = value
                    .as_array()
                    .expect("typed ordered records")
                    .iter()
                    .map(|record| {
                        if c.kind == CollectionKind::ReferenceFiles {
                            let file: crate::bibliography::ReferenceFile =
                                serde_json::from_value(record.clone())
                                    .expect("typed reference file");
                            format!("path({}),", typst_string(&file.path()))
                        } else {
                            let fields = c
                                .fields
                                .iter()
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
        source.push_str(&format!("  {}: {text},\n", binding.parameter()));
    }
    if let Some(signature) = &def.signature {
        let value = raw["signature"]
            .as_str()
            .map_or_else(|| "none".into(), typst_string);
        source.push_str(&format!("  {}: {value},\n", signature.parameter));
    }
    source.push_str(&format!(
        "  options: (paper: {}, landscape: {}, language: {}, bullet-marker: {}),\n)\n#include \"contenu.typ\"\n",
        typst_string(options.paper.typst_name()),options.landscape,typst_string(options.language.code()),
        options.bullet_marker.as_deref().map_or_else(||"auto".into(),typst_string),
    ));
    source
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
        Field::Boolean { .. } => value.as_bool().expect("typed boolean").to_string(),
        _ => typst_string(value.as_str().expect("typed literal text")),
    }
}
