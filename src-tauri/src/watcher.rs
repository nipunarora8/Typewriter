//! Debounced file watcher for the selected note.
//!
//! Watches the selected file's parent directory (not just the file
//! itself) because editors like Obsidian typically save via a
//! temp-write-then-rename sequence, which a direct file watch can miss
//! or misreport as a deletion. Every event is debounced, then
//! re-verified against the real file content before anything is
//! published — OS-level events are a hint to re-check, never ground
//! truth on their own.
//!
//! A `WatcherHandle` is tagged with the `source_session` it was created
//! for. Dropping it (on file reselect, or app shutdown) stops the
//! underlying debouncer thread. Every callback re-checks that its
//! captured session is still current before publishing anything, so a
//! slow callback from a just-disposed watcher can never resurrect
//! stale state.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use notify::RecursiveMode;
use notify_debouncer_full::{new_debouncer, DebounceEventResult, Debouncer, RecommendedCache};
use tauri::{AppHandle, Emitter};

use crate::markdown::hash_bytes;

const DEBOUNCE_MS: u64 = 250;

pub struct WatcherHandle {
    _debouncer: Debouncer<notify::RecommendedWatcher, RecommendedCache>,
    alive: Arc<AtomicBool>,
}

impl Drop for WatcherHandle {
    fn drop(&mut self) {
        self.alive.store(false, Ordering::SeqCst);
    }
}

/// Shared "what the app itself most recently wrote" marker, used to
/// suppress a redundant refresh when the watcher sees our own write
/// land, while still accepting a genuinely different external revision
/// that happens to race it.
pub type ExpectedRevision = Arc<Mutex<Option<String>>>;

pub fn start(
    app: AppHandle,
    watched_path: PathBuf,
    source_session: String,
    expected_revision: ExpectedRevision,
    last_published_revision: Arc<Mutex<String>>,
    sequence: Arc<Mutex<u64>>,
) -> notify::Result<WatcherHandle> {
    let alive = Arc::new(AtomicBool::new(true));
    let alive_for_handler = alive.clone();
    let parent = watched_path
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from("."));

    let handler_path = watched_path.clone();
    let handler_session = source_session.clone();
    let app_for_status = app.clone();
    let sequence_for_status = sequence.clone();

    let mut debouncer = new_debouncer(
        Duration::from_millis(DEBOUNCE_MS),
        None,
        move |result: DebounceEventResult| {
            if !alive_for_handler.load(Ordering::SeqCst) {
                return;
            }
            let Ok(events) = result else {
                let _ = app.emit(
                    "file:status",
                    crate::models::FileStatusEvent {
                        source_session: handler_session.clone(),
                        sequence: *sequence.lock().unwrap(),
                        status: crate::models::WatchStatus::Paused,
                    },
                );
                return;
            };

            let relevant = events.iter().any(|e| e.paths.contains(&handler_path));
            if !relevant {
                return;
            }

            if !alive_for_handler.load(Ordering::SeqCst) {
                return;
            }

            handle_change(
                &app,
                &handler_path,
                &handler_session,
                &expected_revision,
                &last_published_revision,
                &sequence,
            );
        },
    )?;

    debouncer.watch(&parent, RecursiveMode::NonRecursive)?;

    let _ = app_for_status.emit(
        "file:status",
        crate::models::FileStatusEvent {
            source_session,
            sequence: *sequence_for_status.lock().unwrap(),
            status: crate::models::WatchStatus::Watching,
        },
    );

    Ok(WatcherHandle {
        _debouncer: debouncer,
        alive,
    })
}

/// What a freshly-read set of bytes means, relative to what the app
/// last wrote itself and last published to the frontend. Pure and
/// side-effect free so it can be unit tested without a Tauri runtime.
#[derive(Debug, PartialEq, Eq)]
enum ChangeDecision {
    /// This is our own write landing back from disk; already published
    /// by the command that made it. Nothing to do.
    OwnWrite,
    /// Identical to what we last published; a duplicate OS event.
    Duplicate,
    /// Genuinely new content that should be parsed and published.
    Publish,
}

fn classify_change(
    new_revision: &str,
    expected_revision: &mut Option<String>,
    last_published_revision: &mut String,
) -> ChangeDecision {
    if expected_revision.as_deref() == Some(new_revision) {
        *expected_revision = None;
        return ChangeDecision::OwnWrite;
    }
    if *last_published_revision == new_revision {
        return ChangeDecision::Duplicate;
    }
    *last_published_revision = new_revision.to_string();
    ChangeDecision::Publish
}

fn parse_into_document(
    content: &str,
    path: &Path,
    source_session: &str,
    revision: String,
    sequence: u64,
) -> crate::models::TodoDocument {
    let parsed = crate::markdown::parse(content);
    crate::models::TodoDocument {
        path: path.to_path_buf(),
        source_session: source_session.to_string(),
        revision,
        sequence,
        tasks: parsed
            .tasks
            .into_iter()
            .enumerate()
            .map(|(i, t)| crate::models::TodoItem {
                line_id: format!("{source_session}:{}:{}", t.line_index, i),
                line_index: t.line_index,
                text: t.text,
                completed: t.completed,
                indent: t.indent,
            })
            .collect(),
    }
}

