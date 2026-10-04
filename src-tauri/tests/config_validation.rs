use std::fs;

use typewriter_lib::config::validate_selected_path;
use typewriter_lib::errors::AppError;

#[test]
fn rejects_missing_path() {
    let dir = tempfile::tempdir().unwrap();
    let missing = dir.path().join("missing.md");
    let result = validate_selected_path(&missing);
    assert!(matches!(result, Err(AppError::FileMissing)));
}

#[test]
fn rejects_directory() {
    let dir = tempfile::tempdir().unwrap();
    let result = validate_selected_path(dir.path());
    assert!(matches!(result, Err(AppError::IsDirectory)));
}

#[test]
fn rejects_non_markdown_extension() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("notes.txt");
    fs::write(&path, "hello").unwrap();
    let result = validate_selected_path(&path);
    assert!(matches!(result, Err(AppError::NotMarkdown)));
}

#[test]
fn accepts_uppercase_md_extension() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("notes.MD");
    fs::write(&path, "hello").unwrap();
    let result = validate_selected_path(&path);
    assert!(result.is_ok());
}

#[test]
fn rejects_symlinked_file() {
    let dir = tempfile::tempdir().unwrap();
    let real = dir.path().join("real.md");
    fs::write(&real, "hello").unwrap();
    let link = dir.path().join("link.md");
    #[cfg(unix)]
    std::os::unix::fs::symlink(&real, &link).unwrap();
    let result = validate_selected_path(&link);
    assert!(matches!(result, Err(AppError::SymlinkRejected)));
}

#[test]
fn accepts_valid_markdown_file() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("note.md");
    fs::write(&path, "## Todos\n").unwrap();
    let result = validate_selected_path(&path);
    assert!(result.is_ok());
}
