const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'database.sqlite');
console.log('Database Path:', dbPath); // Debug log
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
    // Refactored to English Column Names (v2.1)
    db.exec(`
        CREATE TABLE IF NOT EXISTS master_data (
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

    // Migration: Add size to shipments
    try {
        db.exec("ALTER TABLE shipments ADD COLUMN size TEXT");
    } catch (e) {
        // Column likely exists
    }

    // Migration: Add client to shipments (and backfill)
    try {
        db.exec("ALTER TABLE shipments ADD COLUMN client TEXT");
        console.log("Migrated: Added client column to shipments.");
        // Backfill existing data
        db.exec("UPDATE shipments SET client = (SELECT client FROM inventory WHERE inventory.id = shipments.stock_id) WHERE client IS NULL");
        console.log("Migrated: Backfilled client data for shipments.");
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
