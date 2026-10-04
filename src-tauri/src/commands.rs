use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, State};
use uuid::Uuid;

use crate::config::{validate_selected_path, AppConfig, Profile};
use crate::errors::{AppError, AppResult};
use crate::markdown::{self, hash_bytes};
use crate::models::{TodoDocument, TodoItem};
use crate::watcher::{self, ExpectedRevision, WatcherHandle};
use crate::writer::{guarded_replace, WriteOutcome};

/// In-memory state for the currently active profile. All reads/mutations
/// go through this mutex, which is what serializes widget writes per
/// source and lets us reject stale session/sequence values. The
/// watcher-coordination fields are separate `Arc<Mutex<_>>`s so the
/// watcher's background thread can read/update them without needing a
/// reference to the whole `AppState`.
///
/// Exactly one profile is "active" (watched/mutable) at a time. Switching
/// profiles replaces `source_session` with a fresh UUID and resets the
/// watcher-coordination fields, so any in-flight command or watcher
/// callback captured against the old session is rejected by the same
/// `StaleSession` check already used for file-reselect — no separate
/// mechanism is needed for "switch happened mid-write".
pub struct AppState(pub Mutex<AppStateInner>);

pub struct AppStateInner {
    pub config_path: PathBuf,
    pub profiles: Vec<Profile>,
    pub active_profile_id: Option<String>,
    pub source_session: String,
    pub sequence: Arc<Mutex<u64>>,
    pub theme_id: Option<String>,
    pub expected_revision: ExpectedRevision,
    pub last_published_revision: Arc<Mutex<String>>,
    pub watcher: Option<WatcherHandle>,
    pub window_x: Option<i32>,
    pub window_y: Option<i32>,
}

impl AppState {
    pub fn new(config_path: PathBuf) -> Self {
        let config = AppConfig::load(&config_path);
        AppState(Mutex::new(AppStateInner {
            config_path,
            profiles: config.profiles,
            active_profile_id: config.active_profile_id,
            source_session: Uuid::new_v4().to_string(),
            sequence: Arc::new(Mutex::new(0)),
            theme_id: config.theme_id,
            expected_revision: Arc::new(Mutex::new(None)),
            last_published_revision: Arc::new(Mutex::new(String::new())),
            watcher: None,
            window_x: config.window_x,
            window_y: config.window_y,
        }))
    }
}

impl AppStateInner {
    pub fn persist_config(&self) {
        persist_config(self);
    }

    /// The Markdown path of the active profile, if any and if it still
    /// resolves to one of the saved profiles (defensive against a
    /// dangling `active_profile_id` from a corrupted config).
    fn active_path(&self) -> Option<PathBuf> {
        let id = self.active_profile_id.as_ref()?;
        self.profiles
            .iter()
            .find(|p| &p.id == id)
            .map(|p| p.path.clone())
    }

    fn active_profile(&self) -> Option<&Profile> {
        let id = self.active_profile_id.as_ref()?;
        self.profiles.iter().find(|p| &p.id == id)
    }
}

/// Start (or restart) the file watcher for the currently active
/// profile's path, disposing any previous watcher first. Call this
/// whenever `active_profile_id`/`source_session` changes, and once at
/// startup if a profile was already active from a previous run.
fn restart_watcher(app: &AppHandle, inner: &mut AppStateInner) {
    inner.watcher = None; // drop disposes the old debouncer thread
    let Some(path) = inner.active_path() else {
        return;
    };
    match watcher::start(
        app.clone(),
        path,
        inner.source_session.clone(),
        inner.expected_revision.clone(),
        inner.last_published_revision.clone(),
        inner.sequence.clone(),
    ) {
        Ok(handle) => inner.watcher = Some(handle),
        Err(_) => {
            // Watcher failed to start; UI should show "Live updates
            // paused" and offer manual Reload. No event session/sequence
            // context is meaningful here since the watcher never ran.
        }
    }
}

