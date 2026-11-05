//! Native project IO: validate outside the session lock, recheck before publication.
use crate::error::CommandError;
use crate::{
    session::{Resource, Session, Snapshot},
    settings::Settings,
};
use std::{path::Path, sync::Mutex};
use typstographe_core::{
    DocumentLease,
    assets::Assets,
    content::{archive::Archive, project::Project},
};

pub(super) fn save_project(
    session: &Mutex<Session>,
    path: &Path,
    snapshot: Snapshot,
    update: Vec<u8>,
    validate: impl FnOnce(
        &str,
        &Assets,
        crate::rendering::RenderContext<'_>,
    ) -> Result<(), CommandError>,
) -> Result<(), CommandError> {
    if path.extension().and_then(|e| e.to_str()) != Some("typsto") {
        return Err("Extension .typsto attendue.".into());
    }
    let (checkpoint, assets) = {
        let s = session.lock()?;
        (s.checkpoint(&snapshot, update)?, s.assets.clone())
    };
    let settings = checkpoint.settings;
    let source = checkpoint.source;
    let context = {
        let s = session.lock()?;
        s.render_context(&settings)
    };
    validate(&source, &assets, context)?;
    let mut s = session.lock()?;
    s.validate(&snapshot)?;
    let canonical = if path.exists() {
        path.canonicalize()
    } else {
        path.parent()
            .unwrap_or_else(|| std::path::Path::new("."))
            .canonicalize()
            .map(|p| p.join(path.file_name().unwrap_or_default()))
    }?;
    let same_target = s.file_lease.as_ref().is_some_and(|l| l.path() == canonical);
    let mut lease = if same_target {
        s.file_lease.as_ref().unwrap().clone()
    } else {
        DocumentLease::acquire(&canonical).map_err(CommandError::localized_protocol)?
    };
    let dependencies = s.dependencies_for(&settings);
    let archive = Archive {
        document: snapshot.document,
        metadata: settings.metadata,
        template: settings.template.clone(),
        model_manifest: settings.model_manifest.clone(),
        model_id: settings.model_id,
        assets,
        dependencies,
        yjs: checkpoint.update,
    };
    let base = s
        .project
        .get()
        .expect("checkpoint initializes archive owner");
    let owner = base
        .owner
        .with_current(archive)
        .map_err(crate::project::error)?;
    let owner = if !same_target && base.saved_origin {
        owner.independent_copy()
    } else {
        owner
    };
    owner
        .save(&mut lease)
        .map_err(CommandError::localized_archive)?;
    if let Err(error) = s.mark_clean() {
        // The archive commit succeeded but cleanup failed. Keep the original
        // binding after a refused Save As; otherwise a later ordinary Save
        // could acquire the old path afresh and overwrite an external edit.
        // For an in-place save only, retain our own newly written fingerprint.
        if same_target {
            s.file_lease = Some(lease);
        }
        return Err(error);
    }
    s.file_lease = Some(lease);
    s.project = std::sync::OnceLock::from(crate::project::Context::new(owner, true));
    s.recovered_name = None;
    Ok(())
}

pub(super) fn open_project(
    session: &Mutex<Session>,
    path: &Path,
    revision: u64,
    validate: impl FnOnce(
        &str,
        &Assets,
        crate::rendering::RenderContext<'_>,
    ) -> Result<(), CommandError>,
) -> Result<serde_json::Value, CommandError> {
    session.lock()?.lifecycle(revision)?;
    let canonical = path.canonicalize()?;
    let lease = session
        .lock()?
        .file_lease
        .as_ref()
        .filter(|lease| lease.path() == canonical)
        .cloned()
        .map(Ok)
        .unwrap_or_else(|| DocumentLease::acquire(path))
        .map_err(CommandError::localized_protocol)?;
    let project = Project::read(path).map_err(|e| {
        eprintln!("Project open failed: {e}");
        typstographe_i18n::archive_error(&e)
    })?;
    let archive = project.current().clone();
    let settings = Settings {
        metadata: archive.metadata.clone(),
        template: archive.template.clone(),
        model_manifest: archive.model_manifest.clone(),
        model_id: archive.model_id.clone(),
    };
    settings
        .validate()
        .map_err(CommandError::localized_content)?;
    validate(
        &archive
            .validate()
            .map_err(CommandError::localized_archive)?,
        &archive.assets,
        crate::rendering::RenderContext {
            settings: &settings,
            dependencies: archive.dependencies.clone(),
        },
    )?;
    let resources: Vec<_> = archive
        .assets
        .iter()
        .map(|(path, data)| {
            use base64::Engine;
            Resource {
                path: path.clone(),
                data: base64::engine::general_purpose::STANDARD.encode(data),
            }
        })
        .collect();
    {
        let mut current = session.lock()?;
        current.lifecycle(revision)?;
        // Reading and compiling happen outside the session lock. A different
        // process may have replaced the target while either was in progress.
        lease.check().map_err(CommandError::localized_protocol)?;
        current.mark_clean()?;
        current.file_lease = Some(lease);
        current.replace(
            archive.document.clone(),
            settings.clone(),
            archive.assets,
            archive.yjs.clone(),
        );
        current.project = std::sync::OnceLock::from(crate::project::Context::new(project, true));
        current.clean_revision = Some(current.revision);
    }
    let response = serde_json::json!({
        "document":archive.document,
        "settings":settings,
        "resources":resources,
        "yjs":archive.yjs,
    });
    Ok(response)
}

/// Explicitly confirmed document closure. Refusal must precede cleanup.
pub(super) fn close_project(session: &mut Session, revision: u64) -> Result<(), CommandError> {
    session.lifecycle(revision)?;
    session.mark_clean()?;
    session.file_lease = None;
    session.project = std::sync::OnceLock::new();
    session.opened = false;
    session.owner = None;
    session.reset_document_generation();
    session.revision += 1;
    Ok(())
}
