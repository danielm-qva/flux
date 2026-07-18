mod auth;
mod database;
mod flow;
mod organization;
mod request;
mod workspace;
mod workspace_transfer;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
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
            request::move_saved_request,
            organization::list_request_folders,
            organization::create_request_folder,
            organization::rename_request_folder,
            organization::delete_request_folder,
            organization::list_request_history,
            organization::record_request_history,
            organization::clear_request_history,
            flow::list_request_flows,
            flow::create_request_flow,
            flow::rename_request_flow,
            flow::update_request_flow,
            flow::delete_request_flow,
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
            workspace::delete_environment_variable,
            workspace_transfer::export_workspace,
            workspace_transfer::preview_workspace_import,
            workspace_transfer::import_workspace
        ])
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            let database_path = app_data_dir.join("flux.sqlite3");

            // Preserve databases created while the app still used Tauri's
            // provisional `com.tauri.dev` identifier.
            if !database_path.exists() {
                if let Some(app_data_root) = app_data_dir.parent() {
                    let legacy_database_path =
                        app_data_root.join("com.tauri.dev").join("flux.sqlite3");
                    if legacy_database_path.exists() {
                        std::fs::create_dir_all(&app_data_dir)?;
                        std::fs::copy(legacy_database_path, &database_path)?;
                    }
                }
            }

            std::fs::create_dir_all(&app_data_dir)?;
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
