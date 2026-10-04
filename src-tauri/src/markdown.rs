//! Markdown parsing and byte-range mutation for the single supported
//! task syntax: `- [ ] text` / `- [x] text` / `- [X] text`.
//!
//! Mutations operate on the original byte ranges of the source file
//! rather than reserializing an AST, so every byte outside an intended
//! edit span is preserved exactly (frontmatter, prose, links, unrelated
//! Markdown, newline style, BOM).

use std::ops::Range;

use pulldown_cmark::{Event, Options, Parser, Tag, TagEnd};
use sha2::{Digest, Sha256};

use crate::errors::{AppError, AppResult};

pub const MAX_TASK_TEXT_LEN: usize = 2000;
pub const TODOS_HEADING: &str = "Todos";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedTask {
    pub line_index: usize,
    pub text: String,
    pub completed: bool,
    pub indent: String,
    /// Byte offset, within the file, of the checkbox marker character
    /// itself (the ` `, `x`, or `X` between the brackets).
    pub marker_offset: usize,
}

#[derive(Debug, Clone)]
pub struct ParsedDocument {
    pub tasks: Vec<ParsedTask>,
    /// Byte range of the first recognized `## Todos` section, if any:
    /// from immediately after the heading line to the next level 1/2
    /// heading (or EOF). Level 3+ subsections remain inside this range.
    pub todos_section: Option<Range<usize>>,
    /// Byte offset to insert a new task at, if the section/file allows
    /// a safe deterministic insertion. `None` when no `## Todos` section
    /// exists yet (a fresh section must be appended instead).
    pub insertion_point: Option<usize>,
    pub newline: &'static str,
}

pub fn hash_bytes(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}

fn detect_newline(content: &str) -> &'static str {
    if content.contains("\r\n") {
        "\r\n"
    } else {
        "\n"
    }
}

/// Byte ranges that must be excluded from task recognition: fenced code,
/// indented code blocks, HTML blocks/comments, and YAML frontmatter.
fn excluded_ranges(content: &str) -> Vec<Range<usize>> {
    let mut ranges = Vec::new();

    if let Some(fm_end) = frontmatter_range(content) {
        ranges.push(0..fm_end);
    }

    let options = Options::ENABLE_YAML_STYLE_METADATA_BLOCKS;
    let parser = Parser::new_ext(content, options);
    let mut depth = 0usize;
    let mut open_start: Option<usize> = None;

    for (event, range) in parser.into_offset_iter() {
        match event {
            Event::Start(Tag::CodeBlock(_)) | Event::Start(Tag::HtmlBlock) => {
                if depth == 0 {
                    open_start = Some(range.start);
                }
                depth += 1;
            }
            Event::End(TagEnd::CodeBlock) | Event::End(TagEnd::HtmlBlock) => {
                depth = depth.saturating_sub(1);
                if depth == 0 {
                    if let Some(start) = open_start.take() {
                        ranges.push(start..range.end);
                    }
                }
            }
            Event::Html(_) | Event::InlineHtml(_) => {
                // Standalone HTML comment / inline HTML not already inside
                // a block above (e.g. `<!-- - [ ] fake -->` on one line).
                ranges.push(range);
            }
            _ => {}
        }
    }

    ranges.sort_by_key(|r| r.start);
    ranges
}

fn frontmatter_range(content: &str) -> Option<usize> {
    if !content.starts_with("---\n") && !content.starts_with("---\r\n") {
        return None;
    }
    let after_open = content.find('\n')? + 1;
    let mut search_from = after_open;
    loop {
        let rest = &content[search_from..];
        let line_end = rest.find('\n').map(|i| i + 1).unwrap_or(rest.len());
        let line = &rest[..line_end];
        let trimmed = line.trim_end_matches(['\n', '\r']);
        if trimmed == "---" || trimmed == "..." {
            return Some(search_from + line_end);
        }
        if rest.is_empty() {
            return None;
        }
        search_from += line_end;
        if search_from >= content.len() {
            return None;
        }
    }
}

