use tauri::{AppHandle, Manager};
use std::fs;
use std::path::PathBuf;
use serde::{Serialize, Deserialize};

// --- Data Models ---

// Using simplistic approach: Treat DB as a generic JSON Object to preserve all fields
// but verify specific fields when needed.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AppDb {
    #[serde(rename = "stockIn")]
    pub stock_in: Vec<serde_json::Value>,
    #[serde(rename = "stockOut")]
    pub stock_out: Vec<serde_json::Value>,
    #[serde(rename = "systemList")]
    pub system_list: Vec<serde_json::Value>,
}

impl Default for AppDb {
    fn default() -> Self {
        AppDb {
            stock_in: vec![],
            stock_out: vec![],
            system_list: vec![],
        }
    }
}

// --- Helper Functions ---

fn get_db_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    if !app_data_dir.exists() {
        fs::create_dir_all(&app_data_dir).map_err(|e| e.to_string())?;
    }
    Ok(app_data_dir.join("db.json"))
}

fn read_db(app: &AppHandle) -> Result<AppDb, String> {
    let path = get_db_path(app)?;
    if !path.exists() {
        let initial = AppDb::default();
        let data = serde_json::to_string_pretty(&initial).map_err(|e| e.to_string())?;
        fs::write(&path, data).map_err(|e| e.to_string())?;
        return Ok(initial);
    }
    
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let db: AppDb = serde_json::from_str(&content).unwrap_or_default(); // Fallback to default if corrupted? Or error? logic: default is safer for now but risky.
    Ok(db)
}

fn write_db(app: &AppHandle, db: &AppDb) -> Result<(), String> {
    let path = get_db_path(app)?;
    let data = serde_json::to_string_pretty(db).map_err(|e| e.to_string())?;
    fs::write(path, data).map_err(|e| e.to_string())?;
    Ok(())
}

// --- Commands ---

#[tauri::command]
fn get_data(app: AppHandle) -> Result<AppDb, String> {
    read_db(&app)
}

#[tauri::command]
fn save_stock_out(
    app: AppHandle,
    po: String,
    recipient: String,
    type_: String,
    note: String,
    client: Option<String>
) -> Result<serde_json::Value, String> {
    let mut db = read_db(&app)?;

    // 1. Find inventory item
    // Logic: stockIn item where PO match AND stock > 0.
    // We need to parse stock.
    let mut target_index = None;
    let mut remaining_stock = 0;
    
    for (i, item) in db.stock_in.iter_mut().enumerate() {
        if let Some(item_po) = item.get("PO").and_then(|v| v.as_str()) {
            if item_po == po {
                // Check stock
                let current_stock_val = item.get("stock");
                let current_stock: i64 = match current_stock_val {
                    Some(serde_json::Value::Number(n)) => n.as_i64().unwrap_or(0),
                    Some(serde_json::Value::String(s)) => s.parse().unwrap_or(0),
                    _ => 0
                };

                if current_stock > 0 {
                    target_index = Some(i);
                    // Update stock
                    remaining_stock = current_stock - 1;
                    // Write back as generic Value
                    if let Some(obj) = item.as_object_mut() {
                        // Original was likely string or number. Let's write as Number.
                        // Or if original was string, write as string? JS behavior usually returns Number after math.
                        // But server.js said `stockItem.stock = parseInt(...) - 1`. 
                        // If we save it back, let's save as Number.
                        obj.insert("stock".to_string(), serde_json::json!(remaining_stock));
                    }
                    break;
                }
            }
        }
    }

    if target_index.is_none() {
        return Err("No stock available for this PO".to_string());
    }
    
    // Get client if not provided
    let final_client = if let Some(c) = client {
        c
    } else {
        // extract from stock item
        db.stock_in[target_index.unwrap()]
            .get("client")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string()
    };

    // 2. Create Record
    let new_record = serde_json::json!({
        "id": chrono::Local::now().timestamp_millis().to_string(),
        "date": chrono::Local::now().format("%Y-%m-%d").to_string(),
        "PO": po,
        "client": final_client,
        "recipient": recipient,
        "type": type_,
        "note": note
    });

    // Unshift (insert at 0)
    db.stock_out.insert(0, new_record.clone());

    write_db(&app, &db)?;

    Ok(serde_json::json!({
        "success": true,
        "record": new_record,
        "remainingStock": remaining_stock
    }))
}

#[tauri::command]
fn import_data(app: AppHandle, type_: String, data: Vec<serde_json::Value>) -> Result<serde_json::Value, String> {
    let mut db = read_db(&app)?;
    
    match type_.as_str() {
        "stockIn" => db.stock_in = data.clone(),
        "stockOut" => db.stock_out = data.clone(),
        "systemList" => db.system_list = data.clone(),
        _ => return Err("Invalid data type".to_string()),
    }
    
    write_db(&app, &db)?;
    Ok(serde_json::json!({ "success": true, "count": data.len() }))
}


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_log::Builder::default().build())
    .invoke_handler(tauri::generate_handler![get_data, save_stock_out, import_data])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
