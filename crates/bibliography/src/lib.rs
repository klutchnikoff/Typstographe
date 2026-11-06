//! Bibliographic values and pure operations shared by project and personal libraries.
//! Callers own identity allocation, persistence, document history and publication.

mod diagnostic;
mod genre;
mod import;
mod model;
mod search;

pub use diagnostic::{Code, Diagnostic, Error, Result, Severity};
pub use genre::{FieldDescriptor, FieldKind, Genre, GenreDescriptor, genres};
pub use import::{
    ImportFormat, ImportSource, PreparedImport, completeness, parse_native, prepare_import,
};
pub use model::{FieldPatch, Fingerprint, Library, Provenance, Record, RecordId};
pub use search::{EntrySummary, normalize_text, search, search_score, summarize};

/// Imported source size, before parsing. Original bytes are retained by the caller.
pub const MAX_SOURCE_BYTES: usize = 2 * 1024 * 1024;
/// Maximum records in one library or import.
pub const MAX_RECORDS: usize = 10_000;

#[cfg(test)]
#[cfg_attr(coverage_nightly, coverage(off))]
mod tests;
