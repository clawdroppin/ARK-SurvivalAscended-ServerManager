mod commands;
mod core;
mod error;
mod models;
mod paths;
mod state;

use std::sync::Arc;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let loc = paths::resolve(app.handle())?;
            // The main window is created here (not from config) so a portable install can keep the
            // WebView2 profile inside its own folder instead of %LOCALAPPDATA%.
            let cfg = app.config().app.windows.iter().find(|w| w.label == "main").cloned().expect("main window config");
            let mut builder = tauri::WebviewWindowBuilder::from_config(app.handle(), &cfg)?;
            if loc.portable {
                builder = builder.data_directory(loc.dir.join("webview"));
            }
            builder.build()?;
            app.manage(Arc::new(state::AppState::load(loc.dir, loc.portable)));
            core::supervisor::spawn(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_app_info,
            commands::get_settings,
            commands::save_settings,
            commands::cancel_task,
            commands::check_prereqs,
            commands::install_prereqs,
            commands::list_instances,
            commands::get_statuses,
            commands::suggest_ports,
            commands::create_instance,
            commands::update_instance,
            commands::delete_instance,
            commands::clone_instance,
            commands::import_existing,
            commands::install_server,
            commands::check_server_update,
            commands::start_server,
            commands::stop_server,
            commands::restart_server,
            commands::get_launch_line,
            commands::read_config,
            commands::write_config,
            commands::validate_ini,
            commands::rcon_exec,
            commands::list_players,
            commands::a2s_query,
            commands::read_log_tail,
            commands::cf_search,
            commands::cf_get_mods,
            commands::check_mod_updates,
            commands::purge_mod_files,
            commands::run_diagnostics,
            commands::add_firewall_rules,
            commands::check_saves,
            commands::rollback_save,
            commands::create_backup,
            commands::list_backups,
            commands::get_backup_dir,
            commands::restore_backup,
            commands::delete_backup,
            commands::export_pack,
            commands::read_pack,
            commands::import_pack,
            commands::probe_steamcmd_dir,
            commands::get_map_catalog,
            commands::list_user_presets,
            commands::save_user_presets,
        ])
        .run(tauri::generate_context!())
        .expect("error while running ASA Server Manager");
}
