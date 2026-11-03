//! Read-only bibliography index and model policy. Every mutation stays in the document/Yjs path.
use crate::error::CommandError;
use typstographe_core::{
    bibliography::{self, Entry, ReferenceFile},
    content::Node,
    document_types::Metadata,
};
#[tauri::command]
pub fn bibliography_search(
    files: Vec<ReferenceFile>,
    query: String,
) -> Result<Vec<Entry>, CommandError> {
    let entries = bibliography::index(&files)?;
    Ok(bibliography::search(&entries, &query))
}
#[tauri::command]
pub fn bibliography_index(files: Vec<ReferenceFile>) -> Result<Vec<Entry>, CommandError> {
    bibliography::index(&files).map_err(CommandError::Message)
}
#[tauri::command]
pub fn validate_bibliography(document: Node, metadata: Metadata) -> Result<(), CommandError> {
    metadata.validate()?;
    bibliography::validate_document(&document, &metadata).map_err(CommandError::Message)
}
#[tauri::command]
pub fn model_policy(
    metadata: Metadata,
    manifest: String,
) -> Result<serde_json::Value, CommandError> {
    typstographe_core::document_types::model_options::describe(&manifest, &metadata)
        .map_err(CommandError::Message)
}
