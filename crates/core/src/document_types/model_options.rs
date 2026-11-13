//! One contract and resolver for retained documentary choices and model presentation.
use super::{DocumentType, Metadata, definition::Field};
use crate::document::{DocumentLanguage, PaperFormat, valid_bullet_marker};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::BTreeMap;

#[derive(
    Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, JsonSchema,
)]
#[serde(rename_all = "kebab-case")]
pub enum OptionId {
    Paper,
    Landscape,
    BulletMarker,
    CitationStyle,
    Outline,
}
impl OptionId {
    pub fn domain(self, kind: DocumentType) -> Option<Vec<Value>> {
        match self {
            Self::Paper => Some(PaperFormat::ALL.into_iter().map(|v| json!(v)).collect()),
            Self::Landscape | Self::Outline => Some(vec![json!(false), json!(true)]),
            Self::CitationStyle => Some(
                kind.definition()
                    .definition()
                    .fields
                    .iter()
                    .find_map(|field| match field {
                        Field::Choice { choices, .. } if field.presentation() == Some(self) => {
                            Some(choices.iter().map(|s| json!(s)).collect())
                        }
                        _ => None,
                    })
                    .unwrap_or_default(),
            ),
            Self::BulletMarker => None,
        }
    }
    pub fn valid(self, kind: DocumentType, value: &Value) -> bool {
        if let Some(domain) = self.domain(kind) {
            return domain.contains(value);
        }
        value
            .as_str()
            .is_some_and(|v| v == "auto" || valid_bullet_marker(v))
    }
    fn pointer(self, kind: DocumentType) -> String {
        match self {
            Self::Paper => "/fields/options/paper".into(),
            Self::Landscape => "/fields/options/landscape".into(),
            Self::BulletMarker => "/fields/options/bullet_marker".into(),
            _ => {
                let def = kind.definition().definition();
                let field = def
                    .fields
                    .iter()
                    .find(|f| f.presentation() == Some(self))
                    .expect("registered option");
                let binding = def
                    .bindings
                    .iter()
                    .find(|b| b.source() == field.id())
                    .expect("field binding");
                format!("/fields/{}", binding.metadata_key())
            }
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "regime", rename_all = "kebab-case", deny_unknown_fields)]
pub enum Policy {
    Free { default: Value },
    Restricted { allowed: Vec<Value>, default: Value },
    Imposed { value: Value },
}
impl Policy {
    pub fn allows(&self, value: &Value) -> bool {
        match self {
            Self::Free { .. } => true,
            Self::Restricted { allowed, .. } => allowed.contains(value),
            Self::Imposed { .. } => false,
        }
    }
    fn fallback(&self) -> &Value {
        match self {
            Self::Free { default } | Self::Restricted { default, .. } => default,
            Self::Imposed { value } => value,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "kebab-case", deny_unknown_fields)]
pub struct Manifest {
    pub contract_version: u32,
    pub document_type: DocumentType,
    pub languages: Vec<DocumentLanguage>,
    pub options: BTreeMap<OptionId, Policy>,
    #[serde(default)]
    pub publication: bool,
}

/// Parsing is memoized by source, including invalid input; no per-keystroke YAML parsing.
#[comemo::memoize]
pub fn load(source: &str) -> Result<Manifest, String> {
    let manifest: Manifest = super::definition::decode_yaml(source).map_err(|e| e.to_string())?;
    manifest.validate()?;
    Ok(manifest)
}
pub fn option_ids(kind: DocumentType) -> Vec<OptionId> {
    let mut ids = vec![OptionId::Paper, OptionId::Landscape];
    if kind
        .definition()
        .definition()
        .capabilities
        .iter()
        .any(|id| id == "block.bullet")
    {
        ids.push(OptionId::BulletMarker);
    }
    ids.extend(
        kind.definition()
            .definition()
            .fields
            .iter()
            .filter_map(Field::presentation),
    );
    ids.sort();
    ids
}
impl Manifest {
    /// Incoming shared deltas may not turn retained, inactive choices into hidden new edits.
    pub fn check_edits(&self, before: &Metadata, after: &Metadata) -> Result<(), String> {
        let before = json!(before);
        let after = json!(after);
        for id in self.options.keys() {
            let pointer = id.pointer(self.document_type);
            if before.pointer(&pointer) != after.pointer(&pointer) {
                self.check_write(*id, after.pointer(&pointer).ok_or("missing_option_choice")?)?;
            }
        }
        Ok(())
    }
    fn validate(&self) -> Result<(), String> {
        if self.contract_version != 1 {
            return Err("unsupported_model_manifest_version".into());
        }
        if self.publication && self.document_type != DocumentType::Article {
            return Err("invalid_model_publication".into());
        }
        if self.languages.is_empty()
            || self
                .languages
                .iter()
                .enumerate()
                .any(|(i, l)| self.languages[..i].contains(l))
        {
            return Err("invalid_model_languages".into());
        }
        if self.options.keys().copied().collect::<Vec<_>>() != option_ids(self.document_type) {
            return Err("incomplete_model_options".into());
        }
        for (id, policy) in &self.options {
            if !id.valid(self.document_type, policy.fallback()) {
                return Err(format!("invalid_option_default:{id:?}"));
            }
            if let Policy::Restricted { allowed, default } = policy
                && (allowed.is_empty()
                    || allowed.len() > 128
                    || !allowed.contains(default)
                    || allowed
                        .iter()
                        .enumerate()
                        .any(|(i, v)| !id.valid(self.document_type, v) || allowed[..i].contains(v)))
            {
                return Err(format!("invalid_option_domain:{id:?}"));
            }
        }
        Ok(())
    }
    pub fn resolve(&self, metadata: &Metadata) -> Result<Resolution, String> {
        self.validate()?;
        let kind = metadata.document_type();
        if self.document_type != kind {
            return Err("model_type_mismatch".into());
        }
        if !self.languages.contains(&metadata.options().language) {
            return Err("model_language_unsupported".into());
        }
        let mut raw = json!(metadata);
        let mut options = BTreeMap::new();
        for (id, policy) in &self.options {
            let pointer = id.pointer(kind);
            let choice = raw.pointer(&pointer).expect("option storage").clone();
            if !choice.is_null() && !id.valid(kind, &choice) {
                return Err(format!("invalid_option_choice:{id:?}"));
            }
            let substituted = !choice.is_null()
                && !matches!(policy, Policy::Imposed { .. })
                && !policy.allows(&choice);
            let effective = if !choice.is_null() && policy.allows(&choice) {
                choice.clone()
            } else {
                policy.fallback().clone()
            };
            *raw.pointer_mut(&pointer).unwrap() =
                if *id == OptionId::BulletMarker && effective == "auto" {
                    Value::Null
                } else {
                    effective.clone()
                };
            options.insert(
                *id,
                ResolvedOption {
                    policy: policy.clone(),
                    choice,
                    effective,
                    substituted,
                    domain: id.domain(kind),
                },
            );
        }
        Ok(Resolution {
            publication: self.publication,
            metadata: serde_json::from_value(raw).map_err(|e| e.to_string())?,
            options,
        })
    }
    /// New explicit writes obey the active model. Reset-to-model is valid unless imposed.
    pub fn check_write(&self, id: OptionId, value: &Value) -> Result<(), String> {
        let policy = self.options.get(&id).ok_or("unknown_model_option")?;
        if matches!(policy, Policy::Imposed { .. })
            || (!value.is_null() && (!id.valid(self.document_type, value) || !policy.allows(value)))
        {
            return Err(format!("model_option_not_allowed:{id:?}"));
        }
        Ok(())
    }
}
#[derive(Clone, Debug, Serialize)]
pub struct ResolvedOption {
    #[serde(flatten)]
    pub policy: Policy,
    pub choice: Value,
    pub effective: Value,
    pub substituted: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub domain: Option<Vec<Value>>,
}
pub struct Resolution {
    publication: bool,
    pub metadata: Metadata,
    pub options: BTreeMap<OptionId, ResolvedOption>,
}
impl Resolution {
    pub fn main_source(&self) -> String {
        self.metadata.raw_main_source(self.publication)
    }
}

pub fn describe(source: &str, metadata: &Metadata) -> Result<Value, String> {
    let manifest = load(source)?;
    let resolution = manifest.resolve(metadata)?;
    Ok(json!({"languages":manifest.languages,"options":resolution.options}))
}

#[cfg(test)]
#[cfg_attr(coverage_nightly, coverage(off))]
mod tests;
