pub mod commands;
pub mod config;
pub mod errors;
pub mod markdown;
pub mod models;
pub mod watcher;
pub mod window;
pub mod writer;

use tauri::{Manager, WindowEvent};

use commands::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // TYPEWRITER_CONFIG_DIR lets dev/test runs use a throwaway
            // config instead of the real per-user one.
            let config_dir = match std::env::var_os("TYPEWRITER_CONFIG_DIR") {
                Some(dir) => std::path::PathBuf::from(dir),
                None => app.path().app_config_dir()?,
            };
            let config_path = config_dir.join("config.json");
            app.manage(AppState::new(config_path));
            let handle = app.handle().clone();
            let state = app.state::<AppState>();
            commands::start_watcher_if_selected(&handle, &state);
            if let Some(main_window) = app.get_webview_window("main") {
                window::restore_position(&main_window, &state);
                // macOS draws a rectangular drop shadow around the
                // window's frame regardless of the webview content's
                // own border-radius, which shows as a visible square
                // behind our rounded widget. Disable the native shadow
                // and let the CSS box-shadow (which does follow the
                // rounded corners) stand in for it.
                let _ = main_window.set_shadow(false);
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::Moved(_) = event {
                let state = window.state::<AppState>();
                window::save_position(window, &state);
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_app_state,
            commands::choose_todo_file,
            commands::load_todos,
            commands::toggle_todo,
            commands::add_todo,
            commands::set_preferences,
            commands::add_profile,
            commands::rename_profile,
            commands::relink_profile,
            commands::remove_profile,
            commands::switch_profile,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