fn handle_change(
    app: &AppHandle,
    path: &Path,
    source_session: &str,
    expected_revision: &ExpectedRevision,
    last_published_revision: &Arc<Mutex<String>>,
    sequence: &Arc<Mutex<u64>>,
) {
    let Ok(bytes) = read_with_retry(path) else {
        let _ = app.emit(
            "file:status",
            crate::models::FileStatusEvent {
                source_session: source_session.to_string(),
                sequence: *sequence.lock().unwrap(),
                status: crate::models::WatchStatus::Missing,
            },
        );
        return;
    };

    let new_revision = hash_bytes(&bytes);
    let decision = classify_change(
        &new_revision,
        &mut expected_revision.lock().unwrap(),
        &mut last_published_revision.lock().unwrap(),
    );
    if decision != ChangeDecision::Publish {
        return;
    }

    let Ok(content) = String::from_utf8(bytes) else {
        return;
    };

    let mut seq = sequence.lock().unwrap();
    *seq += 1;
    let doc = parse_into_document(&content, path, source_session, new_revision, *seq);
    drop(seq);

    let _ = app.emit(
        "todos:updated",
        crate::models::TodosUpdatedEvent {
            document: doc,
            source: crate::models::UpdateSource::ExternalChange,
        },
    );
}

/// Atomic replace can briefly make the file unavailable mid-rename;
/// retry a few short times before treating it as genuinely missing.
fn read_with_retry(path: &Path) -> std::io::Result<Vec<u8>> {
    let mut last_err = None;
    for attempt in 0..5 {
        match std::fs::read(path) {
            Ok(bytes) => return Ok(bytes),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                last_err = Some(e);
                std::thread::sleep(Duration::from_millis(20 * (attempt + 1)));
            }
            Err(e) => return Err(e),
        }
    }
    Err(last_err.unwrap())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn own_write_is_classified_and_clears_the_marker() {
        let mut expected = Some("rev-a".to_string());
        let mut last_published = "rev-old".to_string();
        let decision = classify_change("rev-a", &mut expected, &mut last_published);
        assert_eq!(decision, ChangeDecision::OwnWrite);
        assert_eq!(expected, None);
        // last_published is untouched; the command path is responsible
        // for updating it on a successful write, not the watcher.
        assert_eq!(last_published, "rev-old");
    }

    #[test]
    fn duplicate_published_revision_is_classified_as_duplicate() {
        let mut expected = None;
        let mut last_published = "rev-a".to_string();
        let decision = classify_change("rev-a", &mut expected, &mut last_published);
        assert_eq!(decision, ChangeDecision::Duplicate);
    }

    #[test]
    fn genuinely_new_revision_is_classified_as_publish_and_updates_last_published() {
        let mut expected = None;
        let mut last_published = "rev-old".to_string();
        let decision = classify_change("rev-new", &mut expected, &mut last_published);
        assert_eq!(decision, ChangeDecision::Publish);
        assert_eq!(last_published, "rev-new");
    }

    #[test]
    fn external_change_racing_a_pending_own_write_still_publishes() {
        // The app expects its own write (rev-mine) to land, but an
        // external editor's save (rev-external) arrives first. That
        // must not be swallowed as if it were our own write.
        let mut expected = Some("rev-mine".to_string());
        let mut last_published = "rev-old".to_string();
        let decision = classify_change("rev-external", &mut expected, &mut last_published);
        assert_eq!(decision, ChangeDecision::Publish);
        // The still-pending expectation for our own write is untouched,
        // so when it does land afterward it's still recognized.
        assert_eq!(expected, Some("rev-mine".to_string()));
    }

    #[test]
    fn read_with_retry_succeeds_once_file_reappears() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("note.md");
        let path_clone = path.clone();
        let writer = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(40));
            std::fs::write(&path_clone, b"hello").unwrap();
        });
        let result = read_with_retry(&path);
        writer.join().unwrap();
        assert_eq!(result.unwrap(), b"hello");
    }

    #[test]
    fn read_with_retry_fails_after_exhausting_attempts() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("never-created.md");
        let result = read_with_retry(&path);
        assert!(result.is_err());
    }

    #[test]
    fn watcher_handle_drop_marks_itself_dead() {
        let alive = Arc::new(AtomicBool::new(true));
        let alive_check = alive.clone();
        {
            let dir = tempfile::tempdir().unwrap();
            let parent = dir.path().to_path_buf();
            let mut debouncer = new_debouncer(
                Duration::from_millis(50),
                None,
                move |_: DebounceEventResult| {},
            )
            .unwrap();
            debouncer
                .watch(&parent, RecursiveMode::NonRecursive)
                .unwrap();
            let handle = WatcherHandle {
                _debouncer: debouncer,
                alive: alive.clone(),
            };
            drop(handle);
        }
        assert!(!alive_check.load(Ordering::SeqCst));
    }
}
