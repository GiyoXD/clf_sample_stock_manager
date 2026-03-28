const Database = require('better-sqlite3');
const path = require('path');
const { ROOT_DIR } = require('./path_config');

// Parse CLI args for --db-path
const args = process.argv.slice(2);
const dbPathArgIdx = args.indexOf('--db-path');
const dbPathArg = dbPathArgIdx !== -1 ? args[dbPathArgIdx + 1] : null;

// Use ROOT_DIR to ensure DB persists in the exe folder, not temp
const dbPath = (dbPathArgIdx !== -1 ? args[dbPathArgIdx + 1] : null) 
    || process.env.DB_PATH 
    || path.join(ROOT_DIR, 'database.sqlite');
console.log('Database Path:', dbPath); // Debug log

// Native Binding Fix for PKG
// When running in pkg, the native binding cannot be loaded from snapshot.
// We must point to the external .node file.
let dbOptions = {};
if (process.pkg) {
    // We expect 'better_sqlite3.node' to be adjacent to the executable
    const bindingPath = path.join(path.dirname(process.execPath), 'better_sqlite3.node');
    console.log('PKG Mode Detected. Using Native Binding:', bindingPath);
    dbOptions.nativeBinding = bindingPath;
}

const db = new Database(dbPath, dbOptions); // Verbose disabled for performance
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
            client TEXT,
            product TEXT,
            recipient TEXT,
            courier TEXT,
            tracking TEXT,
            date_sent TEXT,
            image_path TEXT, -- Link to uploaded file
            qty INTEGER DEFAULT 1,
            size TEXT, -- Added for tracking size in history
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            deleted_at DATETIME DEFAULT NULL,
            FOREIGN KEY(stock_id) REFERENCES inventory(id)
        )
    `);

    // Master Data Table (Cached from parsing)
    // PERSISTENT: Use IF NOT EXISTS, do NOT drop on start
    db.exec(`
        CREATE TABLE IF NOT EXISTS master_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            using_po TEXT,
            client TEXT,
            client_po TEXT,
            product_name TEXT,
            product_code TEXT,
            quality_note TEXT,
            production_scale INTEGER DEFAULT 0 -- Included in Create
        )
    `);

    // CLF Data Table (Cached from parsing)
    // PERSISTENT: Use IF NOT EXISTS, do NOT drop on start
    db.exec(`
        CREATE TABLE IF NOT EXISTS clf_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ttx_po TEXT, 
            batch TEXT,
            client_po TEXT,
            order_qty INTEGER DEFAULT 0, -- Included in Create
            pieces TEXT
        )
    `);

    // Migration: Add production_scale to master_data
    try {
        db.exec("ALTER TABLE master_data ADD COLUMN production_scale REAL DEFAULT 0");
        console.log("Migrated: Added production_scale column to master_data.");
    } catch (e) {
        // Column likely exists
    }

    // Migration: Add order_qty to clf_data
    try {
        db.exec("ALTER TABLE clf_data ADD COLUMN order_qty REAL DEFAULT 0");
        console.log("Migrated: Added order_qty column to clf_data.");
    } catch (e) {
        // Column likely exists
    }

    // Migration: Add pieces to clf_data
    try {
        db.exec("ALTER TABLE clf_data ADD COLUMN pieces TEXT");
        console.log("Migrated: Added pieces column to clf_data.");
    } catch (e) {
        // Column likely exists
    }

    // Couriers Table (Customizable)
    db.exec(`
        CREATE TABLE IF NOT EXISTS couriers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Client Purpose Mapping Table
    db.exec(`
        CREATE TABLE IF NOT EXISTS client_purposes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_name TEXT UNIQUE NOT NULL,
            purpose TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Seed Client Purpose Data if empty
    const purposesCount = db.prepare('SELECT count(*) as count FROM client_purposes').get();
    if (purposesCount.count === 0) {
        const seedData = [
            { client: 'BTJJ', purpose: '寄客户确认颜色' },
            { client: 'GJ', purpose: '寄客户配PVC' },
            { client: 'HU', purpose: '寄客户确认颜色' },
            { client: 'HLZN', purpose: '留底' },
            { client: 'HP', purpose: '寄客户确认颜色' },
            { client: 'HNOS', purpose: '寄客户配PVC' },
            { client: 'MH-TBL', purpose: '留样' },
            { client: 'LV', purpose: '/' },
            { client: 'YNZX', purpose: '寄客户对色' },
            { client: 'RX', purpose: '给 HLZN' },
            { client: 'LH', purpose: '给 HLZN' },
            { client: 'JLF-TLT', purpose: '寄客户对色' },
            { client: 'JLF-MH-TBL', purpose: '寄客户配PVC' },
            { client: 'JLF-HP', purpose: '寄客户确认颜色' },
            { client: 'JLF-BTJJ', purpose: '寄客户对色' },
            { client: 'JLF-GJ', purpose: '寄客户配PVC' },
            { client: 'JLF-HLZN', purpose: '留样' },
            { client: 'JLF-LWJJ', purpose: '' },
            { client: 'JLF-LV（利丰）', purpose: '' }
            // Deduped list from user input
        ];

        const insert = db.prepare('INSERT OR IGNORE INTO client_purposes (client_name, purpose) VALUES (?, ?)');
        seedData.forEach(item => {
            insert.run(item.client, item.purpose);
        });
        console.log('Seeded client_purposes table.');
    }

    console.log('Database tables initialized.');
};

initDB();

module.exports = db;
