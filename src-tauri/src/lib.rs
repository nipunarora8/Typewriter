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
            let config_dir = app.path().app_config_dir()?;
            let config_path = config_dir.join("config.json");
            app.manage(AppState::new(config_path));
            let handle = app.handle().clone();
            let state = app.state::<AppState>();
            commands::start_watcher_if_selected(&handle, &state);
            if let Some(main_window) = app.get_webview_window("main") {
                window::restore_position(&main_window, &state);
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
