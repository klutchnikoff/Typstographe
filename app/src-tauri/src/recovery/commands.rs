//! Native recovery boundary. Paths never come from catalogue identifiers.
use super::{drafts, work};
use crate::Bridge;
use crate::error::CommandError;
use serde_json::json;
use std::path::PathBuf;
use tauri::{Emitter, State};
use tauri_plugin_dialog::DialogExt;

#[tauri::command(async)]
pub fn work_list(state: State<Bridge>) -> Result<Vec<work::Entry>, CommandError> {
    state.session()?.work_list()
}
#[tauri::command(async)]
pub fn work_delete(state: State<Bridge>, id: String) -> Result<(), CommandError> {
    state.session()?.work_delete(&id)
}
#[tauri::command(async)]
pub fn work_restore(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: State<Bridge>,
    id: String,
    revision: u64,
) -> Result<(), CommandError> {
    state
        .session()?
        .work_restore(window.label(), &id, revision)?;
    let mut agent = state.agent.lock()?;
    agent.token = None;
    agent.proposal = None;
    app.emit("app:document", ()).map_err(CommandError::from)
}
#[tauri::command(async)]
pub fn work_abandon(
    window: tauri::WebviewWindow,
    state: State<Bridge>,
    generation: String,
) -> Result<(), CommandError> {
    state
        .session()?
        .abandon_window_work(window.label(), &generation)
}
#[tauri::command]
pub async fn choose_work_file(
    app: tauri::AppHandle,
    save: bool,
) -> Result<Option<PathBuf>, CommandError> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    let picker = app.dialog().file().add_filter("JSON", &["json"]);
    if save {
        picker
            .set_file_name("typstographe-draft.json")
            .save_file(move |p| {
                let _ = tx.send(p);
            });
    } else {
        picker.pick_file(move |p| {
            let _ = tx.send(p);
        });
    }
    rx.await?
        .map(|p| p.into_path().map_err(CommandError::message))
        .transpose()
}
#[tauri::command(async)]
pub fn work_import(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: State<Bridge>,
    path: PathBuf,
    revision: u64,
) -> Result<(), CommandError> {
    let record = work::read_work(&path)?;
    let mut session = state.session()?;
    session.lifecycle(revision)?;
    session.restore_work_record(window.label(), record)?;
    drop(session);
    let mut agent = state.agent.lock()?;
    agent.token = None;
    agent.proposal = None;
    app.emit("app:document", ()).map_err(CommandError::from)
}
#[tauri::command(async)]
pub fn work_export(
    window: tauri::WebviewWindow,
    state: State<Bridge>,
    id: String,
    path: PathBuf,
) -> Result<(), CommandError> {
    let mut s = state.session()?;
    let item = s
        .recovered_items
        .get(window.label())
        .and_then(|v| v.iter().find(|v| v.id == id))
        .cloned()
        .ok_or("recovery_unknown_item")?;
    let resources = s.resources();
    let generation = s.generation.clone();
    let checkpoint = s.recovery_checkpoint()?;
    let input = drafts::Input {
        generation,
        epoch: 0,
        sequence: 0,
        update: checkpoint.update.clone(),
        document: json!(checkpoint.document),
        settings: json!(checkpoint.settings),
        fields: vec![],
        forms: vec![],
        resources,
        rejected: false,
        recovered: vec![item],
        retain: true,
    };
    drafts::write(
        &path,
        &drafts::Record {
            format: drafts::FORMAT.into(),
            name: s.recovered_name.clone(),
            window: window.label().into(),
            saved_at: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)?
                .as_secs(),
            file_path: None,
            confirmed_revision: s.revision,
            confirmed: checkpoint,
            input,
            rejected_edition: None,
        },
    )
}

#[cfg(feature = "recipe-driver")]
#[tauri::command(async)]
pub fn diagnostic_private_records(
    state: tauri::State<Bridge>,
) -> Result<Vec<crate::recovery::drafts::Record>, CommandError> {
    if state.diagnostic.is_none() {
        return Err("Diagnostic inactive".into());
    }
    let s = state.session()?;
    let mut records = vec![];
    if let Ok(generations) = std::fs::read_dir(s.root.join("drafts")) {
        for generation in generations.flatten() {
            if generation.file_type().is_ok_and(|t| t.is_dir()) {
                for entry in std::fs::read_dir(generation.path())?.flatten() {
                    if entry.path().extension().is_some_and(|e| e == "json") {
                        let record = crate::recovery::drafts::read(&entry.path())?;
                        crate::session::Session::from_checkpoint(
                            s.root.clone(),
                            record.confirmed.clone(),
                        )?;
                        records.push(record);
                    }
                }
            }
        }
    }
    Ok(records)
}

/// Fixed handshake with the external native recipe runner. No arbitrary filesystem access.
#[cfg(feature = "recipe-driver")]
#[tauri::command(async)]
pub fn diagnostic_external_ready(state: State<Bridge>) -> Result<bool, CommandError> {
    if !state
        .diagnostic
        .as_deref()
        .is_some_and(|mode| mode.starts_with("publication"))
    {
        return Err("Publication diagnostic inactive".into());
    }
    state
        .session()?
        .root
        .join("external-ready")
        .try_exists()
        .map_err(CommandError::from)
}