fn offset_excluded(ranges: &[Range<usize>], offset: usize) -> bool {
    ranges.iter().any(|r| r.start <= offset && offset < r.end)
}

/// A recognized `## Todos` heading: level-2, text exactly "Todos"
/// (trimmed of trailing horizontal whitespace), not inside an excluded
/// context.
struct HeadingMatch {
    line_start: usize,
    line_end: usize,
    level: u8,
}

fn scan_headings(content: &str, excluded: &[Range<usize>]) -> Vec<HeadingMatch> {
    let mut headings = Vec::new();
    let mut offset = 0usize;
    for line in content.split_inclusive('\n') {
        let trimmed_end = line.trim_end_matches(['\n', '\r']);
        let trimmed_start = trimmed_end.trim_start();
        if !offset_excluded(excluded, offset) {
            if let Some(level) = heading_level(trimmed_start) {
                headings.push(HeadingMatch {
                    line_start: offset,
                    line_end: offset + line.len(),
                    level,
                });
            }
        }
        offset += line.len();
    }
    headings
}

fn heading_level(trimmed: &str) -> Option<u8> {
    let hashes = trimmed.chars().take_while(|c| *c == '#').count();
    if hashes == 0 || hashes > 6 {
        return None;
    }
    let rest = &trimmed[hashes..];
    if !rest.starts_with(' ') && !rest.is_empty() {
        return None;
    }
    Some(hashes as u8)
}

fn heading_text(line: &str) -> &str {
    let trimmed = line.trim_end_matches(['\n', '\r']).trim();
    let hashes = trimmed.chars().take_while(|c| *c == '#').count();
    trimmed[hashes..].trim()
}

/// Locate the first non-excluded level-2 `## Todos` heading and the byte
/// range of its section body (through the next level-1/2 heading or EOF).
fn find_todos_section(content: &str, excluded: &[Range<usize>]) -> Option<Range<usize>> {
    let headings = scan_headings(content, excluded);
    let todos_idx = headings.iter().position(|h| {
        h.level == 2 && heading_text(&content[h.line_start..h.line_end]) == TODOS_HEADING
    })?;

    let section_start = headings[todos_idx].line_end;
    let section_end = headings[(todos_idx + 1)..]
        .iter()
        .find(|h| h.level <= 2)
        .map(|h| h.line_start)
        .unwrap_or(content.len());

    Some(section_start..section_end)
}

static TASK_PREFIX_RE_OPEN: &str = "- [";

fn parse_task_line(line: &str) -> Option<(String, bool, String)> {
    let indent_len = line.len() - line.trim_start_matches([' ', '\t']).len();
    let indent = &line[..indent_len];
    let rest = &line[indent_len..];
    if !rest.starts_with(TASK_PREFIX_RE_OPEN) {
        return None;
    }
    let after_prefix = &rest[TASK_PREFIX_RE_OPEN.len()..];
    let mut chars = after_prefix.chars();
    let marker = chars.next()?;
    if marker != ' ' && marker != 'x' && marker != 'X' {
        return None;
    }
    let after_marker = &after_prefix[marker.len_utf8()..];
    if !after_marker.starts_with(']') {
        return None;
    }
    let after_bracket = &after_marker[1..];
    let text_start = if after_bracket.starts_with(' ') {
        1
    } else if after_bracket.is_empty() || after_bracket.starts_with(['\n', '\r']) {
        0
    } else {
        return None;
    };
    let text = after_bracket[text_start..]
        .trim_end_matches(['\n', '\r'])
        .to_string();
    Some((text, marker != ' ', indent.to_string()))
}

