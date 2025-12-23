const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new Database(dbPath, { verbose: console.log });
db.pragma('journal_mode = WAL');

// Initialize Tables
const initDB = () => {
    // Inventory Table
    db.exec(`
        CREATE TABLE IF NOT EXISTS inventory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            po TEXT NOT NULL,
            client TEXT,
            client_po TEXT,
            product TEXT,
            item_no TEXT,
            batch TEXT,
            note TEXT,
            date_in TEXT,
            size TEXT,
            original_qty INTEGER DEFAULT 0,
            current_qty INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Shipments Table
    db.exec(`
        CREATE TABLE IF NOT EXISTS shipments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            stock_id INTEGER,
            po TEXT,
            product TEXT,
            recipient TEXT,
            courier TEXT,
            tracking TEXT,
            date_sent TEXT,
            image_path TEXT, -- Link to uploaded file
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(stock_id) REFERENCES inventory(id)
        )
    `);

    // Master Data Table (Cached from parsing)
    // Refactored to English Column Names (v2.1)
    db.exec(`
        DROP TABLE IF EXISTS master_data;
        CREATE TABLE master_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            using_po TEXT,      -- Was yxdh
            client TEXT,        -- Was khjc
            client_po TEXT,     -- Was client_po
            product_name TEXT,  -- Was scmc
            product_code TEXT,  -- Was cpmc
            quality_note TEXT   -- Was zlyq
        )
    `);

    // Migration: Add client_po if not exists (Legacy check removed as we drop table above)
    // try {
    //     db.exec("ALTER TABLE master_data ADD COLUMN client_po TEXT");
    // } catch (e) {
    //     // Column likely exists, ignore
    // }

    // Migration: Add deleted_at to inventory
    try {
        db.exec("ALTER TABLE inventory ADD COLUMN deleted_at DATETIME DEFAULT NULL");
    } catch (e) {
        // Column likely exists
    }

    // Migration: Add deleted_at to shipments
    try {
        db.exec("ALTER TABLE shipments ADD COLUMN deleted_at DATETIME DEFAULT NULL");
    } catch (e) {
        // Column likely exists
    }

    // Migration: Add image_path to shipments
    try {
        db.exec("ALTER TABLE shipments ADD COLUMN image_path TEXT");
    } catch (e) {
        // Column likely exists
    }

    // Migration: Add qty to shipments
    try {
        db.exec("ALTER TABLE shipments ADD COLUMN qty INTEGER DEFAULT 1");
    } catch (e) {
        // Column likely exists
    }

    // CLF Data Table (Cached from parsing)
    db.exec(`
        CREATE TABLE IF NOT EXISTS clf_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ttx_po TEXT, -- PO
            batch TEXT,
            client_po TEXT
        )
    `);

    // Couriers Table (Customizable)
    db.exec(`
        CREATE TABLE IF NOT EXISTS couriers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    console.log('Database tables initialized.');
};

initDB();

module.exports = db;
