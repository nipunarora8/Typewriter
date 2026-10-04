//! Window position persistence. The expanded/collapsed *size* is owned
//! by the frontend's resize choreography (nativeWindow.ts); this module
//! only tracks where the window sits on screen so it reopens in the
//! same place next launch, with a recenter fallback if that position
//! is no longer on any available monitor (e.g. an external display was
//! disconnected).
//!
//! `WebviewWindow` (used at setup) and `Window` (used in the
//! `on_window_event` callback) expose identical position/monitor
//! methods but share no common trait for them in Tauri 2, so the
//! actual logic is written once against the shared shapes it needs and
//! called from both thin entry points below.

use tauri::{Monitor, PhysicalPosition, WebviewWindow, Window};

use crate::commands::AppState;

fn position_is_visible(monitors: &[Monitor], x: i32, y: i32) -> bool {
    monitors.iter().any(|m| {
        let pos = m.position();
        let size = m.size();
        x >= pos.x && x < pos.x + size.width as i32 && y >= pos.y && y < pos.y + size.height as i32
    })
}

/// Move the window to its last saved position, if any, and if that
/// position still falls within some available monitor's bounds.
/// Otherwise leaves the window at its default (OS-centered) position.
pub fn restore_position(window: &WebviewWindow, state: &AppState) {
    let (x, y) = {
        let inner = state.0.lock().unwrap();
        match (inner.window_x, inner.window_y) {
            (Some(x), Some(y)) => (x, y),
            _ => return,
        }
    };

    let Ok(monitors) = window.available_monitors() else {
        return;
    };

    if position_is_visible(&monitors, x, y) {
        let _ = window.set_position(PhysicalPosition::new(x, y));
    }
    // If not visible, leave the window at its OS-assigned default
    // position rather than guessing a recenter point ourselves.
}

/// Persist the window's current position. Called from the Moved window
/// event; failures are non-fatal (position is a convenience, not
/// correctness-critical).
pub fn save_position(window: &Window, state: &AppState) {
    let Ok(pos) = window.outer_position() else {
        return;
    };
    let mut inner = state.0.lock().unwrap();
    inner.window_x = Some(pos.x);
    inner.window_y = Some(pos.y);
    inner.persist_config();
}
