//! Native file-open delivery. Document replacement remains a guarded frontend action.
use crate::{error::CommandError, launch};
use std::{
    collections::VecDeque,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{Emitter, Manager};

#[derive(Default)]
pub struct Requests(Mutex<VecDeque<String>>);

impl Requests {
    fn push(&self, path: String) -> Result<(), CommandError> {
        let mut pending = self.0.lock()?;
        if pending.back() != Some(&path) {
            pending.push_back(path);
        }
        Ok(())
    }
    fn pop(&self) -> Result<Option<String>, CommandError> {
        Ok(self.0.lock()?.pop_front())
    }
}

fn project_path(argument: &str, directory: &Path) -> Option<PathBuf> {
    let path = launch::local_path(argument, directory).ok()?;
    path.extension()
        .is_some_and(|extension| extension.eq_ignore_ascii_case("typsto"))
        .then_some(path)
}

fn target(app: &tauri::AppHandle) -> Option<tauri::WebviewWindow> {
    let mut windows: Vec<_> = app.webview_windows().into_values().collect();
    windows.sort_by(|a, b| a.label().cmp(b.label()));
    windows
        .iter()
        .find(|window| window.is_focused().unwrap_or(false))
        .or_else(|| windows.iter().find(|window| window.label() == "main"))
        .or_else(|| windows.first())
        .cloned()
}

pub fn enqueue(app: &tauri::AppHandle, path: PathBuf) {
    let Some(path) = project_path(&path.to_string_lossy(), Path::new("")) else {
        return;
    };
    if let Some(requests) = app.try_state::<Requests>() {
        let _ = requests.push(path.to_string_lossy().into_owned());
    }
    if let Some(window) = target(app) {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
        let _ = window.emit("app:open-request", ());
    }
}

pub fn second_instance(app: &tauri::AppHandle, args: Vec<String>, directory: String) {
    let directory = Path::new(&directory);
    for argument in args.into_iter().skip(1) {
        if let Some(path) = project_path(&argument, directory) {
            enqueue(app, path);
        }
    }
    if let Some(window) = target(app) {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// Startup and later notifications use the same queue, so early events are retained.
#[tauri::command]
pub fn next_open_request(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    requests: tauri::State<Requests>,
) -> Result<Option<String>, CommandError> {
    if target(&app).is_none_or(|target| target.label() != window.label()) {
        return Ok(None);
    }
    requests.pop()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn requests_wait_for_the_view_and_adjacent_duplicates_are_coalesced() {
        let requests = Requests::default();
        requests.push("first.typsto".into()).unwrap();
        requests.push("first.typsto".into()).unwrap();
        requests.push("second.typsto".into()).unwrap();
        assert_eq!(requests.pop().unwrap().as_deref(), Some("first.typsto"));
        assert_eq!(requests.pop().unwrap().as_deref(), Some("second.typsto"));
        assert!(requests.pop().unwrap().is_none());
        requests.push("first.typsto".into()).unwrap();
        assert_eq!(requests.pop().unwrap().as_deref(), Some("first.typsto"));
    }
    #[test]
    fn local_file_urls_and_relative_paths_resolve_without_taking_a_file_lock() {
        let directory = std::env::temp_dir();
        let expected = directory.join("Résumé de réunion.typsto");
        let url = tauri::Url::from_file_path(&expected).unwrap();
        assert_eq!(
            project_path(url.as_str(), &directory),
            Some(expected.clone())
        );
        assert_eq!(
            project_path("Résumé de réunion.typsto", &directory),
            Some(expected)
        );
        assert!(project_path("https://example.org/project.typsto", &directory).is_none());
        assert!(project_path("document.pdf", &directory).is_none());
        assert!(project_path("--diagnostic", &directory).is_none());
    }
}