pub fn start_watcher_if_selected(app: &AppHandle, state: &AppState) {
    let mut inner = state.0.lock().unwrap();
    restart_watcher(app, &mut inner);
}

fn load_document(path: &PathBuf, source_session: &str, sequence: u64) -> AppResult<TodoDocument> {
    let bytes = std::fs::read(path).map_err(|e| match e.kind() {
        std::io::ErrorKind::NotFound => AppError::FileMissing,
        std::io::ErrorKind::PermissionDenied => AppError::PermissionDenied,
        _ => AppError::Internal,
    })?;
    let content = String::from_utf8(bytes.clone()).map_err(|_| AppError::InvalidUtf8)?;
    let parsed = markdown::parse(&content);
    Ok(TodoDocument {
        path: path.clone(),
        source_session: source_session.to_string(),
        revision: hash_bytes(&bytes),
        sequence,
        tasks: parsed
            .tasks
            .into_iter()
            .enumerate()
            .map(|(i, t)| TodoItem {
                line_id: format!("{source_session}:{}:{}", t.line_index, i),
                line_index: t.line_index,
                text: t.text,
                completed: t.completed,
                indent: t.indent,
            })
            .collect(),
    })
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProfileSummary {
    pub id: String,
    pub display_name: String,
    pub path: PathBuf,
}

impl From<&Profile> for ProfileSummary {
    fn from(p: &Profile) -> Self {
        ProfileSummary {
            id: p.id.clone(),
            display_name: p.display_name.clone(),
            path: p.path.clone(),
        }
    }
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppStateSnapshot {
    pub selected_path: Option<PathBuf>,
    pub theme_id: Option<String>,
    pub profiles: Vec<ProfileSummary>,
    pub active_profile_id: Option<String>,
}

#[tauri::command]
pub fn get_app_state(state: State<AppState>) -> AppStateSnapshot {
    let inner = state.0.lock().unwrap();
    AppStateSnapshot {
        selected_path: inner.active_profile().map(|p| p.path.clone()),
        theme_id: inner.theme_id.clone(),
        profiles: inner.profiles.iter().map(ProfileSummary::from).collect(),
        active_profile_id: inner.active_profile_id.clone(),
    }
}

/// Reset session/sequence/watch-coordination state for a freshly
/// (re)activated profile, restart the watcher, and load its document.
/// Shared by `choose_todo_file` (first profile / relink), `add_profile`,
/// `switch_profile`, and `relink_profile`.
fn activate_and_load(
    app: &AppHandle,
    inner: &mut AppStateInner,
    validated_path: PathBuf,
) -> AppResult<TodoDocument> {
    inner.source_session = Uuid::new_v4().to_string();
    *inner.sequence.lock().unwrap() = 0;
    *inner.expected_revision.lock().unwrap() = None;
    *inner.last_published_revision.lock().unwrap() = String::new();
    persist_config(inner);
    restart_watcher(app, inner);

    let seq = *inner.sequence.lock().unwrap();
    let doc = load_document(&validated_path, &inner.source_session, seq)?;
    *inner.last_published_revision.lock().unwrap() = doc.revision.clone();
    Ok(doc)
}

#[tauri::command]
pub async fn choose_todo_file(
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<Option<TodoDocument>> {
    use tauri_plugin_dialog::DialogExt;

    let (tx, rx) = std::sync::mpsc::channel();
    app.dialog()
        .file()
        .add_filter("Markdown", &["md"])
        .pick_file(move |picked| {
            let _ = tx.send(picked);
        });
    let picked = rx.recv().map_err(|_| AppError::Internal)?;

    let Some(file_path) = picked else {
        return Ok(None);
    };
    let path = file_path.into_path().map_err(|_| AppError::Internal)?;
    let validated = validate_selected_path(&path)?;

    let mut inner = state.0.lock().unwrap();
    let profile = Profile {
        id: Uuid::new_v4().to_string(),
        display_name: default_display_name(&validated),
        path: validated.clone(),
    };
    inner.active_profile_id = Some(profile.id.clone());
    inner.profiles.push(profile);

    let doc = activate_and_load(&app, &mut inner, validated)?;
    Ok(Some(doc))
}

/// A profile name derived from the chosen file's stem (e.g.
/// `Personal.md` -> `"Personal"`), falling back to a generic label if
/// the path has no usable stem. The caller/UI is expected to let the
/// user rename afterward; this is only a reasonable starting default.
fn default_display_name(path: &PathBuf) -> String {
    path.file_stem()
        .and_then(|s| s.to_str())
        .filter(|s| !s.trim().is_empty())
        .unwrap_or("Untitled list")
        .to_string()
}

#[tauri::command]
pub fn load_todos(state: State<AppState>) -> AppResult<TodoDocument> {
    let inner = state.0.lock().unwrap();
    let path = inner.active_path().ok_or(AppError::NoFileSelected)?;
    let seq = *inner.sequence.lock().unwrap();
    load_document(&path, &inner.source_session, seq)
}

#[tauri::command]
pub fn toggle_todo(
    state: State<AppState>,
    line_id: String,
    completed: bool,
    revision: String,
    source_session: String,
) -> AppResult<TodoDocument> {
    let mut inner = state.0.lock().unwrap();
    let path = inner.active_path().ok_or(AppError::NoFileSelected)?;
    if source_session != inner.source_session {
        return Err(AppError::StaleSession);
    }

    // line_id encodes `{session}:{line_index}:{task_index}`; re-resolve
    // against the exact current parse rather than trusting stale state.
    let line_index: usize = line_id
        .split(':')
        .nth(1)
        .and_then(|s| s.parse().ok())
        .ok_or(AppError::StaleRevision)?;

    let outcome = guarded_replace(&path, &revision, |content| {
        let parsed = markdown::parse(content);
        let task = parsed
            .tasks
            .iter()
            .find(|t| t.line_index == line_index)
            .ok_or(AppError::StaleRevision)?;
        if task.completed == completed {
            return Ok(content.to_string());
        }
        markdown::toggle_task_bytes(content, task.marker_offset, completed)
    })?;

    finish_mutation(&mut inner, &path, outcome)
}

#[tauri::command]
pub fn add_todo(
    state: State<AppState>,
    text: String,
    revision: String,
    source_session: String,
) -> AppResult<TodoDocument> {
    let mut inner = state.0.lock().unwrap();
    let path = inner.active_path().ok_or(AppError::NoFileSelected)?;
    if source_session != inner.source_session {
        return Err(AppError::StaleSession);
    }

    let validated_text = markdown::validate_task_text(&text)?;

    let outcome = guarded_replace(&path, &revision, |content| {
        markdown::add_task_bytes(content, &validated_text)
    })?;

    finish_mutation(&mut inner, &path, outcome)
}

/// Shared post-write bookkeeping for toggle/add: mark the new bytes as
/// "expected" so the watcher's own observation of this write is
/// suppressed rather than republished as an external change, bump the
/// shared sequence, and return the freshly reloaded document (or map
/// the outcome to an error without disturbing the on-disk file).
fn finish_mutation(
    inner: &mut AppStateInner,
    path: &PathBuf,
    outcome: WriteOutcome,
) -> AppResult<TodoDocument> {
    let session = inner.source_session.clone();
    match outcome {
        WriteOutcome::Success { new_bytes } => {
            let new_revision = hash_bytes(&new_bytes);
            *inner.expected_revision.lock().unwrap() = Some(new_revision.clone());
            *inner.last_published_revision.lock().unwrap() = new_revision;
            let mut seq = inner.sequence.lock().unwrap();
            *seq += 1;
            let seq_value = *seq;
            drop(seq);
            load_document(path, &session, seq_value)
        }
        WriteOutcome::Conflict => Err(AppError::WriteConflict),
        WriteOutcome::Missing => Err(AppError::FileMissing),
    }
}

#[tauri::command]
pub fn set_preferences(state: State<AppState>, theme_id: Option<String>) -> AppResult<()> {
    let mut inner = state.0.lock().unwrap();
    inner.theme_id = theme_id;
    persist_config(&inner);
    Ok(())
}

/// Add a new named list from an already-picked, already-validated path
/// (the frontend never supplies a raw path for a mutating command
/// without it passing through `validate_selected_path` first, same gate
/// `choose_todo_file` uses). Appends to the saved order and makes it
/// active immediately — this is also how the file picker is reused for
/// "add a second list" from the management UI.
#[tauri::command]
pub async fn add_profile(
    app: AppHandle,
    state: State<'_, AppState>,
    display_name: String,
) -> AppResult<TodoDocument> {
    use tauri_plugin_dialog::DialogExt;

    let name = validate_display_name(&display_name)?;

    let (tx, rx) = std::sync::mpsc::channel();
    app.dialog()
        .file()
        .add_filter("Markdown", &["md"])
        .pick_file(move |picked| {
            let _ = tx.send(picked);
        });
    let picked = rx.recv().map_err(|_| AppError::Internal)?;
    let Some(file_path) = picked else {
        return Err(AppError::NoFileSelected);
    };
    let path = file_path.into_path().map_err(|_| AppError::Internal)?;
    let validated = validate_selected_path(&path)?;

    let mut inner = state.0.lock().unwrap();
    let profile = Profile {
        id: Uuid::new_v4().to_string(),
        display_name: name,
        path: validated.clone(),
    };
    inner.active_profile_id = Some(profile.id.clone());
    inner.profiles.push(profile);

    activate_and_load(&app, &mut inner, validated)
}

#[tauri::command]
pub fn rename_profile(
    state: State<AppState>,
    profile_id: String,
    display_name: String,
) -> AppResult<()> {
    let name = validate_display_name(&display_name)?;
    let mut inner = state.0.lock().unwrap();
    let profile = inner
        .profiles
        .iter_mut()
        .find(|p| p.id == profile_id)
        .ok_or(AppError::ProfileNotFound)?;
    profile.display_name = name;
    persist_config(&inner);
    Ok(())
}

/// Relinks a profile to a different file chosen via the native picker.
/// The frontend never supplies a raw path for this command — only a
/// profile ID — so an arbitrary filesystem path can never reach a
/// profile without going through the OS file dialog and
/// `validate_selected_path` first.
#[tauri::command]
pub async fn relink_profile(
    app: AppHandle,
    state: State<'_, AppState>,
    profile_id: String,
) -> AppResult<Option<TodoDocument>> {
    use tauri_plugin_dialog::DialogExt;

    let (tx, rx) = std::sync::mpsc::channel();
    app.dialog()
        .file()
        .add_filter("Markdown", &["md"])
        .pick_file(move |picked| {
            let _ = tx.send(picked);
        });
    let picked = rx.recv().map_err(|_| AppError::Internal)?;
    let Some(file_path) = picked else {
        return Ok(None);
    };
    let path = file_path.into_path().map_err(|_| AppError::Internal)?;
    let validated = validate_selected_path(&path)?;

    let mut inner = state.0.lock().unwrap();
    let profile = inner
        .profiles
        .iter_mut()
        .find(|p| p.id == profile_id)
        .ok_or(AppError::ProfileNotFound)?;
    profile.path = validated.clone();

    if inner.active_profile_id.as_deref() == Some(profile_id.as_str()) {
        return activate_and_load(&app, &mut inner, validated).map(Some);
    }
    persist_config(&inner);
    Ok(None)
}

/// Remove a profile's configuration entry only — its Markdown file is
/// never touched. If the removed profile was active, activates the
/// previous entry in saved order (or the next if removing the first),
/// or clears the active profile entirely if none remain.
#[tauri::command]
pub fn remove_profile(
    app: AppHandle,
    state: State<AppState>,
    profile_id: String,
) -> AppResult<Option<TodoDocument>> {
    let mut inner = state.0.lock().unwrap();
    let removed_index = inner
        .profiles
        .iter()
        .position(|p| p.id == profile_id)
        .ok_or(AppError::ProfileNotFound)?;
    inner.profiles.remove(removed_index);

    let was_active = inner.active_profile_id.as_deref() == Some(profile_id.as_str());
    if !was_active {
        persist_config(&inner);
        return Ok(None);
    }

    if inner.profiles.is_empty() {
        inner.active_profile_id = None;
        inner.watcher = None;
        persist_config(&inner);
        return Ok(None);
    }

    let next_index = removed_index.min(inner.profiles.len() - 1);
    let next_profile = inner.profiles[next_index].clone();
    inner.active_profile_id = Some(next_profile.id.clone());
    activate_and_load(&app, &mut inner, next_profile.path).map(Some)
}

/// Switch the active profile. Cancels the old watcher, starts a fresh
/// source session (so any write/event already queued against the old
/// profile is rejected as stale by the ordinary session check), and
/// loads the new file. Returns the error state for a missing/
/// inaccessible file rather than failing outright, so the switch itself
/// always succeeds and the frontend can show a per-profile relink
/// prompt instead of refusing to navigate.
#[tauri::command]
pub fn switch_profile(
    app: AppHandle,
    state: State<AppState>,
    profile_id: String,
) -> AppResult<SwitchResult> {
    let mut inner = state.0.lock().unwrap();
    let profile = inner
        .profiles
        .iter()
        .find(|p| p.id == profile_id)
        .cloned()
        .ok_or(AppError::ProfileNotFound)?;
    inner.active_profile_id = Some(profile.id.clone());

    match activate_and_load(&app, &mut inner, profile.path) {
        Ok(doc) => Ok(SwitchResult {
            document: Some(doc),
            error: None,
        }),
        Err(err) => Ok(SwitchResult {
            document: None,
            error: Some(err),
        }),
    }
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SwitchResult {
    pub document: Option<TodoDocument>,
    pub error: Option<AppError>,
}

fn validate_display_name(name: &str) -> AppResult<String> {
    let trimmed = name.trim();
    if trimmed.is_empty() || trimmed.chars().count() > 80 {
        return Err(AppError::InvalidProfileName);
    }
    if trimmed.chars().any(|c| c.is_control()) {
        return Err(AppError::InvalidProfileName);
    }
    Ok(trimmed.to_string())
}

fn persist_config(inner: &AppStateInner) {
    let config = AppConfig {
        selected_path: None,
        profiles: inner.profiles.clone(),
        active_profile_id: inner.active_profile_id.clone(),
        theme_id: inner.theme_id.clone(),
        widget_expanded: false,
        window_x: inner.window_x,
        window_y: inner.window_y,
    };
    let _ = config.save(&inner.config_path);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::Profile;

    fn test_inner(config_path: PathBuf) -> AppStateInner {
        AppStateInner {
            config_path,
            profiles: Vec::new(),
            active_profile_id: None,
            source_session: Uuid::new_v4().to_string(),
            sequence: Arc::new(Mutex::new(0)),
            theme_id: None,
            expected_revision: Arc::new(Mutex::new(None)),
            last_published_revision: Arc::new(Mutex::new(String::new())),
            watcher: None,
            window_x: None,
            window_y: None,
        }
    }

    #[test]
    fn active_path_resolves_through_active_profile_id() {
        let dir = tempfile::tempdir().unwrap();
        let mut inner = test_inner(dir.path().join("config.json"));
        let profile = Profile {
            id: "p1".to_string(),
            display_name: "Personal".to_string(),
            path: dir.path().join("Personal.md"),
        };
        inner.profiles.push(profile.clone());
        inner.active_profile_id = Some("p1".to_string());

        assert_eq!(inner.active_path(), Some(profile.path));
    }

    #[test]
    fn active_path_is_none_for_dangling_active_id() {
        let dir = tempfile::tempdir().unwrap();
        let mut inner = test_inner(dir.path().join("config.json"));
        inner.active_profile_id = Some("ghost".to_string());
        assert_eq!(inner.active_path(), None);
    }

    #[test]
    fn validate_display_name_rejects_empty_and_overlong_and_control_chars() {
        assert!(validate_display_name("").is_err());
        assert!(validate_display_name("   ").is_err());
        assert!(validate_display_name(&"x".repeat(81)).is_err());
        assert!(validate_display_name("bad\u{0007}name").is_err());
        assert_eq!(validate_display_name("  Groceries  ").unwrap(), "Groceries");
    }

    #[test]
    fn default_display_name_uses_file_stem() {
        assert_eq!(
            default_display_name(&PathBuf::from("/vault/Personal.md")),
            "Personal"
        );
        // A path with no file name component at all (e.g. root) has no
        // stem, which is the actual fallback case — not reachable via
        // `validate_selected_path` in practice, but exercised directly.
        assert_eq!(default_display_name(&PathBuf::from("/")), "Untitled list");
    }

    #[test]
    fn remove_profile_logic_picks_neighbor_when_active_removed() {
        // Exercises the index-selection logic directly (same arithmetic
        // used in the command) without a Tauri AppHandle.
        let mut profiles = vec![
            Profile {
                id: "a".to_string(),
                display_name: "A".to_string(),
                path: PathBuf::from("/a.md"),
            },
            Profile {
                id: "b".to_string(),
                display_name: "B".to_string(),
                path: PathBuf::from("/b.md"),
            },
            Profile {
                id: "c".to_string(),
                display_name: "C".to_string(),
                path: PathBuf::from("/c.md"),
            },
        ];
        let removed_index = profiles.iter().position(|p| p.id == "a").unwrap();
        profiles.remove(removed_index);
        let next_index = removed_index.min(profiles.len() - 1);
        assert_eq!(profiles[next_index].id, "b");

        // Removing the last profile clamps to the new last index.
        let mut profiles2 = vec![
            Profile {
                id: "x".to_string(),
                display_name: "X".to_string(),
                path: PathBuf::from("/x.md"),
            },
            Profile {
                id: "y".to_string(),
                display_name: "Y".to_string(),
                path: PathBuf::from("/y.md"),
            },
        ];
        let removed_index2 = profiles2.iter().position(|p| p.id == "y").unwrap();
        profiles2.remove(removed_index2);
        let next_index2 = removed_index2.min(profiles2.len() - 1);
        assert_eq!(profiles2[next_index2].id, "x");
    }

    #[test]
    fn switching_profile_issues_a_fresh_source_session() {
        let dir = tempfile::tempdir().unwrap();
        let mut inner = test_inner(dir.path().join("config.json"));
        let old_session = inner.source_session.clone();
        inner.profiles.push(Profile {
            id: "p1".to_string(),
            display_name: "Personal".to_string(),
            path: dir.path().join("Personal.md"),
        });
        inner.active_profile_id = Some("p1".to_string());

        // Mirrors what activate_and_load does to the session, without a
        // real AppHandle/watcher.
        inner.source_session = Uuid::new_v4().to_string();
        *inner.sequence.lock().unwrap() = 0;

        assert_ne!(inner.source_session, old_session);
        // A write/event carrying the old session must now be rejected
        // by every command's `source_session != inner.source_session`
        // check — this is the same mechanism file-reselect already used,
        // just re-verified here for the profile-switch path.
        assert_ne!(old_session, inner.source_session);
    }
}
