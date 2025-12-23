const express = require('express');
const cors = require('cors');
const db = require('./db');
const app = express();
const PORT = 3000;
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure Multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = 'uploads/';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir);
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // Unique filename: date + original name
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

app.use(cors());
app.use(express.json({ limit: '500mb', strict: false }));
app.use(express.urlencoded({ limit: '500mb', extended: true }));
app.use('/uploads', express.static('uploads'));

// --- INVENTORY ROUTES ---

// --- INVENTORY ROUTES ---

// Get All Inventory (Active)
app.get('/api/inventory', (req, res) => {
    try {
        const rows = db.prepare('SELECT * FROM inventory WHERE deleted_at IS NULL ORDER BY created_at DESC').all();
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Trash (Inventory)
app.get('/api/inventory/trash', (req, res) => {
    try {
        const rows = db.prepare('SELECT * FROM inventory WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC').all();
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Add Stock In
app.post('/api/inventory', (req, res) => {
    try {
        const { po, client, clientPO, product, itemNo, batch, note, date, size, qty } = req.body;
        const stmt = db.prepare(`
            INSERT INTO inventory (po, client, client_po, product, item_no, batch, note, date_in, size, original_qty, current_qty)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const info = stmt.run(po, client, clientPO, product, itemNo, batch, note, date, size, qty, qty);
        res.json({ id: info.lastInsertRowid, ...req.body });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update Inventory (Edit)
app.put('/api/inventory/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { originalQty, note } = req.body;
        const row = db.prepare('SELECT original_qty, current_qty FROM inventory WHERE id = ?').get(id);
        if (!row) return res.status(404).json({ error: 'Item not found' });

        const diff = originalQty - row.original_qty;
        const newCurrent = row.current_qty + diff;

        const stmt = db.prepare(`
            UPDATE inventory 
            SET original_qty = ?, current_qty = ?, note = ?
            WHERE id = ?
        `);
        stmt.run(originalQty, newCurrent, note, id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});



// Soft Delete (Recycle Bin)
app.delete('/api/inventory/:id', (req, res) => {
    try {
        const { id } = req.params;
        db.prepare("UPDATE inventory SET deleted_at = ? WHERE id = ?").run(new Date().toISOString(), id);
        res.json({ success: true });
    } catch (err) {
        const errorLog = `[${new Date().toISOString()}] Delete Error: ${err.message}\nStack: ${err.stack}\n\n`;
        fs.appendFileSync(path.join(__dirname, 'error.log'), errorLog);
        res.status(500).json({ error: err.message });
    }
});

// Restore Inventory
app.post('/api/inventory/restore/:id', (req, res) => {
    try {
        const { id } = req.params;
        db.prepare('UPDATE inventory SET deleted_at = NULL WHERE id = ?').run(id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Hard Delete Inventory
// Hard Delete Inventory (and unlink shipments)
app.delete('/api/inventory/trash/:id', (req, res) => {
    try {
        const { id } = req.params;
        const transaction = db.transaction(() => {
            // Unlink shipments first (set stock_id to NULL) so we don't break FK
            // Or should we delete them? User said "Delete Forever". 
            // If we unlink, the shipment history remains but points to nothing.
            // Let's unlink to be safe, preserving history record (though "Ghost" data).
            db.prepare('UPDATE shipments SET stock_id = NULL WHERE stock_id = ?').run(id);
            db.prepare('DELETE FROM inventory WHERE id = ?').run(id);
        });
        transaction();
        res.json({ success: true });
    } catch (err) {
        const errorLog = `[${new Date().toISOString()}] Hard Delete Inventory Error: ${err.message}\nStack: ${err.stack}\n\n`;
        fs.appendFileSync(path.join(__dirname, 'error.log'), errorLog);
        res.status(500).json({ error: err.message });
    }
});

// --- SHIPMENT ROUTES ---

// Get All Shipments (Active)
app.get('/api/shipments', (req, res) => {
    try {
        const rows = db.prepare('SELECT * FROM shipments WHERE deleted_at IS NULL ORDER BY date_sent DESC').all();
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Trash (Shipments)
app.get('/api/shipments/trash', (req, res) => {
    try {
        const rows = db.prepare('SELECT * FROM shipments WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC').all();
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create Shipment (Confirm Sent)
// Create Shipment (Confirm Sent)
app.post('/api/shipments', (req, res) => {
    const { items, dateSent, imagePath } = req.body; // items has .qty now

    const insertShipment = db.prepare(`
        INSERT INTO shipments (stock_id, po, product, recipient, courier, tracking, date_sent, image_path, qty)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Use >= qty, and deduct qty
    const updateStock = db.prepare(`
        UPDATE inventory SET current_qty = current_qty - ? WHERE id = ? AND current_qty >= ?
    `);

    const transaction = db.transaction((draftItems) => {
        for (const item of draftItems) {
            const qty = item.qty || 1;
            const info = updateStock.run(qty, item.stockId, qty);

            // Should we error if stock is insufficient? 
            // For now, let's allow it but check info.changes. 
            // If strictly needed, we throw error. 
            // User requested "calculation", assuming valid stock.
            // If info.changes === 0, it means not enough stock.
            if (info.changes === 0) {
                throw new Error(`Insufficient stock for P.O: ${item.po}`);
            }

            insertShipment.run(
                item.stockId,
                item.po,
                item.product,
                item.recipient,
                item.courier,
                item.tracking,
                dateSent,
                imagePath || null,
                qty
            );
        }
    });

    try {
        transaction(items);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Soft Delete Shipment (Undo)
app.delete('/api/shipments/:id', (req, res) => {
    try {
        const { id } = req.params;
        const shipment = db.prepare('SELECT * FROM shipments WHERE id = ?').get(id);
        if (!shipment) return res.status(404).json({ error: 'Shipment not found' });

        // Restore Stock (use shipment.qty)
        const qty = shipment.qty || 1;
        db.prepare('UPDATE inventory SET current_qty = current_qty + ? WHERE id = ?').run(qty, shipment.stock_id);

        // Mark as Deleted
        db.prepare("UPDATE shipments SET deleted_at = ? WHERE id = ?").run(new Date().toISOString(), id);

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Restore Shipment (From Recycle Bin)
app.post('/api/shipments/restore/:id', (req, res) => {
    try {
        const { id } = req.params;
        const shipment = db.prepare('SELECT * FROM shipments WHERE id = ?').get(id);
        if (!shipment) return res.status(404).json({ error: 'Not found' });

        // Deduct Stock again (use shipment.qty)
        // Check if sufficient stock? Maybe assume yes if they restore.
        const qty = shipment.qty || 1;
        db.prepare('UPDATE inventory SET current_qty = current_qty - ? WHERE id = ?').run(qty, shipment.stock_id);

        db.prepare('UPDATE shipments SET deleted_at = NULL WHERE id = ?').run(id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Hard Delete Shipment
app.delete('/api/shipments/trash/:id', (req, res) => {
    try {
        const { id } = req.params;
        db.prepare('DELETE FROM shipments WHERE id = ?').run(id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- DATA ROUTES ---

// Get Master Data (All)
app.get('/api/master-data', (req, res) => {
    try {
        const rows = db.prepare('SELECT * FROM master_data').all();
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Sync Master Data (Index-Based Support or Mapping)
app.post('/api/master-data/sync', (req, res) => {
    // Expecting { data: [rows], mapping: {...}, clear: boolean }
    const { data, clear: shouldClear } = req.body;

    if (!Array.isArray(data)) {
        return res.status(400).json({ error: 'Data must be an array' });
    }

    // Prepare insert for new schem
    const insert = db.prepare('INSERT INTO master_data (using_po, client, client_po, product_name, product_code, quality_note) VALUES (?, ?, ?, ?, ?, ?)');
    const deleteParams = db.prepare('DELETE FROM master_data');

    const transaction = db.transaction((rows) => {
        // Only clear if explicitly requested (or if it's the first chunk)
        if (shouldClear === true) {
            deleteParams.run();
            console.log('Clearing master_data table (Clear flag check passed)');
        }

        let failedCount = 0;
        let skippedCount = 0;

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];

            // Expected Keys from Frontend: yxdh (mapped to using_po), khjc (client), etc.
            // Wait, frontend is sending { yxdh: ..., khjc: ... } from the fixed index parser?
            // Let's update frontend to send new keys too, OR map here.
            // BETTER: Update frontend to send proper English keys.
            // Assuming frontend sends: using_po, client, client_po, product_name, product_code, quality_note

            const using_po = row.using_po;

            // Strict Validation: Must have System PO
            if (!using_po) {
                skippedCount++;
                continue;
            }

            try {
                insert.run(
                    String(using_po).trim(),
                    String(row.client || '').trim(),
                    String(row.client_po || '').trim(),
                    String(row.product_name || '').trim(),
                    String(row.product_code || '').trim(),
                    String(row.quality_note || '').trim()
                );
            } catch (rowErr) {
                failedCount++;
                console.error(`Row ${i} import failed:`, row, rowErr.message);
            }
        }

        if (failedCount > 0) {
            console.warn(`Import warning: ${failedCount} rows failed, ${skippedCount} rows skipped.`);
        }

        const validRows = rows.length - failedCount - skippedCount;
        if (validRows === 0 && rows.length > 0) {
            console.error(`Batch Failure: ${rows.length} rows processed. ${skippedCount} skipped (no PO), ${failedCount} failed.`);
            if (rows.length > 5 && validRows === 0) {
                throw new Error(`Import failed. No valid records found in batch of ${rows.length}. Check column mapping/indices.`);
            }
        }
    });

    try {
        transaction(data);
        console.log(`Imported batch of ${data.length} records.`);
        res.json({ count: data.length });
    } catch (err) {
        console.error('Master Import Global Error:', err);
        res.status(500).json({ error: 'Import failed: ' + err.message });
    }
});

// Get CLF Data (All)
app.get('/api/clf-data', (req, res) => {
    try {
        const rows = db.prepare('SELECT * FROM clf_data').all();
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Sync CLF Data (Replace)
app.post('/api/clf-data/sync', (req, res) => {
    const { data } = req.body; // Expecting rows with TTX单号, 批次, PO
    const insert = db.prepare('INSERT INTO clf_data (ttx_po, batch, client_po) VALUES (?, ?, ?)');
    const clear = db.prepare('DELETE FROM clf_data');

    const transaction = db.transaction((rows) => {
        clear.run();
        for (const row of rows) {
            insert.run(row['TTX单号'] || row.ttx_po, row['批次'] || row.batch, row['PO'] || row.client_po);
        }
    });

    try {
        transaction(data);
        res.json({ count: data.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Upload API ---
app.post('/api/upload', upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        // Return the path relative to server root
        res.json({ path: req.file.path.replace(/\\/g, '/') }); // Normalize slashes
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Couriers API ---
app.get('/api/couriers', (req, res) => {
    try {
        const rows = db.prepare('SELECT * FROM couriers ORDER BY name ASC').all();
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/couriers', (req, res) => {
    try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: 'Name is required' });

        const info = db.prepare('INSERT OR IGNORE INTO couriers (name) VALUES (?)').run(name);
        const courier = db.prepare('SELECT * FROM couriers WHERE name = ?').get(name);
        res.json(courier);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- DEBUG / DEV ROUTES ---
app.post('/api/debug/reset-db', (req, res) => {
    try {
        const transaction = db.transaction(() => {
            db.prepare("DELETE FROM shipments").run();
            db.prepare("DELETE FROM inventory").run();
            db.prepare("DELETE FROM couriers").run();
        });
        transaction();
        res.json({ success: true, message: 'Database reset successfully.' });
    } catch (err) {
        console.error('Reset DB Error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);
});