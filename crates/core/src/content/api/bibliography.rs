//! Read-only preparation. These results are not active document records or edit commands.
use super::invalid;
use crate::content::contract::{Error, State, UnavailableReason};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};

use typstographe_bibliography::{
    self as bibliography, Diagnostic, Fingerprint, Genre, ImportFormat, Record, RecordId,
};

use crate::bibliography::editions::SourceInput as ImportInput;

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

#[derive(Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
struct RecordIdentity {
    id: RecordId,
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
    library_fingerprint: Fingerprint,
    plan: Value,
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
        "bibliography.record" => json!(schemars::schema_for!(RecordIdentity)),
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
        "bibliography.record" => {
            let identity: RecordIdentity = serde_json::from_value(params.clone())
                .map_err(|_| invalid("bibliography_record"))?;
            let library = crate::bibliography::editions::library(state, command)?;
            let record = library.get(&identity.id).ok_or_else(|| {
                Error::bibliography(bibliography::Error {
                    code: bibliography::Code::MissingRecord,
                    key: None,
                    field: None,
                    detail: "Record not found".into(),
                })
            })?;
            json!({"record":record,"fingerprint":record.fingerprint(),"diagnostics":bibliography::completeness(record)})
        }
        "bibliography.genres" => json!(GenresResult {
            genres: bibliography::genres()
        }),
        "bibliography.prepare_import" => {
            let input: ImportInput = serde_json::from_value(params.clone())
                .map_err(|_| invalid("bibliography_import"))?;
            let prepared = crate::bibliography::editions::prepare(input)?;
            let library = crate::bibliography::editions::library(state, command)?;
            let plan = crate::bibliography::editions::plan(&library, &prepared)?;
            json!(ImportResult {
                active: false,
                library_fingerprint: library.fingerprint(),
                plan: json!({"blocked":plan.blocked(),"items":plan.items()}),
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
