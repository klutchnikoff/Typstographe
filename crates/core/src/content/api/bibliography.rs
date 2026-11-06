//! Read-only preparation. These results are not active document records or edit commands.
use super::invalid;
use crate::content::contract::{Error, State, UnavailableReason};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};
use sha2::{Digest, Sha256};
use typstographe_bibliography::{
    self as bibliography, Diagnostic, Fingerprint, Genre, ImportFormat, ImportSource, Record,
    RecordId,
};

#[derive(Clone, Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub(super) struct ImportInput {
    pub id: RecordId,
    #[schemars(
        length(min = 1, max = 256),
        regex(pattern = r"^[^/\\\u0000-\u001f\u007f-\u009f]+$")
    )]
    pub name: String,
    pub format: ImportFormat,
    /// Original UTF-8 input, bounded before parsing. Never a filesystem path.
    #[schemars(extend("x-max-utf8-bytes"=2097152))]
    pub contents: String,
}

#[derive(Clone, Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub(super) struct RecordInput {
    pub id: RecordId,
    pub genre: Genre,
    /// Omit to suggest an available key; an explicit occupied key is refused.
    #[serde(default)]
    pub key: Option<String>,
    /// Native Hayagriva fields over the genre's starting structure, not a source document.
    #[serde(default)]
    pub entry: Map<String, Value>,
}

#[derive(Serialize, JsonSchema)]
struct SourceSummary {
    id: RecordId,
    name: String,
    format: ImportFormat,
    digest: Fingerprint,
}

#[derive(Serialize, JsonSchema)]
struct ImportResult {
    /// False: preparation never inserts references, publishes edits or saves a project.
    #[schemars(extend("const"=false))]
    active: bool,
    source: SourceSummary,
    records: Vec<Record>,
    diagnostics: Vec<Diagnostic>,
    fingerprint: Fingerprint,
}

#[derive(Serialize, JsonSchema)]
struct RecordResult {
    #[schemars(extend("const"=false))]
    active: bool,
    record: Record,
    diagnostics: Vec<Diagnostic>,
    fingerprint: Fingerprint,
}

#[derive(Serialize, JsonSchema)]
struct GenresResult {
    genres: Vec<bibliography::GenreDescriptor>,
}

pub(super) fn parameter_schema(id: &str) -> Option<Value> {
    Some(match id {
        "bibliography.prepare_import" => json!(schemars::schema_for!(ImportInput)),
        "bibliography.prepare_record" => json!(schemars::schema_for!(RecordInput)),
        _ => return None,
    })
}
pub(super) fn result_schema(id: &str) -> Option<Value> {
    Some(match id {
        "bibliography.genres" => json!(schemars::schema_for!(GenresResult)),
        "bibliography.prepare_import" => json!(schemars::schema_for!(ImportResult)),
        "bibliography.prepare_record" => json!(schemars::schema_for!(RecordResult)),
        _ => return None,
    })
}

fn occupied(state: &State, command: &str) -> Result<std::collections::BTreeSet<String>, Error> {
    let crate::document_types::Metadata::Article(meta) = &state.settings.metadata else {
        return Err(Error::CommandUnavailable {
            command: command.into(),
            reason: UnavailableReason::UnsupportedDocumentType,
        });
    };
    crate::bibliography::index(&meta.references)
        .map(|v| v.into_iter().map(|e| e.key).collect())
        .map_err(|reason| Error::InvalidDocument { reason })
}

pub(super) fn run(state: &State, command: &str, params: &Value) -> Result<Value, Error> {
    let occupied = occupied(state, command)?;
    Ok(match command {
        "bibliography.genres" => json!(GenresResult {
            genres: bibliography::genres()
        }),
        "bibliography.prepare_import" => {
            let input: ImportInput = serde_json::from_value(params.clone())
                .map_err(|_| invalid("bibliography_import"))?;
            let source = ImportSource::new(input.id, &input.name, input.format, input.contents)
                .map_err(Error::bibliography)?;
            // Allocation belongs to the caller of the pure crate. Stable only for this input:
            // naming seeds allocate proposals; they are never matching evidence.
            let namespace = json!([source.id(), source.digest()]).to_string();
            let prepared = bibliography::prepare_import(source, |key| {
                let bytes = serde_json::to_vec(&(namespace.as_str(), key)).expect("identity seed");
                let digest = Sha256::digest(bytes);
                let name = format!(
                    "ref-{}",
                    digest
                        .iter()
                        .map(|b| format!("{b:02x}"))
                        .collect::<String>()
                );
                RecordId::new(name).expect("bounded ASCII proposal identity")
            })
            .map_err(Error::bibliography)?;
            json!(ImportResult {
                active: false,
                source: SourceSummary {
                    id: prepared.source.id().clone(),
                    name: prepared.source.name().into(),
                    format: prepared.source.format(),
                    digest: prepared.source.digest().clone()
                },
                fingerprint: prepared.fingerprint(),
                records: prepared.records,
                diagnostics: prepared.diagnostics
            })
        }
        "bibliography.prepare_record" => {
            let input: RecordInput = serde_json::from_value(params.clone())
                .map_err(|_| invalid("bibliography_record"))?;
            // Use the crate's strict native decoder, preserving field paths on errors.
            let seed_key = input.key.as_deref().unwrap_or("pending");
            let entry = input.genre.empty_entry(seed_key);
            let mut value = serde_json::to_value(entry).expect("native entry");
            value.as_object_mut().unwrap().extend(input.entry);
            let pending = Record::from_native(input.id, input.genre, seed_key, value)
                .map_err(Error::bibliography)?;
            let key = input
                .key
                .unwrap_or_else(|| bibliography::suggest_key(pending.entry(), &occupied));
            if occupied.contains(&key) {
                return Err(Error::bibliography(bibliography::Error {
                    code: bibliography::Code::DuplicateKey,
                    key: Some(key),
                    field: Some("key".into()),
                    detail: "The requested key is already used by the project".into(),
                }));
            }
            let record = pending
                .renamed(&pending.fingerprint(), &key)
                .map_err(Error::bibliography)?;
            json!(RecordResult {
                active: false,
                fingerprint: record.fingerprint(),
                diagnostics: bibliography::completeness(&record),
                record
            })
        }
        _ => return Err(invalid("query")),
    })
}