pub fn parse(content: &str) -> ParsedDocument {
    let newline = detect_newline(content);
    let excluded = excluded_ranges(content);
    let todos_section = find_todos_section(content, &excluded);

    let mut tasks = Vec::new();
    let mut offset = 0usize;
    let mut last_task_end_in_section: Option<usize> = None;

    for (line_index, line) in content.split_inclusive('\n').enumerate() {
        if let Some((text, completed, indent)) = parse_task_line(line) {
            let indent_len = indent.len();
            let content_offset = offset + indent_len;
            if !offset_excluded(&excluded, content_offset) {
                let marker_offset = content_offset + TASK_PREFIX_RE_OPEN.len();
                tasks.push(ParsedTask {
                    line_index,
                    text,
                    completed,
                    indent,
                    marker_offset,
                });

                if let Some(section) = &todos_section {
                    if offset >= section.start && offset < section.end {
                        last_task_end_in_section = Some(offset + line.len());
                    }
                }
            }
        }
        offset += line.len();
    }

    let insertion_point = todos_section
        .as_ref()
        .map(|section| last_task_end_in_section.unwrap_or(section.start));

    ParsedDocument {
        tasks,
        todos_section,
        insertion_point,
        newline,
    }
}

/// Toggle one task's checkbox marker byte in place. `marker_offset` must
/// come from a `ParsedTask` parsed from these exact `content` bytes.
pub fn toggle_task_bytes(
    content: &str,
    marker_offset: usize,
    completed: bool,
) -> AppResult<String> {
    let marker = content
        .as_bytes()
        .get(marker_offset)
        .copied()
        .ok_or(AppError::Internal)?;
    let is_checked = marker == b'x' || marker == b'X';
    if is_checked == completed {
        // Already in the desired state; nothing to change.
        return Ok(content.to_string());
    }
    let mut bytes = content.as_bytes().to_vec();
    bytes[marker_offset] = if completed { b'x' } else { b' ' };
    String::from_utf8(bytes).map_err(|_| AppError::InvalidUtf8)
}

/// Validate and normalize task text for `add`. Rejects multiline input,
/// control characters, empty text, and text over the length limit.
pub fn validate_task_text(raw: &str) -> AppResult<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(AppError::InvalidTaskText);
    }
    if trimmed.chars().count() > MAX_TASK_TEXT_LEN {
        return Err(AppError::InvalidTaskText);
    }
    if trimmed
        .chars()
        .any(|c| c == '\r' || c == '\n' || c == '\0' || (c.is_control() && c != '\t'))
    {
        return Err(AppError::MultilineRejected);
    }
    Ok(trimmed.to_string())
}

/// Insert a new `- [ ] text` task, returning the full new file content.
/// If no `## Todos` section exists, appends a fresh one (blank-line
/// separated) at EOF. Rejects when the file ends inside an unclosed
/// excluded block that would otherwise swallow the appended section.
pub fn add_task_bytes(content: &str, text: &str) -> AppResult<String> {
    let parsed = parse(content);
    let newline = parsed.newline;
    let line = format!("- [ ] {text}{newline}");

    if let Some(insertion_point) = parsed.insertion_point {
        let mut out = String::with_capacity(content.len() + line.len());
        out.push_str(&content[..insertion_point]);
        out.push_str(&line);
        out.push_str(&content[insertion_point..]);
        return Ok(out);
    }

    if unclosed_excluded_block_at_eof(content) {
        return Err(AppError::NoSafeInsertionPoint);
    }

    let mut out = String::with_capacity(content.len() + line.len() + 16);
    out.push_str(content);
    if !content.is_empty() && !content.ends_with('\n') {
        out.push_str(newline);
    }
    if !content.is_empty() {
        out.push_str(newline);
    }
    out.push_str("## Todos");
    out.push_str(newline);
    out.push_str(newline);
    out.push_str(&line);
    Ok(out)
}

/// True when the file's last excluded block (fenced/indented code, HTML
/// block, frontmatter) runs all the way to EOF without a closing
/// delimiter — appending plain text there would be silently swallowed
/// back into that block when the file is next rendered/parsed.
fn unclosed_excluded_block_at_eof(content: &str) -> bool {
    if content.is_empty() {
        return false;
    }
    let excluded = excluded_ranges(content);
    excluded
        .iter()
        .any(|r| r.end == content.len() && r.end > r.start)
}
