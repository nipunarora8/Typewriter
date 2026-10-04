//! Guarded, serialized file mutation with pre-replacement recovery
//! snapshots.
//!
//! This module cannot provide cross-process compare-and-swap: a
//! non-cooperating editor (Obsidian, vim, etc.) can save in the
//! interval between our last read and our rename, or immediately after.
//! What it does provide:
//! - writes to one selected file are serialized per source (a native
//!   mutex per source session), so the app itself never races itself;
//! - every write re-reads and re-hashes the file immediately before
//!   touching it, and again immediately before and after replacement,
//!   so an externally observed change is detected and never silently
//!   clobbered;
//! - every observed "before" version is snapshotted to a local recovery
//!   directory before any replacement is attempted, bounded to the 10
//!   most recent distinct versions per file.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use crate::config::recovery_dir_for;
use crate::errors::{AppError, AppResult};
use crate::markdown::hash_bytes;

const MAX_RECOVERY_SNAPSHOTS: usize = 10;

/// Outcome of a guarded write, distinguishing failures that definitely
/// left the original file untouched from a write whose final on-disk
/// state could not be confirmed.
#[derive(Debug)]
pub enum WriteOutcome {
    /// Replacement succeeded and was verified by re-reading the file.
    Success { new_bytes: Vec<u8> },
    /// The file changed between our last read and the replacement
    /// attempt; nothing was written. Caller should reload and ask the
    /// user to retry.
    Conflict,
    /// The file disappeared before replacement could happen.
    Missing,
}

/// Read the current file, verify it matches `expected_hash`, write a
/// recovery snapshot of those bytes, then atomically replace the file
/// with `new_bytes` — re-checking immediately before and after the
/// rename. Returns `AppError::StaleRevision` if the on-disk hash does
/// not match `expected_hash` at the first read (the caller's revision
/// is stale and must be rejected before we touch the filesystem at all).
pub fn guarded_replace(
    path: &Path,
    expected_hash: &str,
    mutate: impl FnOnce(&str) -> AppResult<String>,
) -> AppResult<WriteOutcome> {
    let original_bytes = read_or_missing(path)?;
    let original_hash = hash_bytes(&original_bytes);
    if original_hash != expected_hash {
        return Err(AppError::StaleRevision);
    }

    let original_text =
        String::from_utf8(original_bytes.clone()).map_err(|_| AppError::InvalidUtf8)?;
    let candidate_text = mutate(&original_text)?;
    let candidate_bytes = candidate_text.into_bytes();

    save_recovery_snapshot(path, &original_bytes)?;

    // Immediately before replacement, re-read and re-hash: if the file
    // changed or disappeared since our first read, abandon the write
    // entirely rather than recreating or overwriting it.
    let pre_replace_bytes = match read_or_missing(path) {
        Ok(bytes) => bytes,
        Err(AppError::FileMissing) => return Ok(WriteOutcome::Missing),
        Err(e) => return Err(e),
    };
    if hash_bytes(&pre_replace_bytes) != original_hash {
        return Ok(WriteOutcome::Conflict);
    }

    write_atomically(path, &candidate_bytes)?;

    // Re-read after replacement to confirm what's actually on disk now.
    match fs::read(path) {
        Ok(observed) if observed == candidate_bytes => Ok(WriteOutcome::Success {
            new_bytes: candidate_bytes,
        }),
        Ok(observed) => {
            // Something else won the race immediately after our
            // replacement. Preserve what we now see for recovery and
            // report it as a conflict rather than retrying/overwriting.
            let _ = save_recovery_snapshot(path, &observed);
            Ok(WriteOutcome::Conflict)
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(WriteOutcome::Missing),
        Err(_) => Err(AppError::WriteOutcomeUncertain),
    }
}

fn read_or_missing(path: &Path) -> AppResult<Vec<u8>> {
    fs::read(path).map_err(|e| match e.kind() {
        std::io::ErrorKind::NotFound => AppError::FileMissing,
        std::io::ErrorKind::PermissionDenied => AppError::PermissionDenied,
        _ => AppError::Internal,
    })
}

/// Write `bytes` to a uniquely-named temp file alongside `path`, flush
/// and sync it, then atomically rename it over `path`. Preserves the
/// original file's permissions.
fn write_atomically(path: &Path, bytes: &[u8]) -> AppResult<()> {
    let parent = path.parent().ok_or(AppError::Internal)?;
    let original_permissions = fs::metadata(path).ok().map(|m| m.permissions());

    let unique = format!(
        ".{}.typewriter-tmp-{}",
        path.file_name().and_then(|n| n.to_str()).unwrap_or("note"),
        uuid::Uuid::new_v4()
    );
    let tmp_path = parent.join(unique);

    {
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&tmp_path)
            .map_err(|_| AppError::Internal)?;
        file.write_all(bytes).map_err(|_| AppError::Internal)?;
        file.sync_all()
            .map_err(|_| AppError::WriteOutcomeUncertain)?;
    }

    if let Some(perms) = original_permissions {
        let _ = fs::set_permissions(&tmp_path, perms);
    }

    let rename_result = fs::rename(&tmp_path, path);
    if rename_result.is_err() {
        let _ = fs::remove_file(&tmp_path);
        return Err(AppError::WriteOutcomeUncertain);
    }

    Ok(())
}

