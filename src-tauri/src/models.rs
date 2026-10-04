use std::path::PathBuf;

use serde::Serialize;

/// One recognized `- [ ]` / `- [x]` task line.
///
/// `line_id` is only valid within the `TodoDocument` it was parsed from
/// (same `source_session` + `revision`). It encodes the task's source
/// byte offset, not a persistent identity — never resolve it by matching
/// task text, since duplicate text is legal and ambiguous.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TodoItem {
    pub line_id: String,
    pub line_index: usize,
    pub text: String,
    pub completed: bool,
    pub indent: String,
}

/// A parsed snapshot of the selected file at one point in time.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TodoDocument {
    pub path: PathBuf,
    /// Changes whenever a file is selected/reselected. Mutations and
    /// watcher events captured from a previous session must be rejected.
    pub source_session: String,
    /// Cryptographic hash of the original bytes this document was parsed
    /// from. An opaque equality/identity key, not an ordering key.
    pub revision: String,
    /// Monotonically increasing within one `source_session`. Used to order
    /// snapshots; a content hash alone cannot do that.
    pub sequence: u64,
    pub tasks: Vec<TodoItem>,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum UpdateSource {
    Startup,
    UserWrite,
    ExternalChange,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TodosUpdatedEvent {
    pub document: TodoDocument,
    pub source: UpdateSource,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum WatchStatus {
    Watching,
    Paused,
    Missing,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileStatusEvent {
    pub source_session: String,
    pub sequence: u64,
    pub status: WatchStatus,
}
