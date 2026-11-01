use crate::error::CommandError;
use crate::session::Resource;
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    io::Write,
    path::{Path, PathBuf},
};
use tauri::Manager;
#[derive(Clone, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct Preferences {
    pub personal: BTreeMap<String, Vec<String>>,
    pub appearance: String,
    pub font: String,
    pub size: f64,
    pub profile: BTreeMap<String, String>,
    pub signature: Option<Resource>,
    pub recent: Vec<String>,
    pub editor_fraction: f64,
    pub spelling_enabled: bool,
    pub sidebar_expanded: bool,
    pub sidebar_width: f64,
}
impl Default for Preferences {
    fn default() -> Self {
        Self {
            personal: Default::default(),
            appearance: "system".into(),
            font: "serif".into(),
            size: 18.,
            profile: Default::default(),
            signature: None,
            recent: vec![],
            editor_fraction: 0.5,
            spelling_enabled: true,
            sidebar_expanded: true,
            sidebar_width: 320.,
        }
    }
}
impl Preferences {
    pub fn load(root: &Path) -> Result<Self, CommandError> {
        let path = root.join("preferences.json");
        if !path.exists() {
            return Ok(Self::default());
        }
        let metadata = std::fs::metadata(&path)?;
        if metadata.len() > 16 * 1024 * 1024 {
            return Err("Préférences trop volumineuses.".into());
        }
        let result: Self = serde_json::from_slice(&std::fs::read(path)?)?;
        result.validate()?;
        Ok(result)
    }
    fn validate(&self) -> Result<(), CommandError> {
        if !["system", "light", "dark"].contains(&self.appearance.as_str())
            || !["serif", "sans", "mono"].contains(&self.font.as_str())
            || !self.size.is_finite()
            || !(12.0..=32.0).contains(&self.size)
            || self.recent.len() > 20
            || self.profile.values().any(|s| s.len() > 16_000)
            || !self.editor_fraction.is_finite()
            || !(0.1..=0.9).contains(&self.editor_fraction)
            || !self.sidebar_width.is_finite()
            || !(240.0..=520.0).contains(&self.sidebar_width)
        {
            return Err("Préférences invalides.".into());
        }
        if let Some(signature) = &self.signature {
            signature.decoded()?;
        }
        Ok(())
    }
    fn remember_project(&mut self, path: &Path) {
        let path = path.to_string_lossy().into_owned();
        self.recent.retain(|previous| previous != &path);
        self.recent.insert(0, path);
        self.recent.truncate(12);
    }
    pub fn save(&self, root: &Path) -> Result<(), CommandError> {
        self.validate()?;
        std::fs::create_dir_all(root)?;
        let options = atomic_write_file::AtomicWriteFile::options();
        #[cfg(unix)]
        let options = {
            use std::os::unix::fs::OpenOptionsExt;
            let mut options = options;
            options.mode(0o600);
            options
        };
        let mut file = options.open(root.join("preferences.json"))?;
        file.write_all(&serde_json::to_vec_pretty(self)?)?;
        file.commit().map_err(CommandError::from)
    }
}
pub fn root(app: &tauri::AppHandle) -> Result<PathBuf, CommandError> {
    #[cfg(feature = "recipe-driver")]
    let state = app.state::<crate::Bridge>();
    #[cfg(feature = "recipe-driver")]
    if state.diagnostic.is_some() {
        return Ok(state.session()?.root.join("preferences"));
    }
    app.path().app_config_dir().map_err(CommandError::from)
}
pub fn remember(app: &tauri::AppHandle, path: &Path) -> Result<(), CommandError> {
    let root = root(app)?;
    let mut preferences = Preferences::load(&root)?;
    preferences.remember_project(path);
    preferences.save(&root)
}
#[tauri::command]
pub fn preferences_load(app: tauri::AppHandle) -> Result<Preferences, CommandError> {
    Preferences::load(&root(&app)?)
}
#[tauri::command]
pub fn preferences_save(
    app: tauri::AppHandle,
    preferences: Preferences,
) -> Result<(), CommandError> {
    preferences.save(&root(&app)?)
}

#[cfg(test)]
#[cfg_attr(coverage_nightly, coverage(off))]
mod tests {
    use super::*;
    #[test]
    fn adding_sidebar_mode_keeps_existing_profile_and_appearance() {
        let preferences: Preferences = serde_json::from_value(serde_json::json!({
            "appearance": "dark",
            "profile": { "sender.name": "Camille Martin" }
        }))
        .unwrap();
        assert!(preferences.sidebar_expanded);
        assert_eq!(preferences.sidebar_width, 320.);
        let directory = tempfile::tempdir().unwrap();
        preferences.save(directory.path()).unwrap();
        let reopened = Preferences::load(directory.path()).unwrap();
        assert_eq!(reopened.profile["sender.name"], "Camille Martin");
        assert_eq!(reopened.appearance, "dark");
        assert!(reopened.sidebar_expanded);
    }
    #[test]
    fn preferences_roundtrip_and_reject_invalid_column_widths() {
        let directory = tempfile::tempdir().unwrap();
        let mut preferences = Preferences {
            editor_fraction: 0.63,
            spelling_enabled: false,
            sidebar_expanded: false,
            sidebar_width: 404.,
            ..Default::default()
        };
        preferences
            .personal
            .insert("fr".into(), vec!["Typst".into()]);
        preferences.save(directory.path()).unwrap();
        let restored = Preferences::load(directory.path()).unwrap();
        assert_eq!(restored.editor_fraction, 0.63);
        assert!(!restored.spelling_enabled);
        assert!(!restored.sidebar_expanded);
        assert_eq!(restored.sidebar_width, 404.);
        assert_eq!(restored.personal["fr"], vec!["Typst"]);
        for invalid in [239., 521., f64::NAN] {
            preferences.sidebar_width = invalid;
            assert!(preferences.save(directory.path()).is_err());
            assert_eq!(
                Preferences::load(directory.path()).unwrap().sidebar_width,
                404.
            );
        }
        preferences.sidebar_width = 404.;
        preferences.editor_fraction = 0.99;
        assert!(preferences.save(directory.path()).is_err());
        assert_eq!(
            Preferences::load(directory.path()).unwrap().editor_fraction,
            0.63
        );
    }
}

#[cfg(test)]
#[cfg_attr(coverage_nightly, coverage(off))]
#[path = "preferences_tests.rs"]
mod preservation_tests;
