const Database = require('better-sqlite3');
const path = require('path');

// Parse CLI args for --db-path
const args = process.argv.slice(2);
const dbPathArgIdx = args.indexOf('--db-path');
const customPath = dbPathArgIdx !== -1 ? args[dbPathArgIdx + 1] : null;

const dbPath = customPath || path.join(__dirname, 'database.sqlite');
console.log(`Open Database: ${dbPath}`);

const db = new Database(dbPath);

console.log("--- STARTING SCHEMA REPAIR ---");

// 1. Repair Master Data
console.log("Dropping master_data...");
db.exec(`DROP TABLE IF EXISTS master_data`);

console.log("Creating new master_data (with production_scale)...");
db.exec(`
    CREATE TABLE master_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        using_po TEXT,
        client TEXT,
        client_po TEXT,
        product_name TEXT,
        product_code TEXT,
        quality_note TEXT,
        production_scale REAL DEFAULT 0 -- changed from INTEGER
    )
`);
console.log("SUCCESS: master_data repaired.");

// 2. Repair CLF Data
console.log("Dropping clf_data...");
db.exec(`DROP TABLE IF EXISTS clf_data`);

console.log("Creating new clf_data (with order_qty)...");
db.exec(`
    CREATE TABLE clf_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ttx_po TEXT, 
        batch TEXT,
        client_po TEXT,
        order_qty REAL DEFAULT 0, -- changed from INTEGER
        pieces TEXT
    )
`);
console.log("SUCCESS: clf_data repaired.");

console.log("---------------------------------------------------");
console.log("DONE. You can now restart your app and Import data.");
console.log("---------------------------------------------------");
