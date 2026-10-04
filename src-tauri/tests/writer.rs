use std::fs;
use std::path::Path;

use typewriter_lib::errors::AppError;
use typewriter_lib::markdown::hash_bytes;
use typewriter_lib::writer::{guarded_replace, save_recovery_snapshot, WriteOutcome};

fn temp_note(content: &str) -> (tempfile::TempDir, std::path::PathBuf) {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("note.md");
    fs::write(&path, content).unwrap();
    (dir, path)
}

fn recovery_dir(dir: &Path) -> std::path::PathBuf {
    dir.join(".typewriter-recovery").join("note.md")
}

#[test]
fn stale_revision_is_rejected_before_any_write() {
    let (dir, path) = temp_note("## Todos\n\n- [ ] one\n");
    let wrong_hash = hash_bytes(b"not the real content");

    let result = guarded_replace(&path, &wrong_hash, |content| Ok(content.to_string()));

    assert!(matches!(result, Err(AppError::StaleRevision)));
    // Original file untouched.
    assert_eq!(
        fs::read_to_string(&path).unwrap(),
        "## Todos\n\n- [ ] one\n"
    );
    // No recovery snapshot should have been created for a rejected mutation.
    assert!(!recovery_dir(dir.path()).exists());
}

#[test]
fn successful_write_creates_recovery_snapshot_of_original_bytes() {
    let original = "## Todos\n\n- [ ] one\n";
    let (dir, path) = temp_note(original);
    let hash = hash_bytes(original.as_bytes());

    let outcome = guarded_replace(&path, &hash, |content| {
        Ok(content.replace("[ ] one", "[x] one"))
    })
    .unwrap();

    assert!(matches!(outcome, WriteOutcome::Success { .. }));
    assert_eq!(
        fs::read_to_string(&path).unwrap(),
        "## Todos\n\n- [x] one\n"
    );

    let snapshot_path = recovery_dir(dir.path()).join(format!("{hash}.snapshot"));
    assert!(snapshot_path.exists());
    assert_eq!(fs::read_to_string(&snapshot_path).unwrap(), original);
}

#[test]
fn conflict_detected_when_file_changes_immediately_before_replacement() {
    let original = "## Todos\n\n- [ ] one\n";
    let (_dir, path) = temp_note(original);
    let hash = hash_bytes(original.as_bytes());

    let outcome = guarded_replace(&path, &hash, |content| {
        // Simulate an external editor winning the race in the window
        // between our first read and the pre-replacement re-check.
        fs::write(&path, "## Todos\n\n- [ ] one\n- [ ] externally added\n").unwrap();
        Ok(content.replace("[ ] one", "[x] one"))
    })
    .unwrap();

    assert!(matches!(outcome, WriteOutcome::Conflict));
    // The external editor's version must survive untouched.
    assert_eq!(
        fs::read_to_string(&path).unwrap(),
        "## Todos\n\n- [ ] one\n- [ ] externally added\n"
    );
}

#[test]
fn missing_file_before_replacement_is_reported_as_missing() {
    let original = "## Todos\n\n- [ ] one\n";
    let (_dir, path) = temp_note(original);
    let hash = hash_bytes(original.as_bytes());

    let outcome = guarded_replace(&path, &hash, |content| {
        fs::remove_file(&path).unwrap();
        Ok(content.to_string())
    })
    .unwrap();

    assert!(matches!(outcome, WriteOutcome::Missing));
}

#[test]
fn mutation_failure_leaves_original_bytes_intact() {
    let original = "## Todos\n\n- [ ] one\n";
    let (_dir, path) = temp_note(original);
    let hash = hash_bytes(original.as_bytes());

    let result = guarded_replace(&path, &hash, |_content| Err(AppError::InvalidTaskText));

    assert!(matches!(result, Err(AppError::InvalidTaskText)));
    assert_eq!(fs::read_to_string(&path).unwrap(), original);
}

#[test]
fn recovery_snapshots_are_deduplicated_and_bounded() {
    let (dir, path) = temp_note("v0\n");
    let recovery = recovery_dir(dir.path());

    for i in 0..15 {
        let content = format!("v{i}\n");
        fs::write(&path, &content).unwrap();
        save_recovery_snapshot(&path, content.as_bytes()).unwrap();
    }

    let snapshot_count = fs::read_dir(&recovery)
        .unwrap()
        .filter(|e| {
            e.as_ref()
                .unwrap()
                .path()
                .extension()
                .and_then(|e| e.to_str())
                == Some("snapshot")
        })
        .count();
    assert!(
        snapshot_count <= 10,
        "expected at most 10 snapshots, found {snapshot_count}"
    );

    // The most recent version's snapshot must have survived retention.
    let last_hash = hash_bytes(b"v14\n");
    assert!(recovery.join(format!("{last_hash}.snapshot")).exists());
}

#[test]
fn duplicate_content_does_not_create_duplicate_snapshots() {
    let (dir, path) = temp_note("same\n");
    let recovery = recovery_dir(dir.path());

    save_recovery_snapshot(&path, b"same\n").unwrap();
    save_recovery_snapshot(&path, b"same\n").unwrap();
    save_recovery_snapshot(&path, b"same\n").unwrap();

    let snapshot_count = fs::read_dir(&recovery).unwrap().count();
    assert_eq!(snapshot_count, 1);
}

#[test]
fn recovery_retention_never_touches_non_snapshot_siblings() {
    let (dir, path) = temp_note("v0\n");
    let recovery = recovery_dir(dir.path());
    fs::create_dir_all(&recovery).unwrap();
    fs::write(recovery.join("README.txt"), "do not delete me").unwrap();

    for i in 0..12 {
        let content = format!("v{i}\n");
        save_recovery_snapshot(&path, content.as_bytes()).unwrap();
    }

    assert!(recovery.join("README.txt").exists());
}

#[test]
fn write_atomically_cleans_up_temp_file_on_success() {
    let original = "## Todos\n\n- [ ] one\n";
    let (dir, path) = temp_note(original);
    let hash = hash_bytes(original.as_bytes());

    guarded_replace(&path, &hash, |content| Ok(content.to_string())).unwrap();

    let leftover_tmp_files: Vec<_> = fs::read_dir(dir.path())
        .unwrap()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_name().to_string_lossy().contains("typewriter-tmp"))
        .collect();
    assert!(
        leftover_tmp_files.is_empty(),
        "temp files should not survive a successful write"
    );
}
