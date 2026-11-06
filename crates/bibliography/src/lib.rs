//! Bibliographic values and pure operations shared by project and personal libraries.
//! Callers own identity allocation, persistence, document history and publication.
#![cfg_attr(coverage_nightly, feature(coverage_attribute))]

mod diagnostic;
mod genre;
mod identity;
mod import;
mod keys;
mod model;
mod plan;
mod search;

pub use diagnostic::{Code, Diagnostic, Error, Result, Severity};
pub use genre::{FieldDescriptor, FieldKind, Genre, GenreDescriptor, genres};
pub use identity::{
    CandidateGroup, ConflictReason, Evidence, Signal, candidate_groups, evidence, normalize_arxiv,
    normalize_doi,
};
pub use import::{
    ImportFormat, ImportSource, PreparedImport, completeness, parse_native, prepare_import,
};
pub use keys::suggest_key;
pub use model::{FieldPatch, Fingerprint, Library, Provenance, Record, RecordId};
pub use plan::{Action, Decision, ImportPlan, PlanItem};
pub use search::{EntrySummary, SearchQuery, normalize_text, search, summarize};

/// Imported source size, before parsing. Original bytes are retained by the caller.
pub const MAX_SOURCE_BYTES: usize = 2 * 1024 * 1024;
/// Maximum records in one library or import.
pub const MAX_RECORDS: usize = 10_000;

#[cfg(test)]
#[cfg_attr(coverage_nightly, coverage(off))]
mod tests;
