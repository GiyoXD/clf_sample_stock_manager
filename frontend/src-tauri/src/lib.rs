use tauri::{AppHandle, Manager, RunEvent};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandChild;
use std::sync::{Arc, Mutex};

struct ServerProcess(Arc<Mutex<Option<CommandChild>>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let server_process = Arc::new(Mutex::new(None));

  tauri::Builder::default()
    .plugin(tauri_plugin_log::Builder::default().build())
    .plugin(tauri_plugin_shell::init())
    .manage(ServerProcess(server_process.clone()))
    .setup(|app| {
        let handle = app.handle().clone();
        let process_state = app.state::<ServerProcess>();
        let process_state_clone = process_state.0.clone();
        
        // Spawn Sidecar
        tauri::async_runtime::spawn(async move {
            let app_data = handle.path().app_data_dir().unwrap();
            if !app_data.exists() {
                std::fs::create_dir_all(&app_data).unwrap();
            }
            let db_path = app_data.join("database.sqlite").to_string_lossy().to_string();
            
            println!("Tauri Sidecar: Using DB Path: {}", db_path);

            let sidecar_command = handle.shell().sidecar("server").unwrap()
                .args(["--db-path", &db_path]);

            let (mut rx, child) = sidecar_command
                .spawn()
                .expect("Failed to spawn sidecar");

            // Store child handle
            *process_state_clone.lock().unwrap() = Some(child);

            // Monitor Output
            tauri::async_runtime::spawn(async move {
                while let Some(event) = rx.recv().await {
                     match event {
                        tauri_plugin_shell::process::CommandEvent::Stdout(line) => {
                             let msg = String::from_utf8(line).unwrap();
                             println!("Sidecar: {}", msg);
                             log::info!("Sidecar: {}", msg);
                        }
                        tauri_plugin_shell::process::CommandEvent::Stderr(line) => {
                             let msg = String::from_utf8(line).unwrap();
                             println!("Sidecar Error: {}", msg);
                             log::error!("Sidecar Error: {}", msg);
                        }
                        _ => {}
                    }
                }
            });
            
        });

        Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while running tauri application")
    .run(move |app_handle, event| match event {
        RunEvent::Exit => {
            let state = app_handle.state::<ServerProcess>();
            // Lock and take the option
            let mut guard = state.0.lock().unwrap();
            if let Some(child) = guard.take() {
                println!("Killing server process...");
                let _ = child.kill();
            }
        }
        _ => {}
    });
}
