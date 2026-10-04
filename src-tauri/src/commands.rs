use std::path::PathBuf;
use std::sync::Mutex;

use tauri::{AppHandle, State};
use uuid::Uuid;

use crate::config::{validate_selected_path, AppConfig};
use crate::errors::{AppError, AppResult};
use crate::markdown::{self, hash_bytes};
use crate::models::{TodoDocument, TodoItem};
use crate::writer::{guarded_replace, WriteOutcome};

/// In-memory state for the currently selected file. All reads/mutations
/// go through this mutex, which is what serializes widget writes per
/// source and lets us reject stale session/sequence values.
pub struct AppState(pub Mutex<AppStateInner>);

pub struct AppStateInner {
    pub config_path: PathBuf,
    pub selected_path: Option<PathBuf>,
    pub source_session: String,
    pub sequence: u64,
    pub theme_id: Option<String>,
}

impl AppState {
    pub fn new(config_path: PathBuf) -> Self {
        let config = AppConfig::load(&config_path);
        AppState(Mutex::new(AppStateInner {
            config_path,
            selected_path: config.selected_path,
            source_session: Uuid::new_v4().to_string(),
            sequence: 0,
            theme_id: config.theme_id,
        }))
    }
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

#[derive(serde::Serialize)]
pub struct AppStateSnapshot {
    pub selected_path: Option<PathBuf>,
    pub theme_id: Option<String>,
}

#[tauri::command]
pub fn get_app_state(state: State<AppState>) -> AppStateSnapshot {
    let inner = state.0.lock().unwrap();
    AppStateSnapshot {
        selected_path: inner.selected_path.clone(),
        theme_id: inner.theme_id.clone(),
    }
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
    inner.selected_path = Some(validated.clone());
    inner.source_session = Uuid::new_v4().to_string();
    inner.sequence = 0;
    persist_config(&inner);

    let doc = load_document(&validated, &inner.source_session, inner.sequence)?;
    Ok(Some(doc))
}

#[tauri::command]
pub fn load_todos(state: State<AppState>) -> AppResult<TodoDocument> {
    let inner = state.0.lock().unwrap();
    let path = inner
        .selected_path
        .clone()
        .ok_or(AppError::NoFileSelected)?;
    load_document(&path, &inner.source_session, inner.sequence)
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
    let path = inner
        .selected_path
        .clone()
        .ok_or(AppError::NoFileSelected)?;
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

    match outcome {
        WriteOutcome::Success { .. } | WriteOutcome::Conflict | WriteOutcome::Missing => {
            inner.sequence += 1;
            let seq = inner.sequence;
            let session = inner.source_session.clone();
            drop(inner);
            match outcome {
                WriteOutcome::Missing => Err(AppError::FileMissing),
                WriteOutcome::Conflict => Err(AppError::WriteConflict),
                WriteOutcome::Success { .. } => load_document(&path, &session, seq),
            }
        }
    }
}

#[tauri::command]
pub fn add_todo(
    state: State<AppState>,
    text: String,
    revision: String,
    source_session: String,
) -> AppResult<TodoDocument> {
    let mut inner = state.0.lock().unwrap();
    let path = inner
        .selected_path
        .clone()
        .ok_or(AppError::NoFileSelected)?;
    if source_session != inner.source_session {
        return Err(AppError::StaleSession);
    }

    let validated_text = markdown::validate_task_text(&text)?;

    let outcome = guarded_replace(&path, &revision, |content| {
        markdown::add_task_bytes(content, &validated_text)
    })?;

    inner.sequence += 1;
    let seq = inner.sequence;
    let session = inner.source_session.clone();
    drop(inner);

    match outcome {
        WriteOutcome::Success { .. } => load_document(&path, &session, seq),
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

fn persist_config(inner: &AppStateInner) {
    let config = AppConfig {
        selected_path: inner.selected_path.clone(),
        theme_id: inner.theme_id.clone(),
        widget_expanded: false,
        window_x: None,
        window_y: None,
    };
    let _ = config.save(&inner.config_path);
}
