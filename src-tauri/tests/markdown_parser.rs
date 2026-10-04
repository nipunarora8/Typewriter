use std::fs;
use std::path::Path;

use typewriter_lib::markdown::{add_task_bytes, parse, toggle_task_bytes, validate_task_text};

fn fixture(name: &str) -> String {
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
        .join(name);
    fs::read_to_string(path).expect("fixture should exist and be valid UTF-8")
}

#[test]
fn parses_basic_tasks_in_order() {
    let content = fixture("todos-basic.md");
    let doc = parse(&content);
    assert_eq!(doc.tasks.len(), 3);
    assert_eq!(doc.tasks[0].text, "Finish singing test");
    assert!(!doc.tasks[0].completed);
    assert_eq!(doc.tasks[1].text, "Review code");
    assert!(doc.tasks[1].completed);
    assert_eq!(doc.tasks[2].text, "German lesson");
    assert!(!doc.tasks[2].completed);
}

#[test]
fn recognizes_uppercase_x_as_completed() {
    let content = "## Todos\n\n- [X] Uppercase checked\n";
    let doc = parse(content);
    assert_eq!(doc.tasks.len(), 1);
    assert!(doc.tasks[0].completed);
}

#[test]
fn preserves_indentation_on_nested_tasks() {
    let content = fixture("todos-mixed-content.md");
    let doc = parse(&content);
    let nested = doc
        .tasks
        .iter()
        .find(|t| t.text.starts_with("German lesson"))
        .expect("nested task should be parsed");
    assert_eq!(nested.indent, "  ");
}

#[test]
fn excludes_fenced_code_indented_code_and_html_comments() {
    let content = fixture("todos-mixed-content.md");
    let doc = parse(&content);
    for task in &doc.tasks {
        assert!(
            !task.text.contains("looks like a task"),
            "task-like text inside an excluded context must not be recognized: {:?}",
            task.text
        );
    }
}

#[test]
fn todos_section_excludes_other_headings_but_includes_level_three_subsections() {
    let content = fixture("todos-mixed-content.md");
    let doc = parse(&content);

    let in_todos: Vec<&str> = doc
        .tasks
        .iter()
        .filter(|t| {
            if let Some(section) = &doc.todos_section {
                // crude check via marker offset falling inside section range
                t.marker_offset >= section.start && t.marker_offset < section.end
            } else {
                false
            }
        })
        .map(|t| t.text.as_str())
        .collect();

    assert!(in_todos.contains(&"Finish singing test"));
    assert!(in_todos.contains(&"Buy milk"));
    assert!(in_todos.contains(&"Still inside Todos (level-3 subsection)"));
    assert!(!in_todos.contains(&"Not a real target section"));
    assert!(!in_todos.contains(&"Not part of Todos"));
}

#[test]
fn no_todos_heading_yields_no_section_and_no_tasks() {
    let content = fixture("malformed-or-no-todos.md");
    let doc = parse(&content);
    assert!(doc.todos_section.is_none());
    assert!(doc.tasks.is_empty());
}

#[test]
fn crlf_newlines_are_detected_and_tasks_still_parse() {
    let content = fixture("todos-crlf.md");
    let doc = parse(&content);
    assert_eq!(doc.tasks.len(), 2);
    assert_eq!(doc.newline, "\r\n");
}

#[test]
fn no_trailing_newline_still_parses_last_task() {
    let content = fixture("todos-no-trailing-newline.md");
    let doc = parse(&content);
    assert_eq!(doc.tasks.len(), 1);
    assert_eq!(doc.tasks[0].text, "no trailing newline task");
}

#[test]
fn duplicate_todos_headings_use_the_first_deterministically() {
    let content = fixture("todos-duplicate-heading.md");
    let doc = parse(&content);
    // Only the first section's task should be addressable for insertion;
    // both tasks still parse (parsing is not restricted to the first
    // section), but insertion must target the first section only.
    assert_eq!(doc.tasks.len(), 2);
    let result = add_task_bytes(&content, "new task").unwrap();
    let first_section_idx = result.find("first section task").unwrap();
    let inserted_idx = result.find("new task").unwrap();
    let second_section_idx = result.find("second section task").unwrap();
    assert!(first_section_idx < inserted_idx);
    assert!(inserted_idx < second_section_idx);
}

