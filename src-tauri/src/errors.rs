use serde::Serialize;

/// User-safe, categorized error payload. Never includes raw OS error
/// strings or file contents — only a stable category and a short,
/// non-technical message safe to show in the UI.
#[derive(Debug, Clone, Serialize, thiserror::Error)]
#[serde(tag = "category", content = "message", rename_all = "kebab-case")]
pub enum AppError {
    #[error("No file is selected yet.")]
    NoFileSelected,

    #[error("That file isn't a Markdown (.md) file.")]
    NotMarkdown,

    #[error("That path is a directory, not a file.")]
    IsDirectory,

    #[error("The selected file could not be found.")]
    FileMissing,

    #[error("The widget doesn't have permission to read or write that file.")]
    PermissionDenied,

    #[error("The file contains invalid UTF-8 text and can't be read safely.")]
    InvalidUtf8,

    #[error("Linked files (symlinks) aren't supported for the selected note.")]
    SymlinkRejected,

    #[error("That isn't a regular file.")]
    UnsupportedFileType,

    #[error("The note changed; refreshed the list — please try again.")]
    StaleRevision,

    #[error("That file was already closed or replaced by another selection.")]
    StaleSession,

    #[error("Task text can't be empty or longer than 2000 characters.")]
    InvalidTaskText,

    #[error("Task text can't contain line breaks or control characters.")]
    MultilineRejected,

    #[error("Couldn't find an insertion point without disturbing unrelated content.")]
    NoSafeInsertionPoint,

    #[error("Couldn't save a safety copy before writing, so nothing was changed.")]
    RecoverySnapshotFailed,

    #[error("The note changed on disk right before saving; nothing was overwritten.")]
    WriteConflict,

    #[error(
        "The save finished, but the app couldn't confirm the result. Reload before trying again."
    )]
    WriteOutcomeUncertain,

    #[error("That saved list no longer exists.")]
    ProfileNotFound,

    #[error(
        "List names can't be empty, longer than 80 characters, start with a dot, or contain / \\ : or control characters."
    )]
    InvalidProfileName,

    #[error("That path isn't a folder.")]
    NotDirectory,

    #[error("That isn't a valid date.")]
    InvalidDate,

    #[error("There is no note for that day.")]
    NoSuchDay,

    #[error("This list isn't a daily folder list.")]
    NotDailyList,

    #[error("Something unexpected went wrong.")]
    Internal,
}

pub type AppResult<T> = Result<T, AppError>;
