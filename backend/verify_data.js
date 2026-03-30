const Database = require('better-sqlite3');
const path = require('path');

// Parse CLI args for --db-path
const args = process.argv.slice(2);
const dbPathArgIdx = args.indexOf('--db-path');
const customPath = dbPathArgIdx !== -1 ? args[dbPathArgIdx + 1] : null;

// Open DB directly (ReadOnly) to avoid triggering initDB logic in db.js
const dbPath = customPath || path.join(__dirname, 'database.sqlite');
console.log(`\nINSPECTING DATABASE: ${dbPath}`);
const db = new Database(dbPath, { readonly: true, fileMustExist: true });

console.log("--- Verifying DB Schema ---");
try {
    const tableInfo = db.prepare("PRAGMA table_info(master_data)").all();
    const scaleCol = tableInfo.find(c => c.name === 'production_scale');
    if (scaleCol) {
        console.log(`SUCCESS: 'production_scale' exists. Type: [${scaleCol.type}] (Should be REAL/TEXT)`);
    } else {
        console.error("FAILURE: 'production_scale' column MISSING.");
    }
} catch (e) {
    console.error("Schema check failed:", e);
}

console.log("\n--- Checking Data Content (First 10 Non-Zero Scales) ---");
try {
    const rows = db.prepare("SELECT using_po, production_scale, typeof(production_scale) as db_type FROM master_data WHERE production_scale != '0' AND production_scale != 0 LIMIT 10").all();
    if (rows.length === 0) {
        console.log("WARNING: No records found with production_scale > 0.");
        console.log("Dumping first 5 records regardless of values:");
        const allRows = db.prepare("SELECT using_po, production_scale, typeof(production_scale) as db_type FROM master_data LIMIT 5").all();
        console.table(allRows);
    } else {
        console.log("Found records with scale:");
        console.table(rows);
    }
} catch (e) {
    console.error("Data check failed:", e);
}

console.log("\n--- Checking CLF Data (First 10 Non-Zero quantities) ---");
try {
    const tableInfo = db.prepare("PRAGMA table_info(clf_data)").all();
    const qtyCol = tableInfo.find(c => c.name === 'order_qty');
    if (qtyCol) {
        console.log(`SUCCESS: 'order_qty' exists. Type: [${qtyCol.type}] (Should be REAL/TEXT)`);
    } else {
        console.error("FAILURE: 'order_qty' column MISSING in clf_data.");
    }

    const rows = db.prepare("SELECT ttx_po, order_qty, typeof(order_qty) as db_type FROM clf_data WHERE order_qty != '0' AND order_qty != 0 LIMIT 10").all();
    if (rows.length === 0) {
        console.log("WARNING: No CLF records found with order_qty > 0.");
        console.log("Dumping first 5 CLF records:");
        const allRows = db.prepare("SELECT ttx_po, order_qty, typeof(order_qty) as db_type FROM clf_data LIMIT 5").all();
        console.table(allRows);
    } else {
        console.log("Found CLF records with qty:");
        console.table(rows);
    }
} catch (e) {
    console.error("CLF check failed:", e);
}
