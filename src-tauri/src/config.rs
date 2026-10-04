use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::errors::{AppError, AppResult};

/// A saved named list: an immutable ID, a display name, and one
/// explicitly chosen Markdown file. Exactly one profile is active at a
/// time; profiles can point anywhere in the filesystem (not necessarily
/// a shared parent folder).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Profile {
    pub id: String,
    pub display_name: String,
    pub path: PathBuf,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AppConfig {
    /// Legacy single-file field, kept only so an old config.json can be
    /// read and migrated. A freshly saved config always has `profiles`
    /// populated and this left `None`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub selected_path: Option<PathBuf>,
    #[serde(default)]
    pub profiles: Vec<Profile>,
    #[serde(default)]
    pub active_profile_id: Option<String>,
    pub theme_id: Option<String>,
    pub widget_expanded: bool,
    pub window_x: Option<i32>,
    pub window_y: Option<i32>,
}

impl AppConfig {
    pub fn load(path: &Path) -> AppConfig {
        let mut config: AppConfig = fs::read_to_string(path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default();
        config.migrate_legacy_selected_path();
        config
    }

    /// Fold an old single-file `selected_path` into a first profile
    /// named "Personal", preserving every other preference (theme,
    /// window position). A no-op once `profiles` is non-empty, so this
    /// is safe to call unconditionally on every load.
    fn migrate_legacy_selected_path(&mut self) {
        if !self.profiles.is_empty() {
            self.selected_path = None;
            return;
        }
        let Some(path) = self.selected_path.take() else {
            return;
        };
        let profile = Profile {
            id: uuid::Uuid::new_v4().to_string(),
            display_name: "Personal".to_string(),
            path,
        };
        self.active_profile_id = Some(profile.id.clone());
        self.profiles.push(profile);
    }

    pub fn save(&self, path: &Path) -> AppResult<()> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|_| AppError::Internal)?;
        }
        let json = serde_json::to_string_pretty(self).map_err(|_| AppError::Internal)?;
        fs::write(path, json).map_err(|_| AppError::Internal)
    }
}

/// Validate a user-selected path: must exist, be a regular file (not a
/// symlink, directory, or other special file), and have a `.md`
/// extension (case-insensitive). This is the only gate standing between
/// an arbitrary frontend-supplied string and real filesystem commands,
/// so it must reject by metadata, not merely by extension string.
pub fn validate_selected_path(path: &Path) -> AppResult<PathBuf> {
    let metadata = fs::symlink_metadata(path).map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            AppError::FileMissing
        } else {
            AppError::PermissionDenied
        }
    })?;

    if metadata.is_symlink() {
        return Err(AppError::SymlinkRejected);
    }
    if metadata.is_dir() {
        return Err(AppError::IsDirectory);
    }
    if !metadata.is_file() {
        return Err(AppError::UnsupportedFileType);
    }

    let has_md_extension = path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.eq_ignore_ascii_case("md"))
        .unwrap_or(false);
    if !has_md_extension {
        return Err(AppError::NotMarkdown);
    }

    fs::canonicalize(path).map_err(|_| AppError::PermissionDenied)
}

/// The recovery directory for a given selected file:
/// `<note-parent>/.typewriter-recovery/<source-key>/`. `source-key` is
/// derived from the file name so recovery directories for different
/// files selected from the same folder don't collide.
pub fn recovery_dir_for(selected_path: &Path) -> AppResult<PathBuf> {
    let parent = selected_path.parent().ok_or(AppError::Internal)?;
    let file_name = selected_path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or(AppError::Internal)?;
    Ok(parent.join(".typewriter-recovery").join(file_name))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn legacy_selected_path_migrates_into_one_personal_profile() {
        let mut config = AppConfig {
            selected_path: Some(PathBuf::from("/vault/Personal.md")),
            theme_id: Some("ivory".to_string()),
            window_x: Some(10),
            window_y: Some(20),
            ..Default::default()
        };
        config.migrate_legacy_selected_path();

        assert_eq!(config.profiles.len(), 1);
        assert_eq!(config.profiles[0].display_name, "Personal");
        assert_eq!(config.profiles[0].path, PathBuf::from("/vault/Personal.md"));
        assert_eq!(
            config.active_profile_id,
            Some(config.profiles[0].id.clone())
        );
        // Other preferences are untouched by migration.
        assert_eq!(config.theme_id, Some("ivory".to_string()));
        assert_eq!(config.window_x, Some(10));
        assert_eq!(config.window_y, Some(20));
        // Legacy field is cleared once folded into a profile.
        assert_eq!(config.selected_path, None);
    }

    #[test]
    fn migration_is_a_noop_once_profiles_exist() {
        let existing = Profile {
            id: "keep-me".to_string(),
            display_name: "Work".to_string(),
            path: PathBuf::from("/vault/Work.md"),
        };
        let mut config = AppConfig {
            selected_path: Some(PathBuf::from("/vault/Ignored.md")),
            profiles: vec![existing.clone()],
            active_profile_id: Some("keep-me".to_string()),
            ..Default::default()
        };
        config.migrate_legacy_selected_path();

        assert_eq!(config.profiles, vec![existing]);
        assert_eq!(config.active_profile_id, Some("keep-me".to_string()));
        assert_eq!(config.selected_path, None);
    }

    #[test]
    fn no_legacy_path_and_no_profiles_stays_empty() {
        let mut config = AppConfig::default();
        config.migrate_legacy_selected_path();
        assert!(config.profiles.is_empty());
        assert_eq!(config.active_profile_id, None);
    }

    #[test]
    fn load_round_trips_through_save_including_profiles() {
        let dir = tempfile::tempdir().unwrap();
        let config_path = dir.path().join("config.json");
        let profile = Profile {
            id: "p1".to_string(),
            display_name: "Groceries".to_string(),
            path: dir.path().join("Groceries.md"),
        };
        let config = AppConfig {
            profiles: vec![profile.clone()],
            active_profile_id: Some("p1".to_string()),
            theme_id: None,
            widget_expanded: false,
            window_x: None,
            window_y: None,
            selected_path: None,
        };
        config.save(&config_path).unwrap();

        let loaded = AppConfig::load(&config_path);
        assert_eq!(loaded.profiles, vec![profile]);
        assert_eq!(loaded.active_profile_id, Some("p1".to_string()));
    }
}
