mod auth;
mod database;
mod request;
mod workspace;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            auth::register_user,
            auth::login_user,
            request::execute_http_request,
            request::list_saved_requests,
            request::create_saved_request,
            request::update_saved_request,
            request::rename_saved_request,
            request::duplicate_saved_request,
            request::delete_saved_request,
            workspace::list_workspaces,
            workspace::create_workspace,
            workspace::rename_workspace,
            workspace::delete_workspace,
            workspace::list_environments,
            workspace::create_environment,
            workspace::rename_environment,
            workspace::delete_environment,
            workspace::list_environment_variables,
            workspace::save_environment_variable,
            workspace::delete_environment_variable
        ])
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_data_dir)?;
            let database_path = app_data_dir.join("flux.sqlite3");
            database::initialize(&database_path)?;
            app.manage(database::DatabaseState::new(database_path));

            #[cfg(desktop)]
            if let (Some(window), Some(icon)) =
                (app.get_webview_window("main"), app.default_window_icon())
            {
                window.set_icon(icon.clone())?;
            }

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
