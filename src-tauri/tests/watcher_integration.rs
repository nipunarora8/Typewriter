//! Exercises the real `notify`/`notify-debouncer-full` pipeline against
//! temp files, independent of Tauri's AppHandle (which `watcher::start`
//! needs only to `.emit()` — the detection logic itself is plain
//! filesystem watching). This proves the actual risk in this module:
//! that watching the *parent directory* survives an atomic
//! write-temp-then-rename save, which a direct file watch can miss.

use std::fs;
use std::sync::mpsc;
use std::time::Duration;

use notify::RecursiveMode;
use notify_debouncer_full::{new_debouncer, DebounceEventResult};

#[test]
fn parent_directory_watch_survives_atomic_rename_replace() {
    let dir = tempfile::tempdir().unwrap();
    let target = dir.path().join("note.md");
    fs::write(&target, "## Todos\n\n- [ ] one\n").unwrap();

    let (tx, rx) = mpsc::channel();
    let mut debouncer = new_debouncer(
        Duration::from_millis(100),
        None,
        move |result: DebounceEventResult| {
            let _ = tx.send(result);
        },
    )
    .unwrap();
    debouncer
        .watch(dir.path(), RecursiveMode::NonRecursive)
        .unwrap();

    // Simulate Obsidian's atomic save: write a temp file, then rename
    // it over the target, rather than writing the target in place.
    let temp = dir.path().join(".note.md.tmp");
    fs::write(&temp, "## Todos\n\n- [x] one\n").unwrap();
    fs::rename(&temp, &target).unwrap();

    let result = rx
        .recv_timeout(Duration::from_secs(2))
        .expect("debouncer should report an event after atomic rename-replace");
    let events = result.expect("should not be an error result");

    let touches_target = events
        .iter()
        .any(|e| e.paths.iter().any(|p| p.ends_with("note.md")));
    assert!(
        touches_target,
        "expected an event referencing the target path after rename-replace, got: {events:?}"
    );

    // Content on disk reflects the replacement.
    assert_eq!(
        fs::read_to_string(&target).unwrap(),
        "## Todos\n\n- [x] one\n"
    );
}

#[test]
fn watch_recovers_after_file_deleted_and_recreated_at_same_path() {
    let dir = tempfile::tempdir().unwrap();
    let target = dir.path().join("note.md");
    fs::write(&target, "## Todos\n\n- [ ] one\n").unwrap();

    let (tx, rx) = mpsc::channel();
    let mut debouncer = new_debouncer(
        Duration::from_millis(100),
        None,
        move |result: DebounceEventResult| {
            let _ = tx.send(result);
        },
    )
    .unwrap();
    debouncer
        .watch(dir.path(), RecursiveMode::NonRecursive)
        .unwrap();

    fs::remove_file(&target).unwrap();
    let _ = rx.recv_timeout(Duration::from_secs(2));

    fs::write(&target, "## Todos\n\n- [ ] recreated\n").unwrap();
    let result = rx
        .recv_timeout(Duration::from_secs(2))
        .expect("watching the parent dir should see the file reappear");
    let events = result.expect("should not be an error result");
    let touches_target = events
        .iter()
        .any(|e| e.paths.iter().any(|p| p.ends_with("note.md")));
    assert!(touches_target, "expected recreate event for target path");

    assert_eq!(
        fs::read_to_string(&target).unwrap(),
        "## Todos\n\n- [ ] recreated\n"
    );
}

#[test]
fn debounce_coalesces_rapid_successive_writes_into_fewer_events() {
    let dir = tempfile::tempdir().unwrap();
    let target = dir.path().join("note.md");
    fs::write(&target, "## Todos\n\n- [ ] one\n").unwrap();

    let (tx, rx) = mpsc::channel();
    let mut debouncer = new_debouncer(
        Duration::from_millis(600),
        None,
        move |result: DebounceEventResult| {
            let _ = tx.send(result);
        },
    )
    .unwrap();
    debouncer
        .watch(dir.path(), RecursiveMode::NonRecursive)
        .unwrap();

    for i in 0..5 {
        fs::write(&target, format!("## Todos\n\n- [ ] version {i}\n")).unwrap();
        std::thread::sleep(Duration::from_millis(10));
    }

    let mut batches = 0;
    let mut seen = Vec::new();
    while let Ok(result) = rx.recv_timeout(Duration::from_millis(1500)) {
        batches += 1;
        seen.push(format!("{:?}", result.map(|e| e.len())));
    }
    assert!(
        batches < 5,
        "debounce should coalesce rapid writes into fewer than 5 batches, got {batches}: {seen:?}"
    );
}
