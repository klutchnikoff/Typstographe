use super::{Definition, LoadedDefinition};
use serde::{Deserialize, Serialize};

pub const MAX_SOURCE_BYTES: usize = 256 * 1024;

/// Stable categories and structured locations, without Fluent in the core.
#[derive(Debug, thiserror::Error, Serialize)]
#[serde(tag = "code", rename_all = "snake_case")]
pub enum LoadError {
    #[error("Type definition exceeds {max_bytes} UTF-8 bytes")]
    SourceTooLarge { max_bytes: usize },
    #[error("Cannot decode type definition: {message}")]
    Decode {
        message: String,
        line: Option<usize>,
        column: Option<usize>,
    },
    #[error("Unsupported YAML construct at {path}: {construct}")]
    UnsupportedYaml { path: String, construct: String },
    #[error("Invalid type definition: {diagnostics:?}")]
    InvalidDefinition { diagnostics: Vec<super::Diagnostic> },
}
impl From<yaml_serde::Error> for LoadError {
    fn from(error: yaml_serde::Error) -> Self {
        Self::Decode {
            line: error.location().map(|l| l.line()),
            column: error.location().map(|l| l.column()),
            message: error.to_string(),
        }
    }
}

/// One in-memory document only: no filesystem, network, imports or registration.
pub fn load_yaml(source: &str) -> Result<LoadedDefinition, LoadError> {
    if source.len() > MAX_SOURCE_BYTES {
        return Err(LoadError::SourceTooLarge {
            max_bytes: MAX_SOURCE_BYTES,
        });
    }
    // The library's Mapping rejects duplicates at every depth, including inside
    // internally tagged enums (Serde may otherwise buffer those fields).
    let value: yaml_serde::Value = yaml_serde::from_str(source)?;
    json_subset(&value, "")?;
    // Decode from the original source to retain the library's line/column paths.
    let definition = Definition::deserialize(yaml_serde::Deserializer::from_str(source))?;
    definition
        .validate()
        .map_err(|diagnostics| LoadError::InvalidDefinition { diagnostics })
}

fn json_subset(value: &yaml_serde::Value, path: &str) -> Result<(), LoadError> {
    use yaml_serde::Value;
    let unsupported = |construct: &str| LoadError::UnsupportedYaml {
        path: path.into(),
        construct: construct.into(),
    };
    match value {
        Value::Tagged(_) => return Err(unsupported("custom tag")),
        Value::Number(n) if n.as_f64().is_some_and(|v| !v.is_finite()) => {
            return Err(unsupported("non-finite number"));
        }
        Value::Mapping(map) => {
            for (key, value) in map {
                let Some(key) = key.as_str() else {
                    return Err(unsupported("non-string mapping key"));
                };
                if key == "<<" {
                    return Err(unsupported("merge key"));
                }
                json_subset(
                    value,
                    &format!("{path}/{}", super::validation::pointer(key)),
                )?;
            }
        }
        Value::Sequence(values) => {
            for (i, value) in values.iter().enumerate() {
                json_subset(value, &format!("{path}/{i}"))?;
            }
        }
        _ => {}
    }
    Ok(())
}
