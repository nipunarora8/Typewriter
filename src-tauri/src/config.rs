use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::errors::{AppError, AppResult};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AppConfig {
    pub selected_path: Option<PathBuf>,
    pub theme_id: Option<String>,
    pub widget_expanded: bool,
    pub window_x: Option<i32>,
    pub window_y: Option<i32>,
}

impl AppConfig {
    pub fn load(path: &Path) -> AppConfig {
        fs::read_to_string(path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
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