#[test]
fn unicode_task_text_round_trips() {
    let content = "## Todos\n\n- [ ] Café résumé 日本語 emoji 🎉\n";
    let doc = parse(content);
    assert_eq!(doc.tasks[0].text, "Café résumé 日本語 emoji 🎉");
}

// --- Mutation tests -------------------------------------------------

#[test]
fn toggle_only_changes_the_bracket_byte() {
    let content = fixture("todos-basic.md");
    let doc = parse(&content);
    let target = &doc.tasks[0];
    assert!(!target.completed);

    let result = toggle_task_bytes(&content, target.marker_offset, true).unwrap();
    assert_ne!(result, content);

    // Exactly one byte differs.
    let diff_count = result
        .bytes()
        .zip(content.bytes())
        .filter(|(a, b)| a != b)
        .count();
    assert_eq!(diff_count, 1);
    assert!(result.contains("- [x] Finish singing test"));
}

#[test]
fn toggle_to_same_state_is_a_no_op() {
    let content = fixture("todos-basic.md");
    let doc = parse(&content);
    let target = &doc.tasks[0];
    let result = toggle_task_bytes(&content, target.marker_offset, false).unwrap();
    assert_eq!(result, content);
}

#[test]
fn add_preserves_unrelated_content_and_inserts_after_last_task() {
    let content = fixture("todos-basic.md");
    let result = add_task_bytes(&content, "Walk the dog").unwrap();
    assert!(result.contains("# Work list"));
    assert!(result.contains("- [ ] German lesson"));
    assert!(result.contains("- [ ] Walk the dog"));
    let german_idx = result.find("German lesson").unwrap();
    let dog_idx = result.find("Walk the dog").unwrap();
    assert!(german_idx < dog_idx);
}

#[test]
fn add_creates_todos_section_when_absent() {
    let content = fixture("malformed-or-no-todos.md");
    let result = add_task_bytes(&content, "First task").unwrap();
    assert!(result.contains("## Todos"));
    assert!(result.contains("- [ ] First task"));
    assert!(result.starts_with("# A note with no Todos section"));
}

#[test]
fn add_rejects_when_trailing_unclosed_fence_would_swallow_task() {
    let content = fixture("todos-unclosed-fence-eof.md");
    let result = add_task_bytes(&content, "New task");
    assert!(result.is_err());
}

#[test]
fn add_preserves_crlf_newline_convention() {
    let content = fixture("todos-crlf.md");
    let result = add_task_bytes(&content, "CRLF new task").unwrap();
    assert!(result.contains("CRLF new task\r\n"));
}

// --- Task text validation -------------------------------------------

#[test]
fn validate_rejects_empty_and_whitespace_only_text() {
    assert!(validate_task_text("").is_err());
    assert!(validate_task_text("   ").is_err());
}

#[test]
fn validate_rejects_multiline_text() {
    assert!(validate_task_text("line one\nline two").is_err());
    assert!(validate_task_text("line one\r\nline two").is_err());
}

#[test]
fn validate_rejects_control_characters() {
    assert!(validate_task_text("bad\0text").is_err());
}

#[test]
fn validate_rejects_text_over_length_limit() {
    let too_long = "a".repeat(2001);
    assert!(validate_task_text(&too_long).is_err());
    let exactly_at_limit = "a".repeat(2000);
    assert!(validate_task_text(&exactly_at_limit).is_ok());
}

#[test]
fn validate_trims_surrounding_whitespace() {
    assert_eq!(validate_task_text("  hello  ").unwrap(), "hello");
}

#[test]
fn duplicate_task_text_gets_distinct_line_indices_not_merged() {
    let content = "## Todos\n\n- [ ] Buy milk\n- [ ] Buy milk\n";
    let doc = parse(content);
    assert_eq!(doc.tasks.len(), 2);
    assert_ne!(doc.tasks[0].marker_offset, doc.tasks[1].marker_offset);
    assert_ne!(doc.tasks[0].line_index, doc.tasks[1].line_index);
}

#[test]
fn toggle_by_marker_offset_does_not_relocate_by_text_when_duplicates_exist() {
    let content = "## Todos\n\n- [ ] Buy milk\n- [ ] Buy milk\n";
    let doc = parse(content);
    // Toggling the *second* occurrence must only flip that one line.
    let second = &doc.tasks[1];
    let result = toggle_task_bytes(content, second.marker_offset, true).unwrap();
    assert_eq!(result, "## Todos\n\n- [ ] Buy milk\n- [x] Buy milk\n");
}
