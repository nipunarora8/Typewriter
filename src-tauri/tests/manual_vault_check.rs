//! Not part of the automated suite's required-pass set — this exercises
//! the real Obsidian Typewriter folder with a disposable fixture, per
//! the Phase 1 manual verification step. Run explicitly:
//! `cargo test --test manual_vault_check -- --ignored --nocapture`

use std::path::PathBuf;

use typewriter_lib::markdown::hash_bytes;
use typewriter_lib::writer::{guarded_replace, WriteOutcome};

fn vault_path() -> PathBuf {
    PathBuf::from("/Users/nipunarora/obsidian_vault/navel_vault/Typewriter/disposable-test.md")
}

#[test]
#[ignore]
fn toggle_and_add_against_real_vault_file() {
    let path = vault_path();
    assert!(
        path.exists(),
        "disposable fixture must exist in the vault folder before running this check"
    );

    let original = std::fs::read_to_string(&path).unwrap();
    let hash = hash_bytes(original.as_bytes());

    let outcome = guarded_replace(&path, &hash, |content| {
        Ok(content.replace("- [ ] First test task", "- [x] First test task"))
    })
    .unwrap();
    assert!(matches!(outcome, WriteOutcome::Success { .. }));

    let after_toggle = std::fs::read_to_string(&path).unwrap();
    assert!(after_toggle.contains("- [x] First test task"));
    assert!(after_toggle.contains("- [x] Already done"));
    let hash2 = hash_bytes(after_toggle.as_bytes());

    let outcome2 = guarded_replace(&path, &hash2, |content| {
        typewriter_lib::markdown::add_task_bytes(content, "Added via Rust engine")
    })
    .unwrap();
    assert!(matches!(outcome2, WriteOutcome::Success { .. }));

    let final_content = std::fs::read_to_string(&path).unwrap();
    println!("--- final content ---\n{final_content}");
    assert!(final_content.contains("- [ ] Added via Rust engine"));
}
