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
    state: tauri::State<crate::Bridge>,
    template: String,
) -> Result<typstographe_core::document_types::ModelPresentation, CommandError> {
    policy(&*state.session()?, template)
}
pub(crate) fn policy(
    session: &crate::session::Session,
    template: String,
) -> Result<typstographe_core::document_types::ModelPresentation, CommandError> {
    if template.len() > 2 * 1024 * 1024 {
        return Err("Model too large".into());
    }
    let mut settings = session.settings.clone();
    settings.template = template.clone();
    let dependencies = session.dependencies_for(&settings);
    let mut world = typstographe_core::rendering::TypstWorld::default();
    world.set_dependencies(&dependencies);
    world
        .model_presentation(&template)
        .map_err(CommandError::message)
}
