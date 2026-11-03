//! Options and model changes preserve all existing shared branches.
use super::{projection, records};
use crate::{
    assets::Assets,
    content::{
        commands::{Command, OptionName},
        contract::{Error, State},
    },
};
use serde_json::{Value, json};
use yrs::{Any, Doc, Map, Transact};
fn parameter(name: &str) -> Error {
    Error::InvalidParameters {
        parameter: name.into(),
    }
}
fn any(value: &Value) -> Any {
    Any::from_json(&value.to_string()).expect("JSON")
}
fn set(doc: &Doc, key: &str, value: &Value) {
    let root = doc.get_or_insert_map("settings");
    let mut tx = doc.transact_mut();
    root.insert(&mut tx, key, any(value));
}
pub(super) fn set_option(
    doc: &Doc,
    state: &State,
    name: OptionName,
    value: &Value,
) -> Result<(), Error> {
    use crate::document_types::model_options::{self, OptionId};
    let id = match name {
        OptionName::Paper => Some(OptionId::Paper),
        OptionName::Landscape => Some(OptionId::Landscape),
        OptionName::BulletMarker => Some(OptionId::BulletMarker),
        _ => None,
    };
    if let Some(id) = id {
        model_options::load(&state.settings.model_manifest)
            .and_then(|m| m.check_write(id, value))
            .map_err(projection::invalid)?;
    }
    let mut options = serde_json::to_value(state.settings.metadata.options()).expect("options");
    let key = name.key();
    if options[key] == *value {
        return Ok(());
    }
    options[key] = value.clone();
    let options: crate::document::DocumentOptions =
        serde_json::from_value(options).map_err(|_| parameter("value"))?;
    if options
        .bullet_marker
        .as_ref()
        .is_some_and(|v| v != "auto" && !crate::document::valid_bullet_marker(v))
    {
        return Err(parameter("value"));
    }
    set(doc, &format!("options.{key}"), value);
    if name == OptionName::Language {
        // Changing the primary language adds missing localized records, never replaces existing ones.
        if let Some(schema) = state
            .settings
            .metadata
            .document_type()
            .structured_metadata()
        {
            let fields = serde_json::to_value(&state.settings.metadata).expect("metadata");
            for definition in schema["collections"].as_array().into_iter().flatten() {
                let Some(key) = definition["language_key"].as_str() else {
                    continue;
                };
                let name = definition["parameter"].as_str().unwrap();
                let items = fields["fields"][name].as_array().unwrap();
                if items.iter().any(|item| item[key] == *value) {
                    continue;
                }
                let mut index = 1;
                let id = loop {
                    let id = format!("primary-{}-{index}", options.language.code());
                    if !items.iter().any(|item| item["id"] == id) {
                        break id;
                    }
                    index += 1;
                };
                records::apply(
                    doc,
                    state,
                    &Command::AddRecord {
                        collection: name.into(),
                        id,
                        values: serde_json::Map::from_iter([(key.into(), value.clone())]),
                        after: None,
                    },
                )?;
            }
        }
    }
    Ok(())
}
pub(super) fn apply(doc: &Doc, state: &State, command: &Command) -> Result<(), Error> {
    match command {
        Command::SetModel {
            model_id,
            source,
            manifest,
        } => {
            if model_id.trim().is_empty() || model_id.len() > 256 || source.len() > 1024 * 1024 {
                return Err(parameter("model"));
            }
            let builtin = crate::document_types::models::ALL
                .iter()
                .find(|m| m.model.id() == model_id);
            if builtin.is_some_and(|m| m.kind != state.settings.metadata.document_type()) {
                return Err(parameter("model"));
            }
            if state.settings.model_id == *model_id
                && state.settings.template == *source
                && state.settings.model_manifest == *manifest
            {
                return Ok(());
            }
            // Update the scalar base only: collections, rich fragments and overrides retain identity.
            let root = doc.get_or_insert_map("settings");
            let value = root
                .get(&doc.transact(), "document")
                .ok_or_else(|| parameter("model"))?;
            let yrs::Out::Any(value) = value else {
                return Err(parameter("model"));
            };
            let mut base = serde_json::to_value(value).map_err(|_| parameter("model"))?;
            base["modelId"] = json!(model_id);
            base["template"] = json!(source);
            base["modelManifest"] = json!(manifest);
            set(doc, "document", &base);
        }
        _ => unreachable!(),
    }
    Ok(())
}
pub(super) fn validate_model(state: &State, assets: &Assets) -> Result<(), Error> {
    let template = &state.settings.template;
    let dependencies = crate::packages::for_template(template);
    crate::packages::validate(template, &dependencies).map_err(|e| Error::InvalidSettings {
        reason: e.to_string(),
    })?;
    let source = state.validate(assets)?;
    let mut world = crate::rendering::TypstWorld::default();
    world.set_assets(assets);
    world.set_dependencies(&dependencies);
    world
        .validate_with_model(
            &source,
            &state.settings.metadata,
            template,
            &state.settings.model_manifest,
        )
        .map_err(|e| projection::invalid(format!("model_validation: {e}")))?;
    Ok(())
}
