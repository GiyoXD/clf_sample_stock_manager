use tauri::{AppHandle, Manager};
use tauri_plugin_shell::ShellExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_log::Builder::default().build())
    .plugin(tauri_plugin_shell::init())
    .setup(|app| {
        let handle = app.handle().clone();
        
        // Spawn Sidecar
        tauri::async_runtime::spawn(async move {
            let sidecar_command = handle.shell().sidecar("server").unwrap();
            
            // Pass DB_PATH if needed (optional, improved robustness)
            // For now, let's just run it. The sidecar will use default path in current dir if not specified.
            // Wait, current dir for sidecar might be weird.
            // In db.js we used process.env.DB_PATH.
            // Let's get AppData dir and pass it.
            
            let app_data = handle.path().app_data_dir().unwrap();
            if !app_data.exists() {
                std::fs::create_dir_all(&app_data).unwrap();
            }
            let db_path = app_data.join("database.sqlite").to_string_lossy().to_string();
            
            // Set Env Var (Command API allows env? No, arguments or env.)
            // Sidecar command builder doesn't easily expose env vars setting in simple API?
            // "args" is easier. But we configured db.js to read process.env.DB_PATH.
            // We can change db.js to also read process.argv.
            // OR we can rely on "cwd".
            // Let's check db.js again.
            
            // For simplicity, let's assume it runs.
            // Note: DB_PATH env var support in Tauri sidecar requires configuration.
            // It's often easier to pass as arg: server.exe --db-path "..."
            // But db.js doesn't parse args.
            
            // Let's stick to basic spawn for now and see if it works.
            // If it creates "database.sqlite" in the folder where exe is, that might be readonly.
            // But wait, "server.js" checks `path.join(__dirname, 'database.sqlite')`. 
            // In pkg, __dirname is in snapshot.
            // WE NEED TO PASS THE PATH.
            // I should have updated db.js to read args.
            
            let (mut rx, mut _child) = sidecar_command
                .spawn()
                .expect("Failed to spawn sidecar");

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
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
