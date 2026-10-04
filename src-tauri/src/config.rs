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
    /// For a plain list: the one Markdown file. For a daily list: the
    /// dated note currently shown (inside `folder`), or the
    /// `NO_NOTE_SENTINEL` placeholder when the folder has no notes yet.
    pub path: PathBuf,
    /// Set for a daily list: the folder holding `YYYY-MM-DD.md` notes.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub folder: Option<PathBuf>,
}

/// Placeholder `path` for a daily list whose folder has no dated notes.
/// It lives inside the folder (so the watcher watches the right
/// directory) and never exists on disk, so loading it reports a missing
/// note rather than touching any real file.
pub const NO_NOTE_SENTINEL: &str = ".typewriter-no-note.md";

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
            folder: None,
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

/// Validate a user-selected folder for a daily list: must exist and be a
/// real directory (not a symlink or file).
pub fn validate_selected_folder(path: &Path) -> AppResult<PathBuf> {
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
    if !metadata.is_dir() {
        return Err(AppError::NotDirectory);
    }
    fs::canonicalize(path).map_err(|_| AppError::PermissionDenied)
}

/// Strictly validate a `YYYY-MM-DD` date string. It becomes part of a
/// file name, so anything but four digits, two digits, two digits with a
/// plausible month and day is rejected (no separators, no traversal).
pub fn validate_date(date: &str) -> AppResult<()> {
    let b = date.as_bytes();
    let ok = b.len() == 10
        && b[4] == b'-'
        && b[7] == b'-'
        && b.iter()
            .enumerate()
            .all(|(i, c)| i == 4 || i == 7 || c.is_ascii_digit());
    if !ok {
        return Err(AppError::InvalidDate);
    }
    let month: u32 = date[5..7].parse().map_err(|_| AppError::InvalidDate)?;
    let day: u32 = date[8..10].parse().map_err(|_| AppError::InvalidDate)?;
    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return Err(AppError::InvalidDate);
    }
    Ok(())
}

/// The dated notes (`YYYY-MM-DD.md`, regular files only) in `folder`,
/// oldest first. Other files and sub-folders are ignored.
pub fn list_daily_notes(folder: &Path) -> Vec<PathBuf> {
    let mut notes: Vec<PathBuf> = fs::read_dir(folder)
        .map(|rd| {
            rd.filter_map(Result::ok)
                .filter(|e| e.file_type().map(|t| t.is_file()).unwrap_or(false))
                .filter_map(|e| {
                    let name = e.file_name().into_string().ok()?;
                    let stem = name.strip_suffix(".md")?;
                    validate_date(stem).ok()?;
                    Some(folder.join(name))
                })
                .collect()
        })
        .unwrap_or_default();
    notes.sort();
    notes
}

/// The note a daily list should open on: its newest dated note, or the
/// placeholder when there are none.
pub fn newest_note_or_placeholder(folder: &Path) -> PathBuf {
    list_daily_notes(folder)
        .pop()
        .unwrap_or_else(|| folder.join(NO_NOTE_SENTINEL))
}

/// Initial contents of a newly created daily note.
pub fn daily_note_template(list_name: &str, date: &str) -> String {
    format!("# {list_name} — {date}\n\n## Todos\n\n")
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
            folder: None,
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
            folder: None,
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

    #[test]
    fn date_validation_is_strict() {
        assert!(validate_date("2026-10-04").is_ok());
        for bad in [
            "2026-1-04",
            "2026/10/04",
            "2026-13-01",
            "2026-00-10",
            "2026-10-32",
            "../../etc",
            "2026-10-04x",
            "",
        ] {
            assert!(validate_date(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn daily_notes_list_only_dated_regular_files_oldest_first() {
        let dir = tempfile::tempdir().unwrap();
        for name in [
            "2026-10-04.md",
            "2026-09-30.md",
            "notes.md",
            "2026-10-05.txt",
        ] {
            fs::write(dir.path().join(name), "x").unwrap();
        }
        fs::create_dir(dir.path().join("2026-10-06.md")).unwrap();
        let names: Vec<String> = list_daily_notes(dir.path())
            .iter()
            .map(|p| p.file_name().unwrap().to_string_lossy().into_owned())
            .collect();
        assert_eq!(names, vec!["2026-09-30.md", "2026-10-04.md"]);
        assert_eq!(
            newest_note_or_placeholder(dir.path()),
            dir.path().join("2026-10-04.md")
        );
    }

    #[test]
    fn empty_folder_opens_on_the_placeholder() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(
            newest_note_or_placeholder(dir.path()),
            dir.path().join(NO_NOTE_SENTINEL)
        );
    }

    #[test]
    fn folder_validation_rejects_files_and_missing_paths() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("a.md");
        fs::write(&file, "x").unwrap();
        assert!(validate_selected_folder(dir.path()).is_ok());
        assert!(matches!(
            validate_selected_folder(&file),
            Err(AppError::NotDirectory)
        ));
        assert!(matches!(
            validate_selected_folder(&dir.path().join("nope")),
            Err(AppError::FileMissing)
        ));
    }

    #[test]
    fn old_profiles_without_a_folder_still_load() {
        let json = r#"{"profiles":[{"id":"a","display_name":"A","path":"/a.md"}],"active_profile_id":"a","theme_id":null,"widget_expanded":false,"window_x":null,"window_y":null}"#;
        let config: AppConfig = serde_json::from_str(json).unwrap();
        assert_eq!(config.profiles[0].folder, None);
    }
}