/// Persist `bytes` (an observed "before" version) to the recovery
/// directory, named by content hash, deduplicating identical content
/// and keeping only the most recent `MAX_RECOVERY_SNAPSHOTS` versions.
/// Fails the caller's mutation (via `AppError::RecoverySnapshotFailed`)
/// if the snapshot itself cannot be written, rather than proceeding to
/// an unprotected replace.
pub fn save_recovery_snapshot(selected_path: &Path, bytes: &[u8]) -> AppResult<()> {
    let dir = recovery_dir_for(selected_path)?;
    reject_if_symlink(&dir)?;
    fs::create_dir_all(&dir).map_err(|_| AppError::RecoverySnapshotFailed)?;

    let hash = hash_bytes(bytes);
    let snapshot_path = dir.join(format!("{hash}.snapshot"));
    if snapshot_path.exists() {
        touch(&snapshot_path);
        enforce_retention(&dir)?;
        return Ok(());
    }

    fs::write(&snapshot_path, bytes).map_err(|_| AppError::RecoverySnapshotFailed)?;
    enforce_retention(&dir)
}

fn reject_if_symlink(dir: &Path) -> AppResult<()> {
    if let Ok(meta) = fs::symlink_metadata(dir) {
        if meta.is_symlink() {
            return Err(AppError::RecoverySnapshotFailed);
        }
    }
    Ok(())
}

fn touch(path: &Path) {
    // Best-effort recency bump so retention keeps the most recently
    // observed duplicate; failure here is not fatal to the mutation.
    if let Ok(bytes) = fs::read(path) {
        let _ = fs::write(path, bytes);
    }
}

/// Delete only app-owned `*.snapshot` files inside the validated
/// recovery directory, oldest first, keeping at most
/// `MAX_RECOVERY_SNAPSHOTS`. Never touches any other sibling content.
fn enforce_retention(dir: &Path) -> AppResult<()> {
    let mut entries: Vec<(PathBuf, std::time::SystemTime)> = fs::read_dir(dir)
        .map_err(|_| AppError::RecoverySnapshotFailed)?
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path().extension().and_then(|ext| ext.to_str()) == Some("snapshot")
                && e.file_type().map(|t| t.is_file()).unwrap_or(false)
        })
        .filter_map(|e| {
            let modified = e.metadata().ok()?.modified().ok()?;
            Some((e.path(), modified))
        })
        .collect();

    entries.sort_by_key(|(_, modified)| *modified);

    while entries.len() > MAX_RECOVERY_SNAPSHOTS {
        let (path, _) = entries.remove(0);
        let _ = fs::remove_file(path);
    }

    Ok(())
}
